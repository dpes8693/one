// services/scheduler.js
//
// Sprint 5 Task #16: Scheduler 自動開機/關機（含 Row-level lock）
//
// 三組 cron job（保留舊邏輯不破壞舊 e2e 測試）：
//   1. 既有「每分鐘」cron — 處理舊 schedules 表 trigger（保留不動）
//   2. 既有「每 5 分鐘」cron — VM 使用時數限制（F9）（保留不動）
//   3. 新「每分鐘」tickStartScheduler — 到時間自動開 VM
//   4. 新「每分鐘」tickEndScheduler — 到時間自動關 VM
//
// Row-level lock 設計：
//   UPDATE schedule_slots SET status='processing' WHERE status='pending'
//     AND start_at <= now() RETURNING *
//   UPDATE...RETURNING 的原子性保證多 instance 不會重複處理（SPEC v4 Cron lock 規則）
//
// VM 開機失敗：Q6=B 不 retry，立刻通知 admin + 學生
// VM 結束失敗：仍清 gpu_allocations（避免 GPU 永久占用）

import cron from 'node-cron'
import pool from '../db.js'
import {
  callFireEdge,
  getAdminToken,
  instantiateTemplate,
  getVmIp,
} from './opennebula.js'
import {
  sendVmReadyEmail,
  sendVmFailureNotification,
  sendVmFailureToStudent,
  sendVmEndedEmail,
} from './notifier.js'
import { releaseSlot } from './resourceInventory.js'

// =============================================================
// 工具：產生 VM 名稱
// =============================================================
function buildVmName(applicationId, slotId) {
  // SPEC「VM 命名」預設規則：<學號>-<日期>-<時段>，但 schema 凍結後沒法直接拿學號，
  // 為避免改 schema，採簡化：app-<application_id>-<slot_id>，OpenNebula 上限 255 字元無虞。
  return `app-${applicationId}-${slotId}`
}

// =============================================================
// tickStartScheduler — 開機
// =============================================================
export async function tickStartScheduler() {
  // 1) Row-level lock：UPDATE...RETURNING 原子性鎖定 pending → processing
  let locked
  try {
    locked = await pool.query(
      `UPDATE schedule_slots
          SET status = 'processing', processed_at = now()
        WHERE status = 'pending'
          AND start_at <= now()
          AND application_id IN (
            SELECT id FROM applications WHERE status = 'approved'
          )
        RETURNING *`
    )
  } catch (err) {
    // 若 schema 沒 processed_at 欄位（早期版本），fallback 不寫該欄位
    if (/processed_at/i.test(err.message)) {
      locked = await pool.query(
        `UPDATE schedule_slots
            SET status = 'processing'
          WHERE status = 'pending'
            AND start_at <= now()
            AND application_id IN (
              SELECT id FROM applications WHERE status = 'approved'
            )
          RETURNING *`
      )
    } else {
      console.error('[Scheduler] tickStart lock 失敗:', err.message)
      return
    }
  }

  const slots = locked?.rows || []
  if (slots.length === 0) return

  for (const slot of slots) {
    await startOneSlot(slot)
  }
}

async function startOneSlot(slot) {
  let token = null
  try {
    // 1) 查 application
    const appRes = await pool.query(
      `SELECT id, user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count
         FROM applications WHERE id = $1`,
      [slot.application_id]
    )
    if (appRes.rows.length === 0) {
      throw new Error(`application ${slot.application_id} 不存在`)
    }
    const application = appRes.rows[0]

    // 2) 查 GPU 編號
    const gpuRes = await pool.query(
      `SELECT gpu_index FROM gpu_allocations
         WHERE schedule_slot_id = $1 ORDER BY gpu_index`,
      [slot.id]
    )
    const gpuIndices = gpuRes.rows.map((r) => parseInt(r.gpu_index, 10))

    // 3) 拼 OpenNebula instantiate template
    const templateLines = [
      `CPU = ${application.cpu}`,
      `VCPU = ${application.cpu}`,
      `MEMORY = ${parseInt(application.ram_gb, 10) * 1024}`, // GB -> MB
      `DISK = [SIZE = ${parseInt(application.disk_gb, 10) * 1024}]`,
    ]
    for (const idx of gpuIndices) {
      // PCI 直通：實際 device id 由 OpenNebula host 設定，這裡用 gpu_index 標識
      templateLines.push(`PCI = [DEVICE_NAME = "GPU_${idx}", PCI_ID = "${idx}"]`)
    }

    const vmName = buildVmName(application.id, slot.id)

    // 4) 呼叫 OpenNebula instantiate
    token = await getAdminToken()
    const result = await instantiateTemplate(
      token,
      application.template_id,
      vmName,
      { template: templateLines }
    )

    // 萃取 vm_id（FireEdge 不同版本回傳結構不同，多重防禦）
    const vmId =
      result?.data?.VM?.ID ||
      result?.data?.id ||
      result?.data?.ID ||
      result?.id ||
      result?.vm_id

    if (!vmId) {
      throw new Error('OpenNebula 未回傳 vm_id')
    }

    // 5) 嘗試取 SSH IP（DHCP 可能空，容忍）
    let sshHost = ''
    try {
      sshHost = await getVmIp(token, vmId)
    } catch (_) {
      sshHost = ''
    }

    // 6) UPDATE 成功
    await pool.query(
      `UPDATE schedule_slots
          SET status = 'running', vm_id = $1
        WHERE id = $2`,
      [String(vmId), slot.id]
    )

    // 7) 寄信給學生（SSH 連線資訊）
    await sendVmReadyEmail(application.user_email, vmName, sshHost, 22, 'root')

    // 8) audit
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id)
       VALUES ($1, 'scheduler', 'vm.auto_start', 'vm', $2)`,
      [application.user_id, String(vmId)]
    ).catch(() => {})
  } catch (err) {
    console.error(`[Scheduler] tickStart slot ${slot.id} 失敗:`, err.message)
    try {
      await pool.query(
        `UPDATE schedule_slots
            SET status = 'failed', error = $1
          WHERE id = $2`,
        [err.message.slice(0, 500), slot.id]
      )
    } catch (e2) {
      // 沒 error 欄位的 fallback
      await pool.query(
        `UPDATE schedule_slots SET status = 'failed' WHERE id = $1`,
        [slot.id]
      ).catch(() => {})
    }

    // 通知 admin + 學生（SPEC Q6=B 不 retry）
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const vmName = buildVmName(slot.application_id, slot.id)
    try {
      await sendVmFailureNotification(adminEmail, vmName, err.message)
    } catch (_) {}

    // 學生通知（從 application 撈 email）
    try {
      const appRes = await pool.query(
        `SELECT user_email FROM applications WHERE id = $1`,
        [slot.application_id]
      )
      const studentEmail = appRes.rows[0]?.user_email
      if (studentEmail) {
        await sendVmFailureToStudent(studentEmail)
      }
    } catch (_) {}

    // audit
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id)
       VALUES (NULL, 'scheduler', 'vm.auto_start.failed', 'schedule_slot', $1)`,
      [String(slot.id)]
    ).catch(() => {})
  }
}

// =============================================================
// tickEndScheduler — 關機
// =============================================================
export async function tickEndScheduler() {
  // 1) Row-level lock：running → cleaning
  const locked = await pool.query(
    `UPDATE schedule_slots
        SET status = 'cleaning'
      WHERE status = 'running'
        AND end_at <= now()
      RETURNING *`
  ).catch((err) => {
    console.error('[Scheduler] tickEnd lock 失敗:', err.message)
    return { rows: [] }
  })

  const slots = locked?.rows || []
  if (slots.length === 0) return

  for (const slot of slots) {
    await endOneSlot(slot)
  }
}

async function endOneSlot(slot) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  let studentEmail = null
  try {
    const appRes = await pool.query(
      `SELECT user_email FROM applications WHERE id = $1`,
      [slot.application_id]
    )
    studentEmail = appRes.rows[0]?.user_email || null
  } catch (_) {}

  const vmName = buildVmName(slot.application_id, slot.id)

  try {
    if (!slot.vm_id) {
      throw new Error('slot 缺 vm_id，無法 terminate')
    }

    const token = await getAdminToken()
    await callFireEdge(
      'PUT',
      `/vm/action/${slot.vm_id}`,
      { action: 'terminate' },
      token
    )

    await pool.query(
      `UPDATE schedule_slots SET status = 'completed' WHERE id = $1`,
      [slot.id]
    )

    // 釋放 gpu_allocations
    try {
      await releaseSlot(slot.id)
    } catch (e) {
      console.error(`[Scheduler] releaseSlot ${slot.id} 失敗:`, e.message)
    }

    if (studentEmail) {
      await sendVmEndedEmail(studentEmail, vmName).catch(() => {})
    }

    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id)
       VALUES (NULL, 'scheduler', 'vm.auto_end', 'vm', $1)`,
      [String(slot.vm_id)]
    ).catch(() => {})
  } catch (err) {
    console.error(`[Scheduler] tickEnd slot ${slot.id} 失敗:`, err.message)
    await pool.query(
      `UPDATE schedule_slots SET status = 'end_failed' WHERE id = $1`,
      [slot.id]
    ).catch(() => {})

    // 即使 terminate 失敗，仍釋放 GPU 配額（避免永久占用）
    try {
      await releaseSlot(slot.id)
    } catch (_) {}

    try {
      await sendVmFailureNotification(adminEmail, vmName, `關機失敗：${err.message}`)
    } catch (_) {}

    if (studentEmail) {
      await sendVmEndedEmail(studentEmail, vmName).catch(() => {})
    }
  }
}

// =============================================================
// 既有 cron（舊 schedules 表）— 保留不動，讓舊 e2e 測試不破
// =============================================================
function legacyEveryMinute() {
  return async () => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM schedules
          WHERE is_active = true
            AND start_time <= NOW()`
      )

      for (const schedule of rows) {
        try {
          const action = schedule.action || 'resume'
          await callFireEdge(
            'PUT',
            `/vm/action/${schedule.one_vm_id}`,
            { action },
            null
          )

          await pool.query(
            `INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id)
             VALUES ($1, 'scheduler', 'schedule.trigger', 'vm', $2)`,
            [schedule.one_user_id, schedule.one_vm_id]
          )

          if (!schedule.repeat_type || schedule.repeat_type === 'once') {
            await pool.query(
              'UPDATE schedules SET is_active = false WHERE id = $1',
              [schedule.id]
            )
          }
        } catch (err) {
          console.error(`[Scheduler] 排程 ${schedule.id} 執行失敗:`, err.message)
        }
      }
    } catch (err) {
      console.error('[Scheduler] 查詢排程失敗:', err.message)
    }
  }
}

function legacyEveryFiveMinutes() {
  return async () => {
    try {
      const maxHours = parseInt(process.env.VM_MAX_HOURS || '4', 10)
      const maxSeconds = maxHours * 3600

      const { rows } = await pool.query(
        `SELECT one_vm_id, one_user_id FROM application_reviews
          WHERE decision = 'approved' AND one_vm_id IS NOT NULL`
      )

      for (const review of rows) {
        try {
          const vmInfo = await callFireEdge('GET', `/vm/info/${review.one_vm_id}`, null, null)
          const stime = vmInfo?.data?.VM?.STIME
          if (!stime) continue

          const startEpoch = parseInt(stime, 10)
          const nowEpoch = Math.floor(Date.now() / 1000)
          const elapsed = nowEpoch - startEpoch

          if (elapsed > maxSeconds) {
            await callFireEdge(
              'PUT',
              `/vm/action/${review.one_vm_id}`,
              { action: 'poweroff' },
              null
            )
            await pool.query(
              `INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id)
               VALUES ($1, 'scheduler', 'vm.time_limit.poweroff', 'vm', $2)`,
              [review.one_user_id, review.one_vm_id]
            )
          }
        } catch (err) {
          console.error(`[Scheduler] VM ${review.one_vm_id} 時數檢查失敗:`, err.message)
        }
      }
    } catch (err) {
      console.error('[Scheduler] 時數限制檢查失敗:', err.message)
    }
  }
}

// =============================================================
// startScheduler — 啟動所有 cron
// =============================================================
export function startScheduler() {
  // 既有舊 cron（合併新舊兩段「每分鐘」共用 callback）
  cron.schedule('* * * * *', async () => {
    await legacyEveryMinute()()
    try {
      await tickStartScheduler()
    } catch (err) {
      console.error('[Scheduler] tickStart 例外:', err.message)
    }
    try {
      await tickEndScheduler()
    } catch (err) {
      console.error('[Scheduler] tickEnd 例外:', err.message)
    }
  })

  cron.schedule('*/5 * * * *', legacyEveryFiveMinutes())

  console.log('[Scheduler] 排程服務已啟動（含舊 schedules + 新 schedule_slots）')
}
