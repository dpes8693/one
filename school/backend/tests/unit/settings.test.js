// tests/unit/settings.test.js
// Sprint 5 Task #18: 系統設定 API 單元測試
// Mock pool 與 OpenNebula；不真的連 DB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---- Mocks ----
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

const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))
vi.mock('../../src/db.js', () => ({
  default: { query: dbQueryMock },
}))

import app from '../../src/server.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret'

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      one_user_id: 1,
      one_user_name: 'oneadmin',
      one_token: 'fake-one-token',
      role: 'admin',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
}

const adminToken = makeToken()
const userToken = makeToken({ one_user_id: 5, one_user_name: 'student1', role: 'user' })

const SAMPLE_ROWS = [
  { key: 'base_template_id', value: '1', updated_at: new Date().toISOString() },
  { key: 'max_active_reservations', value: '3', updated_at: new Date().toISOString() },
  { key: 'max_advance_booking_days', value: '30', updated_at: new Date().toISOString() },
  { key: 'max_hours_per_reservation', value: '24', updated_at: new Date().toISOString() },
  { key: 'max_total_cpu', value: '32', updated_at: new Date().toISOString() },
  { key: 'max_total_disk_gb', value: '2000', updated_at: new Date().toISOString() },
  { key: 'max_total_gpu', value: '8', updated_at: new Date().toISOString() },
  { key: 'max_total_ram_gb', value: '64', updated_at: new Date().toISOString() },
  { key: 'verification_code_ttl_min', value: '5', updated_at: new Date().toISOString() },
  { key: 'verification_lockout_minutes', value: '30', updated_at: new Date().toISOString() },
  { key: 'verification_max_attempts', value: '3', updated_at: new Date().toISOString() },
  { key: 'verification_max_per_hour', value: '5', updated_at: new Date().toISOString() },
]

beforeEach(() => {
  vi.clearAllMocks()
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 })
})

describe('GET /api/admin/settings', () => {
  it('未登入回 401', async () => {
    const res = await request(app).get('/api/admin/settings')
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('admin 取得 12 筆 setting', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: SAMPLE_ROWS, rowCount: 12 })

    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBe(12)
    // SQL 應 ORDER BY key
    const sqlCall = dbQueryMock.mock.calls.find(([sql]) =>
      /SELECT.+FROM\s+system_settings/i.test(sql)
    )
    expect(sqlCall).toBeDefined()
    expect(sqlCall[0]).toMatch(/ORDER BY key/i)
  })
})

describe('PUT /api/admin/settings/:key', () => {
  it('未登入回 401', async () => {
    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .send({ value: '16' })
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ value: '16' })
    expect(res.status).toBe(403)
  })

  it('白名單外的 key 回 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/evil_key')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '1' })
    expect(res.status).toBe(400)
  })

  it('缺 value 回 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('數字 key 用非數字 value 回 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'abc' })
    expect(res.status).toBe(400)
  })

  it('數字 key 用 0 / 負數 回 400', async () => {
    const res1 = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '0' })
    expect(res1.status).toBe(400)

    const res2 = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '-5' })
    expect(res2.status).toBe(400)
  })

  it('數字 key 正常更新 → DB UPDATE + 寫 audit_logs', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/UPDATE\s+system_settings/i.test(sql)) {
        return Promise.resolve({
          rows: [{ key: 'max_total_cpu', value: '64', updated_at: new Date().toISOString() }],
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '64' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.key).toBe('max_total_cpu')
    expect(res.body.value).toBe('64')

    // UPDATE 呼叫
    const updateCall = dbQueryMock.mock.calls.find(([sql]) =>
      /UPDATE\s+system_settings/i.test(sql)
    )
    expect(updateCall).toBeDefined()
    expect(updateCall[1]).toContain('64')
    expect(updateCall[1]).toContain('max_total_cpu')

    // audit_logs 寫入
    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    const params = auditCall[1]
    expect(params).toContain(1) // user_id
    expect(params).toContain('oneadmin')
    expect(params.some(p => typeof p === 'string' && p.includes('update_setting'))).toBe(true)
    expect(params).toContain('setting') // target_type
    expect(params).toContain('max_total_cpu') // target_id
    expect(params).toContain(200) // response_status
  })

  it('找不到 key 回 404', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(app)
      .put('/api/admin/settings/max_total_cpu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '64' })
    expect(res.status).toBe(404)
  })
})
