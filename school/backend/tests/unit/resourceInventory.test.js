// tests/unit/resourceInventory.test.js
// Sprint 5 Task #13: 資源庫存服務（unit, mock pg pool）
//
// 測試重點：
//   - getAvailableResources：加總正確、GPU available_indices 排除已用
//   - checkResourceAvailable：充足/各種超量
//   - allocateGpus：first-fit 最低編號、不足拋錯、transaction (BEGIN/COMMIT/ROLLBACK)
//   - releaseSlot：DELETE 呼叫
//   - getAvailabilityByHour：對 25 小時區間回 25 筆
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB pool — 整個 service 透過 default import 使用
vi.mock('../../src/db.js', () => ({
  default: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}))

import pool from '../../src/db.js'
import {
  getAvailableResources,
  getAvailabilityByHour,
  checkResourceAvailable,
  allocateGpus,
  releaseSlot,
} from '../../src/services/resourceInventory.js'

// 統一的 system_settings rows（總量上限）
const SETTINGS_ROWS = [
  { key: 'max_total_cpu', value: '32' },
  { key: 'max_total_ram_gb', value: '64' },
  { key: 'max_total_disk_gb', value: '2000' },
  { key: 'max_total_gpu', value: '8' },
]

/**
 * Helper：把 mock 設定成
 *   1) settings 查詢 → SETTINGS_ROWS
 *   2) approved/pending 加總查詢 → 給定的 sumRow
 *   3) 已用 gpu_index 查詢 → 給定的 gpuRows
 */
function mockInventory({ sumRow, gpuRows }) {
  pool.query.mockReset()
  pool.query
    .mockResolvedValueOnce({ rows: SETTINGS_ROWS }) // settings
    .mockResolvedValueOnce({ rows: [sumRow] })       // resource sum
    .mockResolvedValueOnce({ rows: gpuRows })        // gpu indices used
}

describe('getAvailableResources', () => {
  beforeEach(() => {
    pool.query.mockReset()
  })

  it('加總正確（2 筆 approved + 1 筆 pending 共 12 CPU、38 RAM、500 Disk）', async () => {
    mockInventory({
      sumRow: { cpu: '12', ram_gb: '38', disk_gb: '500' },
      gpuRows: [{ gpu_index: 1 }, { gpu_index: 2 }, { gpu_index: 3 }],
    })

    const res = await getAvailableResources(
      '2026-04-25T08:00:00Z',
      '2026-04-25T09:00:00Z'
    )

    expect(res.cpu).toEqual({ total: 32, used: 12, available: 20 })
    expect(res.ram_gb).toEqual({ total: 64, used: 38, available: 26 })
    expect(res.disk_gb).toEqual({ total: 2000, used: 500, available: 1500 })
    expect(res.gpu.total).toBe(8)
    expect(res.gpu.used_indices).toEqual([1, 2, 3])
    expect(res.gpu.available_indices).toEqual([4, 5, 6, 7, 8])
  })

  it('沒有任何 application：available 等於 total，GPU 全部可用', async () => {
    mockInventory({
      sumRow: { cpu: null, ram_gb: null, disk_gb: null },
      gpuRows: [],
    })

    const res = await getAvailableResources(
      '2026-04-25T08:00:00Z',
      '2026-04-25T09:00:00Z'
    )

    expect(res.cpu.used).toBe(0)
    expect(res.cpu.available).toBe(32)
    expect(res.ram_gb.used).toBe(0)
    expect(res.disk_gb.used).toBe(0)
    expect(res.gpu.used_indices).toEqual([])
    expect(res.gpu.available_indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('查 schedule_slots 應使用 tstzrange 區間重疊條件 + status IN approved/pending', async () => {
    mockInventory({
      sumRow: { cpu: '0', ram_gb: '0', disk_gb: '0' },
      gpuRows: [],
    })

    await getAvailableResources(
      '2026-04-25T08:00:00Z',
      '2026-04-25T09:00:00Z'
    )

    // 第二次 query 應該是加總（含 tstzrange && + status 條件）
    const sumCall = pool.query.mock.calls[1]
    expect(sumCall[0]).toMatch(/tstzrange/i)
    expect(sumCall[0]).toMatch(/&&/)
    expect(sumCall[0]).toMatch(/approved/i)
    expect(sumCall[0]).toMatch(/pending/i)
    // 參數化（不能字串拼接）
    expect(sumCall[1]).toEqual([
      '2026-04-25T08:00:00Z',
      '2026-04-25T09:00:00Z',
    ])
  })
})

describe('checkResourceAvailable', () => {
  beforeEach(() => {
    pool.query.mockReset()
  })

  it('資源充足 → ok=true，violations 為空', async () => {
    // 一個 slot：available 全部夠
    mockInventory({
      sumRow: { cpu: '10', ram_gb: '20', disk_gb: '500' },
      gpuRows: [{ gpu_index: 1 }],
    })

    const res = await checkResourceAvailable(
      [{ start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' }],
      { cpu: 4, ram_gb: 8, disk_gb: 50, gpu_count: 2 }
    )

    expect(res.ok).toBe(true)
    expect(res.violations).toEqual([])
  })

  it('CPU 超量 → ok=false 且 violations 含 cpu', async () => {
    mockInventory({
      sumRow: { cpu: '30', ram_gb: '0', disk_gb: '0' },
      gpuRows: [],
    })

    const res = await checkResourceAvailable(
      [{ start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' }],
      { cpu: 8, ram_gb: 8, disk_gb: 50, gpu_count: 0 }
    )

    expect(res.ok).toBe(false)
    const v = res.violations.find((x) => x.resource === 'cpu')
    expect(v).toBeDefined()
    expect(v.requested).toBe(8)
    expect(v.available).toBe(2)
    expect(v.total).toBe(32)
  })

  it('RAM 超量 → violations 含 ram_gb', async () => {
    mockInventory({
      sumRow: { cpu: '0', ram_gb: '60', disk_gb: '0' },
      gpuRows: [],
    })

    const res = await checkResourceAvailable(
      [{ start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' }],
      { cpu: 1, ram_gb: 16, disk_gb: 50, gpu_count: 0 }
    )

    expect(res.ok).toBe(false)
    expect(res.violations.find((x) => x.resource === 'ram_gb')).toBeDefined()
  })

  it('Disk 超量 → violations 含 disk_gb', async () => {
    mockInventory({
      sumRow: { cpu: '0', ram_gb: '0', disk_gb: '1900' },
      gpuRows: [],
    })

    const res = await checkResourceAvailable(
      [{ start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' }],
      { cpu: 1, ram_gb: 1, disk_gb: 200, gpu_count: 0 }
    )

    expect(res.ok).toBe(false)
    expect(res.violations.find((x) => x.resource === 'disk_gb')).toBeDefined()
  })

  it('GPU 超量 → violations 含 gpu', async () => {
    mockInventory({
      sumRow: { cpu: '0', ram_gb: '0', disk_gb: '0' },
      gpuRows: [
        { gpu_index: 1 },
        { gpu_index: 2 },
        { gpu_index: 3 },
        { gpu_index: 4 },
      ],
    })

    const res = await checkResourceAvailable(
      [{ start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' }],
      { cpu: 1, ram_gb: 1, disk_gb: 50, gpu_count: 6 }
    )

    expect(res.ok).toBe(false)
    const v = res.violations.find((x) => x.resource === 'gpu')
    expect(v).toBeDefined()
    expect(v.requested).toBe(6)
    expect(v.available).toBe(4)
    expect(v.total).toBe(8)
  })

  it('多 slot：任一 slot 不夠 → ok=false', async () => {
    pool.query.mockReset()
    // slot1：充足
    pool.query
      .mockResolvedValueOnce({ rows: SETTINGS_ROWS })
      .mockResolvedValueOnce({ rows: [{ cpu: '0', ram_gb: '0', disk_gb: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      // slot2：CPU 不夠
      .mockResolvedValueOnce({ rows: SETTINGS_ROWS })
      .mockResolvedValueOnce({ rows: [{ cpu: '30', ram_gb: '0', disk_gb: '0' }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await checkResourceAvailable(
      [
        { start_at: '2026-04-25T08:00:00Z', end_at: '2026-04-25T09:00:00Z' },
        { start_at: '2026-04-25T09:00:00Z', end_at: '2026-04-25T10:00:00Z' },
      ],
      { cpu: 8, ram_gb: 8, disk_gb: 50, gpu_count: 0 }
    )

    expect(res.ok).toBe(false)
    expect(res.violations.length).toBeGreaterThan(0)
    // violation 應帶上對應 slot 資訊
    expect(res.violations[0].slot).toBeDefined()
  })
})

describe('allocateGpus', () => {
  let client

  beforeEach(() => {
    pool.query.mockReset()
    // 模擬 pool.connect() 拿到 client
    client = {
      query: vi.fn(),
      release: vi.fn(),
    }
    pool.connect.mockReset()
    pool.connect.mockResolvedValue(client)
  })

  it('first-fit：從最低編號取前 N 張', async () => {
    // 1) client.query('SELECT start_at, end_at FROM schedule_slots ...')
    client.query.mockResolvedValueOnce({
      rows: [
        {
          start_at: '2026-04-25T08:00:00Z',
          end_at: '2026-04-25T10:00:00Z',
        },
      ],
    })
    // 2) BEGIN
    client.query.mockResolvedValueOnce({})
    // 3) settings
    client.query.mockResolvedValueOnce({ rows: SETTINGS_ROWS })
    // 4) sum
    client.query.mockResolvedValueOnce({
      rows: [{ cpu: '0', ram_gb: '0', disk_gb: '0' }],
    })
    // 5) used gpu indices — 已用 [2]，那 first-fit 取 1,3,4
    client.query.mockResolvedValueOnce({ rows: [{ gpu_index: 2 }] })
    // 6-8) 三筆 INSERT
    client.query.mockResolvedValue({ rows: [] })

    const indices = await allocateGpus(42, 3)

    expect(indices).toEqual([1, 3, 4])

    // 應該有 BEGIN + COMMIT
    const calls = client.query.mock.calls.map((c) => c[0])
    expect(calls.some((s) => /BEGIN/i.test(s))).toBe(true)
    expect(calls.some((s) => /COMMIT/i.test(s))).toBe(true)

    // 應有 3 筆 INSERT INTO gpu_allocations
    const insertCalls = client.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && /INSERT INTO gpu_allocations/i.test(c[0])
    )
    expect(insertCalls.length).toBe(3)

    // client 釋放
    expect(client.release).toHaveBeenCalled()
  })

  it('資源不足（要 5 張但只剩 3 張）→ 拋錯且 ROLLBACK', async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          start_at: '2026-04-25T08:00:00Z',
          end_at: '2026-04-25T10:00:00Z',
        },
      ],
    })
    client.query.mockResolvedValueOnce({}) // BEGIN
    client.query.mockResolvedValueOnce({ rows: SETTINGS_ROWS })
    client.query.mockResolvedValueOnce({
      rows: [{ cpu: '0', ram_gb: '0', disk_gb: '0' }],
    })
    // 已用 1,2,3,4,5 → 只剩 6,7,8（3 張）
    client.query.mockResolvedValueOnce({
      rows: [
        { gpu_index: 1 },
        { gpu_index: 2 },
        { gpu_index: 3 },
        { gpu_index: 4 },
        { gpu_index: 5 },
      ],
    })
    client.query.mockResolvedValue({}) // ROLLBACK

    await expect(allocateGpus(42, 5)).rejects.toThrow(/資源不足/)

    const calls = client.query.mock.calls.map((c) => c[0])
    expect(calls.some((s) => /ROLLBACK/i.test(s))).toBe(true)
    expect(client.release).toHaveBeenCalled()
  })

  it('找不到 schedule_slot → 拋錯', async () => {
    client.query.mockResolvedValueOnce({ rows: [] }) // 空

    await expect(allocateGpus(999, 1)).rejects.toThrow()
    expect(client.release).toHaveBeenCalled()
  })
})

describe('releaseSlot', () => {
  beforeEach(() => {
    pool.query.mockReset()
  })

  it('呼叫 DELETE FROM gpu_allocations WHERE schedule_slot_id', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 2 })

    const result = await releaseSlot(42)

    expect(pool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toMatch(/DELETE FROM gpu_allocations/i)
    expect(sql).toMatch(/schedule_slot_id/)
    expect(params).toEqual([42])
    expect(result).toEqual({ released: 2 })
  })
})

describe('getAvailabilityByHour', () => {
  beforeEach(() => {
    pool.query.mockReset()
  })

  it('25 小時區間 → 回 25 筆每小時資料', async () => {
    // 每個小時 3 個 query：settings + sum + gpu used
    // 我們對所有 query 都回最寬鬆預設值
    pool.query.mockImplementation((sql) => {
      if (typeof sql === 'string' && /system_settings/i.test(sql)) {
        return Promise.resolve({ rows: SETTINGS_ROWS })
      }
      if (typeof sql === 'string' && /gpu_allocations/i.test(sql)) {
        return Promise.resolve({ rows: [] })
      }
      // sum query
      return Promise.resolve({
        rows: [{ cpu: '0', ram_gb: '0', disk_gb: '0' }],
      })
    })

    const from = '2026-04-25T00:00:00Z'
    const to = '2026-04-26T01:00:00Z' // 25 小時
    const hours = await getAvailabilityByHour(from, to)

    expect(hours.length).toBe(25)
    expect(hours[0].start_at).toBeDefined()
    expect(hours[0].end_at).toBeDefined()
    expect(hours[0].available).toEqual({
      cpu: 32,
      ram_gb: 64,
      disk_gb: 2000,
      gpu: 8,
    })
    // 第 0 筆和第 1 筆相隔 1 小時
    const t0 = new Date(hours[0].start_at).getTime()
    const t1 = new Date(hours[1].start_at).getTime()
    expect(t1 - t0).toBe(60 * 60 * 1000)
  })
})
