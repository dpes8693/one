// tests/integration/approve.test.js
// F4: approve 流程完整測試（TDD）
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

import app from '../../src/server.js'
import { testPool, clearTables } from '../helpers/testDb.js'
import { makeAdminToken } from '../helpers/authToken.js'

describe('PUT /api/applications/:id/approve', () => {
  let appId
  const adminToken = makeAdminToken()

  beforeEach(async () => {
    await clearTables('application_reviews', 'email_notifications', 'audit_logs', 'applications')

    const res = await request(app).post('/api/applications').send({
      student_name: 'Mingo',
      student_id: 'BCS114101',
      email: 'mingo@example.com',
      purpose: 'GPU 實驗',
      gpu_spec: 'rtx4070ti',
    })
    expect(res.status).toBe(201)
    appId = res.body.application.id
  })

  it('should return 200 and approved status', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ template_id: 1, quota: { vms: 1, cpu: 4, memory: 8192 } })

    expect(res.status).toBe(200)
    expect(res.body.application.status).toBe('approved')
    expect(res.body.review.one_user_id).toBe(999)
  })

  it('should write application_reviews record with one_user_id', async () => {
    await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quota: { vms: 1, cpu: 4, memory: 8192 } })

    const { rows } = await testPool.query(
      'SELECT * FROM application_reviews WHERE application_id = $1',
      [appId]
    )
    expect(rows.length).toBe(1)
    expect(rows[0].decision).toBe('approved')
    expect(rows[0].one_user_id).toBe(999)
    expect(rows[0].reviewer_name).toBe('oneadmin')
  })

  it('should call sendApprovalNotification', async () => {
    const { sendApprovalNotification } = await import('../../src/services/notifier.js')

    await request(app)
      .put(`/api/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quota: { vms: 1, cpu: 2, memory: 4096 } })

    expect(sendApprovalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'mingo@example.com',
        studentName: 'Mingo',
        relatedId: appId,
      })
    )
  })

  it('should return 400 if application already processed', async () => {
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

  it('should return 401 without token', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}/approve`)
      .send({})

    expect(res.status).toBe(401)
  })

  it('should return 404 for non-existent application', async () => {
    const res = await request(app)
      .put('/api/applications/99999/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(404)
  })
})
