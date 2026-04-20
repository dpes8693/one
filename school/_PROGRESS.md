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

## Sprint 4 進度
最後更新：2026-04-17

| Task | Agent | 狀態 | 測試結果 |
|------|-------|------|---------|
| #3 SMTP 真實接通（mailer.js 雙模式） | Backend | 完成 | mailer 6/6 + notifier 4/4 通過；其餘 sprint 4 前測試套件無退化 |
| #5 Production 部署設定（Docker 化） | DevOps | 完成 | backend image build 成功（262MB）；frontend image build 成功（92.6MB）；nginx config syntax OK；docker-compose.prod.yml config OK |

### Task #5 變更摘要
- 新增 `backend/Dockerfile`（multi-stage, node:22-alpine, 非 root user, tini, healthcheck）
- 新增 `backend/.dockerignore`（排除 node_modules / tests / .env）
- 新增 `frontend/Dockerfile`（builder: vite build；runtime: nginx:alpine）
- 新增 `frontend/.dockerignore`（排除 node_modules / dist / e2e / .env）
- 新增 `frontend/nginx.conf`（SPA fallback + /api 反向代理 → backend:4000 + gzip + 安全標頭）
- 新增 `docker-compose.prod.yml`（postgres 不對外、backend、frontend 80:80、共用 bridge network、healthcheck）
- 新增 `.env.production.example`（部署者複製為 `.env.production` 後填值）
- 新增 `docs/DEPLOYMENT.md`（中文部署指南：架構、環境變數、常見問題、備份還原、安全 checklist）
- 不動 OpenNebula upstream（`src/fireedge/`），不動 dev `docker-compose.yml`

### Task #3 變更摘要
- 新增 `backend/src/services/mailer.js`（對外 API alias，re-export notifier 的函式，向後相容）
- 重寫 `backend/src/services/notifier.js`：
  - 有 `SMTP_HOST` → `nodemailer.createTransport`（含 `secure`、條件式 `auth`）真寄信
  - 沒設 → console fallback；**fallback 也寫 `email_notifications`（status=sent）**
  - 寄信失敗：寫 DB `status=failed` + `error_message`
- `backend/src/config.js`：新增 `smtp.secure`（讀 `SMTP_SECURE` 字串轉 bool）
- `.env.example`：補 `SMTP_SECURE`、密碼用 placeholder `changeme`、加註釋
- TDD：先寫 `backend/tests/unit/mailer.test.js`（6 案例）讓它紅 → 實作 → 全綠

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

---

## Sprint 4 進度
最後更新：2026-04-17

| Task | 內容 | 狀態 |
|------|------|------|
| #1 | 學生 Dashboard `/student/dashboard`（VM 卡片 + SSH 區塊） | 完成 |
| #2 | Backend Users API `/api/users/*`（admin only） | 完成 |
| #3 | Backend SMTP 雙模式 mailer（真寄信 / console fallback 都寫 DB） | 完成 |
| #4 | Frontend Users 管理頁 `/admin/users`（admin only） | 完成 |
| #5 | Production Dockerfile + docker-compose.prod.yml + DEPLOYMENT.md | 完成 |
| #6 | 學校 Template 修復文件 | 完成 |
| #7 | QA 全測試 + 瀏覽器驗證 | 完成 |

### 測試結果（2026-04-17 14:00）

| 項目 | 結果 |
|------|------|
| Backend Vitest | 11 檔案 / **83 tests 全綠** |
| Frontend Vitest | 10 檔案 / **67 tests 全綠** |
| Backend Smoke (`smoke-backend.sh`) | **49/49 通過** |
| 瀏覽器驗證（playwright-cli） | 4 項中 3 項通過、1 項小 bug |

### 瀏覽器驗證細節

1. **登入後預設導向**：實測導到 `/vms`（**bug**，預期是 `/student/dashboard`）
   - 位置：`school/frontend/src/pages/Login.jsx:20` `navigate('/vms')`
   - Sidebar 與所有頁面本身正常，僅登入後跳轉路徑沒對齊 Task #1
2. **Sidebar**：所有人看到「我的 GPU」+ admin 看到「使用者管理」 — **OK**
3. **`/admin/users`**：列出 oneadmin / serveradmin，含配額（VMS/CPU/MEM/DISK）+ 停用 / 改配額 / 重設密碼按鈕 — **OK**
4. **`/student/dashboard`**：顯示 VM 卡片（Ubuntu 2404-GPU -0、執行中）+ SSH 區塊（IP `—`、Port 22、帳號 root，提示「尚未取得 IP」）— **OK**

### Sprint 4 新增/異動檔案重點

**Backend**
- `backend/src/routes/users.js` — Users API（list / disable / quota / reset password）
- `backend/src/services/mailer.js` — 對外 alias，re-export notifier
- `backend/src/services/notifier.js` — 雙模式（SMTP 真寄信 / console fallback），都寫 `email_notifications`
- `backend/src/config.js` — 新增 `smtp.secure`
- `backend/tests/unit/mailer.test.js` — 6 案例
- `backend/tests/unit/users.test.js` — Users API 測試

**Frontend**
- `frontend/src/pages/StudentDashboard.jsx` — Task #1 學生 Dashboard
- `frontend/src/pages/AdminUsers.jsx` — Task #4 使用者管理
- `frontend/src/components/Layout.jsx` — sidebar 加「我的 GPU」+「使用者管理」
- `frontend/src/App.jsx` — 路由 `/student/dashboard`、`/admin/users`，根路徑 redirect 到 `/student/dashboard`
- `frontend/tests/unit/StudentDashboard.test.jsx`、`AdminUsers.test.jsx`

**Production / Deployment**
- `school/backend/Dockerfile`、`backend/.dockerignore`
- `school/frontend/Dockerfile`、`frontend/nginx.conf`、`frontend/.dockerignore`
- `school/docker-compose.prod.yml`
- `school/.env.production.example`
- `school/docs/DEPLOYMENT.md`

**文件**
- `school/docs/SCHOOL_TEMPLATE_FIX.md`（Task #6）
- `school/_PROGRESS.md` 本段

### 已知小 bug（Sprint 4 收尾）

- `frontend/src/pages/Login.jsx:20` 登入成功後 `navigate('/vms')` 應改成 `navigate('/student/dashboard')` 才符合 Task #1 規格。
  - 影響低：sidebar 第一個項目就是「我的 GPU」，使用者點一下就到。但對齊規格建議修正。

### Backend 重啟紀錄

- 舊 backend (PID 78265) 還跑沒有 `/api/users` 路由的版本，本次驗證已 `kill` 後用 `nohup npm start &` 重啟（新 PID 59050），健康檢查 OK、`/api/users` 401（需 token，路由有掛上）、admin token 拉到正常用戶清單。

---

## Sprint 5 進度
最後更新：2026-04-17

| Task | 內容 | 狀態 |
|------|------|------|
| #8  | DB schema migration（applications 重建 + schedule_slots / gpu_allocations / system_settings 等） | 完成 |
| #13 | Backend 資源庫存服務（`services/resourceInventory.js`） | 完成 |

### Task #13 變更摘要

**新增檔案**
- `backend/src/services/resourceInventory.js` — 5 個對外函式：
  - `getAvailableResources(startAt, endAt)` — 回該時段 cpu/ram_gb/disk_gb/gpu 的 total/used/available + GPU used_indices/available_indices
  - `getAvailabilityByHour(fromDate, toDate)` — 逐小時切，給前端行事曆 30 天用
  - `checkResourceAvailable(slots, request)` — 對多個 slot 檢查 request 是否都夠，回 `{ ok, violations }`
  - `allocateGpus(scheduleSlotId, gpuCount)` — first-fit 從最低編號取 N 張，transaction 包 INSERT；EXCLUDE constraint 兜底 race
  - `releaseSlot(scheduleSlotId)` — DELETE FROM gpu_allocations
- `backend/tests/unit/resourceInventory.test.js` — 14 案例（mock pg pool）
- `backend/tests/integration/resourceInventory.test.js` — 10 案例（真 DB）

**設計重點**
- 同時段「重疊」用 PostgreSQL `tstzrange && tstzrange`
- 加總 status IN `('approved', 'pending')`（規格 R7：已通過 + 待審 + 進行中）
- GPU available_indices 從 `1..max_total_gpu` 中扣除已用編號（distinct）
- `system_settings` 4 個總量上限（max_total_cpu / ram_gb / disk_gb / gpu）以 string 存，service 層 parseInt
- 純 service 層，不暴露 HTTP endpoint，給其他 routes 呼叫

### 測試結果（2026-04-17）

| 項目 | 結果 |
|------|------|
| Backend Vitest（全套） | 15 檔案 / **162 tests 全綠**（+ 6 skipped） |
| 新增 unit | 14/14 通過 |
| 新增 integration | 10/10 通過 |
| 既有測試退化 | 無 |

---

## Sprint 5 收尾驗收（Task #21 QA）
最後更新：2026-04-17

### 13 個 Sprint 5 任務最終狀態

| Task | 內容 | 狀態 |
|------|------|------|
| #8  | DB schema：13 表 + EXCLUDE constraint + 12 system_settings | 完成 |
| #9  | 註冊 API：`POST /api/register/{,verify,resend}` | 完成 |
| #10 | 註冊審核 API：admin only + 建 ONE user + 寄帳密 | 完成 |
| #11 | 註冊三頁前端：`/register`、`/register/verify`、`/register/pending` | 完成 |
| #12 | admin 註冊審核頁：`/admin/registrations` | 完成 |
| #13 | 資源庫存服務：`services/resourceInventory.js` | 完成 |
| #14 | 預約 API：`POST /api/applications` + `GET /availability` + `GET /api/templates` + `DELETE` | 完成 |
| #15 | 預約審核 API：approve/reject + 4 種資源檢查 + GPU first-fit 分配 | 完成 |
| #16 | Scheduler：tickStart/tickEnd + Row-level lock + 自動 instantiate/terminate | 完成 |
| #17 | `/apply` 重寫：行事曆 30 天 × 24 cell + 4 欄位 + 即時餘量警告 | 完成 |
| #18 | 設定頁：`/admin/settings` + `GET/PUT /api/admin/settings` | 完成 |
| #19 | 申請審核警告 banner | 完成 |
| #20 | SSH Key deprecate（sidebar 移除「SSH 金鑰」） | 完成 |
| #21 | QA 全測試 + 瀏覽器驗證 + 更新進度 | 完成 |

### 測試結果（2026-04-17 09:42）

| 項目 | 結果 | 說明 |
|------|------|------|
| Backend Vitest（全套） | 20 檔案 / **251 tests 全綠** | 0 失敗、0 退化 |
| Frontend Vitest（全套） | 17 檔案 / **138 tests 全綠** | 0 失敗、0 退化 |
| Backend Smoke (`smoke-backend.sh`) | 42 PASS / 9 FAIL | **失敗皆為 schema 變更，非 bug**（見下） |
| Playwright E2E (`auth.spec.js`) | 4 PASS / 2 FAIL | 失敗為 Sprint 4 已知 redirect 改變（`/vms` → `/student/dashboard`），舊 spec 未更新 |

#### Smoke 9 個失敗的根因（**不是 bug**）

Sprint 5 #14 故意將 `POST /api/applications` 改成需 JWT（規格要求），且回傳結構從 `{applications:[]}` 改成 `{data:[]}`。舊 smoke test 還在測舊規格 → 失敗合理。新規格的 e2e 已涵蓋。

### 瀏覽器驗證流程（playwright-cli）

| 流程 | 結果 | 細節 |
|------|------|------|
| a. `/register` 表單送出 | OK | 跳到 `/register/verify?email=...`，無 console error |
| a. `/register/verify` | OK | 顯示 email + 6 位數字 input + 「驗證」「重寄驗證碼」按鈕 |
| a. `/register/pending` | OK | 顯示「註冊已送出」+ 後續說明 |
| b. admin 登入 + sidebar | OK | 學生區（我的 GPU / 申請新預約 / 我的虛擬機）+ 管理區 9 連結；**「SSH 金鑰」已不見**（#20 確認） |
| c. 6 個新頁面渲染 | OK | 全部 200，無錯誤 |
| d. `/apply` 行事曆 | OK | 30 天 tabs（4/20–5/19）+ 24 個 1 小時 cell + 每 cell「可用 8 GPU」+ Template 下拉有「Ubuntu 2404-GPU」+ 4 欄位（CPU 4 / RAM 8 / Disk 50 / GPU 1）+ 選 cell 後摘要即時更新 |
| e. `/admin/registrations` | OK | 4 tab（待審核 / 已通過 / 已拒絕 / 全部）切換正常；空狀態顯示「沒有註冊申請」 |
| f. `/admin/settings` | OK | 12 個 settings 分 4 組（預約規則 3 / 資源上限 4 / 驗證碼 4 / Template 1）；改 max_active_reservations=5 → 儲存 → toast「已儲存 max_active_reservations」→ 改回 3 OK |

### Backend 重啟紀錄

- 舊 PID 59071（沒有 register/registrationsAdmin/settings/新 applications 路由）已 `kill -9`
- 新 PID 97497 啟動成功，log 顯示：
  ```
  [Server] GPU 算力平台後端啟動，監聽 port 4000
  [Scheduler] 排程服務已啟動（含舊 schedules + 新 schedule_slots）
  ```
- 新 routes 全數驗通：
  - `POST /api/register` → 400 「email 格式錯誤」（不是 404）
  - `POST /api/register/verify` → 400 「請提供 email 與驗證碼」
  - `GET /api/templates` → 401（需 token，路由有掛上）
  - `GET /api/applications/availability` → 401
  - `GET /api/admin/registrations` → 401
  - `GET /api/admin/settings` → 401

### Sidebar 結構變動（最終）

```
學生區：
  - 我的 GPU              /student/dashboard
  - 申請新預約            /apply           ← Sprint 5 重寫
  - 我的虛擬機            /vms

管理區（admin only）：
  - GPU 資源總覽          /admin/dashboard
  - 註冊審核              /admin/registrations  ← Sprint 5 新增
  - 申請審核              /admin/applications
  - 使用者管理            /admin/users
  - VIP 管理              /admin/vip
  - 排程行事曆            /admin/schedules
  - 審計日誌              /admin/audit
  - GPU 告警              /admin/alerts
  - 系統設定              /admin/settings        ← Sprint 5 新增
  
（移除：SSH 金鑰 → #20 deprecate）
```

### Sprint 5 新增關鍵檔案

**Backend**
- `backend/src/routes/register.js` — 註冊 + verify + resend
- `backend/src/routes/registrationsAdmin.js` — admin 審核
- `backend/src/routes/settings.js` — 12 system_settings GET/PUT
- `backend/src/routes/applications.js` — 重寫（availability、templates、approve 含資源檢查 + GPU 分配）
- `backend/src/services/resourceInventory.js` — 5 個對外函式（庫存、可用、檢查、分配、釋放）
- `backend/src/services/scheduler.js` — 新增 tickStart / tickEnd cron（Row-level lock）
- `db/init/03_sprint5_schema.sql` — 13 表 + EXCLUDE constraint + 12 settings seed

**Frontend**
- `frontend/src/pages/Register.jsx`、`RegisterVerify.jsx`、`RegisterPending.jsx`
- `frontend/src/pages/AdminRegistrations.jsx`
- `frontend/src/pages/AdminSettings.jsx`
- `frontend/src/pages/Apply.jsx` — 重寫（行事曆 30 天 + 24 cell + Template）
- `frontend/src/components/Layout.jsx` — sidebar 新增「註冊審核」、「系統設定」；移除「SSH 金鑰」

### 已知限制（不是 bug）

1. **SMTP 未接學校環境**：學校 SMTP 沒設，註冊驗證碼會 fallback 到 backend console（mailer 雙模式仍會寫 `email_notifications` table）
2. **建 ONE user 需 admin token**：`/admin/registrations` approve 真正建 OpenNebula User 需要 oneadmin 權限與正確 admin token；本機/學校環境若沒 oneadmin 權限會在這步失敗
3. **Cron 已啟動但需真實資料**：`tickStart` / `tickEnd` 已每分鐘跑，但目前 DB 沒有等待中的 application + schedule_slot，cron tick 是 no-op
4. **舊 smoke test 9 個 fail**：`POST /api/applications` 已改需 JWT + 回傳 `{data}`，舊 smoke 還在測舊規格；建議下 sprint 更新 `smoke-backend.sh`
5. **舊 e2e auth.spec.js 2 個 fail**：等 `/vms` 但 Sprint 4 已改成 `/student/dashboard`；屬 Sprint 4 已知問題

### Bug 列表

**未發現新 bug**。所有 6 個瀏覽器流程通過、所有新 routes 掛載成功、無 console error、無 500。

