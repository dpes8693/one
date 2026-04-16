// tests/integration/vip.test.js
// F1: VIP 插隊 API 測試（TDD）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../../src/services/opennebula.js', () => {
  const callFireEdgeMock = vi.fn()
  return {
    callFireEdge: callFireEdgeMock,
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

import app from '../../src/server.js'
import { testPool, clearTables } from '../helpers/testDb.js'
import { makeAdminToken } from '../helpers/authToken.js'
import { callFireEdge } from '../../src/services/opennebula.js'

describe('POST /api/vip/preempt', () => {
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('vip_preemptions')
    vi.clearAllMocks()

    // GET /host/info/* → 回傳有佔用 GPU 的 VM
    // PUT /vm/action/* → 成功
    callFireEdge.mockImplementation(async (method, path) => {
      if (method === 'GET' && path.startsWith('/host/info/')) {
        return {
          data: {
            HOST: {
              HOST_SHARE: {
                PCI_DEVICES: {
                  PCI: [
                    { VMID: '42', CLASS: '0302', ADDRESS: '0000:01:00.0' },
                  ],
                },
              },
            },
          },
        }
      }
      return { ok: true }
    })
  })

  it('should preempt and return 201 with vip_preemption_id', async () => {
    const res = await request(app)
      .post('/api/vip/preempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_vm_id: 100, target_host_id: 1 })

    expect(res.status).toBe(201)
    expect(res.body.vip_preemption_id).toBeDefined()
    expect(res.body.preempted_vm_id).toBe('42')
  })

  it('should stop occupant VM and resume VIP VM', async () => {
    await request(app)
      .post('/api/vip/preempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_vm_id: 100, target_host_id: 1 })

    const stopCall = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/vm/action/42'
    )
    const resumeCall = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/vm/action/100'
    )
    expect(stopCall[2]).toEqual({ action: 'stop' })
    expect(resumeCall[2]).toEqual({ action: 'resume' })
  })

  it('should write vip_preemptions record with status active', async () => {
    await request(app)
      .post('/api/vip/preempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_vm_id: 100, target_host_id: 1 })

    const { rows } = await testPool.query('SELECT * FROM vip_preemptions')
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('active')
    expect(rows[0].vip_vm_id).toBe(100)
    expect(rows[0].preempted_vm_id).toBe(42)
  })

  it('should return 400 if missing parameters', async () => {
    const res = await request(app)
      .post('/api/vip/preempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_vm_id: 100 })

    expect(res.status).toBe(400)
  })

  it('should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/vip/preempt')
      .send({ vip_vm_id: 100, target_host_id: 1 })

    expect(res.status).toBe(401)
  })

  it('should return 404 if no GPU-occupying VM found', async () => {
    callFireEdge.mockResolvedValueOnce({
      data: {
        HOST: {
          HOST_SHARE: {
            PCI_DEVICES: { PCI: [] },
          },
        },
      },
    })

    const res = await request(app)
      .post('/api/vip/preempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_vm_id: 100, target_host_id: 1 })

    expect(res.status).toBe(404)
  })
})

describe('POST /api/vip/restore', () => {
  const adminToken = makeAdminToken()
  let preemptionId

  beforeEach(async () => {
    await clearTables('vip_preemptions')
    vi.clearAllMocks()

    callFireEdge.mockResolvedValue({ ok: true })

    // 建立一個 active 的插隊紀錄
    const { rows } = await testPool.query(
      `INSERT INTO vip_preemptions
         (vip_user_id, vip_vm_id, preempted_vm_id, preempted_user_id, gpu_host_id, action, status)
       VALUES (1, 100, 42, 2, 1, 'preempt', 'active')
       RETURNING *`
    )
    preemptionId = rows[0].id
  })

  it('should restore and return 200', async () => {
    const res = await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: preemptionId })

    expect(res.status).toBe(200)
    expect(res.body.record.status).toBe('restored')
    expect(res.body.record.restored_at).toBeDefined()
  })

  it('should stop VIP VM and resume preempted VM', async () => {
    await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: preemptionId })

    const stopVip = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/vm/action/100'
    )
    const resumePreempted = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/vm/action/42'
    )
    expect(stopVip[2]).toEqual({ action: 'stop' })
    expect(resumePreempted[2]).toEqual({ action: 'resume' })
  })

  it('should update vip_preemptions status to restored', async () => {
    await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: preemptionId })

    const { rows } = await testPool.query(
      'SELECT * FROM vip_preemptions WHERE id = $1',
      [preemptionId]
    )
    expect(rows[0].status).toBe('restored')
    expect(rows[0].restored_at).not.toBeNull()
  })

  it('should return 400 if already restored', async () => {
    await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: preemptionId })

    const res = await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: preemptionId })

    expect(res.status).toBe(400)
  })

  it('should return 404 for non-existent preemption', async () => {
    const res = await request(app)
      .post('/api/vip/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vip_preemption_id: 99999 })

    expect(res.status).toBe(404)
  })
})

describe('GET /api/vip/active', () => {
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('vip_preemptions')
    vi.clearAllMocks()
    callFireEdge.mockResolvedValue({ ok: true })

    // 插入一筆 active 和一筆 restored
    await testPool.query(
      `INSERT INTO vip_preemptions
         (vip_user_id, vip_vm_id, preempted_vm_id, preempted_user_id, gpu_host_id, action, status)
       VALUES
         (1, 100, 42, 2, 1, 'preempt', 'active'),
         (1, 200, 43, 3, 1, 'preempt', 'restored')`
    )
  })

  it('listActive 回傳 active 紀錄、不含 restored', async () => {
    const res = await request(app)
      .get('/api/vip/active')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].status).toBe('active')
    expect(res.body[0].vip_vm_id).toBe(100)
    expect(res.body[0].preempted_vm_id).toBe(42)
    expect(res.body[0].preempted_at).toBeDefined()
  })

  it('無 token 回傳 401', async () => {
    const res = await request(app).get('/api/vip/active')
    expect(res.status).toBe(401)
  })
})
