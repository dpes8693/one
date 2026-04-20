// tests/unit/register.test.js
// Sprint 5 Task #9: 註冊 API（含驗證碼節流）TDD
// 全部 mock — 不依賴實際 DB / SMTP。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

// ---- Mocks（必須在 import app 前）----

// notifier — 攔截寄信
vi.mock('../../src/services/notifier.js', () => ({
  sendVerificationCode: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendApprovalNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendRejectionNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendNewApplicationNotification: vi.fn(),
}))

// opennebula — 不該被註冊路由呼叫，但 server.js 其他 router 會 import
vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn().mockResolvedValue('fake-admin-token'),
  createUser: vi.fn().mockResolvedValue({ id: 999 }),
  setUserQuota: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))

// 用 mock pool 覆蓋 db.js
const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
}))
vi.mock('../../src/db.js', () => ({
  default: { query: dbQueryMock },
}))

import app from '../../src/server.js'
import { sendVerificationCode } from '../../src/services/notifier.js'

// ---- Helper: 建一個輕量的 SQL router，按關鍵字 dispatch 回不同 fixture ----

/**
 * makeDbRouter — 接收一個 state 物件（pending / throttle / settings），
 * 回傳 mockImplementation：
 *   - SELECT system_settings → 回 settings rows
 *   - SELECT verification_throttle → 回 state.throttle
 *   - INSERT verification_throttle ... ON CONFLICT → 寫入 state.throttle
 *   - UPDATE verification_throttle ... → patch state.throttle
 *   - SELECT pending_registrations → 回 state.pending
 *   - INSERT pending_registrations → 寫入 state.pending（回 RETURNING id）
 *   - UPDATE pending_registrations → patch state.pending
 */
function makeDbRouter(state) {
  return async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    // system_settings 查所有 key/value
    if (/SELECT key, value FROM system_settings/i.test(s)) {
      return {
        rows: Object.entries(state.settings).map(([key, value]) => ({ key, value })),
      }
    }

    // throttle SELECT
    if (/SELECT .* FROM verification_throttle WHERE email/i.test(s)) {
      return { rows: state.throttle ? [state.throttle] : [] }
    }

    // throttle UPSERT
    if (/INSERT INTO verification_throttle/i.test(s)) {
      const [email, last_sent_at, hourly_count, hour_window_start] = params
      state.throttle = {
        email,
        last_sent_at,
        hourly_count,
        hour_window_start,
        failed_attempts: state.throttle?.failed_attempts || 0,
        locked_until: state.throttle?.locked_until || null,
      }
      return { rows: [state.throttle] }
    }

    // throttle UPDATE failed_attempts / locked_until
    if (/UPDATE verification_throttle SET failed_attempts/i.test(s)) {
      const [failed_attempts, locked_until] = params
      state.throttle = {
        ...(state.throttle || { email: 'x', hourly_count: 0 }),
        failed_attempts,
        locked_until,
      }
      return { rows: [] }
    }

    // throttle reset failed_attempts (驗證成功時)
    if (/UPDATE verification_throttle SET (failed_attempts = 0|.*failed_attempts.*=.*0)/i.test(s)) {
      if (state.throttle) {
        state.throttle.failed_attempts = 0
        state.throttle.locked_until = null
      }
      return { rows: [] }
    }

    // pending_registrations SELECT by email + pending_email
    if (/SELECT .* FROM pending_registrations WHERE email/i.test(s)) {
      const email = params[0]
      const matched = state.pending.filter(p => p.email === email && p.status === 'pending_email')
      return { rows: matched }
    }

    // pending INSERT
    if (/INSERT INTO pending_registrations/i.test(s)) {
      const [email, password_hash, name, student_id, memo, verification_code, code_expires_at] = params
      const row = {
        id: state.pending.length + 1,
        email,
        password_hash,
        name,
        student_id,
        memo,
        verification_code,
        code_expires_at,
        verified: false,
        status: 'pending_email',
        created_at: new Date(),
      }
      state.pending.push(row)
      return { rows: [{ id: row.id }] }
    }

    // pending UPDATE — 重寄 / 驗證
    if (/UPDATE pending_registrations/i.test(s)) {
      // 找最後一筆 pending_email 的同 email 紀錄
      // 取最後一個 string 參數判斷 email（簡化）
      const email = params.find(p => typeof p === 'string' && p.includes('@'))
      const target = state.pending
        .filter(p => p.email === email)
        .sort((a, b) => b.id - a.id)[0]

      if (target) {
        // verify 路由：SET verified=true, status='pending_review', verification_code=NULL
        if (/verified\s*=\s*true|status\s*=\s*'pending_review'/i.test(s)) {
          target.verified = true
          target.status = 'pending_review'
          target.verification_code = null
        } else {
          // resend / re-pending：UPDATE verification_code, code_expires_at
          const [verification_code, code_expires_at] = params
          target.verification_code = verification_code
          target.code_expires_at = code_expires_at
        }
      }
      return { rows: target ? [target] : [] }
    }

    // 其他（如 audit）— 預設成功
    return { rows: [] }
  }
}

// ---- Default fixtures ----
function freshState(overrides = {}) {
  return {
    pending: [],
    throttle: null,
    settings: {
      verification_code_ttl_min: '5',
      verification_max_per_hour: '5',
      verification_max_attempts: '3',
      verification_lockout_minutes: '30',
      ...(overrides.settings || {}),
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/register', () => {
  it('正常註冊 → 200 + 寄信被呼叫 + DB 寫入 pending_registrations', async () => {
    const state = freshState()
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register').send({
      email: 'student@example.com',
      password: 'p@ssw0rd!',
      name: '王小明',
      student_id: 'B12345678',
      memo: '資工系',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(sendVerificationCode).toHaveBeenCalledTimes(1)
    const arg = sendVerificationCode.mock.calls[0][0]
    expect(arg.email).toBe('student@example.com')
    expect(arg.code).toMatch(/^\d{6}$/)

    expect(state.pending.length).toBe(1)
    expect(state.pending[0].email).toBe('student@example.com')
    expect(state.pending[0].status).toBe('pending_email')
    // 密碼必須被 hash（不是明碼）
    expect(state.pending[0].password_hash).not.toBe('p@ssw0rd!')
    expect(state.pending[0].password_hash.length).toBeGreaterThan(20)
  })

  it('email 大小寫不同視為同一人（小寫化）', async () => {
    const state = freshState()
    dbQueryMock.mockImplementation(makeDbRouter(state))

    await request(app).post('/api/register').send({
      email: 'STUDENT@example.COM',
      password: 'p@ssw0rd!',
      name: '王小明',
      student_id: 'B12345678',
    })

    expect(state.pending[0].email).toBe('student@example.com')
  })

  it('缺欄位 → 400', async () => {
    dbQueryMock.mockImplementation(makeDbRouter(freshState()))
    const res = await request(app).post('/api/register').send({ email: 'a@b.com' })
    expect(res.status).toBe(400)
  })

  it('email 格式錯誤 → 400', async () => {
    dbQueryMock.mockImplementation(makeDbRouter(freshState()))
    const res = await request(app).post('/api/register').send({
      email: 'not-an-email',
      password: 'p@ssw0rd!',
      name: '王',
      student_id: 'B1',
    })
    expect(res.status).toBe(400)
  })

  it('密碼太短 → 400', async () => {
    dbQueryMock.mockImplementation(makeDbRouter(freshState()))
    const res = await request(app).post('/api/register').send({
      email: 'a@b.com',
      password: '123',
      name: '王',
      student_id: 'B1',
    })
    expect(res.status).toBe(400)
  })

  it('60 秒內重送 → 429', async () => {
    const state = freshState({
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(Date.now() - 30 * 1000), // 30 秒前
        hourly_count: 1,
        hour_window_start: new Date(),
        failed_attempts: 0,
        locked_until: null,
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register').send({
      email: 'student@example.com',
      password: 'p@ssw0rd!',
      name: '王',
      student_id: 'B1',
    })

    expect(res.status).toBe(429)
    expect(sendVerificationCode).not.toHaveBeenCalled()
  })

  it('每小時上限超過 → 429', async () => {
    const state = freshState({
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(Date.now() - 5 * 60 * 1000), // 5 分鐘前（已過 60s）
        hourly_count: 5, // 已達上限
        hour_window_start: new Date(Date.now() - 10 * 60 * 1000),
        failed_attempts: 0,
        locked_until: null,
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register').send({
      email: 'student@example.com',
      password: 'p@ssw0rd!',
      name: '王',
      student_id: 'B1',
    })

    expect(res.status).toBe(429)
  })
})

describe('POST /api/register/verify', () => {
  it('正確驗證碼 → 200 + DB 改 pending_review + verified=true', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '123456',
        code_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        status: 'pending_email',
      }],
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(),
        hourly_count: 1,
        failed_attempts: 0,
        locked_until: null,
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com',
      code: '123456',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(state.pending[0].verified).toBe(true)
    expect(state.pending[0].status).toBe('pending_review')
    expect(state.pending[0].verification_code).toBeNull()
  })

  it('email 大小寫不同也能驗證（小寫化）', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '123456',
        code_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        status: 'pending_email',
      }],
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/verify').send({
      email: 'STUDENT@EXAMPLE.com',
      code: '123456',
    })

    expect(res.status).toBe(200)
  })

  it('不存在 email → 400', async () => {
    dbQueryMock.mockImplementation(makeDbRouter(freshState()))
    const res = await request(app).post('/api/register/verify').send({
      email: 'nobody@x.com',
      code: '123456',
    })
    expect(res.status).toBe(400)
  })

  it('驗證碼已過期 → 400', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '123456',
        code_expires_at: new Date(Date.now() - 60 * 1000), // 1 分鐘前過期
        verified: false,
        status: 'pending_email',
      }],
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com',
      code: '123456',
    })

    expect(res.status).toBe(400)
    expect(state.pending[0].verified).toBe(false)
  })

  it('驗證碼錯 3 次 → 鎖 30 分鐘（第 3 次回 410）', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '123456',
        code_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        status: 'pending_email',
      }],
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(),
        hourly_count: 1,
        failed_attempts: 0,
        locked_until: null,
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    // 錯 2 次
    let res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com', code: '000000',
    })
    expect(res.status).toBe(400)

    res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com', code: '000001',
    })
    expect(res.status).toBe(400)

    // 第 3 次 → 鎖
    res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com', code: '000002',
    })
    expect(res.status).toBe(410)
    expect(state.throttle.locked_until).toBeTruthy()
  })

  it('被鎖期間再 verify → 410', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '123456',
        code_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        status: 'pending_email',
      }],
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(),
        hourly_count: 1,
        failed_attempts: 3,
        locked_until: new Date(Date.now() + 25 * 60 * 1000),
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/verify').send({
      email: 'student@example.com',
      code: '123456', // 即使對也應該被擋
    })

    expect(res.status).toBe(410)
  })
})

describe('POST /api/register/resend', () => {
  it('正常重寄 → 200 + 寄信被呼叫 + DB UPDATE 新驗證碼', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: 'OLDOLD',
        code_expires_at: new Date(Date.now() - 1000),
        verified: false,
        status: 'pending_email',
      }],
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/resend').send({
      email: 'student@example.com',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(sendVerificationCode).toHaveBeenCalledTimes(1)
    expect(state.pending[0].verification_code).not.toBe('OLDOLD')
    expect(state.pending[0].verification_code).toMatch(/^\d{6}$/)
  })

  it('60 秒內重寄 → 429', async () => {
    const state = freshState({
      pending: [{
        id: 1,
        email: 'student@example.com',
        password_hash: 'h',
        name: '王',
        student_id: 'B1',
        verification_code: '111111',
        code_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        status: 'pending_email',
      }],
      throttle: {
        email: 'student@example.com',
        last_sent_at: new Date(Date.now() - 10 * 1000),
        hourly_count: 1,
        failed_attempts: 0,
        locked_until: null,
      },
    })
    dbQueryMock.mockImplementation(makeDbRouter(state))

    const res = await request(app).post('/api/register/resend').send({
      email: 'student@example.com',
    })

    expect(res.status).toBe(429)
    expect(sendVerificationCode).not.toHaveBeenCalled()
  })

  it('email 不存在 pending → 400', async () => {
    dbQueryMock.mockImplementation(makeDbRouter(freshState()))
    const res = await request(app).post('/api/register/resend').send({
      email: 'nobody@x.com',
    })
    expect(res.status).toBe(400)
  })
})
