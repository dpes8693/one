# Frontend — React + Vite

## 說明

學生與管理員使用的繁體中文介面，功能包含：
- 學生申請 GPU VM
- 管理員審核申請
- VM 生命週期管理（開機/關機/刪除）
- SSH 連線資訊顯示

## 目錄結構

```
frontend/
├── src/
│   ├── main.jsx          # 進入點
│   ├── App.jsx           # 路由設定
│   ├── pages/            # 頁面
│   │   ├── Login.jsx
│   │   ├── Apply.jsx     # 學生申請頁
│   │   ├── Dashboard.jsx # 管理員總覽
│   │   └── VmDetail.jsx  # VM 詳情 + SSH 資訊
│   ├── components/       # 共用元件
│   ├── api/              # API 呼叫封裝
│   └── store/            # 狀態管理
├── index.html
├── vite.config.js
└── package.json
```

## 啟動方式

```bash
cd frontend
npm install
npm run dev     # 開發模式（Vite HMR）
npm run build   # 打包
```

## E2E 測試（Playwright）

### 前置條件

- Backend 在 `http://localhost:4000`
- Frontend 在 `http://localhost:3000`
- PostgreSQL 在 port 5433（`gpu-platform-db` container）

### 安裝（首次）

```bash
cd frontend
npm install
npx playwright install chromium
```

### 執行

```bash
# 正式（headless）
npm run test:e2e

# 有頭（看瀏覽器）
npm run test:e2e:headed

# 從 school/ 根目錄執行
node scripts/test-e2e.js
```

### 測試範圍

| Spec | 說明 | 項目數 |
|------|------|--------|
| `auth.spec.js` | 認證流程（登入/登出） | 4 |
| `application.spec.js` | 申請流程（提交/拒絕/清理） | 5 |
| `vm-dashboard.spec.js` | VM 列表 + Dashboard | 4 |
| `vip.spec.js` | VIP 插隊管理 | 4 |
| `admin-pages.spec.js` | 各管理頁面渲染 | 4 |
| `sidebar.spec.js` | Sidebar 結構 | 4 |

測試截圖儲存於 `e2e/screenshots/`。

> 注意：E2E 測試**不會**對學校 VM 做 stop/poweroff/terminate，也不會建 OpenNebula User。

## 技術棧

- React 18 + Vite
- React Router v6
- 狀態管理：Zustand 或 Redux Toolkit
- UI：MUI 5 或 Tailwind CSS
- API 呼叫：axios

## 環境變數

```
VITE_API_BASE_URL=http://localhost:3000
```
