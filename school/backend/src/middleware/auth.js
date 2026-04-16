import jwt from 'jsonwebtoken'
import config from '../config.js'

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供認證 Token' })
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效或已過期' })
  }
}
