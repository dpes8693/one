import express from 'express'
import pool from '../db.js'

const router = express.Router()

// POST /api/schedules — 建立排程
router.post('/', async (req, res) => {
  const { one_user_id, one_vm_id, action, start_time, end_time, repeat_type } = req.body

  if (!one_user_id || !one_vm_id || !action || !start_time) {
    return res.status(400).json({ error: '請提供 one_user_id, one_vm_id, action, start_time' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO schedules (one_user_id, one_vm_id, action, start_time, end_time, repeat_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [one_user_id, one_vm_id, action, start_time, end_time || null, repeat_type || 'once']
    )
    return res.status(201).json({ schedule: result.rows[0] })
  } catch (err) {
    console.error('[Schedules] 建立失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// GET /api/schedules — 查詢排程列表（admin 看全部，user 看自己）
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    let result

    if (isAdmin) {
      result = await pool.query('SELECT * FROM schedules ORDER BY start_time DESC')
    } else {
      result = await pool.query(
        'SELECT * FROM schedules WHERE one_user_id = $1 ORDER BY start_time DESC',
        [req.user.one_user_id]
      )
    }

    return res.json({ schedules: result.rows })
  } catch (err) {
    console.error('[Schedules] 查詢失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// PUT /api/schedules/:id — 更新排程
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { start_time, end_time, repeat_type, is_active } = req.body

  try {
    const existing = await pool.query('SELECT * FROM schedules WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '排程不存在' })
    }

    const result = await pool.query(
      `UPDATE schedules
         SET start_time  = COALESCE($1, start_time),
             end_time    = COALESCE($2, end_time),
             repeat_type = COALESCE($3, repeat_type),
             is_active   = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING *`,
      [start_time || null, end_time || null, repeat_type || null, is_active ?? null, id]
    )

    return res.json({ schedule: result.rows[0] })
  } catch (err) {
    console.error('[Schedules] 更新失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// DELETE /api/schedules/:id — 刪除排程
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  try {
    const existing = await pool.query('SELECT * FROM schedules WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '排程不存在' })
    }

    await pool.query('DELETE FROM schedules WHERE id = $1', [id])
    return res.json({ message: '已刪除' })
  } catch (err) {
    console.error('[Schedules] 刪除失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
