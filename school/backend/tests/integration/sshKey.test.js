// tests/integration/sshKey.test.js
// F7: SSH Key 管理 Backend 測試（TDD）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../../src/services/opennebula.js', () => {
  const callFireEdge = vi.fn()
  return {
    callFireEdge: callFireEdge,
    getAdminToken: vi.fn().mockResolvedValue('fake-admin-token'),
    createUser: vi.fn().mockResolvedValue({ id: 999 }),
    setUserQuota: vi.fn().mockResolvedValue({ ok: true }),
  }
})

vi.mock('../../src/services/notifier.js', () => ({
  sendApprovalNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendRejectionNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendNewApplicationNotification: vi.fn(),
}))

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}))

import app from '../../src/server.js'
import { makeAdminToken } from '../helpers/authToken.js'
import jwt from 'jsonwebtoken'
import { callFireEdge } from '../../src/services/opennebula.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret'
function makeUserToken(overrides = {}) {
  const payload = {
    one_user_id: 5,
    one_user_name: 'student1',
    one_token: 'fake-user-token',
    role: 'user',
    ...overrides,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

describe('GET /api/users/me/ssh-key', () => {
  beforeEach(() => vi.clearAllMocks())

  it('成功回傳 ssh_public_key', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: {
        USER: {
          TEMPLATE: { SSH_PUBLIC_KEY: 'ssh-rsa AAAA...' },
        },
      },
    })

    const userToken = makeUserToken()
    const res = await request(app)
      .get('/api/users/me/ssh-key')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ssh_public_key).toBe('ssh-rsa AAAA...')
  })

  it('使用者沒有設定 ssh key 時回傳 null', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: { USER: { TEMPLATE: {} } },
    })

    const userToken = makeUserToken()
    const res = await request(app)
      .get('/api/users/me/ssh-key')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ssh_public_key).toBeNull()
  })

  it('無 token 回傳 401', async () => {
    const res = await request(app).get('/api/users/me/ssh-key')
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/users/me/ssh-key', () => {
  beforeEach(() => vi.clearAllMocks())

  it('成功設定 SSH key 並以 merge 模式更新 OpenNebula', async () => {
    callFireEdge.mockResolvedValueOnce({ ok: true })

    const userToken = makeUserToken()
    const res = await request(app)
      .put('/api/users/me/ssh-key')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ssh_public_key: 'ssh-rsa AAAA...' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // 驗證有正確 merge SSH_PUBLIC_KEY
    expect(callFireEdge).toHaveBeenCalledWith(
      'PUT',
      '/user/update/5',
      expect.objectContaining({
        template: expect.stringContaining('SSH_PUBLIC_KEY="ssh-rsa AAAA..."'),
        replace: 0,
      }),
      'fake-user-token'
    )
  })

  it('缺少 ssh_public_key 回傳 400', async () => {
    const userToken = makeUserToken()
    const res = await request(app)
      .put('/api/users/me/ssh-key')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('無 token 回傳 401', async () => {
    const res = await request(app)
      .put('/api/users/me/ssh-key')
      .send({ ssh_public_key: 'ssh-rsa AAAA...' })

    expect(res.status).toBe(401)
  })
})
