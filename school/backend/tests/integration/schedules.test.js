// tests/integration/schedules.test.js
// F5: 行事曆排程 CRUD 測試（TDD）
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

// mock node-cron 避免 scheduler 真的跑
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

describe('POST /api/schedules', () => {
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('schedules')
    vi.clearAllMocks()
  })

  it('建立排程成功回傳 201', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        one_user_id: 5,
        one_vm_id: 100,
        action: 'resume',
        start_time: '2026-04-20T08:00:00Z',
        end_time: '2026-04-20T18:00:00Z',
        repeat_type: 'once',
      })

    expect(res.status).toBe(201)
    expect(res.body.schedule).toBeDefined()
    expect(res.body.schedule.one_vm_id).toBe(100)
    expect(res.body.schedule.is_active).toBe(true)
  })

  it('缺少必要欄位回傳 400', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ one_user_id: 5 })

    expect(res.status).toBe(400)
  })

  it('無 token 回傳 401', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ one_user_id: 5, one_vm_id: 100, action: 'resume', start_time: '2026-04-20T08:00:00Z' })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/schedules', () => {
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('schedules')
    vi.clearAllMocks()

    // 插入兩筆排程（不同 user）
    await testPool.query(
      `INSERT INTO schedules (one_user_id, one_vm_id, start_time, end_time, repeat_type, is_active)
       VALUES
         (1, 100, '2026-04-20 08:00', '2026-04-20 18:00', 'once', true),
         (5, 200, '2026-04-21 08:00', '2026-04-21 18:00', 'once', true)`
    )
  })

  it('admin 可以看全部排程', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.schedules.length).toBe(2)
  })

  it('普通使用者只看自己的排程', async () => {
    const userToken = makeUserToken({ one_user_id: 5 })
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body.schedules.length).toBe(1)
    expect(res.body.schedules[0].one_user_id).toBe(5)
  })
})

describe('PUT /api/schedules/:id', () => {
  const adminToken = makeAdminToken()
  let scheduleId

  beforeEach(async () => {
    await clearTables('schedules')
    vi.clearAllMocks()

    const { rows } = await testPool.query(
      `INSERT INTO schedules (one_user_id, one_vm_id, start_time, end_time, repeat_type, is_active)
       VALUES (1, 100, '2026-04-20 08:00', '2026-04-20 18:00', 'once', true)
       RETURNING id`
    )
    scheduleId = rows[0].id
  })

  it('更新排程成功回傳 200', async () => {
    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })

    expect(res.status).toBe(200)
    expect(res.body.schedule.is_active).toBe(false)
  })

  it('不存在的 id 回傳 404', async () => {
    const res = await request(app)
      .put('/api/schedules/99999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/schedules/:id', () => {
  const adminToken = makeAdminToken()
  let scheduleId

  beforeEach(async () => {
    await clearTables('schedules')
    vi.clearAllMocks()

    const { rows } = await testPool.query(
      `INSERT INTO schedules (one_user_id, one_vm_id, start_time, end_time, repeat_type, is_active)
       VALUES (1, 100, '2026-04-20 08:00', '2026-04-20 18:00', 'once', true)
       RETURNING id`
    )
    scheduleId = rows[0].id
  })

  it('刪除排程成功回傳 200', async () => {
    const res = await request(app)
      .delete(`/api/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)

    const { rows } = await testPool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId])
    expect(rows.length).toBe(0)
  })

  it('不存在的 id 回傳 404', async () => {
    const res = await request(app)
      .delete('/api/schedules/99999')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(404)
  })
})
