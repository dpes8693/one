// tests/unit/gpu-alert.test.js
// F8: GPU 告警檢查器單元測試（mock opennebula + db）
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/services/opennebula.js', () => ({
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn(),
  createUser: vi.fn(),
  setUserQuota: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  default: { query: vi.fn() },
}))

import { checkGpuAlerts } from '../../src/services/gpu-alert.js'
import { callFireEdge } from '../../src/services/opennebula.js'
import pool from '../../src/db.js'

function makeVmInfo(overrides = {}) {
  return {
    data: {
      VM: {
        NAME: 'test-vm',
        LCM_STATE: '3',
        MONITORING: {
          GPU_UTILIZATION: '50',
          GPU_MEMORY_FREE: '4096',
        },
        ...overrides,
      },
    },
  }
}

describe('checkGpuAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 每次測試前清除 alertState（透過重新 import 是做不到的，改用時間操控）
  })

  it('無 approved VM 時不呼叫 callFireEdge', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })

    await checkGpuAlerts()

    expect(callFireEdge).not.toHaveBeenCalled()
  })

  it('RUNNING VM GPU 使用率正常，不寫入告警', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ one_vm_id: 100 }] })
    callFireEdge.mockResolvedValueOnce(makeVmInfo())

    await checkGpuAlerts()

    // 確認沒有 INSERT INTO gpu_alerts
    const insertCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO gpu_alerts')
    )
    expect(insertCall).toBeUndefined()
  })

  it('非 RUNNING VM 不做告警檢查', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ one_vm_id: 100 }] })
    callFireEdge.mockResolvedValueOnce(makeVmInfo({ LCM_STATE: '1' }))

    await checkGpuAlerts()

    const insertCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO gpu_alerts')
    )
    expect(insertCall).toBeUndefined()
  })

  it('GPU 使用率 > 95% 但未持續 5 分鐘，不寫入告警', async () => {
    pool.query.mockResolvedValue({ rows: [{ one_vm_id: 101 }] })
    callFireEdge.mockResolvedValue(
      makeVmInfo({ MONITORING: { GPU_UTILIZATION: '96', GPU_MEMORY_FREE: '4096' } })
    )

    // 首次觸發（記錄 firstSeen）
    await checkGpuAlerts()

    const insertCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO gpu_alerts')
    )
    expect(insertCall).toBeUndefined()
  })

  it('callFireEdge 拋錯時不影響其他 VM 的處理', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ one_vm_id: 200 }, { one_vm_id: 201 }],
    })
    callFireEdge
      .mockRejectedValueOnce(new Error('VM 不存在'))
      .mockResolvedValueOnce(makeVmInfo())

    // 不應該 throw
    await expect(checkGpuAlerts()).resolves.not.toThrow()
  })
})
