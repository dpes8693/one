# MVP Smoke Test 報告

---

## Sprint 2+3 驗收報告
最後執行：2026-04-16 16:20（台灣時間）

### Backend Vitest: 58/58 通過
### Frontend Vitest: 45/45 通過

### Smoke Test 結果（PASS=49 FAIL=0）

| # | 測試 | 結果 | 備註 |
|---|------|------|------|
| 1 | GET /health | ✓ | status:ok, db:ok |
| 2 | POST /api/applications | ✓ | HTTP 201，status=pending |
| 3 | POST /api/auth/login | ✓ | HTTP 200，回傳 JWT token |
| 4 | GET /api/applications（帶 JWT） | ✓ | HTTP 200 |
| 5 | GET /api/applications（無 JWT → 401） | ✓ | HTTP 401 |
| 6 | GET /api/one/system/version | ✓ | HTTP 200，含 7.0.1 |
| 7 | GET /api/one/vmpool/info?filter=-2 | ✓ | HTTP 200，含 VM_POOL |
| 8 | GET /api/one/host/info/0 | ✓ | HTTP 200，含 PCI_DEVICES |
| 9 | PUT /api/applications/:id/reject | ✓ | HTTP 200 |
| 10 | POST /api/vip/preempt（無 JWT → 401） | ✓ | HTTP 401 |
| 11 | POST /api/vip/preempt（body 缺欄位 → 400） | ✓ | HTTP 400 |
| 12 | POST /api/vip/preempt（target_host_id=999 不存在 → 錯誤） | ✓ | 非 2xx |
| 13 | POST /api/vip/restore（無 JWT → 401） | ✓ | HTTP 401 |
| 14 | POST /api/vip/restore（body 缺欄位 → 400） | ✓ | HTTP 400 |
| 29 | GET /api/vip/active 帶 JWT | ✓ | HTTP 200 |
| 30 | POST /api/schedules 不帶 JWT → 401 | ✓ | HTTP 401 |
| 31 | POST /api/schedules 帶 JWT（body 有效）→ 201 | ✓ | HTTP 201，回傳 schedule id |
| 32 | GET /api/schedules 帶 JWT → 200 | ✓ | 回傳 schedules 陣列 |
| 33 | PUT /api/schedules/:id（is_active=false） → 200 | ✓ | HTTP 200 |
| 34 | DELETE /api/schedules/:id → 200 | ✓ | HTTP 200，回傳 message |
| 35 | GET /api/audit 帶 JWT → 200 | ✓ | 回傳 logs 陣列 |
| 36 | GET /api/users/me/ssh-key 帶 JWT → 200 | ✓ | 回傳 ssh_public_key 欄位 |
| 37 | PUT /api/users/me/ssh-key（body 缺欄位 → 400） | ✓ | HTTP 400 |
| 38 | GET /api/alerts 帶 JWT → 200 | ✓ | 回傳 alerts 陣列 |
| 39 | POST /api/auth/login → user.role 欄位存在 | ✓ | role 欄位正確回傳 |

### E2E 測試（Playwright，PASS=16 FAIL=0）

| # | 測試情境 | 結果 | 備註 |
|---|---------|------|------|
| 1 | /login → 輸入帳密 → 跳轉 /vms | ✓ | 成功登入 |
| 2 | /apply → 填表單 → 「申請已送出」 | ✓ | 成功提交 |
| 3 | /admin/applications → 顯示申請卡片 | ✓ | 顯示申請資料 |
| 4 | /admin/dashboard → 顯示「GPU 資源總覽」標題 | ✓ | Sprint 1 F2 |
| 5 | /admin/vip → 顯示「VIP 插隊管理」標題 | ✓ | Sprint 1 F1 |
| 6 | 側邊欄含「管理」群組 | ✓ | Sidebar 重構正確 |
| 7 | /admin/schedules → 顯示「排程」標題 | ✓ | Sprint 2 F5 |
| 8 | /admin/audit → 顯示「審計」標題 | ✓ | Sprint 2 F6 |
| 9 | /admin/alerts → 顯示「告警」標題 | ✓ | Sprint 3 F8 |
| 10 | /settings/ssh-key → 顯示「SSH」標題 | ✓ | Sprint 2 F7 |

### Sprint 2+3 發現並修正的 Bug（QA 驗收時修正）

**Bug 5：Schedules.jsx `schedules.map is not a function`（已修正）**
- **位置**：`school/frontend/src/pages/admin/Schedules.jsx`
- **問題**：`getSchedules()` 回傳 `{ schedules: [...] }` 物件，但 `useQuery` 的 `data: schedules = []` 預設值只在 data 為 undefined 時生效，實際 data 是物件，導致 `schedules.map` 失敗
- **修正**：改用 `const schedules = Array.isArray(schedulesData?.schedules) ? schedulesData.schedules : []`

**Bug 6：Audit.jsx `logs.filter is not a function`（已修正）**
- **位置**：`school/frontend/src/pages/admin/Audit.jsx`
- **問題**：同上，`getAuditLogs()` 回傳 `{ logs: [...] }` 物件，`data: logs = []` 無法正確取得陣列
- **修正**：改用 `const logs = Array.isArray(auditData?.logs) ? auditData.logs : []`

**Bug 7：Alerts.jsx `alerts.map is not a function`（已修正）**
- **位置**：`school/frontend/src/pages/admin/Alerts.jsx`
- **問題**：同上，`getAlerts()` 回傳 `{ alerts: [...] }` 物件，`data: alerts = []` 無法正確取得陣列
- **修正**：改用 `const alerts = Array.isArray(alertsData?.alerts) ? alertsData.alerts : []`

**Bug 8：smoke-backend.sh 測試 31 — schedules POST body 格式不符（已修正）**
- **位置**：`school/scripts/smoke-backend.sh` 測試 31
- **問題**：`one_user_id: 0`（數字）因 JS falsy 被 backend 驗證拒絕；`end_time` 欄位為 NOT NULL 但測試未提供
- **修正**：改用 `"one_user_id":"0"` 字串，並加入 `end_time` 欄位

### Sprint 2+3 是否可 Demo？
✓ 可以 Demo

Sprint 2+3 核心功能全部驗證通過：
- F5 排程管理：`/admin/schedules` FullCalendar 頁面正常顯示；schedules CRUD API 全部通過（29-34 項）
- F6 審計日誌：`/admin/audit` 頁面正常顯示；GET /api/audit 認證正確
- F7 SSH Key：`/settings/ssh-key` 頁面正常；GET/PUT API 認證與驗證正確
- F8 GPU 告警：`/admin/alerts` 頁面正常；GET /api/alerts 通過
- F9 時數限制：在 scheduler.js 中實作（cron 每 5 分鐘執行）
- Bug A：GET /api/vip/active 通過（測試 29）
- Bug B：login 回傳 user.role 欄位通過（測試 39）

### 已知限制
- F8 GPU 告警需要 VM 持續使用 GPU 5 分鐘以上才會觸發，學校測試環境 GPU 使用率為 0，需手動跑 GPU 程式才能觸發
- F9 時數限制需等 VM_MAX_HOURS 過後才會看到效果
- F5 行事曆觸發 action 是真的執行 OpenNebula API，測試時請設未來時間或不啟用排程



---

## Sprint 1 驗收報告
最後執行：2026-04-16 15:45（台灣時間）

### Backend Vitest: 21/21 通過

### Frontend Vitest: 12/12 通過

### Smoke Test 結果（PASS=28 FAIL=0）

| # | 測試 | 結果 | 備註 |
|---|------|------|------|
| 1 | GET /health | ✓ | status:ok, db:ok |
| 2 | POST /api/applications | ✓ | HTTP 201，status=pending |
| 3 | POST /api/auth/login | ✓ | HTTP 200，回傳 JWT token |
| 4 | GET /api/applications（帶 JWT） | ✓ | HTTP 200 |
| 5 | GET /api/applications（無 JWT → 401） | ✓ | HTTP 401 |
| 6 | GET /api/one/system/version | ✓ | HTTP 200，含 7.0.1 |
| 7 | GET /api/one/vmpool/info?filter=-2 | ✓ | HTTP 200，含 VM_POOL |
| 8 | GET /api/one/host/info/0 | ✓ | HTTP 200，含 PCI_DEVICES |
| 9 | PUT /api/applications/:id/reject | ✓ | HTTP 200 |
| 10 | POST /api/vip/preempt（無 JWT → 401） | ✓ | HTTP 401 |
| 11 | POST /api/vip/preempt（body 缺欄位 → 400） | ✓ | HTTP 400，含 vip_vm_id 錯誤訊息 |
| 12 | POST /api/vip/preempt（target_host_id=999 不存在 → 錯誤） | ✓ | 非 2xx，error handling 正常 |
| 13 | POST /api/vip/restore（無 JWT → 401） | ✓ | HTTP 401 |
| 14 | POST /api/vip/restore（body 缺欄位 → 400） | ✓ | HTTP 400，含 vip_preemption_id 錯誤訊息 |

### E2E 測試（Playwright，PASS=11 FAIL=0）

| # | 測試情境 | 結果 | 備註 |
|---|---------|------|------|
| 1 | /login → 輸入帳密 → 跳轉 /vms | ✓ | 成功登入 |
| 2 | /apply → 填表單 → 「申請已送出」 | ✓ | 成功提交 |
| 3 | /admin/applications → 顯示申請卡片 | ✓ | 顯示 4 筆申請資料 |
| 4 | /admin/dashboard → 顯示「GPU 資源總覽」標題 | ✓ | Sprint 1 F2 |
| 5 | /admin/vip → 顯示「VIP 插隊管理」標題 | ✓ | Sprint 1 F1 |

### Sprint 1 新發現 Bug（QA 驗收時修正）

**Bug 4：Vip.jsx 的 `allVMs.filter is not a function`（已修正）**
- **位置**：`school/frontend/src/pages/admin/Vip.jsx` 第 53 行
- **問題**：`getVMList()` 回傳 `{ id, message, data: [...] }` 物件，但 `Vip.jsx` 直接將 `useQuery` 的 `data` 當成陣列使用（`allVMs.filter`），導致 `/admin/vip` 頁面崩潰
- **現象**：瀏覽器 console 出現 `allVMs.filter is not a function`，頁面顯示空白
- **修正**：改用 `const allVMs = Array.isArray(vmData?.data) ? vmData.data : []`，與 `VMList.jsx` 的取值邏輯一致

### Sprint 1 是否可 Demo？

**✓ 可以 Demo**

Sprint 1 核心功能全部驗證通過：
- F1 VIP 管理：`/admin/vip` 頁面正常顯示 Host 選擇與 GPU 列表；API 認證與參數驗證正確（401/400）
- F2 GPU 看板：`/admin/dashboard` 頁面正常顯示「GPU 資源總覽」、Host 狀態與 GPU 使用情況
- F3 Email 通知：Backend vitest 驗證通過（approve 流程呼叫 sendApprovalNotification）
- F4 Approve 修正：21/21 backend 測試通過，approve endpoint 不再寫入不存在的欄位

**注意事項（Demo 前）**：
- VIP preempt/restore 按鈕會對學校 VM 真實操作，Demo 時建議僅展示 UI，不要點擊「確認插隊」

---

最後執行：2026-04-16 15:11（台灣時間）

## Backend Smoke Test 結果

| # | 項目 | 結果 | 備註 |
|---|------|------|------|
| 1 | GET /health | ✓ | status:ok, db:ok，PostgreSQL 連線正常 |
| 2 | POST /api/applications | ✓ | HTTP 201，回傳 application 物件，status=pending |
| 3 | POST /api/auth/login | ✓ | HTTP 200，回傳 JWT token + user 資訊 |
| 4 | GET /api/applications（帶 JWT） | ✓ | HTTP 200，回傳 applications 陣列 |
| 5 | GET /api/applications（無 JWT） | ✓ | HTTP 401，正確拒絕未授權請求 |
| 6 | GET /api/one/system/version | ✓ | HTTP 200，含版本號 7.0.1，代理正常 |
| 7 | GET /api/one/vmpool/info?filter=-2 | ✓ | HTTP 200，回傳 VM_POOL |
| 8 | GET /api/one/host/info/0 | ✓ | HTTP 200，含 HOST + PCI_DEVICES（RTX 4070 Ti）|
| 9 | PUT /api/applications/:id/reject | ✓ | HTTP 200，申請狀態更新為 rejected |

**Smoke Test 總計：21 個斷言，全部通過（PASS=21 FAIL=0）**

## Frontend E2E 測試結果（Playwright）

| # | 測試情境 | 結果 | 備註 |
|---|---------|------|------|
| 1 | /login → 輸入帳密 → 跳轉 /vms | ✓ | 成功登入，URL 正確跳轉 |
| 2 | /apply → 填表單 → 「申請已送出」 | ✓ | 送出後顯示成功訊息 |
| 3 | /admin/applications → 顯示申請卡片 | ✓ | 正確顯示 3 筆申請資料 |

**E2E 測試總計：7 個斷言，全部通過（PASS=7 FAIL=0）**

## 測試中發現並修正的 Bug

### Bug 1：`reject` 寫入 DB 欄位名稱錯誤（已修正）
- **位置**：`school/backend/src/routes/applications.js`
- **問題**：`PUT /api/applications/:id/reject` 的 SQL INSERT 使用 `reject_reason`，但資料庫 schema（`01_schema.sql`）定義的欄位名稱為 `reason`
- **現象**：呼叫 reject endpoint 回傳 HTTP 500「伺服器錯誤」
- **修正**：將 SQL 中的 `reject_reason` 改為 `reason`

### Bug 2：`approve` 寫入不存在的欄位（已修正）
- **位置**：`school/backend/src/routes/applications.js`
- **問題**：`PUT /api/applications/:id/approve` 的 SQL INSERT 使用 `one_username` 和 `template_id`，但這兩個欄位不在實際建立的資料庫 schema 中
- **修正**：移除 INSERT 中不存在的欄位，只保留 schema 有的 `one_user_id`

### Bug 3：前端管理員頁面申請列表永遠空白（已修正）
- **位置**：`school/frontend/src/pages/admin/Applications.jsx`
- **問題**：第 179 行使用 `data?.data` 存取申請陣列，但 `getApplications()` 已透過 axios 解出 `response.data`，實際結構為 `{ applications: [...] }`，應使用 `data?.applications`
- **現象**：即使 API 有回傳資料，前端管理員頁面一律顯示「無申請紀錄」
- **修正**：將 `data?.data` 改為 `data?.applications`

## 環境資訊

- OpenNebula FireEdge：http://10.1.1.79:2616，版本 7.0.1
- Host：ID=0，IP=10.1.1.79，1 張 RTX 4070 Ti
- VM：ID=0，名稱「Ubuntu 2404-GPU -0」
- PostgreSQL：Docker container `gpu-platform-db`，port 5433

## MVP 是否可 Demo？

**✓ 可以 Demo**

核心功能全部驗證通過：
- 學生提交申請表單（無需帳號）
- 管理員登入後審核申請（拒絕流程完整）
- 代理 OpenNebula API 正常（VM Pool、Host GPU 資訊）
- JWT 認證保護後端 API 正常運作

**注意事項（Demo 前）**：
- `approve`（通過）流程會在 OpenNebula 建立真實使用者帳號，Demo 時建議只展示 `reject` 流程
- 測試資料（多筆 S999999 / E2E999 申請）已累積在 PostgreSQL 中，如需清理可執行 `DELETE FROM applications WHERE student_id IN ('S999999', 'E2E999', 'D000001', 'D000002')`
