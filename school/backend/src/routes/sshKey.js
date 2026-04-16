import express from 'express'
import { callFireEdge } from '../services/opennebula.js'

const router = express.Router()

// GET /api/users/me/ssh-key — 取自己的 SSH key
router.get('/ssh-key', async (req, res) => {
  try {
    const userId = req.user.one_user_id
    const token = req.user.one_token

    const userInfo = await callFireEdge('GET', `/user/info/${userId}`, null, token)
    const sshKey = userInfo?.data?.USER?.TEMPLATE?.SSH_PUBLIC_KEY || null

    return res.json({ ssh_public_key: sshKey })
  } catch (err) {
    console.error('[SSHKey] 取得失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// PUT /api/users/me/ssh-key — 設定 SSH key（merge 模式）
router.put('/ssh-key', async (req, res) => {
  const { ssh_public_key } = req.body
  if (!ssh_public_key) {
    return res.status(400).json({ error: '請提供 ssh_public_key' })
  }

  try {
    const userId = req.user.one_user_id
    const token = req.user.one_token

    const template = `SSH_PUBLIC_KEY="${ssh_public_key}"\n`
    await callFireEdge(
      'PUT',
      `/user/update/${userId}`,
      { template, replace: 0 },
      token
    )

    return res.json({ ok: true })
  } catch (err) {
    console.error('[SSHKey] 設定失敗:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
