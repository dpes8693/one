# GPU 算力平台 — 任務追蹤

最後更新：2026-04-16

---

## 進行中

（無）

---

## Backlog

| ID | 任務 | 優先 | 備註 |
|----|------|------|------|
| D | 修學校 GPU Template SSH key bug | P1 | 改 Template ID=1 為 `$USER[SSH_PUBLIC_KEY]`（手動，需 SSH 到學校環境）|
| EXT-1 | Email SMTP 真實接通 | P2 | 設 SMTP_HOST 環境變數即可運作 |
| EXT-2 | 部署到正式環境 | P2 | 寫 Dockerfile + production docker-compose |
| EXT-3 | F10 拖放自訂 Dashboard | P3 | 已有靜態強化版，拖放是 nice-to-have |

---

## 已完成

### 第一階段（規劃）— 2026-04-15
規劃文件 + API 文件 + 採集 + Master 規格書（11 份文件，共 47 個 API JSON 樣本）

### 第二階段 — MVP（B 任務）— 2026-04-16
- school/ 完整骨架（backend + frontend + db + scripts）
- 21/21 smoke + 7/7 e2e

### 第二階段 Sprint 1 — 2026-04-16
| 模組 | 內容 | 測試 |
|------|------|------|
| F4 Backend | approve 流程 + Email 通知 | 6/6 |
| F1 Backend | VIP API（preempt + restore）| 11/11 |
| F3 Backend | nodemailer + console fallback | 4/4 |
| F1 Frontend | /admin/vip | 5/5 |
| F2 Frontend | /admin/dashboard | 6/6 |
| QA | smoke 28 + e2e 11 | 全通過 |

### 第二階段 Sprint 2+3 + Bug 修正 — 2026-04-16
| 模組 | 內容 | 測試 |
|------|------|------|
| Bug A | GET /api/vip/active 缺端點 | 2/2 |
| Bug B | login 沒回傳 user.role | 4/4 |
| F5 Backend | schedules CRUD + node-cron 排程引擎 | 13/13 |
| F5 Frontend | /admin/schedules（FullCalendar）| 7/7 |
| F6 Backend | GET /api/audit | 7/7 |
| F6 Frontend | /admin/audit | 8/8 |
| F7 Backend | SSH Key 寫入 OpenNebula | 6/6 |
| F7 Frontend | /settings/ssh-key | 7/7 |
| F8 Backend | gpu-alert 服務 + alerts 表 | 5/5 |
| F8 Frontend | /admin/alerts | 6/6 |
| F9 | 時數限制 cron（在 scheduler.js）| 含 F5 |
| F10 | Dashboard 強化（告警/VIP/申請數）| 5/5 |
| Sidebar | 重構分組 | 完成 |
| QA | smoke 49 + e2e 16 | 全通過（修了 4 個 bug）|

---

## Sprint 統計

| 測試類型 | 第一階段 MVP | Sprint 1 | Sprint 2+3 | 累計 |
|---------|-------------|----------|-----------|------|
| Backend Vitest | - | 21/21 | 58/58 | 58 |
| Frontend Vitest | - | 12/12 | 45/45 | 45 |
| Backend Smoke | 21/21 | 28/28 | 49/49 | 49 |
| Playwright E2E | 7/7 | 11/11 | 16/16 | 16 |
| **總和** | **28** | **72** | **168** | **168** |

QA 過程修的 bug：總計 8 個
- MVP 階段：3 個（reject SQL、approve SQL、admin 解析）
- Sprint 1：2 個（createUser 解析、Vip.jsx 結構）
- Sprint 2+3：4 個（Schedules/Audit/Alerts 結構解析、smoke body 格式）

---

## 系統架構

```
http://localhost:3000 (frontend)
  ↕
http://localhost:4000 (backend, ESM)
  ├── /api/auth/*        登入登出
  ├── /api/applications  申請審核
  ├── /api/vip/*         VIP 插隊（preempt/restore/active）
  ├── /api/schedules     行事曆排程 CRUD
  ├── /api/audit         審計日誌查詢
  ├── /api/alerts        GPU 告警查詢
  ├── /api/users/me/ssh-key  SSH Key 管理
  └── /api/one/*         代理 FireEdge
        ↓
http://10.1.1.79:2616/fireedge/api (學校 OpenNebula)
        ↓
oned (XML-RPC) → KVM → GPU VM
        ↓
postgres:5433 (gpu_platform DB, 9 張表)
        + node-cron 排程引擎
        + GPU 告警檢查器
```

---

## 文件導覽圖

```
文件：company-docs/
  ├── MASTER_SPEC.md          ← 入口
  ├── 新手架構指南.md
  ├── ＿前端路由API對照表.md
  ├── 系統架構規劃.md
  ├── xmlrpc-api.yml          ← 169 個 API（含 example）
  ├── one-api.yml             ← 83 個 API（含 example）
  ├── websocket-spec.md
  └── api-samples/INDEX.md    ← 47 個真實 JSON 樣本

程式：school/
  ├── README.md
  ├── _PROGRESS.md
  ├── docker-compose.yml
  ├── backend/                 ESM, vitest 58/58
  ├── frontend/                vitest 45/45, 11 個頁面
  ├── db/init/                 01_schema.sql + 02_gpu_alerts.sql
  └── scripts/                 smoke 49 + e2e 16 + TEST_REPORT.md
```
