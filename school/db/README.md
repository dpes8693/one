# DB — PostgreSQL Schema

## 說明

GPU 算力平台使用 PostgreSQL 儲存業務資料（申請單、審核、排程、日誌等）。
OpenNebula 本身的資料仍儲存在 OpenNebula 原有的資料庫，本 DB 僅存自建業務邏輯。

## 資料表一覽

| 資料表 | 用途 |
|--------|------|
| applications | 學生 GPU 使用申請單 |
| application_reviews | 申請審核記錄（審核者、決策、原因） |
| schedules | VM 時間排程（開/關機時段） |
| vip_preemptions | VIP 插隊記錄 |
| audit_logs | 操作審計日誌 |
| login_history | 登入/登出歷史 |
| email_notifications | Email 發送記錄 |
| gpu_metrics | GPU 監控快照（選用） |

## 初始化

Schema 放在 `init/01_schema.sql`，docker-compose 啟動時會自動執行。

```bash
# 啟動 PostgreSQL
docker compose up -d postgres

# 手動連入確認
docker compose exec postgres psql -U gpuadmin -d gpuplatform
```

## 連線設定

預設連線資訊（見 `.env`）：

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gpuplatform
DB_USER=gpuadmin
DB_PASSWORD=（見 .env）
```
