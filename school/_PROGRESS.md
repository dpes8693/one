# MVP 開發進度

最後更新：2026-04-16

---

## 開發規範（重要）

### TDD（測試驅動開發）— 從第二階段開始強制執行

**所有新功能開發必須遵循：**

1. **先寫測試，再寫實作**
2. Backend 用 Vitest 或 Jest，每個 endpoint 至少 1 個測試
3. Frontend 用 Vitest + React Testing Library，每個頁面至少 1 個渲染測試
4. 端對端用 Playwright（已有 `scripts/test-e2e.js` 範本）
5. **PR/commit 必須包含對應的測試**

### 測試目錄結構（即將建立）

```
backend/
├── src/
└── tests/
    ├── unit/              單元測試（services、utils）
    ├── integration/       整合測試（API endpoint + DB）
    └── e2e/               E2E 測試（呼叫 FireEdge）

frontend/
├── src/
└── tests/
    ├── unit/              元件渲染測試
    └── e2e/               Playwright E2E（使用者流程）
```

---

## MVP 完成狀態（第一階段）

| 模組 | 狀態 | 產出 |
|------|------|------|
| PM | 完成 | db/init/01_schema.sql (8 張表)、_PROGRESS.md、3 份 README |
| Backend | 完成 | Express + JWT + PostgreSQL + 代理（含修 proxy bug） |
| Frontend | 完成 | React + Vite + 5 頁面（含修 VMList 解析 bug） |
| QA | 完成 | smoke-backend.sh (21 通過)、test-e2e.js (7 通過)、TEST_REPORT.md |

### MVP 已驗證可運作
- 學生申請：DB 已累積 9 筆申請紀錄
- 管理員登入：oneadmin / (見 company-docs/env/test-pc.md，已 gitignore)
- VM 列表：能讀到學校 RTX 4070 Ti VM
- 拒絕申請：API + DB 正常

---

## 第二階段：核心功能（下一階段）

按 MASTER_SPEC.md 第 10 章排序：

### Sprint 1（必做，預計 1-2 週）

| 任務 | 規模 | 說明 |
|------|------|------|
| **F1. VIP 緊急插隊（一鍵流程）** | 中 | 後端 stop→resume 自動化 + 前端 VIP 按鈕 |
| **F2. GPU 資源總覽看板** | 中 | 聚合 host/info/:id 的 PCI_DEVICES，視覺化哪張 GPU 被誰用 |
| **F3. Email 通知接通** | 小 | nodemailer 已安裝，補上 SMTP 設定 + 模板 |
| **F4. Approve 流程完整實作** | 中 | 目前 approve 會出錯，需測試自動建 OpenNebula User + Quota |

### Sprint 2（重點，預計 2-3 週）

| 任務 | 規模 | 說明 |
|------|------|------|
| **F5. 行事曆排程 UI** | 大 | FullCalendar 元件、後端寫排程到 DB、cron 觸發 vm.action |
| **F6. 操作審計日誌 UI** | 中 | DB audit_logs 已寫入，需做查詢/篩選頁面 |
| **F7. 學生 SSH Key 管理** | 中 | 前端表單 + 後端寫 OpenNebula USER_TEMPLATE |

### Sprint 3（強化）

| 任務 | 規模 | 說明 |
|------|------|------|
| **F8. GPU 使用率告警** | 小 | 直接讀 vm/info MONITORING.GPU_UTILIZATION，超閾值記錄 |
| **F9. 使用時數限制** | 中 | 配合排程動作，N 小時自動 poweroff |
| **F10. 自訂 Dashboard** | 中 | 前端拖放元件（可選） |

---

## 第二階段強制要求（與第一階段不同）

| 項目 | 第一階段 (MVP) | 第二階段 |
|------|---------------|----------|
| 測試 | QA 最後補 | **TDD：先測試後實作** |
| 程式碼 review | 跳過 | 每個任務完成後我幫忙看 |
| Bug 追蹤 | 即時修 | 寫到 TASK TRACKER |
| Commit | 不嚴格 | 每個任務一個 commit |
| Schema 變更 | 全部初始化 | 用 migration（如 node-pg-migrate）|

---

## 第二階段 Sprint 1 進度

| Task | Agent | 狀態 | 測試結果 |
|------|-------|------|---------|
| F4 修 approve | Backend | 進行中 | - |
| F1 VIP API | Backend | 進行中 | - |
| F3 Email | Backend | 進行中 | - |
| F1 VIP UI | Frontend | 進行中 | - |
| F2 GPU 看板 | Frontend | 進行中 | - |
| QA 驗收 | QA | 等待 | - |

### 測試框架設置狀態

| 項目 | 狀態 | 說明 |
|------|------|------|
| Frontend Vitest | 完成 | 1/1 通過 (Login.test.jsx) |
| Backend Vitest | 進行中 | Backend Agent 處理中 |

---

## 第二階段 Sprint 2+3 進度

### Bug 修正
| Bug | Agent | 狀態 | 測試結果 |
|-----|-------|------|---------|
| A. GET /api/vip/active 404 | Backend | 完成 | 通過 |
| B. login 沒回傳 role | Backend | 完成 | 通過 |

### Sprint 2 (核心功能)
| Task | Agent | 狀態 | 測試結果 |
|------|-------|------|---------|
| F5 行事曆排程 Backend | Backend | 完成 | 通過 |
| F5 行事曆排程 Frontend | Frontend | 完成 | 通過 |
| F6 審計日誌 Backend | Backend | 完成 | 通過 |
| F6 審計日誌 Frontend | Frontend | 完成 | 通過 |
| F7 SSH Key Backend | Backend | 完成 | 通過 |
| F7 SSH Key Frontend | Frontend | 完成 | 通過 |

### Sprint 3 (強化)
| Task | Agent | 狀態 | 測試結果 |
|------|-------|------|---------|
| F8 GPU 告警 Backend | Backend | 完成 | 通過 |
| F8 GPU 告警 Frontend | Frontend | 完成 | 通過 |
| F9 使用時數限制 | Backend | 完成 | 通過 |
| F10 Dashboard 增強 | Frontend | 完成 | 通過 |
| Sidebar 重構 | Frontend | 完成 | 通過 |

### 整合 Review 結果（2026-04-16）
| 項目 | 結果 |
|------|------|
| Backend 測試 | 9 檔案 / 58 測試 全通過 |
| Frontend 測試 | 8 檔案 / 45 測試 全通過 |
| db/init/02_gpu_alerts.sql | 已存在 |
| /admin/schedules | HTTP 200 |
| /admin/audit | HTTP 200 |
| /admin/alerts | HTTP 200 |
| /settings/ssh-key | HTTP 200 |
| 服務清理 | 已停止（QA 環境乾淨）|

---

## E2E Coverage Sprint
最後更新：2026-04-16

| Task | Agent | 狀態 |
|------|-------|------|
| Playwright 全流程測試 | e2e-engineer | 完成 |

### 涵蓋的測試（實際完成 25/25）
- A. 認證流程（4 tests）
- B. 申請流程（5 tests）
- C. VM 與 Dashboard（4 tests）
- D. VIP 管理（4 tests）
- E. 各管理頁面渲染（4 tests）
- F. Sidebar 結構（4 tests）

### 整合 Review 結果（E2E Sprint，2026-04-16）
| 項目 | 結果 |
|------|------|
| Backend unit (Vitest) | 9 檔案 / 58 測試 全通過 |
| Frontend unit (Vitest) | 8 檔案 / 45 測試 全通過 |
| Frontend E2E (Playwright) | 25/25 通過（1 flaky with retry） |
| vite.config.js | 修正 include/exclude，排除 e2e 目錄 |
| 測試 mock 格式 | 修正 Alerts/Audit/Schedules/AdminVip mock 資料格式 |
| test-all.sh | 已建立（scripts/test-all.sh） |
| README.md | 已加入「執行測試」段落 |

---

## 給開發 Agent 的規則（下次啟動 team 時的 prompt 必備）

1. **TDD**: 先寫測試，跑紅色，再寫實作讓它變綠色
2. **單一職責**: 每個 endpoint / 元件做一件事
3. **不過度設計**: MVP 階段以「能跑」為主，先別抽象
4. **修 bug 也要寫測試**: 重現 bug 的測試先寫
5. **任務完成回報必須附**：「測試結果 (X/Y 通過)」

---

## API 介面契約（已實作）

### 認證
- POST /api/auth/login → 回傳 JWT { token, user }
- POST /api/auth/logout

### 申請審核
- POST /api/applications - 學生送出申請（無需登入）
- GET  /api/applications - 列出申請（管理員）
- PUT  /api/applications/:id/approve - 審核通過（需測試完整流程）
- PUT  /api/applications/:id/reject - 審核拒絕

### OpenNebula 代理
- ALL /api/one/* - 代理到 FireEdge `/fireedge/api/*`，需登入

---

## 環境變數
見 .env.example
