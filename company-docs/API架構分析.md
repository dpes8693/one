# FireEdge API 架構分析

本文件說明 FireEdge 前端呼叫後端的三種通訊方式：功能路由、XML-RPC 代理路由、WebSocket。

---

## 1. 兩種 HTTP API 的差異

FireEdge 前端確實呼叫兩種 HTTP API，它們都掛在同一個 Express router 上（`/fireedge/api` 前綴），但運作機制完全不同：

### 1.1 XML-RPC 代理路由（283 個端點）

| 項目 | 說明 |
|------|------|
| **定義位置** | `src/fireedge/src/server/utils/constants/commands/*.js` |
| **路由產生** | `src/fireedge/src/server/routes/entrypoints/Api/xmlrpc.js` 動態產生 |
| **運作方式** | 純代理轉發，將 HTTP 請求映射為 XML-RPC 命令，透過 Worker 執行緒送到 OpenNebula daemon (`oned`) |
| **業務邏輯** | 零，只負責參數解析與轉發 |
| **範例** | `GET /api/vm/info/0` → 轉送為 XML-RPC `one.vm.info(session, 0)` → 回傳結果 |

**流程圖：**

```
前端 React App
    │
    ▼ HTTP GET /api/vm/info/0
FireEdge Express Server (xmlrpc.js)
    │
    ▼ Worker Thread → XML-RPC call
OpenNebula Daemon (oned:2633/RPC2)
    │
    ▼ 回傳 XML → 轉 JSON
前端收到 JSON 回應
```

### 1.2 功能路由（83 個端點）

| 項目 | 說明 |
|------|------|
| **定義位置** | `src/fireedge/src/server/routes/api/*/routes.js` + `functions.js` |
| **路由產生** | `src/fireedge/src/server/routes/api/index.js` 靜態掛載 |
| **運作方式** | 每個端點對應一個專門的 JavaScript handler 函數，包含自訂業務邏輯 |
| **業務邏輯** | 有，且各端點邏輯不同 |
| **範例** | `GET /api/vm/0/guacamole/ssh` → 查 VM 資訊 → 提取 SSH 設定 → AES-256 加密 → 回傳 token |

**流程圖：**

```
前端 React App
    │
    ▼ HTTP GET /api/vm/0/guacamole/ssh
FireEdge Express Server (自訂 handler)
    │
    ├── 呼叫 XML-RPC 取得 VM 資訊
    ├── 呼叫 XML-RPC 取得 User SSH Key
    ├── 提取 NIC IP、SSH port
    ├── AES-256-CBC 加密連線參數
    └── 回傳 Base64 encoded token
        │
        ▼
前端收到加密 token（用於建立 Guacamole WebSocket）
```

### 1.3 具體差異對照表

| 比較項目 | XML-RPC 代理路由 | 功能路由 |
|---------|------------------|---------|
| 端點數量 | 283 個 | 83 個 |
| Handler | 統一的代理邏輯 | 每個端點獨立 handler |
| 業務邏輯 | 無（純轉發） | 有（加密、檔案 I/O、指令執行等） |
| 能否直接打 oned | 是（1:1 對應） | 否（有額外處理） |
| 文件位置 | `xmlrpc-api.yml` | `one-api.yml` |
| 典型用途 | VM CRUD、查詢、權限管理 | 檔案上傳、Guacamole token、VM 日誌、SaveAsTemplate |

---

## 2. 為什麼不全部用 XML-RPC 就好？

開發者之所以需要額外的功能路由，是因為有些操作**無法用單純的 XML-RPC 代理完成**：

### 2.1 需要多步驟串接

**Guacamole SSH Token 產生**（`vm/functions.js`）：
1. 呼叫 `vm.info` XML-RPC 取得 VM 的 NIC IP
2. 呼叫 `user.info` XML-RPC 取得使用者的 SSH Private Key
3. 根據連線類型（VNC/SSH/RDP）提取不同欄位
4. 用 AES-256-CBC 加密連線參數
5. 回傳 Base64 token

→ 這是一個**聚合 + 加密**的操作，單一 XML-RPC 呼叫做不到。

### 2.2 需要本機系統操作

**SaveAsTemplate**（`vm/functions.js`）：
- 執行本機 CLI 指令 `onevm save --persistent`
- 這不是 XML-RPC API 支援的操作，需要直接呼叫系統指令

**VM Logs**（`vm/functions.js`）：
- 直接讀取 FireEdge 本機的日誌檔案
- 解析日誌級別、格式化輸出
- 日誌檔在 FireEdge server 上，無法透過 XML-RPC 取得

### 2.3 需要檔案上傳處理

**Image Upload**（`image/functions.js`）：
- 處理 multipart/form-data 檔案上傳
- XML-RPC 協議本身不支援二進位檔案上傳

### 2.4 需要跨系統整合

**OneFlow Service API**：
- OneFlow 是獨立的服務（非 oned），有自己的 REST API
- 功能路由負責將請求轉送到 OneFlow Server，而非 oned

**Sunstone/System 設定**：
- 讀取 FireEdge 本地的 YAML 設定檔（views、tab-manifest、labels）
- 這些資料存在 FireEdge server 上，不在 oned 裡

### 2.5 總結

```
XML-RPC 代理 = OpenNebula 核心資料的 CRUD（數據中轉站）
功能路由     = FireEdge 應用層邏輯（聚合、加密、檔案 I/O、跨系統整合）
```

兩者互補，缺一不可。

---

## 3. WebSocket 文件與前端功能

### 3.1 WebSocket 是否有寫在 yml 中？

**沒有**。目前 `one-api.yml` 和 `xmlrpc-api.yml` 都只記錄了 HTTP API。WebSocket 連線不是 RESTful 端點，無法用標準 OpenAPI spec 描述。以下是完整的 WebSocket 文件。

### 3.2 WebSocket 架構總覽

FireEdge 使用兩種 WebSocket 機制：

| 機制 | 技術 | 路徑 | 用途 |
|------|------|------|------|
| Hook 事件 | Socket.IO | `/fireedge/websockets/hooks` | 資源即時狀態更新 |
| Guacamole 遠端桌面 | 原生 WebSocket | `/fireedge/guacamole` | VNC/SSH/RDP 連線 |
| Guacamole 外部區域 | 原生 WebSocket（proxy） | `/fireedge/external-guacamole` | Multi-Zone 遠端桌面 |

### 3.3 Hook 事件系統（Socket.IO）

**用途：** 當 VM、Host、Image、Network 的狀態發生變化時，即時推送更新到前端，不需要前端輪詢。

**Server 端：**

| 項目 | 說明 |
|------|------|
| 技術 | Socket.IO + ZeroMQ Subscriber |
| 路徑 | `/fireedge/websockets/hooks` |
| 認證 | JWT Token（從 FireedgeCookie 提取） |
| 事件來源 | ZeroMQ 訂閱 oned 的 Hook 事件 |
| 訂閱格式 | `EVENT {RESOURCE} {ID}`，例如 `EVENT VM 123` |

**流程：**

```
OpenNebula Daemon (oned)
    │
    ▼ ZeroMQ publish EVENT
FireEdge Server (hooks.js)
    │  zeromqSock.subscribe("EVENT VM 123")
    │  接收 XML → xml2json 轉換
    │
    ▼ Socket.IO emit('hooks', { command, data })
前端 React App (socket.js)
    │  socket.on('hooks', listener)
    │
    ▼ RTK Query updateCachedData()
前端 UI 自動更新
```

**前端程式碼位置：** `src/fireedge/src/modules/features/OneApi/socket.js`

```javascript
// 建立連線
const socket = createWebsocket(SOCKETS.HOOKS, { zone, resource, id })

// 監聽事件
socket.on('hooks', (data) => {
  updateCachedData((draft) => {
    // 更新 RTK Query cache 中的資源數據
  })
})
```

**使用此機制的前端模組：**

| 模組 | 檔案 | 訂閱的資源 |
|------|------|-----------|
| VM | `OneApi/vm.js` | VM 狀態變更（開機/關機/錯誤等） |
| Host | `OneApi/host.js` | Host 狀態變更（上線/離線等） |
| Image | `OneApi/image.js` | Image 狀態變更（就緒/鎖定等） |
| Network | `OneApi/network.js` | 虛擬網路狀態變更 |

**效果：** 當另一個管理員操作了某台 VM（例如關機），你的瀏覽器會即時看到狀態更新，不需要手動重新整理頁面。

### 3.4 Guacamole 遠端桌面（原生 WebSocket）

**用途：** 在瀏覽器中直接開啟 VM 的 VNC/SSH/RDP 連線，實現 Web Terminal。

**Server 端：**

| 項目 | 說明 |
|------|------|
| 技術 | `opennebula-guacamole` 套件 + 原生 WebSocket |
| 路徑 | `/fireedge/guacamole`（本地）、`/fireedge/external-guacamole`（跨區域） |
| 後端依賴 | guacd daemon（預設 localhost:4822） |
| 加密 | AES-256-CBC 加密連線參數 |

**連線建立流程：**

```
1. 前端呼叫 HTTP API 取得 token
   GET /api/vm/{id}/guacamole/{type}
       │
       ▼ Server 查詢 VM 資訊 + User SSH Key
       ▼ AES-256 加密連線設定
       ▼ 回傳 Base64 encoded token

2. 前端用 token 建立 WebSocket 連線
   ws://host/fireedge/guacamole?token=xxx
       │
       ▼ Server 解密 token，取得 VNC/SSH/RDP 設定
       ▼ 連接 guacd daemon (localhost:4822)
       ▼ guacd 建立到 VM 的 VNC/SSH/RDP 連線
       │
       ▼ WebSocket 雙向即時資料傳輸
   瀏覽器顯示遠端桌面 / SSH Terminal
```

**三種連線類型的參數來源：**

| 連線類型 | hostname 來源 | port | 認證方式 |
|---------|--------------|------|---------|
| VNC | VM HISTORY 最後一筆 HOSTNAME | GRAPHICS.PORT (預設 5900) | GRAPHICS.PASSWD |
| SSH | NIC.EXTERNAL_IP 或 NIC.IP | CONTEXT.SSH_PORT (預設 22) | User SSH Private Key 或 CONTEXT.USERNAME/PASSWORD |
| RDP | NIC.EXTERNAL_IP 或 NIC.IP | CONTEXT.RDP_PORT (預設 3389) | CONTEXT.USERNAME/PASSWORD |

**前端程式碼位置：**

| 檔案 | 功能 |
|------|------|
| `modules/features/Guacamole/slice.js` | Redux 狀態管理（連線狀態、token、縮圖） |
| `modules/features/Guacamole/hooks.js` | React Hooks（`useGuacamoleSession`） |
| `modules/components/Consoles/Guacamole/client.js` | WebSocket 客戶端核心 |

**Guacamole 連線狀態：**

```
IDLE → CONNECTING → WAITING → CONNECTED → DISCONNECTING → DISCONNECTED
                                             ↓
                                    CLIENT_ERROR / TUNNEL_ERROR
```

### 3.5 SSH Tunnel 支援

當 VM 位於內部網路、無法直接連線時，FireEdge 會自動建立 SSH Tunnel：

```
瀏覽器 ←WebSocket→ FireEdge Server ←SSH Tunnel→ VM (VNC/RDP port)
```

- 判斷條件：VM 設定了 `EXTERNAL_PORT_RANGE`
- 實作位置：`src/fireedge/src/server/utils/sshTunnel.js`
- Port 範圍：5900 ~ 65536

### 3.6 GPU 算力平台與 WebSocket 的關係

| 功能 | WebSocket 機制 | 重要性 |
|------|---------------|--------|
| VM 狀態即時更新 | Hook 事件 (Socket.IO) | 高 — 學生開 VM 後即時看到狀態變化 |
| Web SSH Terminal | Guacamole (原生 WS) | 中 — 可作為「一鍵連線」的備用方案 |
| VNC 遠端桌面 | Guacamole (原生 WS) | 低 — GPU 運算場景通常用 CLI 而非桌面 |

---

## 4. 三種通訊方式總覽

```
前端 React App (RTK Query)
    │
    ├── HTTP API ─────────────────────────────────────────────┐
    │   ├── XML-RPC 代理路由 (283 端點)                        │
    │   │   → 純轉發到 oned XML-RPC                           │
    │   │   → VM/Host/Template/User 等 CRUD                   │
    │   │   → 文件: xmlrpc-api.yml                            │
    │   │                                                     │
    │   └── 功能路由 (83 端點)                                  │
    │       → 自訂 handler 業務邏輯                             │
    │       → 檔案上傳、加密、OneFlow、設定檔                    │
    │       → 文件: one-api.yml                               │
    │                                                         │
    ├── WebSocket (Socket.IO) ────────────────────────────────┤
    │   └── Hook 事件訂閱                                      │
    │       → /fireedge/websockets/hooks                      │
    │       → 即時資源狀態更新 (VM/Host/Image/Network)          │
    │       → 文件: 無獨立 yml（見本文件）                       │
    │                                                         │
    └── WebSocket (原生) ─────────────────────────────────────┘
        └── Guacamole 遠端桌面
            → /fireedge/guacamole
            → VNC/SSH/RDP 連線
            → 文件: 無獨立 yml（見本文件）
```
