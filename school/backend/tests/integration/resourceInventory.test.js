// tests/integration/resourceInventory.test.js
// Sprint 5 Task #13：資源庫存服務（整合測試，用真 DB）
//
// 測試重點：
//   - 插一筆 application + schedule_slot + 部分 gpu_allocations
//     呼叫 getAvailableResources，驗 used / available 對
//   - 呼叫 allocateGpus 真的寫進 DB（first-fit 從最低編號取）
//   - 第二次重疊 → EXCLUDE constraint 拋錯（race protection）
//   - releaseSlot 後再 allocate 又能成功
//
// 注意：每個 case 用唯一 email 並 afterEach 清理，避免相互污染

// 需要先載 .env，否則 testPool 連 :5432 而非 :5433 失敗
import '../../src/config.js'

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { testPool } from '../helpers/testDb.js'
import {
  getAvailableResources,
  checkResourceAvailable,
  allocateGpus,
  releaseSlot,
  getAvailabilityByHour,
} from '../../src/services/resourceInventory.js'

// 測試用時段（用未來年份避免和其他資料碰撞）
const SLOT_START = '2099-04-25T08:00:00Z'
const SLOT_END = '2099-04-25T10:00:00Z'

const EMAIL_PREFIX = 'inventory_int_test_'

/** 建一筆 application + 一筆 schedule_slot，回 { appId, slotId } */
async function createAppWithSlot({
  cpu = 4,
  ram_gb = 8,
  disk_gb = 50,
  gpu_count = 1,
  status = 'approved',
  startAt = SLOT_START,
  endAt = SLOT_END,
} = {}) {
  const email = `${EMAIL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const appRes = await testPool.query(
    `INSERT INTO applications
       (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count, status)
     VALUES (1, $1, 1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [email, cpu, ram_gb, disk_gb, gpu_count, status]
  )
  const appId = appRes.rows[0].id

  const slotRes = await testPool.query(
    `INSERT INTO schedule_slots (application_id, start_at, end_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [appId, startAt, endAt]
  )
  return { appId, slotId: slotRes.rows[0].id }
}

async function cleanup() {
  await testPool.query(
    `DELETE FROM applications WHERE user_email LIKE $1`,
    [`${EMAIL_PREFIX}%`]
  )
}

describe('resourceInventory (integration)', () => {
  beforeAll(cleanup)
  afterEach(cleanup)
  afterAll(cleanup)

  describe('getAvailableResources', () => {
    it('沒有任何 application：available 全等於 total', async () => {
      const r = await getAvailableResources(SLOT_START, SLOT_END)

      expect(r.cpu.total).toBeGreaterThan(0)
      expect(r.cpu.used).toBe(0)
      expect(r.cpu.available).toBe(r.cpu.total)
      expect(r.gpu.used_indices).toEqual([])
      expect(r.gpu.available_indices.length).toBe(r.gpu.total)
    })

    it('插一筆 approved application：used 應加總正確', async () => {
      await createAppWithSlot({
        cpu: 4,
        ram_gb: 16,
        disk_gb: 100,
        gpu_count: 2,
        status: 'approved',
      })

      const r = await getAvailableResources(SLOT_START, SLOT_END)
      expect(r.cpu.used).toBeGreaterThanOrEqual(4)
      expect(r.ram_gb.used).toBeGreaterThanOrEqual(16)
      expect(r.disk_gb.used).toBeGreaterThanOrEqual(100)
      expect(r.cpu.available).toBe(r.cpu.total - r.cpu.used)
    })

    it('插一筆 rejected application：不算入 used', async () => {
      await createAppWithSlot({
        cpu: 8,
        status: 'rejected',
      })

      const r = await getAvailableResources(SLOT_START, SLOT_END)
      expect(r.cpu.used).toBe(0)
    })

    it('GPU available_indices 排除已分配編號', async () => {
      const { slotId } = await createAppWithSlot({ gpu_count: 1 })
      // 直接寫一筆 gpu_allocations 佔走 GPU 3
      await testPool.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, 3, $2, $3)`,
        [slotId, SLOT_START, SLOT_END]
      )

      const r = await getAvailableResources(SLOT_START, SLOT_END)
      expect(r.gpu.used_indices).toContain(3)
      expect(r.gpu.available_indices).not.toContain(3)
    })
  })

  describe('checkResourceAvailable', () => {
    it('資源充足 → ok=true', async () => {
      const res = await checkResourceAvailable(
        [{ start_at: SLOT_START, end_at: SLOT_END }],
        { cpu: 1, ram_gb: 1, disk_gb: 10, gpu_count: 1 }
      )
      expect(res.ok).toBe(true)
    })

    it('GPU 要 9 張（超過總量 8）→ ok=false 且含 gpu violation', async () => {
      const res = await checkResourceAvailable(
        [{ start_at: SLOT_START, end_at: SLOT_END }],
        { cpu: 1, ram_gb: 1, disk_gb: 10, gpu_count: 9 }
      )
      expect(res.ok).toBe(false)
      expect(res.violations.find((v) => v.resource === 'gpu')).toBeDefined()
    })
  })

  describe('allocateGpus', () => {
    it('first-fit：第一次配 3 張應拿到 [1, 2, 3]', async () => {
      const { slotId } = await createAppWithSlot({ gpu_count: 3 })

      const picked = await allocateGpus(slotId, 3)
      expect(picked).toEqual([1, 2, 3])

      // DB 真的有 3 筆
      const { rows } = await testPool.query(
        `SELECT gpu_index FROM gpu_allocations
          WHERE schedule_slot_id = $1
          ORDER BY gpu_index`,
        [slotId]
      )
      expect(rows.map((r) => r.gpu_index)).toEqual([1, 2, 3])
    })

    it('第二次重疊配 6 張會踩到 EXCLUDE constraint：應拋錯且第二筆完全沒寫入', async () => {
      // slot1：先吃 1-3
      const { slotId: slot1 } = await createAppWithSlot({ gpu_count: 3 })
      await allocateGpus(slot1, 3)

      // slot2：同時段，要 6 張
      // available 演算法看到 1-3 已用，會 first-fit 取 4-8（5 張）→ 數量不足拋「資源不足」
      const { slotId: slot2 } = await createAppWithSlot({ gpu_count: 6 })
      await expect(allocateGpus(slot2, 6)).rejects.toThrow(/資源不足/)

      // slot2 應該完全沒寫入
      const { rows } = await testPool.query(
        `SELECT gpu_index FROM gpu_allocations WHERE schedule_slot_id = $1`,
        [slot2]
      )
      expect(rows.length).toBe(0)
    })

    it('release 後可再次 allocate 同編號', async () => {
      const { slotId } = await createAppWithSlot({ gpu_count: 2 })
      await allocateGpus(slotId, 2)

      const result = await releaseSlot(slotId)
      expect(result.released).toBe(2)

      // 再 allocate 一張，應拿到編號 1
      const { slotId: slot2 } = await createAppWithSlot({ gpu_count: 1 })
      const picked = await allocateGpus(slot2, 1)
      expect(picked).toEqual([1])
    })
  })

  describe('getAvailabilityByHour', () => {
    it('小範圍（3 小時）回 3 筆，每筆有正確結構', async () => {
      const from = '2099-05-01T00:00:00Z'
      const to = '2099-05-01T03:00:00Z'
      const hours = await getAvailabilityByHour(from, to)
      expect(hours.length).toBe(3)
      for (const h of hours) {
        expect(h).toHaveProperty('start_at')
        expect(h).toHaveProperty('end_at')
        expect(h.available).toHaveProperty('cpu')
        expect(h.available).toHaveProperty('ram_gb')
        expect(h.available).toHaveProperty('disk_gb')
        expect(h.available).toHaveProperty('gpu')
      }
    })
  })
})
