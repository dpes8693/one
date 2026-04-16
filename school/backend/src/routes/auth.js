import express from 'express'
import jwt from 'jsonwebtoken'
import config from '../config.js'

const router = express.Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { user, password } = req.body
  if (!user || !password) {
    return res.status(400).json({ error: '請提供帳號與密碼' })
  }

  try {
    const fireEdgeRes = await fetch(`${config.opennebula.url}/fireedge/api/auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, token: password }),
    })

    const fireEdgeData = await fireEdgeRes.json()

    if (!fireEdgeRes.ok || !fireEdgeData?.data?.token) {
      console.error('[Auth] FireEdge 登入失敗:', fireEdgeData)
      return res.status(401).json({ error: '帳號或密碼錯誤' })
    }

    const { token: oneToken, id: oneUserId } = fireEdgeData.data
    // FireEdge response 不含 name，用登入時輸入的 user 欄位當 name
    const oneUserName = fireEdgeData.data?.name || user

    const role = oneUserId === '0' ? 'admin' : 'user'

    const platformToken = jwt.sign(
      {
        one_token: oneToken,
        one_user_id: oneUserId,
        one_user_name: oneUserName,
        role,
      },
      config.jwtSecret,
      { expiresIn: '8h' }
    )

    return res.json({
      token: platformToken,
      user: {
        id: oneUserId,
        name: oneUserName,
        role,
      },
    })
  } catch (err) {
    console.error('[Auth] 登入錯誤:', err.message)
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  return res.json({ message: '已登出' })
})

export default router
