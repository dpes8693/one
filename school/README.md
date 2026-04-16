# GPU 算力平台 — 學校自建系統

OpenNebula 之上的學校自建 GPU 算力平台。

## 架構

```
school/
├── backend/        Express.js 微服務 (port 4000)
├── frontend/       React + Vite (port 3000)
├── db/             PostgreSQL schema 與 migration
├── scripts/        部署、開發輔助腳本
├── docs/           專案文件
├── docker-compose.yml  PostgreSQL 容器
└── .env.example    環境變數範本
```

## 快速開始

```bash
# 1. 複製 env
cp .env.example .env

# 2. 啟動 PostgreSQL
docker compose up -d

# 3. 啟動 Backend
cd backend && npm install && npm run dev

# 4. 啟動 Frontend
cd frontend && npm install && npm run dev

# 5. 開瀏覽器
open http://localhost:3000
```

## Port 規劃

| 服務 | Port |
|------|------|
| Frontend (Vite dev) | 3000 |
| Backend (Express) | 4000 |
| PostgreSQL | 5432 |

## 與 OpenNebula 的關係

Backend 透過 `/api/one/*` 代理轉發到 FireEdge（10.1.1.79:2616）。
完整架構請看 `../company-docs/MASTER_SPEC.md`。

## 執行測試

### Backend (Vitest)
```bash
cd backend && npm test
```

### Frontend Unit (Vitest)
```bash
cd frontend && npm test
```

### Frontend E2E (Playwright)
```bash
cd frontend && npm run test:e2e
```
> 注意：跑 E2E 前需確保 backend (port 4000) 與 frontend dev server (port 3000) 皆已啟動。

### Smoke Test (curl)
```bash
bash scripts/smoke-backend.sh
```

### 全部測試
```bash
bash scripts/test-all.sh
```
> 腳本會依序跑 backend unit、frontend unit、smoke、e2e，任一失敗即停止。
