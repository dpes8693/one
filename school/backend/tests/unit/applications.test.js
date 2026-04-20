// tests/unit/applications.test.js
// Sprint 5 Task #14: 預約申請 API 單元測試
// Mock pool / opennebula / notifier / resourceInventory；不真的連 DB / ONE。

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

const { resourceMock } = vi.hoisted(() => ({
  resourceMock: {
    checkResourceAvailable: vi.fn().mockResolvedValue({ ok: true, violations: [] }),
    getAvailabilityByHour: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('../../src/services/resourceInventory.js', () => ({
  checkResourceAvailable: resourceMock.checkResourceAvailable,
  getAvailabilityByHour: resourceMock.getAvailabilityByHour,
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
import { callFireEdge } from '../../src/services/opennebula.js'

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

// 預設 system_settings
const SETTINGS_ROWS = [
  { key: 'max_total_gpu', value: '8' },
  { key: 'max_active_reservations', value: '3' },
  { key: 'max_hours_per_reservation', value: '24' },
  { key: 'max_advance_booking_days', value: '30' },
  { key: 'base_template_id', value: '1' },
]

/**
 * 安裝預設的 dbQueryMock 行為：
 *   - SELECT system_settings → 回完整設定
 *   - SELECT COUNT(*) FROM applications → 回 0
 *   - 其他 → 空
 */
function installDefaultDbMock({ activeReservations = 0 } = {}) {
  dbQueryMock.mockReset()
  dbQueryMock.mockImplementation((sql) => {
    if (/FROM\s+system_settings/i.test(sql)) {
      return Promise.resolve({ rows: SETTINGS_ROWS, rowCount: SETTINGS_ROWS.length })
    }
    if (/COUNT\(\*\)[\s\S]+FROM\s+applications/i.test(sql)) {
      return Promise.resolve({ rows: [{ n: activeReservations }], rowCount: 1 })
    }
    if (/INSERT INTO audit_logs/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
}

function installDefaultClientMock({ insertAppId = 42, insertSlots = 2 } = {}) {
  clientQueryMock.mockReset()
  let slotCounter = 100
  clientQueryMock.mockImplementation((sql) => {
    if (/^BEGIN/i.test(sql) || /^COMMIT/i.test(sql) || /^ROLLBACK/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 0 })
    }
    if (/INSERT INTO applications/i.test(sql)) {
      return Promise.resolve({
        rows: [{ id: insertAppId, created_at: new Date().toISOString() }],
        rowCount: 1,
      })
    }
    if (/INSERT INTO schedule_slots/i.test(sql)) {
      const id = slotCounter++
      return Promise.resolve({
        rows: [{ id, start_at: 'x', end_at: 'y', status: 'pending' }],
        rowCount: 1,
      })
    }
    if (/UPDATE applications/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (/DELETE FROM gpu_allocations/i.test(sql)) {
      return Promise.resolve({ rows: [], rowCount: 0 })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installDefaultDbMock()
  installDefaultClientMock()
  resourceMock.checkResourceAvailable.mockResolvedValue({ ok: true, violations: [] })
  resourceMock.getAvailabilityByHour.mockResolvedValue([])
})

// ============================================================
// GET /api/templates
// ============================================================
describe('GET /api/templates', () => {
  it('未登入回 401', async () => {
    const res = await request(app).get('/api/templates')
    expect(res.status).toBe(401)
  })

  it('已登入：ONE 失敗也回 fallback defaults', async () => {
    callFireEdge.mockRejectedValueOnce(new Error('boom'))

    const res = await request(app)
      .get('/api/templates')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.id).toBe(1)
    expect(res.body.data.defaults).toEqual({
      cpu: 4,
      ram_gb: 8,
      disk_gb: 50,
      gpu_count: 1,
    })
  })

  it('已登入：ONE 成功時用 template name', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: {
        VMTEMPLATE: {
          NAME: 'Ubuntu 24.04 GPU',
          TEMPLATE: { CPU: '8', MEMORY: '16384' }, // 16 GB
        },
      },
    })

    const res = await request(app)
      .get('/api/templates')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Ubuntu 24.04 GPU')
    expect(res.body.data.defaults.cpu).toBe(8)
    expect(res.body.data.defaults.ram_gb).toBe(16)
  })
})

// ============================================================
// GET /api/applications/availability
// ============================================================
describe('GET /api/applications/availability', () => {
  it('未登入回 401', async () => {
    const res = await request(app).get('/api/applications/availability?from=2026-04-25T00:00:00Z&to=2026-04-25T01:00:00Z')
    expect(res.status).toBe(401)
  })

  it('正常回陣列', async () => {
    resourceMock.getAvailabilityByHour.mockResolvedValueOnce([
      {
        start_at: '2026-04-25T00:00:00Z',
        end_at: '2026-04-25T01:00:00Z',
        available: { cpu: 32, ram_gb: 64, disk_gb: 2000, gpu: 8 },
      },
    ])

    const res = await request(app)
      .get('/api/applications/availability?from=2026-04-25T00:00:00Z&to=2026-04-25T01:00:00Z')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBe(1)
    expect(res.body.data[0].available.gpu).toBe(8)
  })

  it('to-from 過長回 400', async () => {
    // max_advance_booking_days=30 → 上限 31 天，故傳 60 天會超
    const res = await request(app)
      .get('/api/applications/availability?from=2026-04-01T00:00:00Z&to=2026-06-01T00:00:00Z')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(400)
  })

  it('to <= from 回 400', async () => {
    const res = await request(app)
      .get('/api/applications/availability?from=2026-04-25T05:00:00Z&to=2026-04-25T05:00:00Z')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(400)
  })

  it('缺 from / to 回 400', async () => {
    const res = await request(app)
      .get('/api/applications/availability?from=2026-04-25T05:00:00Z')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(400)
  })
})

// ============================================================
// POST /api/applications
// ============================================================
describe('POST /api/applications', () => {
  // 取一個未來、整點、24h 內的 slot（避免「超過 max_advance_booking_days」誤判）
  function futureSlot(daysFromNow = 1, startHourUtc = 8, durationHours = 4) {
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
    d.setUTCHours(startHourUtc, 0, 0, 0)
    const end = new Date(d.getTime() + durationHours * 60 * 60 * 1000)
    return { start_at: d.toISOString(), end_at: end.toISOString() }
  }

  const okBody = {
    template_id: 1,
    cpu: 4,
    ram_gb: 16,
    disk_gb: 100,
    gpu_count: 2,
    slots: [futureSlot(1)],
  }

  it('沒登入回 401', async () => {
    const res = await request(app).post('/api/applications').send(okBody)
    expect(res.status).toBe(401)
  })

  it('cpu 為負回 400', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...okBody, cpu: -1 })

    expect(res.status).toBe(400)
  })

  it('gpu_count 超過 max_total_gpu 回 400', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...okBody, gpu_count: 99 })

    expect(res.status).toBe(400)
  })

  it('slot 非整點回 400', async () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
    d.setUTCHours(14, 30, 0, 0) // 14:30 非整點
    const end = new Date(d.getTime() + 60 * 60 * 1000)
    end.setUTCMinutes(0, 0, 0)
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ...okBody,
        slots: [{ start_at: d.toISOString(), end_at: end.toISOString() }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/整點/)
  })

  it('slot 為空陣列回 400', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...okBody, slots: [] })

    expect(res.status).toBe(400)
  })

  it('end_at <= start_at 回 400', async () => {
    const s = futureSlot(1, 8, 4)
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ...okBody,
        slots: [{ start_at: s.end_at, end_at: s.start_at }],
      })

    expect(res.status).toBe(400)
  })

  it('超過 max_hours_per_reservation 回 400', async () => {
    const s = futureSlot(1, 0, 30) // 30 小時 > 預設 24h 上限
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...okBody, slots: [s] })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/24/)
  })

  it('超過 max_advance_booking_days 回 400', async () => {
    const s = futureSlot(60, 8, 4) // 60 天後 > 30 天上限
    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...okBody, slots: [s] })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/30/)
  })

  it('超過 max_active_reservations 回 409', async () => {
    installDefaultDbMock({ activeReservations: 3 }) // 3 + 1 > 3

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send(okBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/3/)
  })

  it('資源不夠回 409 + violations', async () => {
    resourceMock.checkResourceAvailable.mockResolvedValueOnce({
      ok: false,
      violations: [
        { resource: 'gpu', requested: 2, available: 1, total: 8, slot: futureSlot(1) },
      ],
    })

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send(okBody)

    expect(res.status).toBe(409)
    expect(res.body.ok).toBe(false)
    expect(res.body.violations).toHaveLength(1)
    expect(res.body.violations[0].resource).toBe('gpu')
  })

  it('正常 → 200 + 寫 applications + N 筆 schedule_slots', async () => {
    const body = {
      ...okBody,
      slots: [futureSlot(1, 8, 4), futureSlot(2, 9, 4)],
    }

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send(body)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.application_id).toBe(42)
    expect(res.body.slots).toHaveLength(2)

    // INSERT applications 一次
    const appInserts = clientQueryMock.mock.calls.filter(([sql]) =>
      /INSERT INTO applications/i.test(sql)
    )
    expect(appInserts).toHaveLength(1)

    // INSERT schedule_slots N 次
    const slotInserts = clientQueryMock.mock.calls.filter(([sql]) =>
      /INSERT INTO schedule_slots/i.test(sql)
    )
    expect(slotInserts).toHaveLength(2)

    // BEGIN + COMMIT
    expect(clientQueryMock.mock.calls.some(([sql]) => /^BEGIN/i.test(sql))).toBe(true)
    expect(clientQueryMock.mock.calls.some(([sql]) => /^COMMIT/i.test(sql))).toBe(true)
  })
})

// ============================================================
// GET /api/applications
// ============================================================
describe('GET /api/applications', () => {
  it('未登入回 401', async () => {
    const res = await request(app).get('/api/applications')
    expect(res.status).toBe(401)
  })

  it('user 只看自己（WHERE user_id = $1）', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/FROM\s+applications/i.test(sql) && /LEFT JOIN/i.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: 1, user_id: 5, user_email: 'student1@example.com',
              template_id: 1, cpu: 4, ram_gb: 8, disk_gb: 50, gpu_count: 1,
              status: 'pending', created_at: new Date().toISOString(),
              slots: [],
            },
          ],
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    const sqlCall = dbQueryMock.mock.calls.find(([sql]) =>
      /LEFT JOIN schedule_slots/i.test(sql)
    )
    expect(sqlCall[0]).toMatch(/WHERE a\.user_id/)
    expect(sqlCall[1]).toContain(5) // userToken 的 one_user_id
  })

  it('admin 看全部（無 WHERE user_id）', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/FROM\s+applications/i.test(sql) && /LEFT JOIN/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const sqlCall = dbQueryMock.mock.calls.find(([sql]) =>
      /LEFT JOIN schedule_slots/i.test(sql)
    )
    expect(sqlCall[0]).not.toMatch(/WHERE\s+a\.user_id/)
  })
})

// ============================================================
// DELETE /api/applications/:id
// ============================================================
describe('DELETE /api/applications/:id', () => {
  it('未登入回 401', async () => {
    const res = await request(app).delete('/api/applications/1')
    expect(res.status).toBe(401)
  })

  it('找不到回 404', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, status FROM applications/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .delete('/api/applications/999')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(404)
  })

  it('取消他人的回 403', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, status FROM applications/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 1, user_id: 999, status: 'pending' }], // 不同 user
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .delete('/api/applications/1')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(403)
  })

  it('狀態不是 pending/approved 回 400', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, status FROM applications/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 1, user_id: 5, status: 'cancelled' }],
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .delete('/api/applications/1')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(400)
  })

  it('已 running 的 slot → 409', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, status FROM applications/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 1, user_id: 5, status: 'approved' }],
          rowCount: 1,
        })
      }
      if (/SELECT id, status FROM schedule_slots/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 10, status: 'running' }],
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .delete('/api/applications/1')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/terminate|啟動/i)
  })

  it('正常 cancel → 200 + status=cancelled + 釋放 GPU', async () => {
    dbQueryMock.mockReset()
    dbQueryMock.mockImplementation((sql) => {
      if (/SELECT id, user_id, status FROM applications/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 1, user_id: 5, status: 'pending' }],
          rowCount: 1,
        })
      }
      if (/SELECT id, status FROM schedule_slots/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 10, status: 'pending' }, { id: 11, status: 'pending' }],
          rowCount: 2,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    const res = await request(app)
      .delete('/api/applications/1')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.status).toBe('cancelled')

    // 應呼叫 DELETE FROM gpu_allocations
    const delCall = clientQueryMock.mock.calls.find(([sql]) =>
      /DELETE FROM gpu_allocations/i.test(sql)
    )
    expect(delCall).toBeDefined()
    expect(delCall[1][0]).toEqual([10, 11])

    // 應呼叫 UPDATE applications SET status='cancelled'
    const updCall = clientQueryMock.mock.calls.find(([sql]) =>
      /UPDATE applications/i.test(sql)
    )
    expect(updCall).toBeDefined()
    expect(updCall[1]).toContain(1)
  })
})
