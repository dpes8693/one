// tests/integration/audit.test.js
// F6: 審計日誌查詢 Backend 測試（TDD）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn().mockResolvedValue('fake-admin-token'),
  createUser: vi.fn().mockResolvedValue({ id: 999 }),
  setUserQuota: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../../src/services/notifier.js', () => ({
  sendApprovalNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendRejectionNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendNewApplicationNotification: vi.fn(),
}))

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}))

import app from '../../src/server.js'
import { testPool, clearTables } from '../helpers/testDb.js'
import { makeAdminToken } from '../helpers/authToken.js'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret'
function makeUserToken(overrides = {}) {
  const payload = {
    one_user_id: 5,
    one_user_name: 'student1',
    one_token: 'fake-token',
    role: 'user',
    ...overrides,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

describe('GET /api/audit', () => {
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('audit_logs')
    vi.clearAllMocks()

    // 插入測試資料
    await testPool.query(`
      INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, created_at)
      VALUES
        (1, 'oneadmin', 'vm.action.poweroff', 'vm', 100, '2026-04-10 10:00:00'),
        (5, 'student1', 'vm.action.resume',   'vm', 200, '2026-04-11 11:00:00'),
        (1, 'oneadmin', 'vm.action.resume',   'vm', 100, '2026-04-12 12:00:00')
    `)
  })

  it('admin 可取得全部審計日誌', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.logs.length).toBe(3)
  })

  it('依 user_id 過濾', async () => {
    const res = await request(app)
      .get('/api/audit?user_id=5')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.logs.length).toBe(1)
    expect(res.body.logs[0].user_id).toBe(5)
  })

  it('依 action 過濾', async () => {
    const res = await request(app)
      .get('/api/audit?action=vm.action.resume')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.logs.length).toBe(2)
    expect(res.body.logs.every(l => l.action === 'vm.action.resume')).toBe(true)
  })

  it('依 from 日期過濾', async () => {
    const res = await request(app)
      .get('/api/audit?from=2026-04-11')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.logs.length).toBe(2)
  })

  it('依 from + to 日期範圍過濾', async () => {
    const res = await request(app)
      .get('/api/audit?from=2026-04-11&to=2026-04-11 23:59:59')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.logs.length).toBe(1)
  })

  it('非 admin 回傳 403', async () => {
    const userToken = makeUserToken()
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(403)
  })

  it('無 token 回傳 401', async () => {
    const res = await request(app).get('/api/audit')
    expect(res.status).toBe(401)
  })
})
