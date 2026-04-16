import express from 'express'
import cors from 'cors'
import pool from './db.js'
import authRoutes from './routes/auth.js'
import applicationsRoutes from './routes/applications.js'
import proxyRoutes from './routes/proxy.js'
import vipRoutes from './routes/vip.js'
import schedulesRoutes from './routes/schedules.js'
import auditRoutes from './routes/audit.js'
import sshKeyRoutes from './routes/sshKey.js'
import alertsRoutes from './routes/alerts.js'
import { requireAuth } from './middleware/auth.js'

const app = express()

// CORS — dev 階段允許前端 localhost:3000
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}))

app.use(express.json())

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'ok'
  let dbError = null

  try {
    await pool.query('SELECT 1')
  } catch (err) {
    dbStatus = 'error'
    dbError = err.message
  }

  const status = dbStatus === 'ok' ? 200 : 503
  return res.status(status).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    db: dbStatus,
    dbError,
    timestamp: new Date().toISOString(),
  })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/vip', requireAuth, vipRoutes)
app.use('/api/schedules', requireAuth, schedulesRoutes)
app.use('/api/audit', requireAuth, auditRoutes)
app.use('/api/users/me', requireAuth, sshKeyRoutes)
app.use('/api/alerts', requireAuth, alertsRoutes)
app.use('/api/one', ...proxyRoutes)

// 404
app.use((req, res) => {
  res.status(404).json({ error: `找不到路由: ${req.method} ${req.path}` })
})

export default app
