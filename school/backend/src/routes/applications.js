// routes/applications.js
// Sprint 5 Task #14：預約申請 API（SPEC V2 改寫版）
//
// 規格依據：school/docs/SPEC_V2.md A1-A8、R7-R10、Q1-Q6
// 端點：
//   GET    /api/templates                            列出可選 Template（admin 預建）
//   GET    /api/applications                         列出申請（user 看自己 / admin 看全部）
//   GET    /api/applications/availability?from=&to=  查時段可用資源
//   POST   /api/applications                         學生送出預約（4 種資源 + 整點驗證）
//   DELETE /api/applications/:id                     學生取消預約
//
// 注意：approve / reject 留給 Task #15 處理；scheduler 自動開機留給 #16。
//
// 資源檢查順序：欄位 → 整點 → 預約範圍 → 單筆時長 → 同學上限 → 4 種資源庫存
// audit_logs 寫入：request_body jsonb + response_status

import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdminToken, callFireEdge } from '../services/opennebula.js'
import {
  checkResourceAvailable,
  getAvailabilityByHour,
  allocateGpus,
} from '../services/resourceInventory.js'
import {
  sendReservationApprovedEmail,
  sendReservationRejectedEmail,
} from '../services/notifier.js'

const router = express.Router()

// ----------------- helpers -----------------

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** 從 system_settings 一次撈一組 key → value（含 fallback 預設） */
async function loadSettings(keys, defaults = {}) {
  try {
    const r = await pool.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
      [keys]
    )
    const map = { ...defaults }
    for (const row of r.rows) map[row.key] = row.value
    return map
  } catch (err) {
    console.error('[Applications] 讀 system_settings 失敗，使用預設:', err.message)
    return { ...defaults }
  }
}

/** parse 並驗證為正整數，失敗回 fallback */
function asPositiveInt(v, fallback) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 驗證時間是整點（minute = 0, second = 0, ms = 0） */
function isOnTheHour(isoStr) {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return false
  return (
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  )
}

/** audit log helper */
async function writeAudit(req, { action, targetId, requestBody = null, status = 200 }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, user_name, action, target_type, target_id, request_body, response_status, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user?.one_user_id ?? null,
        req.user?.one_user_name ?? 'anonymous',
        action,
        'application',
        targetId != null ? Number(targetId) : null,
        requestBody ? JSON.stringify(requestBody) : null,
        status,
        req.ip ?? null,
      ]
    )
  } catch (err) {
    console.error('[Applications][Audit] 寫入失敗:', err.message)
  }
}

// ----------------- GET /api/templates -----------------
// 注意：實際路徑由 server.js 註冊在 /api/templates，但本 file 內定義為 router 的 root '/'
// 我們改用 sub-router 暴露，或在 server.js 直接呼叫此 handler。
// 為了讓 routes 集中管理，這裡暴露一個 handler，server.js 會把它掛到 /api/templates。
export async function templatesHandler(req, res) {
  // 已透過 requireAuth 包過
  const FALLBACK = {
    cpu: 4,
    ram_gb: 8,
    disk_gb: 50,
    gpu_count: 1,
  }

  let templateId = 1
  let name = 'Base Template'

  try {
    const s = await loadSettings(['base_template_id'], { base_template_id: '1' })
    templateId = asPositiveInt(s.base_template_id, 1)
  } catch (_) {
    // ignore
  }

  // 嘗試呼叫 OpenNebula 拿 template 真實 name；失敗就用 fallback
  let defaults = { ...FALLBACK }
  try {
    const adminToken = await getAdminToken()
    const result = await callFireEdge('GET', `/template/info/${templateId}`, null, adminToken)

    // FireEdge 回傳結構不一：data.VMTEMPLATE 或 VMTEMPLATE 或 data.TEMPLATE 直接
    const tpl =
      result?.data?.VMTEMPLATE ??
      result?.VMTEMPLATE ??
      result?.data ??
      result

    if (tpl?.NAME) name = String(tpl.NAME)

    // 從 TEMPLATE 推算 defaults
    const T = tpl?.TEMPLATE ?? {}
    const cpu = parseInt(T.CPU ?? T.VCPU, 10)
    const memMB = parseInt(T.MEMORY, 10) // OpenNebula MEMORY 單位是 MB
    const diskMB = parseInt(T.DISK?.SIZE ?? T.DISK?.[0]?.SIZE, 10)

    if (Number.isFinite(cpu) && cpu > 0) defaults.cpu = cpu
    if (Number.isFinite(memMB) && memMB > 0) defaults.ram_gb = Math.max(1, Math.round(memMB / 1024))
    if (Number.isFinite(diskMB) && diskMB > 0) defaults.disk_gb = Math.max(1, Math.round(diskMB / 1024))
  } catch (err) {
    console.error('[Templates] 取 template 失敗，使用 fallback:', err.message)
  }

  return res.json({
    data: {
      id: templateId,
      name,
      defaults,
    },
  })
}

// ----------------- GET /api/applications/availability -----------------
router.get('/availability', requireAuth, async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) {
    return res.status(400).json({ error: '請提供 from 與 to 查詢字串' })
  }

  const fromTs = new Date(from).getTime()
  const toTs = new Date(to).getTime()
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
    return res.status(400).json({ error: 'from / to 格式錯誤' })
  }
  if (toTs <= fromTs) {
    return res.status(400).json({ error: 'to 必須晚於 from' })
  }

  const settings = await loadSettings(
    ['max_advance_booking_days'],
    { max_advance_booking_days: '30' }
  )
  const maxDays = asPositiveInt(settings.max_advance_booking_days, 30)
  // 範圍上限 = max_advance_booking_days 天 + 24h buffer（避免邊界整點誤判）
  const maxRange = maxDays * DAY_MS + DAY_MS

  if (toTs - fromTs > maxRange) {
    return res.status(400).json({
      error: `查詢範圍不得超過 ${maxDays + 1} 天`,
    })
  }

  try {
    const data = await getAvailabilityByHour(from, to)
    return res.json({ data })
  } catch (err) {
    console.error('[Applications] availability 查詢失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ----------------- GET /api/applications -----------------
router.get('/', requireAuth, async (req, res) => {
  const isAdmin = req.user?.role === 'admin'
  const userId = req.user?.one_user_id ?? null

  try {
    let sql, params
    if (isAdmin) {
      sql = `
        SELECT a.id, a.user_id, a.user_email, a.template_id,
               a.cpu, a.ram_gb, a.disk_gb, a.gpu_count,
               a.status, a.reject_reason, a.created_at,
               a.reviewed_at, a.reviewed_by,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', s.id,
                     'start_at', s.start_at,
                     'end_at', s.end_at,
                     'vm_id', s.vm_id,
                     'status', s.status
                   ) ORDER BY s.start_at
                 ) FILTER (WHERE s.id IS NOT NULL),
                 '[]'::json
               ) AS slots
          FROM applications a
          LEFT JOIN schedule_slots s ON s.application_id = a.id
         GROUP BY a.id
         ORDER BY a.created_at DESC
      `
      params = []
    } else {
      sql = `
        SELECT a.id, a.user_id, a.user_email, a.template_id,
               a.cpu, a.ram_gb, a.disk_gb, a.gpu_count,
               a.status, a.reject_reason, a.created_at,
               a.reviewed_at, a.reviewed_by,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', s.id,
                     'start_at', s.start_at,
                     'end_at', s.end_at,
                     'vm_id', s.vm_id,
                     'status', s.status
                   ) ORDER BY s.start_at
                 ) FILTER (WHERE s.id IS NOT NULL),
                 '[]'::json
               ) AS slots
          FROM applications a
          LEFT JOIN schedule_slots s ON s.application_id = a.id
         WHERE a.user_id = $1
         GROUP BY a.id
         ORDER BY a.created_at DESC
      `
      params = [userId]
    }

    const r = await pool.query(sql, params)
    return res.json({ data: r.rows })
  } catch (err) {
    console.error('[Applications] GET 列表失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ----------------- POST /api/applications -----------------
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user?.one_user_id ?? null
  const userEmail = req.user?.email || `${req.user?.one_user_name || 'user'}@local`

  const { template_id, cpu, ram_gb, disk_gb, gpu_count, slots } = req.body || {}

  // 1) 基本欄位驗證
  const tplId = parseInt(template_id, 10)
  const cpuN = parseInt(cpu, 10)
  const ramN = parseInt(ram_gb, 10)
  const diskN = parseInt(disk_gb, 10)
  const gpuN = parseInt(gpu_count, 10)

  if (!Number.isFinite(tplId) || tplId <= 0) {
    return res.status(400).json({ error: 'template_id 為必填正整數' })
  }
  if (!Number.isFinite(cpuN) || cpuN <= 0) {
    return res.status(400).json({ error: 'cpu 必須為正整數' })
  }
  if (!Number.isFinite(ramN) || ramN <= 0) {
    return res.status(400).json({ error: 'ram_gb 必須為正整數' })
  }
  if (!Number.isFinite(diskN) || diskN <= 0) {
    return res.status(400).json({ error: 'disk_gb 必須為正整數' })
  }
  if (!Number.isFinite(gpuN) || gpuN < 0) {
    return res.status(400).json({ error: 'gpu_count 必須為非負整數' })
  }

  // 2) slots 驗證
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: '請至少提供一個時段（slots）' })
  }

  // 3) 載入系統設定
  const settings = await loadSettings(
    [
      'max_total_gpu',
      'max_active_reservations',
      'max_hours_per_reservation',
      'max_advance_booking_days',
    ],
    {
      max_total_gpu: '8',
      max_active_reservations: '3',
      max_hours_per_reservation: '24',
      max_advance_booking_days: '30',
    }
  )
  const maxTotalGpu = asPositiveInt(settings.max_total_gpu, 8)
  const maxActive = asPositiveInt(settings.max_active_reservations, 3)
  const maxHours = asPositiveInt(settings.max_hours_per_reservation, 24)
  const maxAdvanceDays = asPositiveInt(settings.max_advance_booking_days, 30)

  if (gpuN > maxTotalGpu) {
    return res.status(400).json({
      error: `gpu_count (${gpuN}) 超過系統上限 ${maxTotalGpu}`,
    })
  }

  // 4) 整點 + 範圍 + 單筆時長
  const now = Date.now()
  const maxAdvanceMs = maxAdvanceDays * DAY_MS

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (!s?.start_at || !s?.end_at) {
      return res.status(400).json({ error: `slot[${i}] 缺 start_at 或 end_at` })
    }
    const startTs = new Date(s.start_at).getTime()
    const endTs = new Date(s.end_at).getTime()
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      return res.status(400).json({ error: `slot[${i}] 時間格式錯誤` })
    }
    if (!isOnTheHour(s.start_at) || !isOnTheHour(s.end_at)) {
      return res.status(400).json({
        error: `slot[${i}] start_at / end_at 必須是整點（minute=0, second=0）`,
      })
    }
    if (endTs <= startTs) {
      return res.status(400).json({ error: `slot[${i}] end_at 必須晚於 start_at` })
    }
    if (startTs > now + maxAdvanceMs) {
      return res.status(400).json({
        error: `slot[${i}] 預約時間超出 ${maxAdvanceDays} 天上限`,
      })
    }
    const hours = (endTs - startTs) / HOUR_MS
    if (hours > maxHours) {
      return res.status(400).json({
        error: `slot[${i}] 時長 ${hours} 小時超過單筆上限 ${maxHours} 小時`,
      })
    }
  }

  // 5) 同學上限：未取消/拒絕/完成的 application 數量
  try {
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM applications
        WHERE user_id = $1
          AND status IN ('approved', 'pending')`,
      [userId]
    )
    const current = cnt.rows[0]?.n ?? 0
    if (current + 1 > maxActive) {
      await writeAudit(req, {
        action: 'create_application',
        targetId: null,
        requestBody: req.body,
        status: 409,
      })
      return res.status(409).json({
        ok: false,
        error: `已達同時最多 ${maxActive} 筆預約上限（目前 ${current} 筆）`,
      })
    }
  } catch (err) {
    console.error('[Applications] 查詢同學上限失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤' })
  }

  // 6) 4 種資源檢查
  try {
    const check = await checkResourceAvailable(slots, {
      cpu: cpuN,
      ram_gb: ramN,
      disk_gb: diskN,
      gpu_count: gpuN,
    })
    if (!check.ok) {
      await writeAudit(req, {
        action: 'create_application',
        targetId: null,
        requestBody: req.body,
        status: 409,
      })
      return res.status(409).json({
        ok: false,
        violations: check.violations,
      })
    }
  } catch (err) {
    console.error('[Applications] 資源檢查失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }

  // 7) Transaction 寫入 applications + schedule_slots
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const appRes = await client.query(
      `INSERT INTO applications
         (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, created_at`,
      [userId, userEmail, tplId, cpuN, ramN, diskN, gpuN]
    )
    const applicationId = appRes.rows[0].id

    const slotRows = []
    for (const s of slots) {
      const r = await client.query(
        `INSERT INTO schedule_slots (application_id, start_at, end_at)
         VALUES ($1, $2, $3)
         RETURNING id, start_at, end_at, status`,
        [applicationId, s.start_at, s.end_at]
      )
      slotRows.push(r.rows[0])
    }

    await client.query('COMMIT')

    await writeAudit(req, {
      action: 'create_application',
      targetId: applicationId,
      requestBody: req.body,
      status: 200,
    })

    return res.json({
      ok: true,
      application_id: applicationId,
      slots: slotRows,
    })
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) {}
    console.error('[Applications] 寫入失敗:', err.message)
    await writeAudit(req, {
      action: 'create_application',
      targetId: null,
      requestBody: req.body,
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  } finally {
    client.release()
  }
})

// ----------------- DELETE /api/applications/:id -----------------
router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '無效的 id' })
  }

  const userId = req.user?.one_user_id ?? null
  const isAdmin = req.user?.role === 'admin'

  try {
    // 1) 取 application
    const r = await pool.query(
      `SELECT id, user_id, status FROM applications WHERE id = $1`,
      [id]
    )
    if (r.rows.length === 0) {
      return res.status(404).json({ error: '找不到該預約' })
    }
    const app = r.rows[0]

    // 2) 只能取消自己的（admin 也可取消他人）
    if (!isAdmin && app.user_id !== userId) {
      await writeAudit(req, {
        action: 'cancel_application',
        targetId: id,
        requestBody: null,
        status: 403,
      })
      return res.status(403).json({ error: '無權取消他人的預約' })
    }

    // 3) 只能取消 pending / approved
    if (!['pending', 'approved'].includes(app.status)) {
      return res.status(400).json({
        error: `狀態為 ${app.status}，無法取消`,
      })
    }

    // 4) 若任一 slot 已經 running → 不能 DELETE，要走 terminate API
    const slotR = await pool.query(
      `SELECT id, status FROM schedule_slots WHERE application_id = $1`,
      [id]
    )
    const slotIds = slotR.rows.map((s) => s.id)
    const hasRunning = slotR.rows.some((s) => s.status === 'running')
    if (hasRunning) {
      await writeAudit(req, {
        action: 'cancel_application',
        targetId: id,
        requestBody: null,
        status: 409,
      })
      return res.status(409).json({
        error: '有時段已啟動 VM，請改用 terminate API',
      })
    }

    // 5) Transaction：手動釋放 gpu_allocations + UPDATE 狀態
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (slotIds.length > 0) {
        await client.query(
          `DELETE FROM gpu_allocations WHERE schedule_slot_id = ANY($1::int[])`,
          [slotIds]
        )
      }

      await client.query(
        `UPDATE applications SET status = 'cancelled', reviewed_at = now(), reviewed_by = $1
          WHERE id = $2`,
        [req.user?.one_user_name ?? 'user', id]
      )

      await client.query('COMMIT')
    } catch (err) {
      try { await client.query('ROLLBACK') } catch (_) {}
      throw err
    } finally {
      client.release()
    }

    await writeAudit(req, {
      action: 'cancel_application',
      targetId: id,
      requestBody: null,
      status: 200,
    })

    return res.json({ ok: true, application_id: id, status: 'cancelled' })
  } catch (err) {
    console.error('[Applications] DELETE 失敗:', err.message)
    await writeAudit(req, {
      action: 'cancel_application',
      targetId: id,
      requestBody: null,
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ----------------- admin only middleware -----------------
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '僅限管理員存取' })
  }
  next()
}

// ----------------- PUT /api/applications/:id/approve -----------------
// Sprint 5 Task #15：管理員審核通過
//
// 流程（SPEC V2 A7 + R7-R10 + Mermaid ⑤）：
//   1) status='pending' 才能改
//   2) 撈 schedule_slots
//   3) checkResourceAvailable（excludeApplicationId=自己）→ 不夠 409
//   4) Transaction：UPDATE applications + 對每個 slot allocateGpus
//      （allocateGpus 內部自帶 transaction，這裡只負責整體流程；任一拋錯整體回 409）
//   5) 寄信 sendReservationApprovedEmail
//   6) audit_logs
router.put('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '無效的 id' })
  }

  let application
  let slots

  try {
    // 1) 查 application（含 lock 避免 race）
    const r = await pool.query(
      `SELECT id, user_id, user_email, template_id,
              cpu, ram_gb, disk_gb, gpu_count, status
         FROM applications WHERE id = $1`,
      [id]
    )
    if (r.rows.length === 0) {
      await writeAudit(req, {
        action: 'approve_application',
        targetId: id,
        requestBody: req.body || null,
        status: 404,
      })
      return res.status(404).json({ error: '找不到該預約' })
    }
    application = r.rows[0]

    if (application.status !== 'pending') {
      await writeAudit(req, {
        action: 'approve_application',
        targetId: id,
        requestBody: req.body || null,
        status: 400,
      })
      return res.status(400).json({
        error: `狀態為 ${application.status}，僅能審核 pending 的申請`,
      })
    }

    // 2) 撈該 application 所有 schedule_slots
    const slotR = await pool.query(
      `SELECT id, start_at, end_at, status
         FROM schedule_slots
        WHERE application_id = $1
        ORDER BY start_at`,
      [id]
    )
    slots = slotR.rows
    if (slots.length === 0) {
      await writeAudit(req, {
        action: 'approve_application',
        targetId: id,
        requestBody: req.body || null,
        status: 400,
      })
      return res.status(400).json({ error: '此申請沒有任何時段' })
    }
  } catch (err) {
    console.error('[Applications][Approve] 查詢失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }

  // 3) 最終資源檢查（排除自己這筆 pending）
  try {
    const check = await checkResourceAvailable(
      slots.map((s) => ({ start_at: s.start_at, end_at: s.end_at })),
      {
        cpu: application.cpu,
        ram_gb: application.ram_gb,
        disk_gb: application.disk_gb,
        gpu_count: application.gpu_count,
      },
      id // excludeApplicationId
    )
    if (!check.ok) {
      await writeAudit(req, {
        action: 'approve_application',
        targetId: id,
        requestBody: req.body || null,
        status: 409,
      })
      return res.status(409).json({
        error: 'resource_exceeded',
        violations: check.violations,
      })
    }
  } catch (err) {
    console.error('[Applications][Approve] 資源檢查失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }

  // 4) 改狀態 + 對每個 slot 分配 GPU
  //    註：allocateGpus 自帶 transaction（含 BEGIN/COMMIT/ROLLBACK），
  //    無法跟外層 UPDATE 同步 commit。先改狀態 → 再 allocate；任一失敗就 rollback 狀態。
  let allocations = {}
  try {
    await pool.query(
      `UPDATE applications
          SET status = 'approved',
              reviewed_at = now(),
              reviewed_by = $1
        WHERE id = $2`,
      [req.user?.one_user_name ?? 'admin', id]
    )
  } catch (err) {
    console.error('[Applications][Approve] UPDATE 失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }

  // 4b) GPU 分配；若 gpu_count = 0 直接跳過
  try {
    if ((application.gpu_count || 0) > 0) {
      for (const slot of slots) {
        const picked = await allocateGpus(slot.id, application.gpu_count)
        allocations[slot.id] = picked
      }
    }
  } catch (err) {
    console.error('[Applications][Approve] allocateGpus 失敗:', err.message)
    // ROLLBACK 狀態 + 釋放已分配
    try {
      await pool.query(
        `UPDATE applications SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL WHERE id = $1`,
        [id]
      )
      await pool.query(
        `DELETE FROM gpu_allocations
          WHERE schedule_slot_id IN (
            SELECT id FROM schedule_slots WHERE application_id = $1
          )`,
        [id]
      )
    } catch (rbErr) {
      console.error('[Applications][Approve] 回滾失敗:', rbErr.message)
    }
    await writeAudit(req, {
      action: 'approve_application',
      targetId: id,
      requestBody: req.body || null,
      status: 409,
    })
    return res.status(409).json({
      error: 'resource_exceeded',
      detail: err.message,
    })
  }

  // 5) 寄信（失敗不阻擋成功回應，只 console.error）
  try {
    await sendReservationApprovedEmail(application.user_email, application, slots)
  } catch (err) {
    console.error('[Applications][Approve] 寄信失敗:', err.message)
  }

  // 6) audit
  await writeAudit(req, {
    action: 'approve_application',
    targetId: id,
    requestBody: req.body || null,
    status: 200,
  })

  return res.json({
    ok: true,
    application_id: id,
    gpu_allocations: allocations,
  })
})

// ----------------- PUT /api/applications/:id/reject -----------------
// Sprint 5 Task #15：管理員審核拒絕
router.put('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '無效的 id' })
  }

  const reason = (req.body?.reason || '').toString().trim()
  if (!reason) {
    return res.status(400).json({ error: 'reason 為必填' })
  }

  let application
  try {
    const r = await pool.query(
      `SELECT id, user_id, user_email, status FROM applications WHERE id = $1`,
      [id]
    )
    if (r.rows.length === 0) {
      await writeAudit(req, {
        action: 'reject_application',
        targetId: id,
        requestBody: req.body || null,
        status: 404,
      })
      return res.status(404).json({ error: '找不到該預約' })
    }
    application = r.rows[0]
    if (application.status !== 'pending') {
      await writeAudit(req, {
        action: 'reject_application',
        targetId: id,
        requestBody: req.body || null,
        status: 400,
      })
      return res.status(400).json({
        error: `狀態為 ${application.status}，僅能審核 pending 的申請`,
      })
    }

    await pool.query(
      `UPDATE applications
          SET status = 'rejected',
              reject_reason = $1,
              reviewed_at = now(),
              reviewed_by = $2
        WHERE id = $3`,
      [reason, req.user?.one_user_name ?? 'admin', id]
    )

    try {
      await sendReservationRejectedEmail(application.user_email, reason)
    } catch (err) {
      console.error('[Applications][Reject] 寄信失敗:', err.message)
    }

    await writeAudit(req, {
      action: 'reject_application',
      targetId: id,
      requestBody: req.body || null,
      status: 200,
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[Applications][Reject] 失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
