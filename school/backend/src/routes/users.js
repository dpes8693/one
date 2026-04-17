import express from 'express'
import pool from '../db.js'
import { callFireEdge } from '../services/opennebula.js'

const router = express.Router()

// ---- middleware ----
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '僅限管理員存取' })
  }
  next()
}

router.use(requireAdmin)

// ---- helpers ----
/**
 * 寫一筆 audit_logs。
 * audit_logs schema: user_id, user_name, action, target_type, target_id,
 *                    request_body(jsonb), response_status, ip_address, created_at
 */
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
        'user',
        targetId,
        requestBody ? JSON.stringify(requestBody) : null,
        status,
        req.ip ?? null,
      ]
    )
  } catch (err) {
    // 審計失敗不能讓主流程也失敗，記 log 即可
    console.error('[Users][Audit] 寫入失敗:', err.message)
  }
}

/**
 * FireEdge 取出來的 USER pool 可能是陣列也可能是單一物件，標準化成陣列。
 */
function normalizeUserList(payload) {
  const users =
    payload?.data?.USER_POOL?.USER ??
    payload?.USER_POOL?.USER ??
    []
  if (Array.isArray(users)) return users
  if (users && typeof users === 'object') return [users]
  return []
}

function extractUser(payload) {
  return payload?.data?.USER ?? payload?.USER ?? null
}

// ---- GET /api/users — 列出全部用戶 ----
router.get('/', async (req, res) => {
  try {
    const token = req.user.one_token
    const data = await callFireEdge('GET', '/userpool/info', null, token)
    const users = normalizeUserList(data)
    return res.json({ users })
  } catch (err) {
    console.error('[Users] 列表失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- GET /api/users/:id — 單一用戶 ----
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id
    const token = req.user.one_token
    const data = await callFireEdge('GET', `/user/info/${id}`, null, token)
    return res.json({ user: extractUser(data) })
  } catch (err) {
    console.error('[Users] 取得失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- PUT /api/users/:id/quota — 修改 VM/CPU/MEMORY/SYSTEM_DISK_SIZE ----
router.put('/:id/quota', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { vms, cpu, memory, system_disk_size } = req.body ?? {}

  // 構造 OpenNebula 預期的 USER_QUOTA template XML
  const lines = []
  if (vms !== undefined) lines.push(`        <VMS>${vms}</VMS>`)
  if (cpu !== undefined) lines.push(`        <CPU>${cpu}</CPU>`)
  if (memory !== undefined) lines.push(`        <MEMORY>${memory}</MEMORY>`)
  if (system_disk_size !== undefined)
    lines.push(`        <SYSTEM_DISK_SIZE>${system_disk_size}</SYSTEM_DISK_SIZE>`)

  const template = `<USER_QUOTA>
  <VM_QUOTA>
    <VM>
${lines.join('\n')}
    </VM>
  </VM_QUOTA>
</USER_QUOTA>`

  try {
    const token = req.user.one_token
    await callFireEdge('PUT', `/user/quota/${id}`, { template }, token)
    await writeAudit(req, {
      action: 'user.quota.update',
      targetId: id,
      requestBody: { vms, cpu, memory, system_disk_size },
      status: 200,
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[Users] 改配額失敗:', err.message)
    await writeAudit(req, {
      action: 'user.quota.update',
      targetId: id,
      requestBody: { vms, cpu, memory, system_disk_size },
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- PUT /api/users/:id/enable ----
router.put('/:id/enable', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  try {
    const token = req.user.one_token
    await callFireEdge('PUT', `/user/enable/${id}`, { enable: true }, token)
    await writeAudit(req, { action: 'user.enable', targetId: id, status: 200 })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[Users] enable 失敗:', err.message)
    await writeAudit(req, { action: 'user.enable', targetId: id, status: 500 })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- PUT /api/users/:id/disable ----
router.put('/:id/disable', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  try {
    const token = req.user.one_token
    await callFireEdge('PUT', `/user/enable/${id}`, { enable: false }, token)
    await writeAudit(req, { action: 'user.disable', targetId: id, status: 200 })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[Users] disable 失敗:', err.message)
    await writeAudit(req, { action: 'user.disable', targetId: id, status: 500 })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// ---- PUT /api/users/:id/password ----
router.put('/:id/password', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { password } = req.body ?? {}
  if (!password) {
    return res.status(400).json({ error: '請提供 password' })
  }

  try {
    const token = req.user.one_token
    await callFireEdge('PUT', `/user/passwd/${id}`, { password }, token)
    // 安全：審計裡不寫密碼，只記事件
    await writeAudit(req, {
      action: 'user.password.reset',
      targetId: id,
      requestBody: { password_changed: true },
      status: 200,
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[Users] passwd 失敗:', err.message)
    await writeAudit(req, {
      action: 'user.password.reset',
      targetId: id,
      requestBody: { password_changed: false },
      status: 500,
    })
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
