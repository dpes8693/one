-- ============================================================
-- Sprint 5 Task #9 — verification_throttle 擴充
-- ============================================================
-- 為註冊驗證碼機制補上：
--   * failed_attempts — 累計輸錯次數
--   * locked_until    — 鎖定到何時（達 verification_max_attempts 觸發）
-- 採 IF NOT EXISTS，重複執行安全
-- 套用：
--   docker exec gpu-platform-db psql -U gpu_platform -d gpu_platform \
--     -f /docker-entrypoint-initdb.d/04_register_throttle.sql
-- ============================================================

ALTER TABLE verification_throttle
  ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;

ALTER TABLE verification_throttle
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
