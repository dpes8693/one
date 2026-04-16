import { createProxyMiddleware } from 'http-proxy-middleware'
import config from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { auditLog } from '../middleware/audit.js'

const proxyMiddleware = createProxyMiddleware({
  target: config.opennebula.url,
  changeOrigin: true,
  pathRewrite: (path) => `/fireedge/api${path}`,
  on: {
    proxyReq: (proxyReq, req) => {
      if (req.user?.one_token) {
        proxyReq.setHeader('Authorization', `Bearer ${req.user.one_token}`)
      }
    },
    error: (err, req, res) => {
      console.error('[Proxy] 代理錯誤:', err.message)
      res.status(502).json({ error: '無法連接 FireEdge' })
    },
  },
})

export default [requireAuth, auditLog, proxyMiddleware]
