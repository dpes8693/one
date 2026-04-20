-- ============================================================
-- GPU 算力平台 SPEC V2 Schema Migration
-- ============================================================
-- 依據：school/docs/SPEC_V2.md
-- 變動策略：
--   * Q5 = A，舊 applications / application_reviews 砍掉重建
--   * 新增：pending_registrations, verification_throttle,
--           schedule_slots, gpu_allocations, system_settings
--   * gpu_allocations 採用 EXCLUDE constraint 由 DB 保證 GPU 同時段不重疊
-- 套用方式：
--   psql -h localhost -p 5433 -U gpu_platform -d gpu_platform \
--        -f db/init/03_spec_v2.sql
-- ============================================================

-- 1. 預備：載入 btree_gist 擴充（gpu_allocations EXCLUDE constraint 需要）
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 2. 砍舊表（applications + application_reviews，CASCADE）
-- ============================================================
DROP TABLE IF EXISTS application_reviews CASCADE;
DROP TABLE IF EXISTS applications CASCADE;

-- ============================================================
-- 3. 重建 applications（新 schema）
-- ============================================================
CREATE TABLE applications (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL,                -- pending_registrations.id 或 ONE user id
  user_email    TEXT NOT NULL,
  template_id   INT NOT NULL,                -- OpenNebula Template ID
  cpu           INT NOT NULL,                -- 學生輸入（覆寫 Template 預設）
  ram_gb        INT NOT NULL,
  disk_gb       INT NOT NULL,
  gpu_count     INT NOT NULL CHECK (gpu_count BETWEEN 0 AND 8),
  status        TEXT DEFAULT 'pending',      -- pending / approved / rejected / cancelled / completed
  reject_reason TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_apps_user   ON applications(user_id);

-- ============================================================
-- 4. schedule_slots（一筆 application 多個時段卡，跨日 = 多列）
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_slots (
  id             SERIAL PRIMARY KEY,
  application_id INT REFERENCES applications(id) ON DELETE CASCADE,
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  vm_id          TEXT,                        -- 開機後寫入 OpenNebula VM ID
  status         TEXT DEFAULT 'pending'       -- pending / running / completed / failed
);

CREATE INDEX IF NOT EXISTS idx_slots_start  ON schedule_slots(start_at);
CREATE INDEX IF NOT EXISTS idx_slots_status ON schedule_slots(status);

-- ============================================================
-- 5. gpu_allocations（GPU 庫存核心，DB-level EXCLUDE 防重疊）
-- ============================================================
CREATE TABLE IF NOT EXISTS gpu_allocations (
  id               SERIAL PRIMARY KEY,
  schedule_slot_id INT REFERENCES schedule_slots(id) ON DELETE CASCADE,
  gpu_index        INT NOT NULL CHECK (gpu_index BETWEEN 1 AND 8),
  start_at         TIMESTAMPTZ NOT NULL,    -- 冗餘但方便查詢
  end_at           TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 區間排他：同一張 GPU 在重疊時段絕不能有兩列
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gpu_no_overlap'
  ) THEN
    ALTER TABLE gpu_allocations
      ADD CONSTRAINT gpu_no_overlap
      EXCLUDE USING gist (
        gpu_index WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      );
  END IF;
END$$;

-- ============================================================
-- 6. pending_registrations（學生註冊 + 信箱驗證 + admin 審核）
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_registrations (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  name              TEXT NOT NULL,
  student_id        TEXT NOT NULL,
  memo              TEXT,
  verification_code CHAR(6),
  code_expires_at   TIMESTAMPTZ,
  verified          BOOLEAN DEFAULT FALSE,
  status            TEXT DEFAULT 'pending_email',  -- pending_email / pending_review / approved / rejected
  reject_reason     TEXT,
  one_user_id       TEXT,                          -- 通過後 OpenNebula 建出的 user id
  created_at        TIMESTAMPTZ DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_email  ON pending_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_registrations(status);

-- ============================================================
-- 7. verification_throttle（驗證碼節流：60s 一次、每小時 5 次）
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_throttle (
  email             TEXT PRIMARY KEY,
  last_sent_at      TIMESTAMPTZ,
  hourly_count      INT DEFAULT 0,
  hour_window_start TIMESTAMPTZ
);

-- ============================================================
-- 8. system_settings（後台可調參數）+ 預設值
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('max_active_reservations',    '3'),     -- 每位學生未開始 + 進行中預約上限
  ('max_hours_per_reservation',  '24'),    -- 每筆預約最長時數
  ('max_advance_booking_days',   '30'),    -- 可預約多遠的未來（天）
  ('max_total_cpu',              '32'),    -- 系統總 CPU 核數
  ('max_total_ram_gb',           '64'),    -- 系統總 RAM (GB)
  ('max_total_disk_gb',          '2000'),  -- 系統總磁碟 (GB)
  ('max_total_gpu',              '8'),     -- 系統總 GPU 卡數
  ('verification_code_ttl_min',  '5'),     -- 驗證碼有效分鐘
  ('verification_max_per_hour',  '5'),     -- 驗證碼每小時上限
  ('verification_max_attempts',  '3'),     -- 驗證碼錯幾次就鎖
  ('verification_lockout_minutes','30'),   -- 鎖多久（分鐘）
  ('base_template_id',           '1')      -- 學校 base VM Template ID
ON CONFLICT (key) DO NOTHING;
