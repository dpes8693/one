// tests/integration/approve.test.js
// Sprint 5 Task #15：PUT /api/applications/:id/approve 整合測試（用真 DB）
//
// 對齊 SPEC V2 新版 schema：
//   - applications：新欄位 cpu / ram_gb / disk_gb / gpu_count
//   - schedule_slots / gpu_allocations 子表
//   - admin only：用 makeAdminToken（role='admin'）
//
// 測試重點：
//   1) 通過正常流程：DB status='approved' + gpu_allocations 真的寫入
//   2) 重複 approve 一筆已 approved → 400
//   3) 資源不足 → 409 + 狀態保持 pending
//   4) reject：DB status='rejected' + 帶 reason
//   5) notifier 用 mock 不真寄信

// 確保 .env 載入（連 :5433 testDb）
import '../../src/config.js'

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../../src/services/notifier.js', async (orig) => {
  const real = await orig()
  return {
    ...real,
    sendReservationApprovedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
    sendReservationRejectedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  }
})

import app from '../../src/server.js'
import { testPool } from '../helpers/testDb.js'
import { makeAdminToken } from '../helpers/authToken.js'
import {
  sendReservationApprovedEmail,
  sendReservationRejectedEmail,
} from '../../src/services/notifier.js'

const adminToken = makeAdminToken()
const EMAIL_PREFIX = 'approve_int_test_'

const SLOT_START = '2099-05-25T08:00:00Z'
const SLOT_END = '2099-05-25T10:00:00Z'

async function createPendingApp({
  cpu = 2,
  ram_gb = 4,
  disk_gb = 50,
  gpu_count = 2,
  startAt = SLOT_START,
  endAt = SLOT_END,
} = {}) {
  const email = `${EMAIL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const appRes = await testPool.query(
    `INSERT INTO applications
       (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count, status)
     VALUES (1, $1, 1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [email, cpu, ram_gb, disk_gb, gpu_count]
  )
  const appId = appRes.rows[0].id
  const slotRes = await testPool.query(
    `INSERT INTO schedule_slots (application_id, start_at, end_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [appId, startAt, endAt]
  )
  return { appId, slotId: slotRes.rows[0].id, email }
}

async function cleanup() {
  await testPool.query(
    `DELETE FROM applications WHERE user_email LIKE $1`,
    [`${EMAIL_PREFIX}%`]
  )
}

describe('PUT /api/applications/:id/approve (integration, real DB)', () => {
  beforeAll(cleanup)
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)
  afterAll(cleanup)

  it('正常通過：status=approved + gpu_allocations 寫入 + 寄信', async () => {
    const { appId, slotId } = await createPendingApp({ gpu_count: 2 })

    const res = await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.application_id).toBe(appId)
    expect(res.body.gpu_allocations).toBeDefined()
    expect(res.body.gpu_allocations[slotId]).toEqual([1, 2])

    // DB：狀態 approved
    const { rows } = await testPool.query(
      `SELECT status, reviewed_at, reviewed_by FROM applications WHERE id=$1`,
      [appId]
    )
    expect(rows[0].status).toBe('approved')
    expect(rows[0].reviewed_at).not.toBeNull()
    expect(rows[0].reviewed_by).toBe('oneadmin')

    // DB：gpu_allocations 真的寫入
    const { rows: gpuRows } = await testPool.query(
      `SELECT gpu_index FROM gpu_allocations WHERE schedule_slot_id=$1 ORDER BY gpu_index`,
      [slotId]
    )
    expect(gpuRows.map((r) => r.gpu_index)).toEqual([1, 2])

    expect(sendReservationApprovedEmail).toHaveBeenCalledTimes(1)
  })

  it('重複 approve 已 approved → 400', async () => {
    const { appId } = await createPendingApp({ gpu_count: 1 })

    await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    const res = await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('資源不足 → 409 + 狀態仍是 pending', async () => {
    // gpu_count=99 超過 max_total_gpu=8（CHECK 也擋；改用相同時段重複占用）
    // 先佔走 8 張：建一筆 approved + 直接寫 8 筆 gpu_allocations
    const occupy = await createPendingApp({ gpu_count: 8 })
    await testPool.query(
      `UPDATE applications SET status='approved' WHERE id=$1`,
      [occupy.appId]
    )
    for (let g = 1; g <= 8; g++) {
      await testPool.query(
        `INSERT INTO gpu_allocations (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, $2, $3, $4)`,
        [occupy.slotId, g, SLOT_START, SLOT_END]
      )
    }

    // 再來一筆 pending 想要 1 張，必爆
    const { appId } = await createPendingApp({ gpu_count: 1 })

    const res = await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('resource_exceeded')
    expect(Array.isArray(res.body.violations)).toBe(true)

    // 狀態仍 pending
    const { rows } = await testPool.query(
      `SELECT status FROM applications WHERE id=$1`,
      [appId]
    )
    expect(rows[0].status).toBe('pending')
  })

  it('沒登入回 401', async () => {
    const res = await request(app)
      .put('/api/applications/1/approve')
      .send({})
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/applications/:id/reject (integration, real DB)', () => {
  beforeAll(cleanup)
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)
  afterAll(cleanup)

  it('正常拒絕：status=rejected + reject_reason + 寄信', async () => {
    const { appId } = await createPendingApp({ gpu_count: 1 })

    const res = await request(app)
      .put(`/api/applications/${appId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '配額不足' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const { rows } = await testPool.query(
      `SELECT status, reject_reason FROM applications WHERE id=$1`,
      [appId]
    )
    expect(rows[0].status).toBe('rejected')
    expect(rows[0].reject_reason).toBe('配額不足')

    expect(sendReservationRejectedEmail).toHaveBeenCalledTimes(1)
  })

  it('reject 沒帶 reason → 400', async () => {
    const { appId } = await createPendingApp({ gpu_count: 1 })

    const res = await request(app)
      .put(`/api/applications/${appId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })
})
