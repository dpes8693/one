// tests/unit/scheduler.test.js
// F5: scheduler cron trigger 單元測試（mock cron + opennebula）
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock node-cron — 擷取傳入的 callback，讓我們手動觸發
const cronCallbacks = {}
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((pattern, callback) => {
      cronCallbacks[pattern] = callback
    }),
  },
}))

// mock opennebula
vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn(),
  createUser: vi.fn(),
  setUserQuota: vi.fn(),
}))

// mock db
vi.mock('../../src/db.js', () => ({
  default: { query: vi.fn() },
}))

import { startScheduler } from '../../src/services/scheduler.js'
import { callFireEdge } from '../../src/services/opennebula.js'
import pool from '../../src/db.js'

describe('startScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(cronCallbacks).forEach(k => delete cronCallbacks[k])
  })

  it('應該用 node-cron 註冊兩個排程', async () => {
    const cron = (await import('node-cron')).default
    startScheduler()
    expect(cron.schedule).toHaveBeenCalledTimes(2)
  })

  it('每分鐘 cron：找到 active 排程後應呼叫 callFireEdge', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, one_vm_id: 100, one_user_id: 5, action: 'resume', repeat_type: 'once' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // audit_logs insert
      .mockResolvedValueOnce({ rows: [] }) // update is_active

    callFireEdge.mockResolvedValue({ ok: true })

    startScheduler()
    await cronCallbacks['* * * * *']()

    expect(callFireEdge).toHaveBeenCalledWith(
      'PUT',
      '/vm/action/100',
      { action: 'resume' },
      null
    )
  })

  it('每分鐘 cron：沒有 active 排程時不呼叫 callFireEdge', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })
    callFireEdge.mockResolvedValue({ ok: true })

    startScheduler()
    await cronCallbacks['* * * * *']()

    expect(callFireEdge).not.toHaveBeenCalled()
  })

  it('每 5 分鐘 cron：VM 超過時數應觸發 poweroff', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000)
    const maxHours = parseInt(process.env.VM_MAX_HOURS || '4', 10)
    const stimeOld = nowEpoch - maxHours * 3600 - 100 // 超過時數

    pool.query
      .mockResolvedValueOnce({ rows: [] }) // 每分鐘 schedules
      .mockResolvedValueOnce({ rows: [{ one_vm_id: 200, one_user_id: 7 }] }) // 每5分鐘 reviews
      .mockResolvedValueOnce({ rows: [] }) // audit_logs

    callFireEdge
      .mockResolvedValueOnce({ data: { VM: { STIME: String(stimeOld) } } }) // vm/info
      .mockResolvedValueOnce({ ok: true }) // poweroff

    startScheduler()
    await cronCallbacks['* * * * *']()
    await cronCallbacks['*/5 * * * *']()

    const poweroffCall = callFireEdge.mock.calls.find(
      ([m, p]) => m === 'PUT' && p === '/vm/action/200'
    )
    expect(poweroffCall).toBeDefined()
    expect(poweroffCall[2]).toEqual({ action: 'poweroff' })
  })
})
