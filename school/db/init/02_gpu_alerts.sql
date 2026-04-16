-- ============================================================
-- GPU 告警表
-- ============================================================

CREATE TABLE IF NOT EXISTS gpu_alerts (
  id           SERIAL PRIMARY KEY,
  vm_id        INTEGER NOT NULL,
  vm_name      TEXT,
  alert_type   TEXT NOT NULL,    -- 'high_utilization' / 'low_memory'
  metric_value NUMERIC,
  triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_alerts_vm ON gpu_alerts(vm_id, triggered_at);
