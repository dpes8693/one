// tests/unit/scheduler.test.js
// Sprint 5 Task #16: scheduler tickStart / tickEnd（含 Row-level lock）+ 既有舊邏輯
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

// mock opennebula — 包含新增的 instantiateTemplate / getVmIp
vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn().mockResolvedValue('fake-token'),
  createUser: vi.fn(),
  setUserQuota: vi.fn(),
  instantiateTemplate: vi.fn(),
  getVmIp: vi.fn().mockResolvedValue('10.1.1.100'),
}))

// mock notifier — 4 個新函式
vi.mock('../../src/services/notifier.js', () => ({
  sendVmReadyEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendVmFailureNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendVmFailureToStudent: vi.fn().mockResolvedValue({ status: 'sent' }),
  sendVmEndedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
}))

// mock resourceInventory — releaseSlot
vi.mock('../../src/services/resourceInventory.js', () => ({
  releaseSlot: vi.fn().mockResolvedValue({ released: 0 }),
}))

// mock db
vi.mock('../../src/db.js', () => ({
  default: { query: vi.fn() },
}))

import {
  startScheduler,
  tickStartScheduler,
  tickEndScheduler,
} from '../../src/services/scheduler.js'
import {
  callFireEdge,
  instantiateTemplate,
  getVmIp,
} from '../../src/services/opennebula.js'
import {
  sendVmReadyEmail,
  sendVmFailureNotification,
  sendVmFailureToStudent,
  sendVmEndedEmail,
} from '../../src/services/notifier.js'
import { releaseSlot } from '../../src/services/resourceInventory.js'
import pool from '../../src/db.js'

describe('startScheduler — 既有舊邏輯（保留不退化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(cronCallbacks).forEach((k) => delete cronCallbacks[k])
  })

  it('應該用 node-cron 註冊兩個排程', async () => {
    const cron = (await import('node-cron')).default
    startScheduler()
    expect(cron.schedule).toHaveBeenCalledTimes(2)
  })

  it('每分鐘 cron：找到 active 排程後應呼叫 callFireEdge', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          { id: 1, one_vm_id: 100, one_user_id: 5, action: 'resume', repeat_type: 'once' },
        ],
      }) // legacy schedules
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }) // update is_active
      .mockResolvedValueOnce({ rows: [] }) // tickStart UPDATE...RETURNING
      .mockResolvedValueOnce({ rows: [] }) // tickEnd UPDATE...RETURNING

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
    pool.query.mockResolvedValue({ rows: [] })
    callFireEdge.mockResolvedValue({ ok: true })

    startScheduler()
    await cronCallbacks['* * * * *']()

    expect(callFireEdge).not.toHaveBeenCalled()
  })

  it('每 5 分鐘 cron：VM 超過時數應觸發 poweroff', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000)
    const maxHours = parseInt(process.env.VM_MAX_HOURS || '4', 10)
    const stimeOld = nowEpoch - maxHours * 3600 - 100

    // 每分鐘 callback 會呼叫多次 query：legacy + tickStart lock + tickEnd lock
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // legacy schedules
      .mockResolvedValueOnce({ rows: [] }) // tickStart UPDATE...RETURNING
      .mockResolvedValueOnce({ rows: [] }) // tickEnd UPDATE...RETURNING
      // 每5分鐘 callback
      .mockResolvedValueOnce({ rows: [{ one_vm_id: 200, one_user_id: 7 }] })
      .mockResolvedValueOnce({ rows: [] }) // audit

    callFireEdge
      .mockResolvedValueOnce({ data: { VM: { STIME: String(stimeOld) } } })
      .mockResolvedValueOnce({ ok: true })

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

describe('tickStartScheduler — Sprint 5 Task #16（開機）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(cronCallbacks).forEach((k) => delete cronCallbacks[k])
  })

  it('沒有 pending slot → 不呼叫 instantiate', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }) // UPDATE...RETURNING

    await tickStartScheduler()

    expect(instantiateTemplate).not.toHaveBeenCalled()
  })

  it('Row-level lock：UPDATE 必含 status=processing + RETURNING', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })

    await tickStartScheduler()

    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE\s+schedule_slots/i)
    expect(sql).toMatch(/SET\s+status\s*=\s*'processing'/i)
    expect(sql).toMatch(/WHERE\s+status\s*=\s*'pending'/i)
    expect(sql).toMatch(/start_at\s*<=\s*now\(\)/i)
    expect(sql).toMatch(/RETURNING/i)
  })

  it('一個 pending slot → 呼叫 instantiate → status=running + 寄信', async () => {
    const slot = { id: 10, application_id: 100, vm_id: null }
    pool.query
      .mockResolvedValueOnce({ rows: [slot] }) // UPDATE...RETURNING
      .mockResolvedValueOnce({
        rows: [
          {
            id: 100,
            user_id: 7,
            user_email: 'student@example.com',
            template_id: 5,
            cpu: 4,
            ram_gb: 16,
            disk_gb: 100,
            gpu_count: 2,
          },
        ],
      }) // SELECT application
      .mockResolvedValueOnce({ rows: [{ gpu_index: 1 }, { gpu_index: 3 }] }) // SELECT gpu_allocations
      .mockResolvedValueOnce({ rows: [] }) // UPDATE schedule_slots SET running
      .mockResolvedValueOnce({ rows: [] }) // audit_logs

    instantiateTemplate.mockResolvedValueOnce({ data: { VM: { ID: '999' } } })

    await tickStartScheduler()

    expect(instantiateTemplate).toHaveBeenCalledTimes(1)
    const [, templateId, vmName, opts] = instantiateTemplate.mock.calls[0]
    expect(templateId).toBe(5)
    expect(vmName).toBe('app-100-10')
    expect(opts.template).toEqual(
      expect.arrayContaining([
        'CPU = 4',
        'VCPU = 4',
        'MEMORY = 16384',
        'DISK = [SIZE = 102400]',
        expect.stringMatching(/PCI = \[DEVICE_NAME = "GPU_1"/),
        expect.stringMatching(/PCI = \[DEVICE_NAME = "GPU_3"/),
      ])
    )

    // 學生收到 SSH 信
    expect(sendVmReadyEmail).toHaveBeenCalledWith(
      'student@example.com',
      'app-100-10',
      '10.1.1.100',
      22,
      'root'
    )

    // status 更新成 running + vm_id
    const updateRunningCall = pool.query.mock.calls.find(
      ([sql]) => /UPDATE\s+schedule_slots/i.test(sql) && /running/i.test(sql)
    )
    expect(updateRunningCall).toBeDefined()
    expect(updateRunningCall[1]).toEqual(['999', 10])
  })

  it('instantiate 失敗 → status=failed + 通知 admin + 通知學生', async () => {
    const slot = { id: 11, application_id: 200, vm_id: null }
    pool.query
      .mockResolvedValueOnce({ rows: [slot] }) // UPDATE...RETURNING
      .mockResolvedValueOnce({
        rows: [
          {
            id: 200,
            user_id: 7,
            user_email: 'sad@example.com',
            template_id: 5,
            cpu: 4,
            ram_gb: 16,
            disk_gb: 100,
            gpu_count: 1,
          },
        ],
      }) // SELECT application
      .mockResolvedValueOnce({ rows: [{ gpu_index: 1 }] }) // SELECT gpu
      .mockResolvedValueOnce({ rows: [] }) // UPDATE failed
      .mockResolvedValueOnce({ rows: [{ user_email: 'sad@example.com' }] }) // SELECT user_email for student notify
      .mockResolvedValueOnce({ rows: [] }) // audit

    instantiateTemplate.mockRejectedValueOnce(new Error('OpenNebula 423'))

    await tickStartScheduler()

    // failed 寫入
    const failedUpdate = pool.query.mock.calls.find(
      ([sql]) => /UPDATE\s+schedule_slots/i.test(sql) && /failed/i.test(sql)
    )
    expect(failedUpdate).toBeDefined()

    // admin 收到失敗通知
    expect(sendVmFailureNotification).toHaveBeenCalledWith(
      expect.any(String),
      'app-200-11',
      expect.stringContaining('OpenNebula 423')
    )

    // 學生收到開機失敗通知
    expect(sendVmFailureToStudent).toHaveBeenCalledWith('sad@example.com')
  })
})

describe('tickEndScheduler — Sprint 5 Task #16（關機）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(cronCallbacks).forEach((k) => delete cronCallbacks[k])
  })

  it('沒有到期 running slot → 不呼叫 terminate', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })

    await tickEndScheduler()

    expect(callFireEdge).not.toHaveBeenCalled()
  })

  it('Row-level lock：UPDATE 必含 status=cleaning + RETURNING', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })

    await tickEndScheduler()

    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE\s+schedule_slots/i)
    expect(sql).toMatch(/SET\s+status\s*=\s*'cleaning'/i)
    expect(sql).toMatch(/WHERE\s+status\s*=\s*'running'/i)
    expect(sql).toMatch(/end_at\s*<=\s*now\(\)/i)
    expect(sql).toMatch(/RETURNING/i)
  })

  it('一個 running 到期 → terminate → status=completed + 釋放 GPU', async () => {
    const slot = { id: 20, application_id: 300, vm_id: '888' }
    pool.query
      .mockResolvedValueOnce({ rows: [slot] }) // UPDATE...RETURNING
      .mockResolvedValueOnce({ rows: [{ user_email: 'done@example.com' }] }) // SELECT user_email
      .mockResolvedValueOnce({ rows: [] }) // UPDATE completed
      .mockResolvedValueOnce({ rows: [] }) // audit

    callFireEdge.mockResolvedValueOnce({ ok: true })

    await tickEndScheduler()

    expect(callFireEdge).toHaveBeenCalledWith(
      'PUT',
      '/vm/action/888',
      { action: 'terminate' },
      'fake-token'
    )

    // status=completed
    const completedUpdate = pool.query.mock.calls.find(
      ([sql]) => /UPDATE\s+schedule_slots/i.test(sql) && /completed/i.test(sql)
    )
    expect(completedUpdate).toBeDefined()
    expect(completedUpdate[1]).toEqual([20])

    // 釋放 gpu_allocations
    expect(releaseSlot).toHaveBeenCalledWith(20)

    // 學生收信
    expect(sendVmEndedEmail).toHaveBeenCalledWith('done@example.com', 'app-300-20')
  })

  it('slot 缺 vm_id → 走 end_failed 分支 + 仍釋放 GPU', async () => {
    const slot = { id: 22, application_id: 401, vm_id: null }
    pool.query
      .mockResolvedValueOnce({ rows: [slot] }) // UPDATE...RETURNING
      .mockResolvedValueOnce({ rows: [{ user_email: 'noid@example.com' }] }) // SELECT user_email
      .mockResolvedValueOnce({ rows: [] }) // UPDATE end_failed

    await tickEndScheduler()

    expect(callFireEdge).not.toHaveBeenCalled()
    expect(releaseSlot).toHaveBeenCalledWith(22)
    expect(sendVmFailureNotification).toHaveBeenCalled()
  })

  it('terminate 失敗 → status=end_failed + 通知 admin，仍釋放 GPU', async () => {
    const slot = { id: 21, application_id: 400, vm_id: '777' }
    pool.query
      .mockResolvedValueOnce({ rows: [slot] }) // UPDATE...RETURNING
      .mockResolvedValueOnce({ rows: [{ user_email: 'oops@example.com' }] }) // SELECT user_email
      .mockResolvedValueOnce({ rows: [] }) // UPDATE end_failed

    callFireEdge.mockRejectedValueOnce(new Error('VM 不存在'))

    await tickEndScheduler()

    const endFailedUpdate = pool.query.mock.calls.find(
      ([sql]) => /UPDATE\s+schedule_slots/i.test(sql) && /end_failed/i.test(sql)
    )
    expect(endFailedUpdate).toBeDefined()

    // 釋放 GPU（即使 terminate 失敗，避免永久占用）
    expect(releaseSlot).toHaveBeenCalledWith(21)

    // admin 收到失敗通知
    expect(sendVmFailureNotification).toHaveBeenCalledWith(
      expect.any(String),
      'app-400-21',
      expect.stringContaining('VM 不存在')
    )
  })
})
