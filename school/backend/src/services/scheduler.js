import cron from 'node-cron'
import pool from '../db.js'
import { callFireEdge } from './opennebula.js'

/**
 * 每分鐘觸發排程：找出 is_active=true 且 start_time <= now 的排程，執行對應動作
 */
export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM schedules
          WHERE is_active = true
            AND start_time <= NOW()`
      )

      for (const schedule of rows) {
        try {
          // 目前 action 欄位未在 schema，讀自 repeat_type 欄或外部傳入
          // 這裡預設 resume；若需要支援多 action 可加欄位
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

          // 若是 once，執行後停用
          if (!schedule.repeat_type || schedule.repeat_type === 'once') {
            await pool.query('UPDATE schedules SET is_active = false WHERE id = $1', [schedule.id])
          }
        } catch (err) {
          console.error(`[Scheduler] 排程 ${schedule.id} 執行失敗:`, err.message)
        }
      }
    } catch (err) {
      console.error('[Scheduler] 查詢排程失敗:', err.message)
    }
  })

  // 每 5 分鐘檢查 VM 使用時數限制（F9）
  cron.schedule('*/5 * * * *', async () => {
    try {
      const maxHours = parseInt(process.env.VM_MAX_HOURS || '4', 10)
      const maxSeconds = maxHours * 3600

      // 取出所有 approved 的 VM
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
  })

  console.log('[Scheduler] 排程服務已啟動')
}
