// tests/integration/auth.test.js
// Bug B: login 回傳 role 欄位
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// mock global fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

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

import app from '../../src/server.js'

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('oneadmin (id=0) 登入後 user.role === "admin"', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          token: 'fake-one-token',
          id: '0',
          name: 'oneadmin',
        },
      }),
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ user: 'oneadmin', password: 'pass' })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('admin')
    expect(res.body.token).toBeDefined()
  })

  it('普通使用者 (id != 0) 登入後 user.role === "user"', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          token: 'fake-one-token',
          id: '5',
          name: 'student1',
        },
      }),
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ user: 'student1', password: 'pass' })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('user')
  })

  it('帳號或密碼錯誤回傳 401', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: '帳號或密碼錯誤' }),
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ user: 'bad', password: 'wrong' })

    expect(res.status).toBe(401)
  })

  it('缺少帳號或密碼回傳 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ user: 'only-user' })

    expect(res.status).toBe(400)
  })
})
