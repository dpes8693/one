import express from 'express'
import pool from '../db.js'

const router = express.Router()

// GET /api/alerts — 查詢 GPU 告警紀錄（需登入）
router.get('/', async (req, res) => {
  const { from, to, limit } = req.query
  const maxLimit = Math.min(parseInt(limit) || 100, 500)

  try {
    const conditions = []
    const params = []

    if (from) {
      params.push(from)
      conditions.push(`triggered_at >= $${params.length}`)
    }
    if (to) {
      params.push(to)
      conditions.push(`triggered_at <= $${params.length}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(maxLimit)
    const query = `SELECT * FROM gpu_alerts ${where} ORDER BY triggered_at DESC LIMIT $${params.length}`

    const result = await pool.query(query, params)
    return res.json({ alerts: result.rows })
  } catch (err) {
    console.error('[Alerts] 查詢失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
