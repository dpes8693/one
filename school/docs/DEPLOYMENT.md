# GPU 算力平台 — Production 部署文件

本文件說明如何在正式環境用 Docker Compose 啟動 GPU 算力平台。

## 架構總覽

```
                    ┌─────────────────────────────┐
                    │        Host (port 80)       │
                    └──────────────┬──────────────┘
                                   │
                ┌──────────────────▼──────────────────┐
                │  frontend (nginx:alpine)            │
                │  - 提供 React SPA 靜態檔             │
                │  - /api/* 反向代理 → backend:4000   │
                └──────────────────┬──────────────────┘
                                   │ docker network
                ┌──────────────────▼──────────────────┐
                │  backend (node:22-alpine)           │
                │  - Express + Vitest 通過的 API      │
                │  - 連 postgres 與 OpenNebula        │
                └──────────────────┬──────────────────┘
                                   │
                ┌──────────────────▼──────────────────┐
                │  postgres (postgres:16-alpine)      │
                │  - 不對外暴露 port，只走 internal    │
                │  - volume: postgres-data-prod        │
                └─────────────────────────────────────┘
```

3 個服務全部跑在 `gpu-platform-net` 這個 bridge network，互相用 service name 連線。

---

## 前置需求

- Docker 20+ 與 Docker Compose v2
- 主機開放 port 80（HTTP）
- 可連到 OpenNebula FireEdge（預設 `http://10.1.1.79:2616`）

---

## 快速啟動

```bash
cd /path/to/one/school

# 1. 準備 production 環境變數
cp .env.production.example .env.production
vim .env.production   # 改密碼、JWT_SECRET、OPENNEBULA_PASS

# 2. Build + 啟動全部服務
docker-compose -f docker-compose.prod.yml up -d --build

# 3. 檢查狀態
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f backend
```

啟動成功後：
- 前端：http://<host>/
- 健康檢查：http://<host>/health

---

## 環境變數

正式部署只讀 `school/.env.production`，dev 用的 `school/.env` 不會被使用。

| 變數 | 用途 | 必填 |
|---|---|---|
| `POSTGRES_USER` | DB 帳號 | 是 |
| `POSTGRES_PASSWORD` | DB 密碼（**請改強密碼**） | 是 |
| `POSTGRES_DB` | DB 名稱 | 是 |
| `BACKEND_PORT` | Backend 內部 port，預設 4000 | 否 |
| `JWT_SECRET` | JWT 簽章金鑰（**務必改隨機長字串**） | 是 |
| `OPENNEBULA_URL` | FireEdge 入口 | 是 |
| `OPENNEBULA_USER` / `OPENNEBULA_PASS` | OpenNebula 認證 | 是 |
| `SMTP_*` | 通知信箱（選填） | 否 |

**容器內覆寫**：`docker-compose.prod.yml` 會把 `POSTGRES_HOST` 強制設為 `postgres`（service name）、`POSTGRES_PORT=5432`，不用在 `.env.production` 設定。

---

## 常用指令

```bash
# 重啟單一服務
docker-compose -f docker-compose.prod.yml restart backend

# 重新 build 與部署
docker-compose -f docker-compose.prod.yml up -d --build

# 看 log
docker-compose -f docker-compose.prod.yml logs -f --tail=200 backend

# 停止全部（保留資料）
docker-compose -f docker-compose.prod.yml down

# 停止並清掉 volume（會刪 DB 資料！）
docker-compose -f docker-compose.prod.yml down -v
```

---

## 資料庫

### 初始化

第一次啟動時，PostgreSQL 會自動執行 `school/db/init/*.sql` 完成 schema 建立。

### Migration

目前專案沒有獨立 migration 工具，schema 透過 `db/init/*.sql` 套用。新增 schema 變更時的流程：

```bash
# 1. 在 db/init/ 下新增一份 SQL 檔（檔名照順序，例如 03_xxx.sql）
# 2. 進 backend container 手動套用
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U gpu_platform -d gpu_platform -f /docker-entrypoint-initdb.d/03_xxx.sql
```

> 提醒：volume 內的資料庫**不會**重新跑 init script，必須手動套用差異。

### 備份/還原

```bash
# 備份
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U gpu_platform gpu_platform > backup_$(date +%F).sql

# 還原
cat backup.sql | docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U gpu_platform -d gpu_platform
```

---

## 常見問題

### 1. Port 80 衝突

```
Error: bind: address already in use
```

主機已經有東西在 80。改 `docker-compose.prod.yml` 的 frontend ports：

```yaml
ports:
  - "8080:80"   # 對外用 8080
```

### 2. Backend 連不到 DB

檢查項目：
1. `docker-compose ps` 看 postgres 是不是 healthy
2. `docker logs gpu-platform-backend-prod` 看錯誤訊息
3. 確認 `.env.production` 的 `POSTGRES_PASSWORD` 與 postgres container 內一致
4. 第一次啟動如果改過密碼，volume 內已經有舊密碼，要 `docker-compose down -v` 重來（會刪資料！）

### 3. Frontend 開得起來但 /api 都 502

代表 nginx 接到請求但 backend 沒回應：
1. `docker-compose ps` 看 backend 狀態
2. `docker-compose logs backend` 找錯誤
3. 確認兩者在同一個 network：`docker network inspect school_gpu-platform-net`

### 4. OpenNebula 連不到

backend 在 container 內，要確認 `OPENNEBULA_URL` 從容器內可以 reach：
- 走 IP 通常 OK（如 `http://10.1.1.79:2616`）
- 不要用 `localhost`，那會指到 container 自己

測試：
```bash
docker-compose -f docker-compose.prod.yml exec backend \
  wget -O- http://10.1.1.79:2616/
```

### 5. Build 太慢

`frontend` build 包含 `npm ci` 與 Vite build，第一次大約 3–5 分鐘。後續 build 會用 layer cache，只在 `package.json` 改動時才會重新 `npm ci`。

### 6. Image 太大

如果想再瘦身：
- backend image 已用 multi-stage + `--omit=dev` + alpine
- frontend runtime 只有 nginx:alpine + 靜態檔

---

## 安全檢查清單

- [ ] `.env.production` 不在 git 內（已被 `.gitignore` 排除）
- [ ] `JWT_SECRET` 換成隨機 64 字元字串
- [ ] `POSTGRES_PASSWORD` 換強密碼
- [ ] 主機防火牆只開 80/443（postgres 不對外暴露）
- [ ] 定期備份 `postgres-data-prod` volume
- [ ] 定期更新 base image（`node:22-alpine`、`nginx:alpine`、`postgres:16-alpine`）

---

## 與 Dev 環境的差異

| 項目 | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|---|---|---|
| 服務 | 只跑 PostgreSQL | postgres + backend + frontend |
| Postgres port | 5433 對外 | 不對外，只走 network |
| Backend / Frontend | 在 host 直接 `npm run dev` | 跑在 container |
| 環境變數 | `.env` | `.env.production` |
| Volume | `./postgres-data` (host bind) | named volume `postgres-data-prod` |
