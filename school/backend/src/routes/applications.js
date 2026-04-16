import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdminToken, createUser, setUserQuota } from '../services/opennebula.js'
import {
  sendApprovalNotification,
  sendRejectionNotification,
  sendNewApplicationNotification,
} from '../services/notifier.js'

const router = express.Router()

// POST /api/applications — 學生提交申請（無需登入）
router.post('/', async (req, res) => {
  const { student_name, student_id, email, purpose, gpu_spec } = req.body
  if (!student_name || !student_id || !email || !purpose) {
    return res.status(400).json({ error: '請填寫姓名、學號、Email 及用途' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO applications (student_name, student_id, email, purpose, gpu_spec, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, student_name, student_id, email, purpose, gpu_spec, status, created_at`,
      [student_name, student_id, email, purpose, gpu_spec || null]
    )

    sendNewApplicationNotification({ studentName: student_name, studentId: student_id, purpose })

    return res.status(201).json({ application: result.rows[0] })
  } catch (err) {
    console.error('[Applications] 建立申請失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤' })
  }
})

// GET /api/applications — 管理員查詢申請列表（需登入）
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query
  const validStatuses = ['pending', 'approved', 'rejected']

  try {
    let query = `SELECT * FROM applications ORDER BY created_at DESC`
    let params = []

    if (status && validStatuses.includes(status)) {
      query = `SELECT * FROM applications WHERE status = $1 ORDER BY created_at DESC`
      params = [status]
    }

    const result = await pool.query(query, params)
    return res.json({ applications: result.rows })
  } catch (err) {
    console.error('[Applications] 查詢失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤' })
  }
})

// PUT /api/applications/:id/approve — 管理員審核通過（需登入）
router.put('/:id/approve', requireAuth, async (req, res) => {
  const { id } = req.params
  const { quota } = req.body

  try {
    const appResult = await pool.query('SELECT * FROM applications WHERE id = $1', [id])
    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: '申請不存在' })
    }
    const application = appResult.rows[0]
    if (application.status !== 'pending') {
      return res.status(400).json({ error: `申請已處理（狀態：${application.status}）` })
    }

    // 取得 oneadmin token
    const adminToken = await getAdminToken()

    // 產生帳號名稱與隨機密碼
    const username = `student_${application.student_id}`.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)

    // 建立 OpenNebula 使用者帳號
    let oneUserId = null
    try {
      const createRes = await createUser(adminToken, username, password)
      // 支援 { id } 或 { data: { id } } 兩種回傳格式
      oneUserId = createRes?.id ?? createRes?.data?.id ?? null
      console.log('[Approve] 建立帳號成功, userId:', oneUserId)
    } catch (err) {
      console.error('[Approve] 建立帳號失敗:', err.message)
      // 帳號可能已存在，繼續流程
    }

    // 設定配額
    if (oneUserId && quota) {
      try {
        await setUserQuota(adminToken, oneUserId, quota)
        console.log('[Approve] 設定配額成功')
      } catch (err) {
        console.error('[Approve] 設定配額失敗:', err.message)
      }
    }

    // 更新申請狀態
    const updatedApp = await pool.query(
      'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['approved', id]
    )

    // 寫審核紀錄
    const reviewResult = await pool.query(
      `INSERT INTO application_reviews
         (application_id, reviewer_name, decision, one_user_id)
       VALUES ($1, $2, 'approved', $3)
       RETURNING *`,
      [id, req.user.one_user_name, oneUserId]
    )

    // 寫 email_notifications 紀錄並發通知
    await sendApprovalNotification({
      email: application.email,
      studentName: application.student_name,
      username,
      password,
      relatedId: parseInt(id),
    })

    return res.json({
      message: '申請已通過',
      application: updatedApp.rows[0],
      review: reviewResult.rows[0],
      username,
    })
  } catch (err) {
    console.error('[Approve] 錯誤:', err.message)
    return res.status(500).json({ error: '伺服器錯誤' })
  }
})

// PUT /api/applications/:id/reject — 管理員拒絕申請（需登入）
router.put('/:id/reject', requireAuth, async (req, res) => {
  const { id } = req.params
  const { reason } = req.body

  if (!reason) {
    return res.status(400).json({ error: '請提供拒絕原因' })
  }

  try {
    const appResult = await pool.query('SELECT * FROM applications WHERE id = $1', [id])
    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: '申請不存在' })
    }
    const application = appResult.rows[0]
    if (application.status !== 'pending') {
      return res.status(400).json({ error: `申請已處理（狀態：${application.status}）` })
    }

    await pool.query(
      'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2',
      ['rejected', id]
    )

    await pool.query(
      `INSERT INTO application_reviews
         (application_id, reviewer_name, decision, reason)
       VALUES ($1, $2, 'rejected', $3)`,
      [id, req.user.one_user_name, reason]
    )

    await sendRejectionNotification({
      email: application.email,
      studentName: application.student_name,
      reason,
      relatedId: parseInt(id),
    })

    return res.json({ message: '申請已拒絕' })
  } catch (err) {
    console.error('[Reject] 錯誤:', err.message)
    return res.status(500).json({ error: '伺服器錯誤' })
  }
})

export default router
