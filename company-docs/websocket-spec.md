# FireEdge WebSocket 規格文件

> 實測環境：OpenNebula 7.0.1 FireEdge，URL: http://10.1.1.79:2616
> 實測日期：2026-04-16
> 源碼版本：master（7.3.80）

---

## 一、連線資訊

### Socket.IO 伺服器位置

| 項目 | 值 |
|------|-----|
| Server URL | `http://10.1.1.79:2616` |
| Socket.IO path | `/fireedge/websockets/hooks` |
| 支援 transport | `websocket`（優先），`polling`（備用） |
| Socket.IO 協議版本 | EIO=4（Socket.IO v4） |

### 認證方式（重要）

**實測結果**：伺服器上部署的版本（7.0.1）認證方式與最新源碼不同。

#### 實測有效：query parameter 帶 token

```
ws://10.1.1.79:2616/fireedge/websockets/hooks?resource=VM&id=0&zone=0&token=<JWT>
```

伺服器端 `validateAuthWebsocket` 從 `server.handshake.query.token` 取 token，
再用 `validateAuth({ headers: { authorization: token } })` 驗證（Bearer token 格式）。

#### 最新源碼版本：cookie 認證

新版（源碼 master）改為從 HTTP cookie `FireedgeToken` 取 token，
cookie 格式：`FireedgeToken=<encodeURIComponent(JSON.stringify({token: JWT}))>`

#### JWT Token 格式

登入 API：`POST /fireedge/api/auth/`，body `{ user, token(password) }`

JWT payload：
```json
{
  "iss": "<zone_id>",
  "aud": "<username>:<opennebula_token>",
  "jti": "<opennebula_session_token>"
}
```

---

## 二、Hook 事件（資源狀態變化）

### 訂閱流程（必要前置步驟）

**重要**：WebSocket 連線前，必須先透過 REST API 取得資源詳情，才能通過伺服器端的 `middlewareValidateResourceForHookConnection` 驗證。

```
步驟1：GET /fireedge/api/vm/info/:id
        （觸發伺服器端 fillResourceforHookConnection，記錄 global.users[username].resourcesHooks["vm"] = id）

步驟2：連線 Socket.IO，query 帶 { resource: 'VM', id: ':id', zone: '0', token: JWT }
```

若省略步驟1，Socket.IO 連線時會被伺服器靜默踢掉（`server.disconnect(true)`），且 client 不會收到明確錯誤。

### 訂閱 query 參數

| 參數 | 類型 | 說明 |
|------|------|------|
| `resource` | string | 資源類型：`VM`、`HOST`、`IMAGE`、`NET` |
| `id` | string/number | 資源 ID（必須與步驟1呼叫的 ID 相同） |
| `zone` | string | Zone ID，通常為 `"0"` |
| `token` | string | JWT token（舊版認證方式） |

### 伺服器端訂閱機制

伺服器收到連線後，訂閱 ZeroMQ（`tcp://<oned_host>:2101`）：

```javascript
zeromqSock.subscribe(`EVENT ${resource.toUpperCase()} ${id}`)
// 例：EVENT VM 0
```

ZeroMQ 訊息格式（base64 encoded XML）：

```
[命令 topic]  →  EVENT VM 0
[base64 XML]  →  base64(<?xml version="1.0" ... >)
```

伺服器 decode 後轉成 JSON，以 `type` 名稱（即 filename，`hooks`）emit 給 client：

```javascript
server.emit('hooks', { command: 'EVENT VM 0', data: <parsed_xml_json> })
```

### 事件 payload 結構（源碼推導）

事件名稱：`hooks`

```javascript
// 監聽方式
socket.on('hooks', (payload) => { ... })

// payload 結構
{
  command: "EVENT VM 0",   // ZeroMQ topic
  data: {
    HOOK_MESSAGE: {
      HOOK_TYPE: "STATE",       // 事件類型
      HOOK_OBJECT: "VM",        // 資源類型
      STATE: "3",               // VM state 數字
      LCM_STATE: "3",           // LCM state（VM 專用）
      REMOTE_HOST: "...",       // 執行主機（可選）
      RESOURCE_ID: "0",         // 資源 ID
      VM: { ... }               // 完整 VM 物件（XML 轉 JSON）
    }
  }
}
```

#### 支援的資源類型

| HOOK_OBJECT | 訂閱 resource | VM 物件 key |
|------------|---------------|------------|
| `VM`       | `VM`          | `VM`       |
| `HOST`     | `HOST`        | `HOST`     |
| `IMAGE`    | `IMAGE`       | `IMAGE`    |
| `VNET`     | `NET`         | `NET`（特殊：NET 對應 VNET） |

#### VM STATE 對照表

| STATE | 說明 |
|-------|------|
| 0 | INIT |
| 1 | PENDING |
| 2 | HOLD |
| 3 | ACTIVE |
| 4 | STOPPED |
| 5 | SUSPENDED |
| 6 | DONE |
| 8 | POWEROFF |
| 9 | UNDEPLOYED |
| 10 | CLONING |
| 11 | CLONING_FAILURE |

#### VM LCM_STATE（STATE=3 ACTIVE 下）

| LCM_STATE | 說明 |
|-----------|------|
| 0 | LCM_INIT |
| 1 | PROLOG |
| 3 | RUNNING |
| 4 | MIGRATE |
| 5 | SAVE_STOP |
| 12 | EPILOG |
| 14 | FAILURE |

---

## 三、實測結果

### 連線測試

| 測試項目 | 結果 |
|---------|------|
| HTTP polling 初始握手 | **成功**（回傳 SID） |
| WebSocket upgrade | **成功** |
| query token 認證 | **成功**（Socket.ID 分配，進入 `connect` 事件） |
| cookie 認證（新版格式）| **失敗**（401 Unauthorized，格式不符） |
| resourcesHooks 驗證 | **成功**（先呼叫 vm/info 後，連線不被踢掉） |

### 事件採集結果

| 觸發方式 | 是否收到 hooks 事件 |
|---------|-------------------|
| VM rename（可逆操作） | **未收到** |
| 等待 monitoring 週期（31 秒間隔 x 3） | **未收到** |
| 等待 90 秒 | **未收到** |

### 分析與可能原因

**WebSocket 連線層：正常**
- Socket.IO 連線建立成功
- 認證通過（query token 方式）
- resourcesHooks 驗證通過

**事件未接收的可能原因**：

1. **OpenNebula Hook Pool 為空**：
   呼叫 `GET /fireedge/api/hookpool/info` 回傳 `{"HOOK_POOL":""}` — 確認未設定任何 OpenNebula Hook。
   ZeroMQ publisher 只在 Hook 被觸發時發布 `EVENT` 訊息，沒有 Hook 就沒有事件。

2. **rename 操作不觸發 Hook**：
   OpenNebula Hook 主要在 STATE 轉換時觸發（開機、關機、遷移等），rename 屬於元數據修改，不觸發狀態 Hook。

3. **monitoring 事件格式可能不同**：
   `LAST_POLL` 每 31 秒更新（monitoring 有在運作），但 monitoring 資料可能透過不同 ZeroMQ topic 發布，不符合 `EVENT VM 0` 的訂閱格式。

### 建議觸發事件的方式

若要實際採集 hooks payload，需要：
1. 在 OpenNebula 中設定 STATE Hook（oned.conf 或透過 API）
2. 觸發 VM 狀態轉換（poweroff → resume，或 suspend → resume 等）
3. 這需要 OpenNebula 管理員權限設定，或在測試 VM 上操作

---

## 四、前端使用方式（源碼）

### socket.js 關鍵邏輯

```javascript
// src/fireedge/src/modules/features/OneApi/socket.js

// 建立 socket
const createWebsocket = (path, query) =>
  socketIO({
    path: `${WEBSOCKET_URL}/${path}`,  // /fireedge/websockets/hooks
    query,                              // { zone, resource, id }
    autoConnect: false,
    timeout: 10_000,
    reconnectionAttempts: 5,
  })

// UpdateFromSocket：RTK Query 的 onCacheEntryAdded 回調
// 在 getVm / getHost 等查詢時自動訂閱 WebSocket
const UpdateFromSocket = ({ updateQueryData, resource, rtkResources }) =>
  async ({ id }, { cacheEntryRemoved, cacheDataLoaded, updateCachedData, getState, dispatch }) => {
    const { zone } = getState().general
    const query = { zone, resource, id }
    const socket = createWebsocket(SOCKETS.HOOKS, query)

    await cacheDataLoaded
    socket.on(SOCKETS.HOOKS, listener)  // 監聽 'hooks' 事件
    socket.open()
    await cacheEntryRemoved
    socket.close()
  }
```

### 更新資料流

```
ZeroMQ EVENT → FireEdge Server → Socket.IO 'hooks' → 
  getResourceValueFromEventState(data) →
  HOOK_MESSAGE.HOOK_OBJECT (VM/HOST/IMAGE/NET) →
  updateResourceOnPool({ id, resourceFromQuery: value }) →
  dispatch(updateQueryData(...))  → Redux store 更新
```

---

## 五、Guacamole（遠端桌面）

> 我們的 GPU 算力平台不需要此功能（學生用 SSH，不用圖形桌面）。

### 連線資訊（源碼整理）

| 項目 | 值 |
|------|-----|
| Socket.IO path | `/fireedge/websockets/guacamole` |
| 事件名稱 | `guacamole` |
| 前置 API | `GET /fireedge/api/vm/:id/guacamole/:type?zone=:zone` |
| type | `vnc`、`rdp`、`ssh` |

### 流程

1. 呼叫 `GET /fireedge/api/vm/:id/guacamole/vnc` 取得 Guacamole token
2. 用 Guacamole token 連線 Socket.IO，並指定 VM ID

### 外部 Guacamole

若使用外部 Guacamole 服務（非 FireEdge 內建），透過 HTTP upgrade 直接 proxy：
- endpoint: `endpointExternalGuacamole`（設定檔中指定）

---

## 六、採集腳本位置

採集腳本：`/Users/rich/Documents/GitHub/one/company-docs/api-samples/_collect_ws.js`

執行方式：
```bash
# 確保 socket.io-client 已安裝
cd /tmp && npm install socket.io-client@4

# 先登入取得 token
bash /Users/rich/Documents/GitHub/one/company-docs/api-samples/_login.sh

# 執行採集（連線 30 秒後自動結束）
cd /tmp && NODE_PATH=/tmp/node_modules node \
  /Users/rich/Documents/GitHub/one/company-docs/api-samples/_collect_ws.js
```

---

## 七、給開發者的結論

### WebSocket 連線成功，但需 Hook 設定才有事件

| 問題 | 解法 |
|------|------|
| 認證格式（舊版 vs 新版）| 用 query.token（舊版）或 cookie（新版）|
| resourcesHooks 未設定 → 連線被踢 | 先呼叫對應資源的 info API |
| 無事件接收 | OpenNebula 需要設定 Hook，或等真實 VM 狀態變化 |

### 對 GPU 算力平台的建議

我們的平台主要需要偵測 VM 從 PENDING → ACTIVE（開機完成），建議：

1. **不使用 WebSocket polling 方式**：改用 REST API 定期輪詢（每 5 秒呼叫 `vm/info/:id`）
2. **或設定 OpenNebula Hook**：在 oned.conf 設定 `VM STATE` hook，確保 ZeroMQ 有發布事件
3. WebSocket 主要適合需要即時更新的管理介面（Sunstone），對學生平台用 polling 已足夠
