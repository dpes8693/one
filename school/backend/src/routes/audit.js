import express from 'express'
import pool from '../db.js'

const router = express.Router()

// GET /api/audit — 審計日誌查詢（admin only）
router.get('/', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '僅限管理員存取' })
  }

  const { user_id, action, from, to, limit } = req.query
  const maxLimit = Math.min(parseInt(limit) || 100, 500)

  try {
    const conditions = []
    const params = []

    if (user_id) {
      params.push(parseInt(user_id))
      conditions.push(`user_id = $${params.length}`)
    }
    if (action) {
      params.push(action)
      conditions.push(`action = $${params.length}`)
    }
    if (from) {
      params.push(from)
      conditions.push(`created_at >= $${params.length}`)
    }
    if (to) {
      params.push(to)
      conditions.push(`created_at <= $${params.length}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(maxLimit)
    const query = `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`

    const result = await pool.query(query, params)
    return res.json({ logs: result.rows })
  } catch (err) {
    console.error('[Audit] 查詢失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
