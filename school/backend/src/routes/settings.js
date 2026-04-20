// routes/settings.js
// Sprint 5 Task #18: 系統設定 API（admin only）
//
// 提供 12 個 system_settings 欄位的查詢與更新。
// 所有「值是數字」的 key（max_*、verification_*）會強制驗證為正整數。
// 寫入 audit_logs（schema：request_body jsonb + response_status）。

import express from 'express'
import pool from '../db.js'

const router = express.Router()

// ---- middleware：admin only ----
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '僅限管理員存取' })
  }
  next()
}
router.use(requireAdmin)

// ---- 白名單：只允許這 12 個 key ----
const ALLOWED_KEYS = new Set([
  // 預約規則
  'max_active_reservations',
  'max_hours_per_reservation',
  'max_advance_booking_days',
  // 資源上限
  'max_total_cpu',
  'max_total_ram_gb',
  'max_total_disk_gb',
  'max_total_gpu',
  // 驗證碼
  'verification_code_ttl_min',
  'verification_max_per_hour',
  'verification_max_attempts',
  'verification_lockout_minutes',
  // Template
  'base_template_id',
])

// 數字類 key（要驗正整數）
const NUMERIC_KEYS = new Set([
  'max_active_reservations',
  'max_hours_per_reservation',
  'max_advance_booking_days',
  'max_total_cpu',
  'max_total_ram_gb',
  'max_total_disk_gb',
  'max_total_gpu',
  'verification_code_ttl_min',
  'verification_max_per_hour',
  'verification_max_attempts',
  'verification_lockout_minutes',
  'base_template_id',
])

// ---- audit helper ----
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
        'setting',
        targetId,
        requestBody ? JSON.stringify(requestBody) : null,
        status,
        req.ip ?? null,
      ]
    )
  } catch (err) {
    console.error('[Settings][Audit] 寫入失敗:', err.message)
  }
}

// ---- GET /api/admin/settings — 列出所有設定 ----
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT key, value, updated_at FROM system_settings ORDER BY key'
    )
    return res.json({ data: result.rows })
  } catch (err) {
    console.error('[Settings] 列表失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- PUT /api/admin/settings/:key — 更新單一設定 ----
router.put('/:key', async (req, res) => {
  const key = req.params.key
  const { value } = req.body ?? {}

  // 1) value 必填
  if (value === undefined || value === null || value === '') {
    return res.status(400).json({ error: '請提供 value' })
  }

  // 2) key 必須在白名單
  if (!ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ error: `不支援的設定 key：${key}` })
  }

  // 3) 數字 key 驗證為正整數
  if (NUMERIC_KEYS.has(key)) {
    const str = String(value).trim()
    if (!/^\d+$/.test(str) || parseInt(str, 10) <= 0) {
      return res.status(400).json({ error: `${key} 必須為正整數` })
    }
  }

  // 統一儲存為字串（system_settings.value 是 TEXT）
  const valueStr = String(value)

  try {
    const result = await pool.query(
      `UPDATE system_settings
          SET value = $1, updated_at = now()
        WHERE key = $2
        RETURNING key, value, updated_at`,
      [valueStr, key]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: `找不到設定：${key}` })
    }

    await writeAudit(req, {
      action: 'update_setting',
      targetId: key,
      requestBody: { value: valueStr },
      status: 200,
    })

    return res.json({ ok: true, key, value: valueStr })
  } catch (err) {
    console.error('[Settings] 更新失敗:', err.message)
    await writeAudit(req, {
      action: 'update_setting',
      targetId: key,
      requestBody: { value: valueStr },
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
