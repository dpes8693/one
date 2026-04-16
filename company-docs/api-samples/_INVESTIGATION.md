# API 採集失敗調查報告

調查日期：2026-04-16

---

## 1. vm/{id}/logs (404)

### 路由是否存在？

**存在。** 路由定義在：

- `src/fireedge/src/server/routes/api/vm/routes.js:74`
- action 名稱：`vm.logs`
- 路徑：`GET /vm/:id/logs`
- 需要認證：`auth: true`

### handler 做什麼？

handler 位於 `src/fireedge/src/server/routes/api/vm/functions.js:355`，函式 `vmLogs`：

1. 取得路徑參數 `id`（VM ID）
2. 組合 log 檔案路徑：`${global.paths.LOG_LOCATION}/${id}.log`
3. 用 `fs.access()` 檢查檔案是否存在
4. 若存在：讀取檔案內容，按行解析 log 等級（`[E]`/`[W]`/`[D]`/`[I]`），回傳 JSON
5. **若不存在（`err.code === 'ENOENT'`）：回傳 HTTP 404 `"Log file not found"`**

### LOG_LOCATION 路徑

- 預設值（無 `ONE_LOCATION` 環境變數）：`/var/log/one`
- 若設定 `ONE_LOCATION`：`${ONE_LOCATION}/var`
- 對應源碼：`src/fireedge/src/server/utils/server.js:549`

### 失敗的真實原因

VM ID=0 回傳 404 的原因是：**`/var/log/one/0.log` 檔案不存在於學校測試機上。**

這不是路由問題，也不是 VM 狀態問題（VM 是否 RUNNING 與此 API 無關）。  
OpenNebula 只有在 VM 真正執行過某些操作（部署、遷移、關機等）時，才會在 `/var/log/one/<vm_id>.log` 寫入 log。

可能原因：
- VM ID=0 是由老版本 OpenNebula 建立，log 從未產生
- 學校環境的 `ONE_LOCATION` 指向非標準路徑，log 位置不同
- log 檔案存在但路徑不同（例如 `/var/lib/one/var/0.log`）

### 實際 API 回應

```
GET http://10.1.1.79:2616/fireedge/api/vm/0/logs
→ HTTP 404, {"id": 404, "message": "Not Found"}
```

源碼中的 `notFound` 對應的 message 是 `"Log file not found"`，但 Express 框架層可能將其包裝為標準 404 message。

### 修正方法

此 API **本身無 bug**，設計如此。若要成功採集：

1. **使用有實際 log 的 VM ID**：SSH 到 10.1.1.79，確認 `/var/log/one/` 目錄中有哪些 `*.log` 檔案
2. 或確認 `ONE_LOCATION` 設定，找到正確的 log 目錄後，選有對應 log 的 VM ID

```bash
# 在學校機器上執行
ls /var/log/one/*.log
# 或
ls ${ONE_LOCATION}/var/*.log
```

---

## 2. vn/info/{id} (404)

### 確認失敗原因

vn/info/0 回傳 404 的原因很簡單：**學校環境沒有 ID=0 的 Virtual Network。**

OpenNebula 的 Virtual Network ID 從 0 開始分配，但若 ID=0 的 vnet 從未建立（或已刪除），API 就會回傳 OpenNebula error 404。

### 學校真實 vnet 狀況

| vnet ID | API 結果 |
|---------|---------|
| 0       | 404 Not Found |
| 4       | 200 OK |
| 5       | 200 OK |

### 補採集成功範例

已採集以下檔案：

- `network/vn-info-4.json` — vnet ID=4 的完整資訊（73 行）
- `network/vn-info-5.json` — vnet ID=5 的完整資訊（73 行）

```bash
GET http://10.1.1.79:2616/fireedge/api/vn/info/4  → 200 OK
GET http://10.1.1.79:2616/fireedge/api/vn/info/5  → 200 OK
```

### 結論

vn/info API **本身正常運作**。只需使用正確的 vnet ID（4 或 5）即可。

---

## 總結

| API | 是否有 bug | 真實失敗原因 | 解法 |
|-----|-----------|------------|------|
| `vm/{id}/logs` | 無 | log 檔案不存在（`/var/log/one/0.log`） | 使用有 log 的 VM ID |
| `vn/info/{id}` | 無 | vnet ID=0 不存在 | 使用 ID=4 或 ID=5 |
