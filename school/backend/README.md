# Backend — Express 微服務

## 說明

Node.js + Express 後端，負責：
1. 代理 OpenNebula FireEdge API（/api/one/*）
2. 自建業務 API（申請審核、排程、審計日誌等）
3. JWT 認證
4. 寫入 PostgreSQL

## 目錄結構

```
backend/
├── src/
│   ├── index.js          # 進入點
│   ├── routes/           # API 路由
│   │   ├── auth.js       # 認證
│   │   ├── applications.js # 申請審核
│   │   └── proxy.js      # FireEdge 代理
│   ├── middleware/       # 中介層（JWT 驗證等）
│   ├── db/               # PostgreSQL 連線與查詢
│   └── services/         # 業務邏輯
├── package.json
└── .env.example
```

## 啟動方式

```bash
cd backend
npm install
cp .env.example .env   # 填入環境變數
npm run dev            # 開發模式（nodemon）
npm start              # 正式模式
```

## API 端點

### 認證
- `POST /api/auth/login` — 登入（代理 FireEdge），回傳 JWT
- `POST /api/auth/logout` — 登出

### 申請審核
- `POST /api/applications` — 學生送出申請（無需登入）
- `GET  /api/applications` — 列出申請（管理員）
- `GET  /api/applications/:id` — 查詢單筆申請
- `PUT  /api/applications/:id/approve` — 審核通過
- `PUT  /api/applications/:id/reject` — 審核拒絕

### OpenNebula 代理
- `ALL /api/one/*` — 代理到 FireEdge 同名路徑（需 JWT）

## 環境變數

見 `.env.example`
