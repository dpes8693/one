// tests/unit/users.test.js
// Sprint 4 Task #2: Users 管理 API 單元測試（TDD）
// 全部 mock — 不依賴實際 DB 或 OpenNebula。
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

// 用 mock pool 覆蓋 db.js — 單元測試不真的連 PG
const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn().mockResolvedValue({ rows: [] }),
}))
vi.mock('../../src/db.js', () => ({
  default: { query: dbQueryMock },
}))

import app from '../../src/server.js'
import { callFireEdge } from '../../src/services/opennebula.js'

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

beforeEach(() => {
  vi.clearAllMocks()
  dbQueryMock.mockResolvedValue({ rows: [] })
})

describe('GET /api/users', () => {
  it('admin 可取得 OpenNebula 用戶列表', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: {
        USER_POOL: {
          USER: [
            { ID: '0', NAME: 'oneadmin' },
            { ID: '5', NAME: 'student1' },
          ],
        },
      },
    })

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.users)).toBe(true)
    expect(res.body.users.length).toBe(2)
    expect(callFireEdge).toHaveBeenCalledWith(
      'GET',
      '/userpool/info',
      null,
      'fake-one-token'
    )
  })

  it('支援單一 USER 物件（FireEdge 只回一筆時不是陣列）', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: { USER_POOL: { USER: { ID: '0', NAME: 'oneadmin' } } },
    })

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.users.length).toBe(1)
  })

  it('無 token 回 401', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/users/:id', () => {
  it('admin 可取得單一用戶資訊', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: { USER: { ID: '5', NAME: 'student1' } },
    })

    const res = await request(app)
      .get('/api/users/5')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.ID).toBe('5')
    expect(callFireEdge).toHaveBeenCalledWith(
      'GET',
      '/user/info/5',
      null,
      'fake-one-token'
    )
  })

  it('無 token 回 401', async () => {
    const res = await request(app).get('/api/users/5')
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .get('/api/users/5')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/users/:id/quota', () => {
  it('修改配額並回 200', async () => {
    callFireEdge.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .put('/api/users/5/quota')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vms: 2, cpu: 4, memory: 4096, system_disk_size: 20480 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const call = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/user/quota/5'
    )
    expect(call).toBeDefined()
    // 應傳一段 USER_QUOTA 的 template XML
    const body = call[2]
    expect(body.template).toContain('<VMS>2</VMS>')
    expect(body.template).toContain('<CPU>4</CPU>')
    expect(body.template).toContain('<MEMORY>4096</MEMORY>')
    expect(body.template).toContain('<SYSTEM_DISK_SIZE>20480</SYSTEM_DISK_SIZE>')
  })

  it('PUT quota 會寫一筆 audit_logs', async () => {
    callFireEdge.mockResolvedValueOnce({ data: {} })

    await request(app)
      .put('/api/users/5/quota')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vms: 2, cpu: 4, memory: 4096 })

    // 找到對 audit_logs 的 INSERT
    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    const params = auditCall[1]
    // user_id, user_name, action, target_type, target_id, request_body, response_status
    expect(params).toContain(1) // user_id (admin)
    expect(params).toContain('oneadmin')
    expect(params.some(p => typeof p === 'string' && p.includes('user.quota.update'))).toBe(true)
    expect(params).toContain('user')
    expect(params).toContain(5) // target_id
  })

  it('無 token 回 401', async () => {
    const res = await request(app)
      .put('/api/users/5/quota')
      .send({ vms: 1 })
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/users/5/quota')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vms: 1 })
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/users/:id/enable', () => {
  it('呼叫 user/enable 並寫 audit', async () => {
    callFireEdge.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .put('/api/users/5/enable')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const call = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/user/enable/5'
    )
    expect(call).toBeDefined()
    expect(call[2]).toEqual({ enable: true })

    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    expect(auditCall[1].some(p => typeof p === 'string' && p.includes('user.enable'))).toBe(true)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/users/5/enable')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/users/:id/disable', () => {
  it('呼叫 user/enable {enable:false} 並寫 audit', async () => {
    callFireEdge.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .put('/api/users/5/disable')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const call = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/user/enable/5'
    )
    expect(call).toBeDefined()
    expect(call[2]).toEqual({ enable: false })

    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall[1].some(p => typeof p === 'string' && p.includes('user.disable'))).toBe(true)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/users/5/disable')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/users/:id/password', () => {
  it('重設密碼，呼叫 user/passwd 並寫 audit', async () => {
    callFireEdge.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .put('/api/users/5/password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'newSecret123' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const call = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/user/passwd/5'
    )
    expect(call).toBeDefined()
    expect(call[2]).toEqual({ password: 'newSecret123' })

    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    expect(auditCall[1].some(p => typeof p === 'string' && p.includes('user.password.reset'))).toBe(true)
    // 不應在 audit 中暴露密碼
    const requestBodyParam = auditCall[1].find(
      p => p && typeof p === 'object' && !Array.isArray(p)
    )
    if (requestBodyParam) {
      expect(JSON.stringify(requestBodyParam)).not.toContain('newSecret123')
    }
  })

  it('缺 password 回 400', async () => {
    const res = await request(app)
      .put('/api/users/5/password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/users/5/password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ password: 'x' })
    expect(res.status).toBe(403)
  })

  it('無 token 回 401', async () => {
    const res = await request(app)
      .put('/api/users/5/password')
      .send({ password: 'x' })
    expect(res.status).toBe(401)
  })
})
