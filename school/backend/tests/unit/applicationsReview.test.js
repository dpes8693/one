// tests/unit/applicationsReview.test.js
// Sprint 5 Task #15：PUT /api/applications/:id/approve | reject 單元測試
//
// Mock pool / opennebula / notifier / resourceInventory；不真連 DB / ONE。
// 重點：
//   - 401 / 403 權限
//   - status != pending → 400
//   - 資源足 → 200 + DB UPDATE + allocateGpus 被呼叫 + 寄信
//   - 資源不足 → 409 + 狀態不改
//   - excludeApplicationId 被傳給 checkResourceAvailable（測自己這筆 pending 不算）
//   - reject 必須 reason
//   - reject 正常 → status='rejected' + 寄信

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
  sendReservationApprovedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendReservationRejectedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendNewApplicationNotification: vi.fn(),
}))

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))

const { resourceMock } = vi.hoisted(() => ({
  resourceMock: {
    checkResourceAvailable: vi.fn().mockResolvedValue({ ok: true, violations: [] }),
    getAvailabilityByHour: vi.fn().mockResolvedValue([]),
    allocateGpus: vi.fn().mockResolvedValue([1, 2]),
  },
}))
vi.mock('../../src/services/resourceInventory.js', () => ({
  checkResourceAvailable: resourceMock.checkResourceAvailable,
  getAvailabilityByHour: resourceMock.getAvailabilityByHour,
  allocateGpus: resourceMock.allocateGpus,
}))

const { dbQueryMock, dbConnectMock, clientQueryMock, clientReleaseMock } = vi.hoisted(() => {
  const clientQueryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
  const clientReleaseMock = vi.fn()
  return {
    dbQueryMock: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    clientQueryMock,
    clientReleaseMock,
    dbConnectMock: vi.fn().mockResolvedValue({
      query: clientQueryMock,
      release: clientReleaseMock,
    }),
  }
})

vi.mock('../../src/db.js', () => ({
  default: { query: dbQueryMock, connect: dbConnectMock },
}))

import app from '../../src/server.js'
import {
  sendReservationApprovedEmail,
  sendReservationRejectedEmail,
} from '../../src/services/notifier.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret'

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      one_user_id: 5,
      one_user_name: 'student1',
      one_token: 'fake-one-token',
      role: 'user',
      email: 'student1@example.com',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
}

const userToken = makeToken()
const adminToken = makeToken({ one_user_id: 1, one_user_name: 'oneadmin', role: 'admin' })

const APP_ROW_PENDING = {
  id: 42,
  user_id: 5,
  user_email: 'student1@example.com',
  template_id: 1,
  cpu: 4,
  ram_gb: 8,
  disk_gb: 100,
  gpu_count: 2,
  status: 'pending',
}
const APP_ROW_APPROVED = { ...APP_ROW_PENDING, status: 'approved' }

const SLOT_ROWS = [
  { id: 100, start_at: '2099-05-25T08:00:00Z', end_at: '2099-05-25T10:00:00Z', status: 'pending' },
  { id: 101, start_at: '2099-05-26T08:00:00Z', end_at: '2099-05-26T10:00:00Z', status: 'pending' },
]

/**
 * 設定 dbQueryMock 預設行為
 */
function installDbMockApprove({ appRow = APP_ROW_PENDING, slots = SLOT_ROWS } = {}) {
  dbQueryMock.mockReset()
  dbQueryMock.mockImplementation((sql) => {
    if (/SELECT id, user_id, user_email, template_id/i.test(sql)) {
      return Promise.resolve({ rows: [appRow], rowCount: 1 })
    }
    if (/SELECT id, user_id, user_email, status FROM applications/i.test(sql)) {
      return Promise.resolve({ rows: [appRow], rowCount: 1 })
    }
    if (/SELECT id, start_at, end_at, status[\s\S]+FROM schedule_slots/i.test(sql)) {
      return Promise.resolve({ rows: slots, rowCount: slots.length })
    }
    if (/UPDATE applications/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (/INSERT INTO audit_logs/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installDbMockApprove()
  resourceMock.checkResourceAvailable.mockResolvedValue({ ok: true, violations: [] })
  resourceMock.allocateGpus.mockResolvedValue([1, 2])
  clientQueryMock.mockReset()
  clientQueryMock.mockResolvedValue({ rows: [], rowCount: 0 })
})

// ============================================================
// PUT /api/applications/:id/approve
// ============================================================
describe('PUT /api/applications/:id/approve', () => {
  it('沒登入回 401', async () => {
    const res = await request(app).put('/api/applications/42/approve').send({})
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
    expect(res.status).toBe(403)
  })

  it('狀態不是 pending 回 400', async () => {
    installDbMockApprove({ appRow: APP_ROW_APPROVED })

    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('找不到 application → 404', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, user_email, template_id/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .put('/api/applications/9999/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(404)
  })

  it('資源足夠 → 200 + UPDATE applications + allocateGpus 被呼叫 + 寄信', async () => {
    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.application_id).toBe(42)
    expect(res.body.gpu_allocations).toBeDefined()
    // 兩個 slot 都被 allocate
    expect(Object.keys(res.body.gpu_allocations).map(Number).sort()).toEqual([100, 101])

    // UPDATE applications 應被呼叫（status='approved'）
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE applications/i.test(sql) && /'approved'/i.test(sql)
    )
    expect(updateCall).toBeDefined()

    // allocateGpus 被呼叫 N 次（slot 數量）
    expect(resourceMock.allocateGpus).toHaveBeenCalledTimes(SLOT_ROWS.length)
    expect(resourceMock.allocateGpus).toHaveBeenCalledWith(100, 2)
    expect(resourceMock.allocateGpus).toHaveBeenCalledWith(101, 2)

    // 寄信
    expect(sendReservationApprovedEmail).toHaveBeenCalledTimes(1)
    expect(sendReservationApprovedEmail).toHaveBeenCalledWith(
      'student1@example.com',
      expect.objectContaining({ id: 42 }),
      expect.any(Array)
    )
  })

  it('資源不足 → 409 + 狀態不改 + 不呼叫 allocateGpus', async () => {
    resourceMock.checkResourceAvailable.mockResolvedValueOnce({
      ok: false,
      violations: [
        { resource: 'gpu', requested: 2, available: 1, total: 8, slot: SLOT_ROWS[0] },
      ],
    })

    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('resource_exceeded')
    expect(res.body.violations).toHaveLength(1)

    // 不該呼 UPDATE 也不該呼 allocateGpus
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE applications/i.test(sql) && /'approved'/i.test(sql)
    )
    expect(updateCall).toBeUndefined()
    expect(resourceMock.allocateGpus).not.toHaveBeenCalled()
    expect(sendReservationApprovedEmail).not.toHaveBeenCalled()
  })

  it('checkResourceAvailable 收到 excludeApplicationId（自己這筆不該被算）', async () => {
    await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    // 第三個參數 = excludeApplicationId
    expect(resourceMock.checkResourceAvailable).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ cpu: 4, ram_gb: 8, disk_gb: 100, gpu_count: 2 }),
      42
    )
  })

  it('沒有 slot → 400', async () => {
    installDbMockApprove({ slots: [] })

    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('allocateGpus 拋錯 → 409 + 回滾狀態', async () => {
    resourceMock.allocateGpus.mockRejectedValueOnce(new Error('資源不足：要求 2 張 GPU，僅剩 1 張'))

    const res = await request(app)
      .put('/api/applications/42/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('resource_exceeded')

    // 應有 ROLLBACK：UPDATE 回 pending + DELETE gpu_allocations
    const rollbackUpdate = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE applications/i.test(sql) && /'pending'/i.test(sql)
    )
    expect(rollbackUpdate).toBeDefined()
    const cleanupDelete = dbQueryMock.mock.calls.find(
      ([sql]) => /DELETE FROM gpu_allocations/i.test(sql)
    )
    expect(cleanupDelete).toBeDefined()
  })
})

// ============================================================
// PUT /api/applications/:id/reject
// ============================================================
describe('PUT /api/applications/:id/reject', () => {
  it('沒登入回 401', async () => {
    const res = await request(app).put('/api/applications/42/reject').send({ reason: 'x' })
    expect(res.status).toBe(401)
  })

  it('非 admin 回 403', async () => {
    const res = await request(app)
      .put('/api/applications/42/reject')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'x' })
    expect(res.status).toBe(403)
  })

  it('reason 缺漏 → 400', async () => {
    const res = await request(app)
      .put('/api/applications/42/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('reason 為空字串 → 400', async () => {
    const res = await request(app)
      .put('/api/applications/42/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '   ' })
    expect(res.status).toBe(400)
  })

  it('狀態不是 pending → 400', async () => {
    installDbMockApprove({ appRow: APP_ROW_APPROVED })

    const res = await request(app)
      .put('/api/applications/42/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '不通過' })

    expect(res.status).toBe(400)
  })

  it('找不到 → 404', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, user_email, status FROM applications/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .put('/api/applications/9999/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'no' })

    expect(res.status).toBe(404)
  })

  it('正常拒絕 → 200 + UPDATE status=rejected + 寄信', async () => {
    const res = await request(app)
      .put('/api/applications/42/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '配額不足' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE applications/i.test(sql) && /'rejected'/i.test(sql)
    )
    expect(updateCall).toBeDefined()
    // params: [reason, reviewer, id]
    expect(updateCall[1][0]).toBe('配額不足')
    expect(updateCall[1][2]).toBe(42)

    expect(sendReservationRejectedEmail).toHaveBeenCalledWith(
      'student1@example.com',
      '配額不足'
    )
  })
})
