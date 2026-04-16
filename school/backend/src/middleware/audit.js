import pool from '../db.js'

export async function auditLog(req, res, next) {
  const originalSend = res.send.bind(res)
  res.send = function (body) {
    setImmediate(async () => {
      try {
        await pool.query(
          `INSERT INTO audit_logs (user_id, user_name, action, target_type, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            req.user?.one_user_id || null,
            req.user?.one_user_name || 'anonymous',
            `${req.method} ${req.path}`,
            'api',
            req.ip,
          ]
        )
      } catch (err) {
        console.error('[Audit] 寫入 audit_logs 失敗:', err.message)
      }
    })
    return originalSend(body)
  }
  next()
}
