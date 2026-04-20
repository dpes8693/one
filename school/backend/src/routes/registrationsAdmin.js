// routes/registrationsAdmin.js
// Sprint 5 Task #10: 註冊審核 API（admin only）
//
// 三個端點：
//   GET  /api/admin/registrations            待審清單（?status=pending_review|all）
//   POST /api/admin/registrations/:id/approve  通過 → 建 ONE user + 寄密碼
//   POST /api/admin/registrations/:id/reject   拒絕 → 寄拒絕原因
//
// 規格依據：school/docs/SPEC_V2.md（R4-R6 + N1/N2 + ③ 管理員審核）
import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdminToken, createUser } from '../services/opennebula.js'
import { sendApprovalEmail, sendRejectionEmail } from '../services/notifier.js'
import { generateRandomPassword } from '../utils/password.js'

const router = express.Router()

// ---- middleware：admin only ----
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '僅限管理員存取' })
  }
  next()
}

router.use(requireAuth)
router.use(requireAdmin)

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
        'registration',
        targetId != null ? String(targetId) : null,
        requestBody ? JSON.stringify(requestBody) : null,
        status,
        req.ip ?? null,
      ]
    )
  } catch (err) {
    console.error('[RegAdmin][Audit] 寫入失敗:', err.message)
  }
}

// ---- GET /api/admin/registrations ----
// 預設只看 pending_review；?status=all 看全部；亦可傳具體狀態
router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pending_review').trim()

    let sql, params
    if (status === 'all') {
      sql = `
        SELECT id, email, name, student_id, memo, status, reject_reason,
               one_user_id, created_at, reviewed_at, reviewed_by, verified
          FROM pending_registrations
         ORDER BY created_at DESC
      `
      params = []
    } else {
      sql = `
        SELECT id, email, name, student_id, memo, status, reject_reason,
               one_user_id, created_at, reviewed_at, reviewed_by, verified
          FROM pending_registrations
         WHERE status = $1
         ORDER BY created_at DESC
      `
      params = [status]
    }

    const r = await pool.query(sql, params)
    return res.json({ data: r.rows })
  } catch (err) {
    console.error('[RegAdmin] GET 列表失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- POST /api/admin/registrations/:id/approve ----
router.post('/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '無效的 id' })
  }
  const overridePassword = req.body?.password ? String(req.body.password) : null

  try {
    // 1) 查 pending
    const r = await pool.query(
      `SELECT id, email, name, student_id, status
         FROM pending_registrations
        WHERE id = $1`,
      [id]
    )
    if (r.rows.length === 0) {
      return res.status(404).json({ error: '找不到該註冊申請' })
    }
    const pending = r.rows[0]

    if (pending.status !== 'pending_review') {
      return res.status(400).json({
        error: `狀態為 ${pending.status}，無法審核（必須是 pending_review）`,
      })
    }

    // 2) 產密碼（admin 可覆寫）
    const password = overridePassword || generateRandomPassword(12)

    // 3) 呼叫 OpenNebula user.allocate（學號當 username）
    let oneUserId
    try {
      const adminToken = await getAdminToken()
      const result = await createUser(adminToken, pending.student_id, password)
      // FireEdge 回傳結構不一：可能 { id }、{ data: { id } }、或數字
      oneUserId =
        result?.id ??
        result?.data?.id ??
        result?.data ??
        (typeof result === 'number' ? result : null)
      if (oneUserId == null) {
        throw new Error('OpenNebula 未回傳 user id')
      }
    } catch (err) {
      const msg = err?.message || String(err)
      // 學號衝突 → 409
      const conflict = /already used|exists|duplicate|conflict/i.test(msg)
      const httpStatus = conflict ? 409 : 502
      await writeAudit(req, {
        action: 'approve_registration',
        targetId: id,
        requestBody: { student_id: pending.student_id },
        status: httpStatus,
      })
      return res.status(httpStatus).json({
        error: conflict
          ? `學號 ${pending.student_id} 已存在於 OpenNebula，請改用其他學號`
          : `OpenNebula 建立帳號失敗：${msg}`,
      })
    }

    // 4) 更新 DB
    await pool.query(
      `UPDATE pending_registrations
          SET status = 'approved',
              one_user_id = $1,
              reviewed_at = now(),
              reviewed_by = $2
        WHERE id = $3`,
      [String(oneUserId), req.user?.one_user_name ?? 'admin', id]
    )

    // 5) 寄信
    try {
      await sendApprovalEmail(pending.email, pending.student_id, password)
    } catch (err) {
      console.error('[RegAdmin] 寄通過信失敗（不阻擋流程）:', err.message)
    }

    // 6) audit
    await writeAudit(req, {
      action: 'approve_registration',
      targetId: id,
      requestBody: { student_id: pending.student_id },
      status: 200,
    })

    // 7) 回應（明文密碼僅這次顯示）
    return res.json({
      ok: true,
      one_user_id: oneUserId,
      generated_password: password,
    })
  } catch (err) {
    console.error('[RegAdmin] approve 失敗:', err.message)
    await writeAudit(req, {
      action: 'approve_registration',
      targetId: id,
      requestBody: null,
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- POST /api/admin/registrations/:id/reject ----
router.post('/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '無效的 id' })
  }
  const reason = req.body?.reason ? String(req.body.reason).trim() : ''
  if (!reason) {
    return res.status(400).json({ error: '請提供拒絕原因（reason）' })
  }

  try {
    // 1) 查狀態
    const r = await pool.query(
      `SELECT id, email, name, student_id, status
         FROM pending_registrations
        WHERE id = $1`,
      [id]
    )
    if (r.rows.length === 0) {
      return res.status(404).json({ error: '找不到該註冊申請' })
    }
    const pending = r.rows[0]
    if (pending.status !== 'pending_review') {
      return res.status(400).json({
        error: `狀態為 ${pending.status}，無法審核（必須是 pending_review）`,
      })
    }

    // 2) 更新 DB
    await pool.query(
      `UPDATE pending_registrations
          SET status = 'rejected',
              reject_reason = $1,
              reviewed_at = now(),
              reviewed_by = $2
        WHERE id = $3`,
      [reason, req.user?.one_user_name ?? 'admin', id]
    )

    // 3) 寄信
    try {
      await sendRejectionEmail(pending.email, reason)
    } catch (err) {
      console.error('[RegAdmin] 寄拒絕信失敗（不阻擋流程）:', err.message)
    }

    // 4) audit
    await writeAudit(req, {
      action: 'reject_registration',
      targetId: id,
      requestBody: { reason },
      status: 200,
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error('[RegAdmin] reject 失敗:', err.message)
    await writeAudit(req, {
      action: 'reject_registration',
      targetId: id,
      requestBody: { reason },
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
