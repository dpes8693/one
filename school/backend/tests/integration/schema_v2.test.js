// tests/integration/schema_v2.test.js
// Task #8：SPEC V2 DB schema 整合測試（用真 DB，不 mock）
//
// 驗證重點：
//   1. 既有 + 新表都存在（13 表）
//   2. system_settings 12 筆預設值齊全 + 內容正確
//   3. gpu_allocations EXCLUDE constraint 擋同 GPU 重疊時段
//   4. CASCADE 行為：刪 application 連帶刪 schedule_slots / gpu_allocations
//   5. 欄位 / index / extension 正確

// 載入 .env（裡面有 POSTGRES_HOST=localhost / PORT=5433 / PASSWORD=changeme）
// 其他既有測試會 import src/server.js → 透過 src/config.js 載入 .env；本檔只用 testPool
// 不導 server，因此必須自己載 .env，否則 testDb.js 預設會連 :5432 而失敗。
import '../../src/config.js'

import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { testPool } from '../helpers/testDb.js'

const EXPECTED_TABLES = [
  // 既有保留
  'audit_logs',
  'email_notifications',
  'gpu_alerts',
  'gpu_metrics',
  'login_history',
  'schedules',
  'vip_preemptions',
  // 新建（含重建的 applications）
  'applications',
  'pending_registrations',
  'verification_throttle',
  'schedule_slots',
  'gpu_allocations',
  'system_settings',
]

const EXPECTED_SETTINGS = {
  max_active_reservations: '3',
  max_hours_per_reservation: '24',
  max_advance_booking_days: '30',
  max_total_cpu: '32',
  max_total_ram_gb: '64',
  max_total_disk_gb: '2000',
  max_total_gpu: '8',
  verification_code_ttl_min: '5',
  verification_max_per_hour: '5',
  verification_max_attempts: '3',
  verification_lockout_minutes: '30',
  base_template_id: '1',
}

describe('SPEC V2 schema migration (03_spec_v2.sql)', () => {
  afterAll(async () => {
    // 清乾淨任何測試殘留
    await testPool.query(
      `DELETE FROM applications WHERE user_email LIKE 'schema_v2_test%@example.com'`
    )
  })

  describe('1. tables 都存在', () => {
    it.each(EXPECTED_TABLES)('表 %s 存在於 public schema', async (table) => {
      const { rows } = await testPool.query(
        `SELECT to_regclass($1) AS oid`,
        [`public.${table}`]
      )
      expect(rows[0].oid).toBe(table)
    })
  })

  describe('2. system_settings 12 筆預設值', () => {
    it('總筆數 >= 12（含 spec v2 全部 key）', async () => {
      const { rows } = await testPool.query(
        `SELECT COUNT(*)::int AS n FROM system_settings`
      )
      expect(rows[0].n).toBeGreaterThanOrEqual(12)
    })

    it.each(Object.entries(EXPECTED_SETTINGS))(
      'key=%s value=%s 存在且正確',
      async (key, expected) => {
        const { rows } = await testPool.query(
          `SELECT value FROM system_settings WHERE key=$1`,
          [key]
        )
        expect(rows.length).toBe(1)
        expect(rows[0].value).toBe(expected)
      }
    )
  })

  describe('3. btree_gist 擴充 + gpu_no_overlap EXCLUDE constraint', () => {
    it('btree_gist 擴充已安裝', async () => {
      const { rows } = await testPool.query(
        `SELECT extname FROM pg_extension WHERE extname='btree_gist'`
      )
      expect(rows.length).toBe(1)
    })

    it('gpu_no_overlap constraint 存在', async () => {
      const { rows } = await testPool.query(
        `SELECT conname FROM pg_constraint WHERE conname='gpu_no_overlap'`
      )
      expect(rows.length).toBe(1)
    })
  })

  describe('4. EXCLUDE 真的擋住重疊（end-to-end 寫測試）', () => {
    let appId
    let slotId

    beforeEach(async () => {
      // 每個 case 用唯一 email，避免互相干擾
      const email = `schema_v2_test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
      const appRes = await testPool.query(
        `INSERT INTO applications
           (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count)
         VALUES (1, $1, 1, 4, 8, 50, 1) RETURNING id`,
        [email]
      )
      appId = appRes.rows[0].id

      const slotRes = await testPool.query(
        `INSERT INTO schedule_slots (application_id, start_at, end_at)
         VALUES ($1, '2026-04-25 10:00+00', '2026-04-25 12:00+00')
         RETURNING id`,
        [appId]
      )
      slotId = slotRes.rows[0].id
    })

    it('同 GPU、重疊時段 → 第二筆 INSERT 應被 DB 拒絕', async () => {
      await testPool.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, 3, '2026-04-25 10:00+00', '2026-04-25 12:00+00')`,
        [slotId]
      )

      await expect(
        testPool.query(
          `INSERT INTO gpu_allocations
             (schedule_slot_id, gpu_index, start_at, end_at)
           VALUES ($1, 3, '2026-04-25 11:00+00', '2026-04-25 13:00+00')`,
          [slotId]
        )
      ).rejects.toThrow(/gpu_no_overlap|exclusion constraint/i)
    })

    it('同 GPU、不重疊時段 → 兩筆都成功', async () => {
      await testPool.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, 5, '2026-04-25 10:00+00', '2026-04-25 12:00+00')`,
        [slotId]
      )
      // tstzrange 用 [) 半開區間，end=12:00 不算佔用 12:00
      await expect(
        testPool.query(
          `INSERT INTO gpu_allocations
             (schedule_slot_id, gpu_index, start_at, end_at)
           VALUES ($1, 5, '2026-04-25 12:00+00', '2026-04-25 14:00+00')`,
          [slotId]
        )
      ).resolves.toBeTruthy()
    })

    it('不同 GPU、重疊時段 → 都成功', async () => {
      await testPool.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, 1, '2026-04-25 10:00+00', '2026-04-25 12:00+00')`,
        [slotId]
      )
      await expect(
        testPool.query(
          `INSERT INTO gpu_allocations
             (schedule_slot_id, gpu_index, start_at, end_at)
           VALUES ($1, 2, '2026-04-25 10:00+00', '2026-04-25 12:00+00')`,
          [slotId]
        )
      ).resolves.toBeTruthy()
    })

    it('CASCADE：刪 application → schedule_slots & gpu_allocations 連帶刪', async () => {
      await testPool.query(
        `INSERT INTO gpu_allocations
           (schedule_slot_id, gpu_index, start_at, end_at)
         VALUES ($1, 7, '2026-04-25 10:00+00', '2026-04-25 12:00+00')`,
        [slotId]
      )
      await testPool.query(`DELETE FROM applications WHERE id=$1`, [appId])

      const slots = await testPool.query(
        `SELECT id FROM schedule_slots WHERE application_id=$1`,
        [appId]
      )
      const allocs = await testPool.query(
        `SELECT id FROM gpu_allocations WHERE schedule_slot_id=$1`,
        [slotId]
      )
      expect(slots.rows.length).toBe(0)
      expect(allocs.rows.length).toBe(0)
    })
  })

  describe('5. applications 新欄位 + 約束', () => {
    it('gpu_count CHECK (BETWEEN 0 AND 8)：超過 8 應失敗', async () => {
      await expect(
        testPool.query(
          `INSERT INTO applications
             (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count)
           VALUES (1, 'schema_v2_test_overflow@example.com', 1, 4, 8, 50, 9)`
        )
      ).rejects.toThrow(/check constraint/i)
    })

    it('預設 status = pending', async () => {
      const email = `schema_v2_test_default_${Date.now()}@example.com`
      const { rows } = await testPool.query(
        `INSERT INTO applications
           (user_id, user_email, template_id, cpu, ram_gb, disk_gb, gpu_count)
         VALUES (1, $1, 1, 4, 8, 50, 1)
         RETURNING status`,
        [email]
      )
      expect(rows[0].status).toBe('pending')
    })
  })
})
