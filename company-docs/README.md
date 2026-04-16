# gpu-opennubula-api

api yml spec

# OneApi 與 OneFlow Server API 對照文件

本文件根據官方文件整理：

- https://docs.opennebula.io/7.0/product/integration_references/system_interfaces/appflow_api/

並對照本專案 FireEdge 的 OneApi 實作，說明 OneFlow (Service / Service Template) 在前端 `oneApi` 的呼叫方式與後端路由映射。

## 1. 範圍與定位

- OneFlow Server API 是 OpenNebula 的 REST 介面，用來管理服務 (Service) 與服務模板 (Service Template)。
- FireEdge 的 OneApi 透過 RTK Query 封裝呼叫，實際後端入口在 `.../api`。
- 在本專案中，相關模組主要是：
  - `src/fireedge/src/modules/features/OneApi/service.js`
  - `src/fireedge/src/modules/features/OneApi/serviceTemplate.js`

## 2. 認證與回應碼 (依官方頁面)

### 認證

OneFlow API 採用 HTTP Basic Auth。官方範例：

```bash
curl -u "username:password" https://oneflow.server
```

在 FireEdge 中，請求會先經過 API entrypoint 的 session/zone 驗證，再轉送到對應 action。

### 常見 HTTP 狀態碼

- `200 OK`：查詢成功
- `201 Created`：建立成功
- `202 Accepted`：已接受處理
- `204 No Content`：成功但無回應內容
- `400 Bad Request`：參數或語法錯誤
- `401 Unauthorized`：認證失敗
- `403 Forbidden`：授權不足
- `404 Not Found`：資源不存在
- `500 Internal Server Error`：伺服器內部錯誤
- `501 Not Implemented`：不支援的方法

## 3. FireEdge API 入口與路由組裝

- API 掛載位置：`src/fireedge/src/server/index.js`
  - `app.use(`${basename}/api`, entrypointApi)`
- OneFlow 路由彙整：`src/fireedge/src/server/routes/api/oneflow/index.js`
- Service 路由定義：`src/fireedge/src/server/routes/api/oneflow/service/routes.js`
- Service Template 路由定義：`src/fireedge/src/server/routes/api/oneflow/template/routes.js`

## 4. OneFlow API 與專案端點對照

注意：官方文件是 OneFlow 原生路徑 (如 `/service/<id>`)，本專案 FireEdge 在同語意下採用自己的 API 路徑設計。

### 4.1 Service

| 用途              | 官方 OneFlow API (7.0)                  | FireEdge 路由 (本專案)                    |
| ----------------- | --------------------------------------- | ----------------------------------------- |
| 列出服務          | `GET /service`                          | `GET /service/:id?` (不給 `id` 即為 list) |
| 查詢單一服務      | `GET /service/<id>`                     | `GET /service/:id?`                       |
| 刪除服務          | `DELETE /service/<id>`                  | `DELETE /service/:id`                     |
| 對服務執行 action | `POST /service/<id>/action`             | `POST /service/action/:id`                |
| 服務縮放          | `POST /service/<id>/scale`              | `POST /service/:id/scale`                 |
| 對角色執行 action | `POST /service/<id>/role/<name>/action` | `POST /service/:id/role/:role/action`     |
| 動態加/減角色     | `POST /service/<id>/role_action`        | `POST /service/:id/role_action`           |

額外提供 (本專案)：

- `POST /service/sched_action/:id`：新增排程動作
- `PUT /service/sched_action/:id/:id_sched`：更新排程動作
- `DELETE /service/sched_action/:id/:id_sched`：刪除排程動作

### 4.2 Service Template

| 用途                                        | 官方 OneFlow API (7.0)               | FireEdge 路由 (本專案)              |
| ------------------------------------------- | ------------------------------------ | ----------------------------------- |
| 列出模板                                    | `GET /service_template`              | `GET /service_template/:id?`        |
| 查詢單一模板                                | `GET /service_template/<id>`         | `GET /service_template/:id?`        |
| 建立模板                                    | `POST /service_template`             | `POST /service_template`            |
| 更新模板                                    | `PUT /service_template/<id>`         | `PUT /service_template/:id`         |
| 刪除模板                                    | `DELETE /service_template/<id>`      | `DELETE /service_template/:id`      |
| 模板動作 (instantiate/chown/chgrp/chmod...) | `POST /service_template/<id>/action` | `POST /service_template/action/:id` |

## 5. OneApi 模組中的實際 hook

### Service (`service.js`)

查詢：

- `useGetServicesQuery`
- `useGetServiceQuery`

操作：

- `useRemoveServiceMutation`
- `useChangeServiceOwnerMutation`
- `useRecoverServiceMutation`
- `useServiceAddRoleMutation`
- `useServiceScaleRoleMutation`
- `useServiceRoleActionMutation`
- `useAddServiceSchedActionMutation`
- `useUpdateServiceSchedActionMutation`
- `useDeleteServiceSchedActionMutation`

### Service Template (`serviceTemplate.js`)

查詢：

- `useGetServiceTemplatesQuery`
- `useGetServiceTemplateQuery`

操作：

- `useCreateServiceTemplateMutation`
- `useUpdateServiceTemplateMutation`
- `useRemoveServiceTemplateMutation`
- `useDeployServiceTemplateMutation`
- `useChangeServiceTemplatePermissionsMutation`
- `useChangeServiceTemplateOwnershipMutation`
- `useRenameServiceTemplateMutation`

## 6. OneFlow 資料模型重點 (官方摘要)

### Service 重要欄位

- `name`：服務名稱
- `deployment`：部署策略 (`none` / `straight`)
- `shutdown_action`：關機行為
- `ready_status_gate`：是否以 READY gate 判定運行
- `on_hold`：是否先建立為 HOLD
- `networks`、`user_inputs`
- `roles[]`：角色陣列 (必要)

### Role 重要欄位

- `name`：角色名稱
- `type`：`vm` 或 `vr`
- `template_id`：VM Template ID
- `cardinality`：預設 VM 數量
- `parents[]`：角色依賴
- `min_vms` / `max_vms` / `cooldown`
- `elasticity_policies[]` / `scheduled_policies[]`

## 7. 使用建議

- 需要「平台標準語意」時，先參考官方 OneFlow 文件。
- 需要「在 FireEdge 實際怎麼打 API」時，以本 repo 的 `server/routes/api/oneflow/*/routes.js` 為準。
- 前端功能開發請優先使用 `service.js`、`serviceTemplate.js` 已封裝的 hooks，避免直接手刻 request。

## 8. 來源

- 官方 OneFlow Server API 文件：
  - https://docs.opennebula.io/7.0/product/integration_references/system_interfaces/appflow_api/
