// services/resourceInventory.js
// Sprint 5 Task #13：資源庫存服務（核心 service 層）
//
// 規格：docs/SPEC_V2.md R1-R10、Sprint 5 Task S5-6
//
// 五個對外函式：
//   1. getAvailableResources(startAt, endAt)
//        回傳該時段 cpu / ram_gb / disk_gb / gpu 的 total / used / available
//        + GPU 的 used_indices / available_indices
//   2. getAvailabilityByHour(fromDate, toDate)
//        逐小時切，每小時呼叫 getAvailableResources，給前端行事曆 30 天用
//   3. checkResourceAvailable(slots, request)
//        檢查多個 slot 對某 request 是否都夠，回 { ok, violations }
//   4. allocateGpus(scheduleSlotId, gpuCount)
//        first-fit 從最低編號取 N 張，transaction 包 INSERT，
//        race condition 由 DB 的 EXCLUDE constraint 兜底
//   5. releaseSlot(scheduleSlotId)
//        DELETE FROM gpu_allocations WHERE schedule_slot_id = $1
//
// 設計重點：
//   - 同時段「重疊」用 PostgreSQL 的 tstzrange && tstzrange
//   - 加總時 status IN ('approved', 'pending')（R7：通過 + 待審 + 進行中）
//   - GPU available_indices 從 1..max_total_gpu 中扣除已用編號
//   - 純 service，不暴露 HTTP endpoint

import pool from '../db.js'

const SETTING_KEYS = [
  'max_total_cpu',
  'max_total_ram_gb',
  'max_total_disk_gb',
  'max_total_gpu',
]

/**
 * 從 system_settings 拉 4 個總量上限，回 { cpu, ram_gb, disk_gb, gpu }（皆 number）
 * 缺值時走預設值（保守給 0，呼叫端會看到 available 變負）
 */
async function loadTotals(executor) {
  const { rows } = await executor.query(
    `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
    [SETTING_KEYS]
  )
  const map = {}
  for (const r of rows) map[r.key] = parseInt(r.value, 10)

  return {
    cpu: Number.isFinite(map.max_total_cpu) ? map.max_total_cpu : 0,
    ram_gb: Number.isFinite(map.max_total_ram_gb) ? map.max_total_ram_gb : 0,
    disk_gb: Number.isFinite(map.max_total_disk_gb) ? map.max_total_disk_gb : 0,
    gpu: Number.isFinite(map.max_total_gpu) ? map.max_total_gpu : 0,
  }
}

/**
 * 加總同時段（與 [startAt, endAt) 重疊）所有 status IN approved/pending 的
 * application 之 CPU / RAM / Disk
 *
 * Sprint 5 Task #15：新增 excludeApplicationId — 審核時排除「自己這筆 pending」，
 * 避免 R7 把待審本身也算進「已用」造成資源永遠不足。
 */
async function sumUsedResources(executor, startAt, endAt, excludeApplicationId = null) {
  const params = [startAt, endAt]
  let extra = ''
  if (excludeApplicationId != null) {
    params.push(excludeApplicationId)
    extra = ` AND a.id <> $${params.length}`
  }
  const { rows } = await executor.query(
    `SELECT
       COALESCE(SUM(a.cpu), 0)::int      AS cpu,
       COALESCE(SUM(a.ram_gb), 0)::int   AS ram_gb,
       COALESCE(SUM(a.disk_gb), 0)::int  AS disk_gb
     FROM schedule_slots s
     JOIN applications a ON a.id = s.application_id
     WHERE a.status IN ('approved', 'pending')
       AND tstzrange(s.start_at, s.end_at, '[)')
           && tstzrange($1::timestamptz, $2::timestamptz, '[)')${extra}`,
    params
  )
  const r = rows[0] || {}
  return {
    cpu: parseInt(r.cpu ?? 0, 10) || 0,
    ram_gb: parseInt(r.ram_gb ?? 0, 10) || 0,
    disk_gb: parseInt(r.disk_gb ?? 0, 10) || 0,
  }
}

/**
 * 查同時段已被佔用的 GPU 編號（distinct），對應 application 仍在 approved/pending
 *
 * Sprint 5 Task #15：新增 excludeApplicationId — 同 sumUsedResources 理由。
 */
async function fetchUsedGpuIndices(executor, startAt, endAt, excludeApplicationId = null) {
  const params = [startAt, endAt]
  let extra = ''
  if (excludeApplicationId != null) {
    params.push(excludeApplicationId)
    extra = ` AND a.id <> $${params.length}`
  }
  const { rows } = await executor.query(
    `SELECT DISTINCT g.gpu_index
       FROM gpu_allocations g
       JOIN schedule_slots s ON s.id = g.schedule_slot_id
       JOIN applications a   ON a.id = s.application_id
      WHERE a.status IN ('approved', 'pending')
        AND tstzrange(g.start_at, g.end_at, '[)')
            && tstzrange($1::timestamptz, $2::timestamptz, '[)')${extra}
      ORDER BY g.gpu_index`,
    params
  )
  return rows.map((r) => parseInt(r.gpu_index, 10))
}

/**
 * 內部版本：可帶入 executor（pool 或 client），給 transaction 共用
 *
 * Sprint 5 Task #15：新增 excludeApplicationId — 由 approve 流程傳入，
 * 排除「自己這筆 pending」避免雙重計算。
 */
async function getAvailableResourcesWith(executor, startAt, endAt, excludeApplicationId = null) {
  const totals = await loadTotals(executor)
  const used = await sumUsedResources(executor, startAt, endAt, excludeApplicationId)
  const usedIndices = await fetchUsedGpuIndices(executor, startAt, endAt, excludeApplicationId)

  const allIndices = []
  for (let i = 1; i <= totals.gpu; i++) allIndices.push(i)
  const availableIndices = allIndices.filter((i) => !usedIndices.includes(i))

  return {
    cpu: {
      total: totals.cpu,
      used: used.cpu,
      available: totals.cpu - used.cpu,
    },
    ram_gb: {
      total: totals.ram_gb,
      used: used.ram_gb,
      available: totals.ram_gb - used.ram_gb,
    },
    disk_gb: {
      total: totals.disk_gb,
      used: used.disk_gb,
      available: totals.disk_gb - used.disk_gb,
    },
    gpu: {
      total: totals.gpu,
      used_indices: usedIndices,
      available_indices: availableIndices,
    },
  }
}

/**
 * 公開：查某時段的可用資源
 *
 * @param {string} startAt
 * @param {string} endAt
 * @param {number|null} [excludeApplicationId] 排除特定 application（審核時用）
 */
export async function getAvailableResources(startAt, endAt, excludeApplicationId = null) {
  return getAvailableResourcesWith(pool, startAt, endAt, excludeApplicationId)
}

/**
 * 公開：行事曆 30 天每小時餘量
 *  - 把 [from, to) 切成整點小時格
 *  - 每格呼叫 getAvailableResources 拿餘量
 *  - 回傳 { start_at, end_at, available: { cpu, ram_gb, disk_gb, gpu } }[]
 *
 *  注意：呼叫端應自行控制範圍（例：30 天 = 720 格），避免太大
 */
export async function getAvailabilityByHour(fromDate, toDate) {
  const HOUR = 60 * 60 * 1000
  const start = new Date(fromDate).getTime()
  const end = new Date(toDate).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return []
  }

  const result = []
  for (let t = start; t < end; t += HOUR) {
    const slotStart = new Date(t).toISOString()
    const slotEnd = new Date(t + HOUR).toISOString()
    const r = await getAvailableResources(slotStart, slotEnd)
    result.push({
      start_at: slotStart,
      end_at: slotEnd,
      available: {
        cpu: r.cpu.available,
        ram_gb: r.ram_gb.available,
        disk_gb: r.disk_gb.available,
        gpu: r.gpu.available_indices.length,
      },
    })
  }
  return result
}

/**
 * 公開：檢查 request 在所有 slot 上是否都夠
 *  輸入：
 *    slots: [{ start_at, end_at }, ...]
 *    request: { cpu, ram_gb, disk_gb, gpu_count }
 *  輸出：
 *    { ok: boolean, violations: [{ resource, slot, requested, available, total }] }
 */
export async function checkResourceAvailable(slots, request, excludeApplicationId = null) {
  const violations = []
  const req = {
    cpu: parseInt(request.cpu ?? 0, 10) || 0,
    ram_gb: parseInt(request.ram_gb ?? 0, 10) || 0,
    disk_gb: parseInt(request.disk_gb ?? 0, 10) || 0,
    gpu_count: parseInt(request.gpu_count ?? 0, 10) || 0,
  }

  for (const slot of slots) {
    const r = await getAvailableResources(slot.start_at, slot.end_at, excludeApplicationId)

    if (req.cpu > r.cpu.available) {
      violations.push({
        resource: 'cpu',
        slot,
        requested: req.cpu,
        available: r.cpu.available,
        total: r.cpu.total,
      })
    }
    if (req.ram_gb > r.ram_gb.available) {
      violations.push({
        resource: 'ram_gb',
        slot,
        requested: req.ram_gb,
        available: r.ram_gb.available,
        total: r.ram_gb.total,
      })
    }
    if (req.disk_gb > r.disk_gb.available) {
      violations.push({
        resource: 'disk_gb',
        slot,
        requested: req.disk_gb,
        available: r.disk_gb.available,
        total: r.disk_gb.total,
      })
    }
    if (req.gpu_count > r.gpu.available_indices.length) {
      violations.push({
        resource: 'gpu',
        slot,
        requested: req.gpu_count,
        available: r.gpu.available_indices.length,
        total: r.gpu.total,
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

/**
 * 公開：對某個 schedule_slot first-fit 配 N 張 GPU，寫入 gpu_allocations
 *  - 在 transaction 內：BEGIN → 算 available → INSERT N 筆 → COMMIT
 *  - 任一步驟失敗 → ROLLBACK 並 throw
 *  - DB 的 EXCLUDE constraint (gpu_no_overlap) 會兜底 race condition
 *  - 回傳：[gpu_index, ...]（依排序）
 */
export async function allocateGpus(scheduleSlotId, gpuCount) {
  const n = parseInt(gpuCount, 10) || 0
  if (n <= 0) return []

  const client = await pool.connect()
  try {
    // 1) 取 slot 的 start_at / end_at（也用 client，方便測試 mock）
    const slotRes = await client.query(
      `SELECT start_at, end_at FROM schedule_slots WHERE id = $1`,
      [scheduleSlotId]
    )
    if (!slotRes || slotRes.rows.length === 0) {
      throw new Error(`schedule_slot ${scheduleSlotId} 不存在`)
    }
    const { start_at: startAt, end_at: endAt } = slotRes.rows[0]

    // 2) Transaction：BEGIN → 算 available → INSERT → COMMIT
    await client.query('BEGIN')

    const inv = await getAvailableResourcesWith(client, startAt, endAt)
    const available = inv.gpu.available_indices

    if (available.length < n) {
      await client.query('ROLLBACK')
      throw new Error(
        `資源不足：要求 ${n} 張 GPU，僅剩 ${available.length} 張`
      )
    }

    // first-fit：available_indices 已排序，取前 N
    const picked = available.slice(0, n)

    for (const gpuIndex of picked) {
      await client.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, $2, $3, $4)`,
        [scheduleSlotId, gpuIndex, startAt, endAt]
      )
    }

    await client.query('COMMIT')
    return picked
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // 忽略 ROLLBACK 失敗（多半是已經結束 / 還沒 BEGIN）
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * 公開：釋放某 schedule_slot 的所有 GPU 分配
 *  （ON DELETE CASCADE 會自動釋放，但提早 terminate 場景需顯式呼叫）
 */
export async function releaseSlot(scheduleSlotId) {
  const res = await pool.query(
    `DELETE FROM gpu_allocations WHERE schedule_slot_id = $1`,
    [scheduleSlotId]
  )
  return { released: res.rowCount || 0 }
}

export default {
  getAvailableResources,
  getAvailabilityByHour,
  checkResourceAvailable,
  allocateGpus,
  releaseSlot,
}
