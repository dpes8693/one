-- ============================================================
-- GPU 算力平台 PostgreSQL Schema
-- ============================================================

-- ============================================================
-- 申請審核
-- ============================================================

CREATE TABLE applications (
    id            SERIAL PRIMARY KEY,
    student_name  VARCHAR(100) NOT NULL,
    student_id    VARCHAR(50) NOT NULL,        -- 學號
    email         VARCHAR(255) NOT NULL,
    purpose       TEXT,                         -- 申請用途
    gpu_spec      VARCHAR(100),                 -- 需要的 GPU 規格
    status        VARCHAR(20) DEFAULT 'pending', -- pending / approved / rejected
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE application_reviews (
    id              SERIAL PRIMARY KEY,
    application_id  INTEGER REFERENCES applications(id),
    reviewer_name   VARCHAR(100),               -- 審核者
    decision        VARCHAR(20) NOT NULL,        -- approved / rejected
    reason          TEXT,                         -- 審核原因
    one_user_id     INTEGER,                     -- 審核通過後建立的 OpenNebula User ID
    one_vm_id       INTEGER,                     -- 審核通過後建立的 VM ID
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 行事曆排程
-- ============================================================

CREATE TABLE schedules (
    id              SERIAL PRIMARY KEY,
    one_user_id     INTEGER NOT NULL,            -- OpenNebula User ID
    one_vm_id       INTEGER NOT NULL,            -- OpenNebula VM ID
    gpu_host_id     INTEGER,                     -- 指定的 GPU Host ID
    start_time      TIMESTAMPTZ NOT NULL,        -- 時段開始
    end_time        TIMESTAMPTZ NOT NULL,        -- 時段結束
    repeat_type     VARCHAR(20),                 -- once / daily / weekly
    repeat_days     VARCHAR(50),                 -- 週幾（例如 "1,3,5" = 週一三五）
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIP 插隊
-- ============================================================

CREATE TABLE vip_preemptions (
    id                  SERIAL PRIMARY KEY,
    vip_user_id         INTEGER NOT NULL,        -- VIP 的 OpenNebula User ID
    vip_vm_id           INTEGER NOT NULL,         -- VIP 的 VM ID
    preempted_vm_id     INTEGER NOT NULL,         -- 被暫停的 VM ID
    preempted_user_id   INTEGER NOT NULL,         -- 被暫停的 User ID
    gpu_host_id         INTEGER,                  -- GPU Host ID
    action              VARCHAR(20) NOT NULL,      -- preempt / restore
    status              VARCHAR(20) DEFAULT 'active', -- active / restored
    preempted_at        TIMESTAMPTZ DEFAULT NOW(),
    restored_at         TIMESTAMPTZ
);

-- ============================================================
-- 操作審計日誌
-- ============================================================

CREATE TABLE audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER,                     -- 操作者 OpenNebula User ID
    user_name       VARCHAR(100),
    action          VARCHAR(100) NOT NULL,        -- 例如 "vm.action.poweroff"
    target_type     VARCHAR(50),                  -- vm / user / template / host
    target_id       INTEGER,
    request_body    JSONB,                        -- API 請求內容
    response_status INTEGER,                      -- HTTP 回應碼
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 登入活動
-- ============================================================

CREATE TABLE login_history (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    user_name   VARCHAR(100),
    ip_address  VARCHAR(45),
    user_agent  TEXT,                             -- 瀏覽器資訊
    action      VARCHAR(20) NOT NULL,             -- login / logout / login_failed
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Email 通知紀錄
-- ============================================================

CREATE TABLE email_notifications (
    id              SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    subject         VARCHAR(500),
    template_type   VARCHAR(50),                  -- approval / rejection / vip_alert / schedule_reminder
    related_id      INTEGER,                      -- 關聯的申請單或排程 ID
    status          VARCHAR(20) DEFAULT 'sent',   -- sent / failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GPU 監控快照（選用，從 DCGM 定期寫入）
-- ============================================================

CREATE TABLE gpu_metrics (
    id              SERIAL PRIMARY KEY,
    host_id         INTEGER NOT NULL,             -- OpenNebula Host ID
    gpu_index       INTEGER DEFAULT 0,
    utilization     INTEGER,                      -- GPU 使用率 %
    temperature     INTEGER,                      -- 溫度 °C
    memory_used     INTEGER,                      -- 已用顯存 MB
    memory_total    INTEGER,                      -- 總顯存 MB
    power_usage     INTEGER,                      -- 功耗 W
    recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_schedules_time ON schedules(start_time, end_time);
CREATE INDEX idx_schedules_user ON schedules(one_user_id);
CREATE INDEX idx_audit_logs_time ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_login_history_user ON login_history(user_id);
CREATE INDEX idx_gpu_metrics_host ON gpu_metrics(host_id, recorded_at);
