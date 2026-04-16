# Sunstone 前端路由與 API 對照表

所有前端路徑前綴為 `/fireedge/sunstone`，API 前綴為 `/fireedge/api`。
以下簡寫省略前綴，例如 `/vm` 實際為 `/fireedge/sunstone/vm`。

---

## Instances（實例）

### VMs（虛擬機器）

| 頁面     | 前端路徑               | API 端點                                                   | HTTP Method    |
| -------- | ---------------------- | ---------------------------------------------------------- | -------------- |
| 列表     | `/vm`                  | `/vmpool/info/paginated?extended=1&filter=-2&pageSize=200` | GET            |
| 詳情     | `/vm/:id`              | `/vm/info/:id`                                             | GET            |
| 監控     | (詳情頁 tab)           | `/vm/monitoring/:id`                                       | GET            |
| 日誌     | (詳情頁 tab)           | `/vm/:id/logs`                                             | GET (功能路由) |
| 遠端桌面 | `/guacamole/:id/:type` | `/vm/:id/guacamole/:type`                                  | GET (功能路由) |

**詳情頁可用的操作 API：**
| 操作 | API | Method |
|------|-----|--------|
| 啟動/關機/重啟 | `/vm/action/:id` body: `{action: "resume/poweroff/reboot"}` | PUT |
| 刪除 | `/vm/action/:id` body: `{action: "terminate"}` | PUT |
| 調整規格 | `/vm/resize/:id` | PUT |
| 建立快照 | `/vm/snapshotcreate/:id` | POST |
| 掛載磁碟 | `/vm/attach/:id` | PUT |
| 掛載網卡 | `/vm/attachnic/:id` | PUT |
| 掛載 GPU | `/vm/attachpci/:id` | PUT |
| 修改權限 | `/vm/chmod/:id` | PUT |
| 修改擁有者 | `/vm/chown/:id` | PUT |
| 儲存為範本 | `/vm/save/:id` | POST (功能路由) |

---

### Virtual Routers（虛擬路由器）

| 頁面       | 前端路徑               | API 端點                      | HTTP Method |
| ---------- | ---------------------- | ----------------------------- | ----------- |
| 列表       | `/vrouter`             | `/vrouterpool/info?filter=-2` | GET         |
| 詳情       | `/vrouter/:id`         | `/vrouter/info/:id`           | GET         |
| 從範本建立 | `/vrouter/instantiate` | `/vrouter/instantiate/:id`    | PUT         |

---

### Services（服務）

| 頁面       | 前端路徑               | API 端點                       | HTTP Method            |
| ---------- | ---------------------- | ------------------------------ | ---------------------- |
| 列表       | `/service`             | `/service/`                    | GET (功能路由/OneFlow) |
| 詳情       | `/service/:id`         | `/service/:id`                 | GET (功能路由/OneFlow) |
| 從範本建立 | `/service/instantiate` | `/service_template/action/:id` | POST (功能路由)        |

---

## Templates（範本）

### VM Templates（VM 範本）

| 頁面         | 前端路徑                   | API 端點                           | HTTP Method |
| ------------ | -------------------------- | ---------------------------------- | ----------- |
| 列表         | `/vm-template`             | `/templatepool/info?filter=-2`     | GET         |
| 詳情         | `/vm-template/:id`         | `/template/info/:id?extended=true` | GET         |
| 建立         | `/vm-template/create`      | `/template/allocate`               | PUT         |
| 更新         | `/vm-template/update`      | `/template/update/:id`             | PUT         |
| 實例化(建VM) | `/vm-template/instantiate` | `/template/instantiate/:id`        | PUT         |

---

### Service Templates（服務範本）

| 頁面   | 前端路徑                        | API 端點                       | HTTP Method            |
| ------ | ------------------------------- | ------------------------------ | ---------------------- |
| 列表   | `/service-template`             | `/service_template/`           | GET (功能路由/OneFlow) |
| 詳情   | `/service-template/:id`         | `/service_template/:id`        | GET (功能路由/OneFlow) |
| 建立   | `/service-template/create`      | `/service_template`            | POST (功能路由)        |
| 實例化 | `/service-template/instantiate` | `/service_template/action/:id` | POST (功能路由)        |

---

### Virtual Router Templates（虛擬路由器範本）

| 頁面   | 前端路徑                        | API 端點                      | HTTP Method |
| ------ | ------------------------------- | ----------------------------- | ----------- |
| 列表   | `/vrouter-template`             | `/vrouterpool/info?filter=-2` | GET         |
| 詳情   | `/vrouter-template/:id`         | `/vrouter/info/:id`           | GET         |
| 建立   | `/vrouter-template/create`      | `/vrouter/allocate`           | POST        |
| 實例化 | `/vrouter-template/instantiate` | `/vrouter/instantiate/:id`    | PUT         |

---

### VM Groups（VM 群組）

| 頁面 | 前端路徑           | API 端點                      | HTTP Method |
| ---- | ------------------ | ----------------------------- | ----------- |
| 列表 | `/vm-group`        | `/vmgrouppool/info?filter=-2` | GET         |
| 建立 | `/vm-group/create` | `/vmgroup/allocate`           | POST        |

---

## Storage（儲存）

### Datastores（資料儲存庫）

| 頁面 | 前端路徑            | API 端點              | HTTP Method |
| ---- | ------------------- | --------------------- | ----------- |
| 列表 | `/datastore`        | `/datastorepool/info` | GET         |
| 詳情 | `/datastore/:id`    | `/datastore/info/:id` | GET         |
| 建立 | `/datastore/create` | `/datastore/allocate` | POST        |

---

### Images（映像檔）

| 頁面 | 前端路徑         | API 端點                    | HTTP Method                |
| ---- | ---------------- | --------------------------- | -------------------------- |
| 列表 | `/image`         | `/imagepool/info?filter=-2` | GET                        |
| 詳情 | (列表頁側邊面板) | `/image/info/:id`           | GET                        |
| 建立 | `/image/create`  | `/image/allocate`           | POST                       |
| 上傳 | (建立頁)         | `/image/upload`             | POST (功能路由, multipart) |

---

### Files（檔案）

| 頁面 | 前端路徑       | API 端點                                | HTTP Method |
| ---- | -------------- | --------------------------------------- | ----------- |
| 列表 | `/file`        | `/imagepool/info?filter=-2` (type=FILE) | GET         |
| 建立 | `/file/create` | `/image/allocate`                       | POST        |

---

### Backups（備份）

| 頁面 | 前端路徑      | API 端點                                  | HTTP Method |
| ---- | ------------- | ----------------------------------------- | ----------- |
| 列表 | `/backup`     | `/imagepool/info?filter=-2` (type=BACKUP) | GET         |
| 詳情 | `/backup/:id` | `/image/info/:id`                         | GET         |

---

### Marketplaces（市集）

| 頁面 | 前端路徑              | API 端點           | HTTP Method |
| ---- | --------------------- | ------------------ | ----------- |
| 列表 | `/marketplace`        | `/marketpool/info` | GET         |
| 詳情 | `/marketplace/:id`    | `/market/info/:id` | GET         |
| 建立 | `/marketplace/create` | `/market/allocate` | POST        |

---

### Apps（市集應用）

| 頁面 | 前端路徑                  | API 端點                        | HTTP Method     |
| ---- | ------------------------- | ------------------------------- | --------------- |
| 列表 | `/marketplace-app`        | `/marketapppool/info?filter=-2` | GET             |
| 詳情 | `/marketplace-app/:id`    | `/marketapp/info/:id`           | GET             |
| 建立 | `/marketplace-app/create` | `/marketapp/allocate/:id`       | PUT             |
| 匯出 | (詳情頁操作)              | `/marketapp/export/:id`         | POST (功能路由) |
| 下載 | (詳情頁操作)              | `/marketapp/download/:id`       | GET (功能路由)  |

---

### Backup Jobs（備份作業）

| 頁面 | 前端路徑             | API 端點                        | HTTP Method |
| ---- | -------------------- | ------------------------------- | ----------- |
| 列表 | `/backupjobs`        | `/backupjobpool/info?filter=-2` | GET         |
| 詳情 | `/backupjobs/:id`    | `/backupjob/info/:id`           | GET         |
| 建立 | `/backupjobs/create` | `/backupjob/allocate`           | POST        |

---

## Networks（網路）

### Virtual Networks（虛擬網路）

| 頁面 | 前端路徑                  | API 端點                 | HTTP Method |
| ---- | ------------------------- | ------------------------ | ----------- |
| 列表 | `/virtual-network`        | `/vnpool/info?filter=-2` | GET         |
| 詳情 | `/virtual-network/:id`    | `/vn/info/:id`           | GET         |
| 建立 | `/virtual-network/create` | `/vn/allocate`           | POST        |

---

### Network Templates（網路範本）

| 頁面   | 前端路徑                        | API 端點                         | HTTP Method |
| ------ | ------------------------------- | -------------------------------- | ----------- |
| 列表   | `/network-template`             | `/vntemplatepool/info?filter=-2` | GET         |
| 建立   | `/network-template/create`      | `/vntemplate/allocate`           | POST        |
| 實例化 | `/network-template/instantiate` | `/vntemplate/instantiate/:id`    | PUT         |

---

### Security Groups（安全群組）

| 頁面 | 前端路徑                 | API 端點                       | HTTP Method |
| ---- | ------------------------ | ------------------------------ | ----------- |
| 列表 | `/security-group`        | `/secgrouppool/info?filter=-2` | GET         |
| 建立 | `/security-group/create` | `/secgroup/allocate`           | POST        |

---

## Infrastructure（基礎設施）

### Clusters（叢集）

| 頁面     | 前端路徑          | API 端點                 | HTTP Method    |
| -------- | ----------------- | ------------------------ | -------------- |
| 列表     | `/cluster`        | `/clusterpool/info`      | GET            |
| 詳情     | `/cluster/:id`    | `/cluster/info/:id`      | GET            |
| 管理資訊 | (詳情頁)          | `/cluster/admininfo/:id` | GET (功能路由) |
| 建立     | `/cluster/create` | `/cluster/allocate`      | PUT            |

---

### Hosts（主機）

| 頁面        | 前端路徑       | API 端點               | HTTP Method    |
| ----------- | -------------- | ---------------------- | -------------- |
| 列表        | `/host`        | `/hostpool/info`       | GET            |
| 列表(admin) | `/host`        | `/hostpool/admininfo`  | GET (功能路由) |
| 詳情        | `/host/:id`    | `/host/info/:id`       | GET            |
| 監控        | (詳情頁 tab)   | `/host/monitoring/:id` | GET            |
| 建立        | `/host/create` | `/host/allocate`       | PUT            |

**詳情頁重要欄位（GPU 算力平台）：**

- `HOST_SHARE.PCI_DEVICES` — GPU 裝置清單
- `HOST_SHARE.NUMA_NODES` — NUMA 拓撲
- `MONITORING` — 即時 CPU/RAM 使用率

---

### Zones（區域）

| 頁面 | 前端路徑 | API 端點         | HTTP Method |
| ---- | -------- | ---------------- | ----------- |
| 列表 | `/zone`  | `/zonepool/info` | GET         |

---

## System（系統）

### Users（使用者）

| 頁面 | 前端路徑       | API 端點         | HTTP Method |
| ---- | -------------- | ---------------- | ----------- |
| 列表 | `/user`        | `/userpool/info` | GET         |
| 詳情 | `/user/:id`    | `/user/info/:id` | GET         |
| 建立 | `/user/create` | `/user/allocate` | POST        |

**詳情頁可用的操作 API：**
| 操作 | API | Method |
|------|-----|--------|
| 修改密碼 | `/user/passwd/:id` | PUT |
| 設定配額 | `/user/quota/:id` | PUT |
| 啟用/停用 | `/user/enable/:id` | PUT |
| 加入群組 | `/user/addgroup/:id` | POST |

---

### Groups（群組）

| 頁面 | 前端路徑        | API 端點          | HTTP Method |
| ---- | --------------- | ----------------- | ----------- |
| 列表 | `/group`        | `/grouppool/info` | GET         |
| 詳情 | `/group/:id`    | `/group/info/:id` | GET         |
| 建立 | `/group/create` | `/group/allocate` | POST        |

---

### VDCs（虛擬資料中心）

| 頁面 | 前端路徑                      | API 端點        | HTTP Method     |
| ---- | ----------------------------- | --------------- | --------------- |
| 列表 | `/virtual-data-center`        | `/vdcpool/info` | GET             |
| 詳情 | `/virtual-data-center/:id`    | `/vdc/info/:id` | GET             |
| 建立 | `/virtual-data-center/create` | `/vdc/create`   | POST (功能路由) |

---

### ACLs（存取控制）

| 頁面 | 前端路徑      | API 端點       | HTTP Method |
| ---- | ------------- | -------------- | ----------- |
| 列表 | `/acl`        | `/acl/info`    | GET         |
| 建立 | `/acl/create` | `/acl/addrule` | POST        |

---

## Settings（設定）

| 頁面   | 前端路徑    | API 端點           | HTTP Method    |
| ------ | ----------- | ------------------ | -------------- |
| 設定頁 | `/settings` | `/sunstone/views`  | GET (功能路由) |
|        |             | `/sunstone/config` | GET (功能路由) |
|        |             | `/system/config`   | GET (功能路由) |

---

## 全局共用 API

以下 API 在多個頁面都會被呼叫：

| 用途           | API 端點                   | 呼叫時機     |
| -------------- | -------------------------- | ------------ |
| 登入           | `POST /auth/`              | 登入頁       |
| 登出           | `POST /auth/logout`        | 登出         |
| 取得登入者資訊 | `GET /user/info/-1`        | 每次頁面載入 |
| 系統設定       | `GET /system/config`       | 應用初始化   |
| Sunstone Views | `GET /sunstone/views`      | 應用初始化   |
| Tab Manifest   | `GET /system/tab-manifest` | 應用初始化   |
| Zone 列表      | `GET /zonepool/info`       | 應用初始化   |

---

## GPU 算力平台最常用的 API 路徑

| 功能               | 前端路徑                   | API                                                      |
| ------------------ | -------------------------- | -------------------------------------------------------- |
| 查看所有 GPU VM    | `/vm`                      | `GET /vmpool/info/paginated?extended=1&filter=-2`        |
| 查看 VM 詳情+IP    | `/vm/:id`                  | `GET /vm/info/:id`                                       |
| 從範本建立 GPU VM  | `/vm-template/instantiate` | `PUT /template/instantiate/:id`                          |
| 開機/關機          | `/vm/:id`                  | `PUT /vm/action/:id` body: `{action: "resume/poweroff"}` |
| 刪除 VM            | `/vm/:id`                  | `PUT /vm/action/:id` body: `{action: "terminate"}`       |
| 查看 GPU Host 狀態 | `/host/:id`                | `GET /host/info/:id`                                     |
| Web SSH 連線       | `/guacamole/:id/ssh`       | `GET /vm/:id/guacamole/ssh` → WebSocket                  |
| 建立學生帳號       | `/user/create`             | `POST /user/allocate`                                    |
| 設定學生配額       | `/user/:id`                | `PUT /user/quota/:id`                                    |

＝＝＝

## GPU算力平台 系統 功能

| **模組**       | **功能分類**       | **功能名稱**       | **功能說明**                                                         | **實現方式**  |
| -------------- | ------------------ | ------------------ | -------------------------------------------------------------------- | ------------- |
| **帳號管理**   | **申請與審核**     | 帳號申請表單       | 學生填寫基本資料（姓名、學號、用途、GPU 需求）送出申請。              | 需自建        |
|                |                    | 申請通知管理       | 新申請送出後，系統自動發 Email 通知管理者審核。                      | 需自建        |
|                |                    | 申請審核流程       | 管理者查看待審核列表，逐筆通過或拒絕，可填寫原因。                   | 需自建        |
|                |                    | 審核結果通知       | 通過：發送金鑰 + 登入連結 Email。拒絕：發送拒絕原因 Email。          | 需自建        |
|                |                    | 審核後自動建帳     | 通過後自動建立使用者帳號、設定配額、建立 VM。                        | 部分可用 API  |
|                | **登入與認證**     | 帳號註冊與登入管理 | 支援 Email 註冊登入。                                                | 部分可用 API  |
|                |                    | 身份認證管理       | Email 驗證及其他多重身份驗證（2FA）。                                | 部分可用 API  |
|                | **權限與金鑰**     | 系統授權控管       | 角色權限分配（管理者、擁有人、使用者等）。                           | 可直接用 API  |
|                |                    | 金鑰授權管理       | 審核通過後自動生成連線金鑰/Token，發送給使用者。                     | 部分可用 API  |
|                | **資料管理**       | 帳號資料管理       | 修改個人資料、密碼重設、停權與刪除申請。                             | 可直接用 API  |
|                | **追蹤審計**       | 操作記錄管理       | 後台操作歷程紀錄，供審計使用。                                       | 需自建        |
|                |                    | 活動紀錄查詢       | 查詢註冊、登入及認證的相關軌跡。                                     | 需自建        |
| **虛擬機管理** | **運作與生命週期** | 虛擬個體管理       | 虛擬機的新增、修改、停用與卸載。                                     | 可直接用 API  |
|                |                    | 生命週期管理       | 設定使用期間及使用比率，超過額度/時段自動暫停 VM。                   | 部分可用 API  |
|                |                    | 排程管理           | 週期性或計劃性動作的自動化排程。                                     | 可直接用 API  |
|                | **資源配置**       | 資源範本管理       | 設定 GPU、CPU、RAM 等硬體資源組合。                                  | 可直接用 API  |
|                |                    | 額度管理           | 整體資源額度的管控與分配。                                           | 部分可用 API  |
|                |                    | 儲存空間管理       | 掛載空間的容量與格式化管理。                                         | 可直接用 API  |
|                | **VIP 與優先級**   | VIP 優先排程       | VIP 學生的 VM 自動設定 USER_PRIORITY，排隊時優先分配資源。           | 部分可用 API  |
|                |                    | VIP 緊急插隊       | 管理者一鍵暫停佔用者 VM，立即啟動 VIP 的 VM。                       | 部分可用 API  |
|                | **監控與備份**     | 監控與示警管理     | 監控 CPU/RAM/GPU 數據，異常時告警通知。                              | 部分可用 API  |
|                |                    | 快照備份管理       | 快照容量與備份週期的自動化管理。                                     | 可直接用 API  |
|                | **介面與資源庫**   | 儀表板管理         | GPU 資源總覽看板（使用率、排隊人數、各 Host GPU 狀態）。             | 需自建        |
|                |                    | 映像檔管理         | 官方與自建虛擬機系統映像檔版本控管（上傳 ISO、製作映像檔）。         | 可直接用 API  |
|                |                    | 資源管理分配       | 提供「行事曆」式的資源瀏覽介面，管理者拖放設定學生可用時段。         | 需自建        |

---

## 功能實現分析：哪些可用現有 API，哪些需要自建

以下將上表每項功能標記為三種狀態：
- **可直接用** — 現有 OpenNebula API 完整支援，只需在新前端串接
- **部分可用** — API 有基礎能力，但需要加業務邏輯包裝
- **需自建** — OpenNebula 完全沒有，必須自己寫後端 + 前端

---

### 帳號管理 — 申請與審核（需自建）

| 功能 | 狀態 | 說明 | 自建方式 + 可搭配的 API |
|------|------|------|------------------------|
| 帳號申請表單 | **需自建** | OpenNebula 沒有申請流程，使用者直接由管理員建立 | **自建**：申請表單頁面 + 存入自己的資料庫（students 表） |
| 申請通知管理 | **需自建** | 沒有通知機制 | **自建**：新申請存入後，用 nodemailer 發 Email 給管理者 |
| 申請審核流程 | **需自建** | 沒有工單/審核概念 | **自建**：管理者後台的「待審核列表」頁面，支援通過/拒絕 + 填原因 |
| 審核結果通知 | **需自建** | 沒有通知機制 | **自建**：審核完成後發 Email（通過：附金鑰+連結；拒絕：附原因） |
| 審核後自動建帳 | 部分可用 | 通過後需串接多支 API 自動執行 | 1. `POST /user/allocate` 建帳號<br>2. `PUT /user/quota/:id` 設配額<br>3. `PUT /template/instantiate/:id` 建 VM<br>4. `POST /user/login` 生成 token<br>**自建**：串接這些 API 的自動化邏輯 |

**審核流程圖對應：**
```
Mermaid M1~M8 的完整流程：

學生送出申請 → 存入自建 DB → 發 Email 通知管理者
                                    ↓
                            管理者登入 → 查看待審核列表
                                    ↓
                              通過 or 拒絕？
                             ↙            ↘
                        通過                拒絕
                         ↓                   ↓
                   自動呼叫 API：          發拒絕 Email
                   1. 建帳號
                   2. 設配額
                   3. 建 VM
                   4. 生成金鑰
                         ↓
                   發通過 Email（含金鑰）
```

---

### 帳號管理 — 登入、權限、資料

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| 帳號註冊與登入管理 | 部分可用 | 有建帳號和登入 API，但 Email 註冊流程需自建 | 登入：`POST /auth/`<br>建帳號：`POST /user/allocate`<br>**自建**：Email 寄送、註冊表單 |
| 身份認證管理 | 部分可用 | 有 2FA (TOTP)，但 Email 驗證需自建 | 2FA 設定：`POST /tfa`<br>2FA QR Code：`GET /tfa`<br>**自建**：Email 驗證碼 |
| 系統授權控管 | 可直接用 | 原生有完整 User/Group/ACL 權限 | 建群組：`POST /group/allocate`<br>設 ACL：`POST /acl/addrule`<br>改擁有者：`PUT /vm/chown/:id` |
| 金鑰授權管理 | 部分可用 | 有 login token，審核通過後自動生成 | Token：`POST /user/login`<br>**自建**：SSH Key 上傳介面，寫入 `PUT /user/update/:id` |
| 帳號資料管理 | 可直接用 | 改密碼、停用、刪除都有 API | 改密碼：`PUT /user/passwd/:id`<br>停用：`PUT /user/enable/:id`<br>刪除：`DELETE /user/delete/:id` |
| 操作記錄管理 | **需自建** | OpenNebula 沒有操作審計日誌 API | **自建**：中間層攔截 API 呼叫，記錄 who/what/when 到自己的資料庫 |
| 活動紀錄查詢 | **需自建** | 沒有登入歷史查詢 API | **自建**：記錄每次登入/登出的 IP、時間、裝置 |

---

### 虛擬機管理 — VIP 與優先級

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| VIP 優先排程 | 部分可用 | OpenNebula 原生有 USER_PRIORITY 機制，但沒有 UI | API：`PUT /template/instantiate/:id` extra 帶 `USER_PRIORITY=100`<br>**自建**：後台判斷 VIP 身份 → 自動帶入高 priority |
| VIP 緊急插隊 | 部分可用 | API 可 stop/resume VM，但串接邏輯需自建 | 1. `GET /host/info/:id` 查哪台 VM 佔用 GPU<br>2. `PUT /vm/action/:vmId` body:`{action:"stop"}` 暫停佔用者<br>3. `PUT /vm/action/:vipVmId` body:`{action:"resume"}` 啟動 VIP<br>**自建**：一鍵插隊按鈕 + 自動化串接 |

---

### 虛擬機管理 — 運作與生命週期

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| 虛擬個體管理 | 可直接用 | VM 建立/查詢/修改/刪除全部有 API | 建立：`PUT /template/instantiate/:id`<br>查詢：`GET /vm/info/:id`<br>刪除：`PUT /vm/action/:id` body:`{action:"terminate"}` |
| 生命週期管理 | 部分可用 | 有排程動作（定時開關機），但「使用比率」需自建 | 定時關機：`POST /vm/schedadd/:id`<br>**自建**：「每人每天最多 N 小時」的計時邏輯 |
| 排程管理 | 可直接用 | 支援一次性/週期性/相對時間三種排程 | 新增：`POST /vm/schedadd/:id`<br>更新：`PUT /vm/schedupdate/:id`<br>刪除：`DELETE /vm/scheddelete/:id` |

---

### 虛擬機管理 — 資源配置

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| 資源範本管理 | 可直接用 | Template 完整支援 CPU/RAM/GPU/磁碟/網路 | 建範本：`PUT /template/allocate`<br>改範本：`PUT /template/update/:id`<br>從範本建 VM：`PUT /template/instantiate/:id` |
| 額度管理 | 部分可用 | 可控制 VM 數量/CPU/RAM，但**不能直接控制 GPU 數量** | 使用者配額：`PUT /user/quota/:id`<br>群組配額：`PUT /group/quota/:id`<br>**自建**：GPU 數量配額（用 CPU 間接限制，或自建計數） |
| 儲存空間管理 | 可直接用 | 磁碟掛載/卸載/調整大小都有 API | 掛載：`PUT /vm/attach/:id`<br>卸載：`PUT /vm/detach/:id`<br>調大小：`PUT /vm/diskresize/:id` |

---

### 虛擬機管理 — 監控與備份

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| 監控與示警管理 | 部分可用 | 有 CPU/RAM 監控，但**沒有 GPU 使用率**，也沒有告警 | VM 監控：`GET /vm/monitoring/:id`<br>Host 監控：`GET /host/monitoring/:id`<br>**自建**：GPU 監控（需 DCGM agent）、告警通知 |
| 快照備份管理 | 可直接用 | VM 快照和備份都有完整 API | VM 快照：`POST /vm/snapshotcreate/:id`<br>備份：`POST /vm/backup/:id`<br>排程備份：`POST /vm/schedadd/:id` body:`{action:"backup"}` |

---

### 虛擬機管理 — 介面與資源庫

| 功能 | 狀態 | 說明 | 現有 API / 自建方式 |
|------|------|------|-------------------|
| 儀表板管理 | **需自建** | OpenNebula Dashboard 不能自訂。GPU 平台需要自己的看板 | **自建**：前端 Dashboard 元件<br>資料來源：`GET /hostpool/info` + `GET /vmpool/info` + 自建 GPU 監控 |
| 映像檔管理 | 可直接用 | Image CRUD 完整 | 列表：`GET /imagepool/info`<br>上傳：`POST /image/upload`<br>刪除：`DELETE /image/delete/:id` |
| 資源管理分配（行事曆） | **需自建** | OpenNebula **完全沒有行事曆 UI**，這是平台的核心功能 | **自建**：行事曆前端（可用 FullCalendar 套件）<br>後端：將時段轉換為 `POST /vm/schedadd/:id` 排程，或自建 cron 呼叫 `PUT /vm/action/:id` |

---

## 自建優先級建議

### P0 — 必須自建（沒有替代方案）

| 功能 | 工作量 | 說明 |
|------|--------|------|
| 申請審核流程 | 大 | 申請表單 + 待審核列表 + 通過/拒絕 + 自動建帳串接 API + Email 通知。這是使用者入口 |
| 行事曆資源分配 UI | 大 | 核心功能。前端日曆元件 + 後端排程管理 |
| VIP 插隊流程 | 中 | 後端串接 stop → resume 的自動化邏輯 + 前端一鍵插隊按鈕 |
| GPU 資源總覽看板 | 中 | 聚合 Host 的 PCI 裝置資訊，前端視覺化 |
| 操作審計日誌 | 中 | API Proxy 層攔截記錄，需自建資料庫表 |

### P1 — 建議自建（有替代但體驗差）

| 功能 | 工作量 | 說明 |
|------|--------|------|
| Email 註冊/驗證流程 | 中 | 可先用管理員手動建帳號替代 |
| GPU 數量配額 | 小 | 用 CPU 配額間接限制（1 GPU Template = 4 CPU，配額 CPU=4 = 只能開 1 台） |
| 使用時數限制 | 中 | 用排程動作（建立後 N 小時自動 poweroff）替代 |
| GPU 監控告警 | 中 | 用 DCGM 原生策略（不需 Prometheus），詳見下方說明 |

### P2 — 可後期做（不影響核心功能）

| 功能 | 工作量 | 說明 |
|------|--------|------|
| 活動紀錄查詢 | 小 | 登入歷史，等審計需求明確再加 |
| SSH Key 管理 UI | 小 | 學生可用 Guacamole Web SSH 或自己的 SSH client |
| 自訂儀表板元件 | 中 | 先做固定版面 Dashboard，後期開放拖放自訂 |
| GPU 時數計費 | 大 | Showback 只算 CPU/RAM/磁碟，不含 GPU，詳見下方說明 |

---

## 補充說明

### GPU 監控告警 — DCGM 原生方案（不需 Prometheus）

不用架設 Prometheus，直接用 NVIDIA DCGM 就能做到 GPU 監控和告警：

```
在每台 GPU Host 上安裝 DCGM：
sudo apt install datacenter-gpu-manager

設定告警策略（溫度、功耗、使用率超標時觸發）：
dcgmi policy --set --temp-threshold 85 --temp-action LOG,EMAIL
dcgmi policy --set --power-threshold 300 --power-action LOG,SCRIPT:/path/to/alert.sh
dcgmi policy --set --util-threshold 95
```

**進階整合方式：** 寫一支 probe 腳本，定期把 GPU 數據推到 OpenNebula Host 的自訂屬性：

```bash
#!/bin/bash
# 每 30 秒跑一次，把 GPU 狀態寫入 Host 自訂屬性
GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits)
GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader)
GPU_MEM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

onehost update <HOST_ID> --append \
  "GPU_UTILIZATION=$GPU_UTIL\nGPU_TEMPERATURE=$GPU_TEMP\nGPU_MEMORY_USED=$GPU_MEM"
```

這樣你的 GPU 算力平台前端就可以透過 `GET /host/info/:id` 讀到 GPU 使用率，不需要額外的監控系統。

---

### GPU 時數計費 — Showback 是什麼？為什麼不夠用？

**Showback** 是 OpenNebula 內建的「費用估算」功能。它會自動計算每台 VM 每個月花了多少錢。

**計算公式：**
```
每月費用 = (CPU 數量 × CPU 單價 × 使用小時數)
         + (記憶體 MB × 記憶體單價 × 使用小時數)
         + (磁碟 GB × 磁碟單價 × 使用小時數)
```

**設定位置：** VM Template 或 oned.conf 中的 `CPU_COST`、`MEMORY_COST`、`DISK_COST`

**API：**
- 計算 Showback：`GET /vmpool/calculateshowback?startMonth=1&startYear=2026&endMonth=3&endYear=2026`
- 查詢 Showback：`GET /vmpool/showback?filter=-2&startMonth=1&startYear=2026`

**前端位置：** Settings → Showback（管理員觸發計算）

**為什麼 GPU 算力平台不夠用？**

```
Showback 算的：CPU + RAM + 磁碟 = 每月 $100
漏掉的：       GPU                = 每月 $???  ← 這是最貴的部分！
```

一張 A100 GPU 的成本遠高於 CPU/RAM，但 Showback 完全不知道 VM 有沒有掛 GPU。
源碼中只有 `CPU_COST`、`MEMORY_COST`、`DISK_COST` 三種成本（`modules/components/Tabs/Showback/index.js`），沒有 `GPU_COST`。

**如果學校需要計費，有兩種做法：**

| 做法 | 說明 | 複雜度 |
|------|------|--------|
| **簡單版：把 GPU 成本灌到 CPU_COST** | 例如 GPU Template 設 `CPU_COST=10`（含 GPU），普通 Template 設 `CPU_COST=1`。Showback 會自動算出較高費用 | 小（改 Template 設定即可） |
| **完整版：自建 GPU 計費引擎** | 自己記錄每台 VM 的 GPU 使用時數，獨立計算費用。需自建資料庫 + 計費邏輯 + 帳單頁面 | 大 |

建議先用簡單版，把 GPU 成本算在 CPU_COST 裡，用 Showback 原生功能產出帳單。

---

## 總覽圖

```
GPU 算力平台功能地圖

  可直接用 OpenNebula API（不需寫後端）
  ┌──────────────────────────────────────────────┐
  │  VM CRUD        │  Template 管理  │  快照備份  │
  │  開機/關機/重啟  │  磁碟掛載/卸載  │  排程動作  │
  │  權限/擁有者     │  映像檔管理     │  使用者 CRUD│
  │  群組/ACL 管理   │  2FA 雙因素驗證 │  配額設定   │
  └──────────────────────────────────────────────┘

  部分可用（API 夠但需包裝業務邏輯）
  ┌──────────────────────────────────────────────┐
  │  Email 註冊流程   │  GPU 數量配額（間接控制）   │
  │  SSH Key 管理     │  使用時數限制（排程替代）   │
  │  VM 監控（CPU/RAM）│  使用期間/比率設定         │
  │  VIP 優先排程     │  審核後自動建帳串接         │
  └──────────────────────────────────────────────┘

  需完全自建（OpenNebula 沒有）
  ┌──────────────────────────────────────────────┐
  │  ★ 申請審核流程       │  ★ 行事曆資源分配 UI  │
  │  ★ VIP 緊急插隊       │  ★ GPU 資源總覽看板   │
  │  ★ 操作審計日誌       │    GPU 使用率監控      │
  │    GPU 時數計費        │    活動紀錄查詢        │
  │    自訂儀表板          │    Email 通知系統      │
  └──────────────────────────────────────────────┘
  ★ = P0 必須自建
```
