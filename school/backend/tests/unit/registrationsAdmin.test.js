// tests/unit/registrationsAdmin.test.js
// Sprint 5 Task #10: 註冊審核 API 單元測試（admin only）
// Mock pool / opennebula / notifier；不真的連 DB 也不真的呼叫 ONE。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---- Mocks（必須在 import app 前）----
vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn().mockResolvedValue('fake-admin-token'),
  createUser: vi.fn().mockResolvedValue({ id: 999 }),
  setUserQuota: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../../src/services/notifier.js', () => ({
  sendVerificationCode: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendApprovalEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendRejectionEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendApprovalNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendRejectionNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendNewApplicationNotification: vi.fn(),
}))

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))

const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))
vi.mock('../../src/db.js', () => ({
  default: { query: dbQueryMock },
}))

import app from '../../src/server.js'
import { createUser, getAdminToken } from '../../src/services/opennebula.js'
import { sendApprovalEmail, sendRejectionEmail } from '../../src/services/notifier.js'

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
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 })
  // 預設 OpenNebula 成功
  createUser.mockResolvedValue({ id: 999 })
  getAdminToken.mockResolvedValue('fake-admin-token')
})

// ===== GET /api/admin/registrations =====

describe('GET /api/admin/registrations', () => {
  it('未登入回 401', async () => {
    const res = await request(app).get('/api/admin/registrations')
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .get('/api/admin/registrations')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('admin 取得 pending_review 列表（預設 status=pending_review）', async () => {
    const sample = [
      {
        id: 1, email: 'a@x.com', name: '甲', student_id: 'B1', memo: null,
        status: 'pending_review', reject_reason: null, one_user_id: null,
        created_at: new Date(), reviewed_at: null, reviewed_by: null, verified: true,
      },
      {
        id: 2, email: 'b@x.com', name: '乙', student_id: 'B2', memo: '資工',
        status: 'pending_review', reject_reason: null, one_user_id: null,
        created_at: new Date(), reviewed_at: null, reviewed_by: null, verified: true,
      },
    ]
    dbQueryMock.mockResolvedValueOnce({ rows: sample, rowCount: 2 })

    const res = await request(app)
      .get('/api/admin/registrations')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(2)
    // 不應包含 password_hash 與 verification_code
    expect(res.body.data[0]).not.toHaveProperty('password_hash')
    expect(res.body.data[0]).not.toHaveProperty('verification_code')

    // SQL 應 WHERE status=$1 + ORDER BY created_at DESC
    const call = dbQueryMock.mock.calls[0]
    expect(call[0]).toMatch(/FROM\s+pending_registrations/i)
    expect(call[0]).toMatch(/WHERE\s+status\s*=\s*\$1/i)
    expect(call[0]).toMatch(/ORDER BY created_at DESC/i)
    expect(call[1]).toEqual(['pending_review'])
  })

  it('?status=all 回所有狀態', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(app)
      .get('/api/admin/registrations?status=all')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const call = dbQueryMock.mock.calls[0]
    expect(call[0]).not.toMatch(/WHERE\s+status/i)
    expect(call[1]).toEqual([])
  })
})

// ===== POST /api/admin/registrations/:id/approve =====

describe('POST /api/admin/registrations/:id/approve', () => {
  function pendingRow(overrides = {}) {
    return {
      id: 1,
      email: 'student@x.com',
      name: '王小明',
      student_id: 'B12345678',
      status: 'pending_review',
      ...overrides,
    }
  }

  it('未登入 401', async () => {
    const res = await request(app).post('/api/admin/registrations/1/approve')
    expect(res.status).toBe(401)
  })

  it('非 admin 403', async () => {
    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('找不到該 id → 404', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(app)
      .post('/api/admin/registrations/999/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(404)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('狀態不是 pending_review → 400（不改 DB、不寄信、不呼叫 ONE）', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [pendingRow({ status: 'approved' })],
      rowCount: 1,
    })

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(400)
    expect(createUser).not.toHaveBeenCalled()
    expect(sendApprovalEmail).not.toHaveBeenCalled()
    // 不應有 UPDATE pending_registrations
    expect(dbQueryMock.mock.calls.some(c => /UPDATE pending_registrations/i.test(c[0]))).toBe(false)
  })

  it('正常 approve → 呼叫 ONE user.allocate + UPDATE DB + 寄信 + audit + 回 generated_password', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.one_user_id).toBe(999)
    expect(typeof res.body.generated_password).toBe('string')
    expect(res.body.generated_password).toHaveLength(12)

    // ONE 呼叫：學號 + 隨機密碼
    expect(getAdminToken).toHaveBeenCalledTimes(1)
    expect(createUser).toHaveBeenCalledTimes(1)
    const args = createUser.mock.calls[0]
    expect(args[0]).toBe('fake-admin-token')
    expect(args[1]).toBe('B12345678')
    expect(args[2]).toBe(res.body.generated_password)

    // UPDATE pending_registrations status='approved'
    const updateCall = dbQueryMock.mock.calls.find(([sql]) =>
      /UPDATE pending_registrations/i.test(sql)
    )
    expect(updateCall).toBeDefined()
    expect(updateCall[0]).toMatch(/status\s*=\s*'approved'/i)
    expect(updateCall[0]).toMatch(/one_user_id/i)
    expect(updateCall[0]).toMatch(/reviewed_at/i)
    expect(updateCall[0]).toMatch(/reviewed_by/i)
    expect(updateCall[1]).toContain('999')
    expect(updateCall[1]).toContain('oneadmin')

    // 寄信
    expect(sendApprovalEmail).toHaveBeenCalledTimes(1)
    expect(sendApprovalEmail).toHaveBeenCalledWith(
      'student@x.com',
      'B12345678',
      res.body.generated_password
    )

    // audit_logs 寫入
    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    const params = auditCall[1]
    expect(params).toContain('approve_registration')
    expect(params).toContain('registration')
    expect(params).toContain('1') // target_id 字串化
    expect(params).toContain(200)
  })

  it('admin 可以在 body 傳 password 覆寫', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'CustomP@ss123' })

    expect(res.status).toBe(200)
    expect(res.body.generated_password).toBe('CustomP@ss123')
    expect(createUser.mock.calls[0][2]).toBe('CustomP@ss123')
  })

  it('學號衝突（ONE 回 already used）→ 409，DB 狀態不改', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    createUser.mockRejectedValueOnce(new Error('NAME is already used by another USER'))

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(409)
    // 不應 UPDATE pending_registrations
    expect(dbQueryMock.mock.calls.some(c => /UPDATE pending_registrations/i.test(c[0]))).toBe(false)
    // 不應寄信
    expect(sendApprovalEmail).not.toHaveBeenCalled()
    // 仍應寫 audit（status=409）
    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    expect(auditCall[1]).toContain(409)
  })

  it('ONE 其他錯誤 → 502', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    createUser.mockRejectedValueOnce(new Error('FireEdge 錯誤 [500]: internal'))

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(502)
    expect(sendApprovalEmail).not.toHaveBeenCalled()
  })

  it('ONE 回傳 { data: { id } } 結構也能解析', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    createUser.mockResolvedValueOnce({ data: { id: 1234 } })

    const res = await request(app)
      .post('/api/admin/registrations/1/approve')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.one_user_id).toBe(1234)
  })
})

// ===== POST /api/admin/registrations/:id/reject =====

describe('POST /api/admin/registrations/:id/reject', () => {
  function pendingRow(overrides = {}) {
    return {
      id: 1,
      email: 'student@x.com',
      name: '王小明',
      student_id: 'B12345678',
      status: 'pending_review',
      ...overrides,
    }
  }

  it('未登入 401', async () => {
    const res = await request(app).post('/api/admin/registrations/1/reject')
    expect(res.status).toBe(401)
  })

  it('非 admin 403', async () => {
    const res = await request(app)
      .post('/api/admin/registrations/1/reject')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'no' })
    expect(res.status).toBe(403)
  })

  it('沒給 reason → 400', async () => {
    const res = await request(app)
      .post('/api/admin/registrations/1/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(sendRejectionEmail).not.toHaveBeenCalled()
  })

  it('reason 是空白字串 → 400', async () => {
    const res = await request(app)
      .post('/api/admin/registrations/1/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '   ' })
    expect(res.status).toBe(400)
  })

  it('找不到 → 404', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const res = await request(app)
      .post('/api/admin/registrations/999/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '資料不全' })
    expect(res.status).toBe(404)
  })

  it('狀態非 pending_review → 400', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [pendingRow({ status: 'rejected' })],
      rowCount: 1,
    })
    const res = await request(app)
      .post('/api/admin/registrations/1/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '重複' })
    expect(res.status).toBe(400)
    expect(sendRejectionEmail).not.toHaveBeenCalled()
  })

  it('正常 reject → 改 DB + 寄信 + audit', async () => {
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT[\s\S]*FROM pending_registrations[\s\S]*WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [pendingRow()], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .post('/api/admin/registrations/1/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '系所不符' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // UPDATE 包含 status='rejected', reject_reason, reviewed_at, reviewed_by
    const updateCall = dbQueryMock.mock.calls.find(([sql]) =>
      /UPDATE pending_registrations/i.test(sql)
    )
    expect(updateCall).toBeDefined()
    expect(updateCall[0]).toMatch(/status\s*=\s*'rejected'/i)
    expect(updateCall[0]).toMatch(/reject_reason/i)
    expect(updateCall[0]).toMatch(/reviewed_at/i)
    expect(updateCall[1]).toContain('系所不符')
    expect(updateCall[1]).toContain('oneadmin')

    // 寄信
    expect(sendRejectionEmail).toHaveBeenCalledTimes(1)
    expect(sendRejectionEmail).toHaveBeenCalledWith('student@x.com', '系所不符')

    // audit
    const auditCall = dbQueryMock.mock.calls.find(([sql]) =>
      /INSERT INTO audit_logs/i.test(sql)
    )
    expect(auditCall).toBeDefined()
    expect(auditCall[1]).toContain('reject_registration')
    expect(auditCall[1]).toContain('registration')
    expect(auditCall[1]).toContain(200)
  })
})
