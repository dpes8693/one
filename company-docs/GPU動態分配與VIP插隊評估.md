# GPU 動態分配與 VIP 插隊機制評估

## 需求摘要

學校要求：
1. **行事曆排程**：後台人員在前端設定不同學生在不同時段可用的 GPU 算力
2. **動態分配**：GPU 資源能依時段動態調配給不同學生
3. **VIP 插隊**：緊急情況下，VIP 學生可以臨時插隊，優先取得 GPU 資源

---

## 現有 API 能力盤點

### 能用的（原生支援）

| 需求 | 現有 API | 能力說明 |
|------|---------|---------|
| 建立 GPU VM | `PUT /template/instantiate/:id` | 從 GPU Template 建立 VM，完全支援 |
| 開機/關機/暫停 | `PUT /vm/action/:id` | 支援 resume/suspend/poweroff/stop |
| 暫停 VM（釋放 CPU/RAM） | `PUT /vm/action/:id` body: `{action:"suspend"}` | 暫停 VM，GPU 仍被佔用但 CPU/RAM 釋放 |
| 恢復 VM | `PUT /vm/action/:id` body: `{action:"resume"}` | 從暫停恢復，秒級恢復 |
| 定時動作 | `POST /vm/schedadd/:id` | 可排程 suspend/resume/poweroff/terminate |
| 週期排程 | 同上，支援 PERIODIC 類型 | 每日/每週/每月/每 N 小時重複 |
| 使用者配額 | `PUT /user/quota/:id` | 限制 VM 數量、CPU、RAM 上限 |
| 群組配額 | `PUT /group/quota/:id` | 群組層級的資源上限 |
| 查看 GPU 使用狀態 | `GET /host/info/:id` | HOST_SHARE.PCI_DEVICES 含每張 GPU 的 VM_ID |
| 查看所有 VM 狀態 | `GET /vmpool/info?filter=-2` | 可篩選 state 取得運行中的 VM |
| 強制關機 | `PUT /vm/action/:id` body: `{action:"poweroff-hard"}` | 不等待 OS 回應直接關機 |
| 刪除 VM | `PUT /vm/action/:id` body: `{action:"terminate"}` | 完全釋放資源 |
| 排程限制 | VM Template 中設定 `SCHED_REQUIREMENTS` | 限制 VM 只跑在有特定 GPU 的 Host |

### 不能直接用的（需要自建）

| 需求 | 現有限制 | 原因 |
|------|---------|------|
| GPU 熱插拔 | PCI attach/detach 只能在 POWEROFF 狀態 | KVM 限制，GPU passthrough 不支援熱插拔 |
| VIP 自動搶占 | 無原生搶占機制 | OpenNebula 排程器無 preemption 功能 |
| 行事曆 UI | 無行事曆介面 | Sunstone 只有排程動作表單，無行事曆視圖 |
| GPU 時數計費 | 無 GPU 專屬計費 | Showback 只計算 CPU/RAM/磁碟，不含 GPU |
| 動態配額調整 | 配額是靜態設定 | 無法依時段自動切換配額 |
| 排程優先級 | 只有軟性排序 | 無法強制讓高優先級 VM 先取得資源 |

---

## 核心問題：GPU Passthrough 的限制

GPU 算力平台最大的架構限制是：

```
GPU Passthrough = 一張實體 GPU 只能分配給一台 VM
                  且只能在 VM 關機狀態下掛載/卸載
```

這意味著：
- **不能**在 VM 運行中動態增減 GPU
- **不能**像 CPU/RAM 那樣用配額百分比控制
- GPU 是「整張卡獨佔」的模式
- 要把 GPU 從 A 學生移給 B 學生，必須先**關掉 A 的 VM**

---

## 可行方案評估

### 方案一：時間分片 + Suspend/Resume（推薦）

**原理：** 不動態遷移 GPU，而是用「時間切換」控制誰的 VM 在跑。

```
時段 09:00-12:00：學生 A 的 GPU VM 運行
時段 12:00-15:00：學生 B 的 GPU VM 運行
VIP 插隊：暫停當前 VM → 啟動 VIP VM
```

**用到的現有 API：**

| 步驟 | API | 說明 |
|------|-----|------|
| 1. 預建所有學生的 GPU VM | `PUT /template/instantiate/:id` | 開學時批量建好，平時保持 POWEROFF |
| 2. 設定排程：時段開始時開機 | `POST /vm/schedadd/:id` body: `{action:"resume"}` | 週期排程，每個時段自動 resume |
| 3. 設定排程：時段結束時暫停 | `POST /vm/schedadd/:id` body: `{action:"suspend"}` | 週期排程，自動 suspend |
| 4. VIP 插隊：暫停當前 VM | `PUT /vm/action/:id` body: `{action:"suspend"}` | 即時暫停佔用 GPU 的 VM |
| 5. VIP 插隊：啟動 VIP VM | `PUT /vm/action/:id` body: `{action:"resume"}` | 即時恢復 VIP 的 VM |
| 6. VIP 結束：反向操作 | 同上 | 暫停 VIP VM，恢復原本的 VM |

**Suspend vs Poweroff 的選擇：**

| | Suspend | Poweroff |
|---|---------|----------|
| 恢復速度 | 秒級（記憶體保留） | 分鐘級（需要開機） |
| GPU 釋放 | **不釋放**（仍被佔用） | **釋放**（可分配給別人） |
| 學生體驗 | 恢復後繼續之前的工作 | 需要重新開機 |

**關鍵取捨：**
- 用 `suspend`：恢復快但 GPU 不釋放，插隊的 VIP 需要用**另一張 GPU**
- 用 `poweroff`：GPU 釋放但恢復慢，學生需要等開機
- 用 `stop`：狀態存到磁碟，GPU 釋放，恢復速度中等

**推薦策略：**
```
正常時段切換 → 用 poweroff（完全釋放 GPU，反正有排程時間緩衝）
VIP 緊急插隊 → 用 stop（釋放 GPU，且保留學生的工作狀態）
```

**現有 API 覆蓋率：100%** — 全部用現有 API 即可實現。

---

### 方案二：多 VM 池 + 配額控制

**原理：** 用不同的 Group 和 Quota 控制不同群組的資源上限。

```
普通班 Group → Quota: RUNNING_VMS=2, CPU=8
VIP Group    → Quota: RUNNING_VMS=5, CPU=20（優先保證資源）
```

**用到的現有 API：**

| 步驟 | API |
|------|-----|
| 建立群組 | `POST /group/allocate` |
| 設定群組配額 | `PUT /group/quota/:id` |
| 動態調整使用者配額 | `PUT /user/quota/:id` |
| 將學生加入/移出群組 | `POST /user/addgroup/:id` / `DELETE /user/delgroup/:id` |

**限制：** OpenNebula 配額不能直接控制 GPU 數量（只能控制 VM 數/CPU/RAM），所以需要間接控制——每個 GPU Template 綁定固定的 CPU/RAM，用 CPU 配額間接限制 GPU 使用。

**現有 API 覆蓋率：80%** — 配額調整靠 API，但時段切換需自建排程器。

---

### 方案三：自建調度引擎（最完整但工程量大）

**原理：** 在 OpenNebula 之上建一層調度服務，統一管理 GPU 分配。

```
┌────────────────────────────────────────┐
│  GPU 調度引擎（需自建）                   │
│                                        │
│  ┌──────────┐  ┌──────────┐            │
│  │ 行事曆    │  │ VIP 優先  │            │
│  │ 排程模組  │  │ 級隊列   │            │
│  └────┬─────┘  └────┬─────┘            │
│       └──────┬──────┘                  │
│              ▼                         │
│  ┌──────────────────────┐              │
│  │ 決策引擎              │              │
│  │ 1. 查詢 GPU 使用狀態   │              │
│  │ 2. 判斷是否需要搶占    │              │
│  │ 3. 執行 VM 動作       │              │
│  └──────────┬───────────┘              │
└─────────────┼──────────────────────────┘
              │ 呼叫現有 API
              ▼
┌─────────────────────────────────────────┐
│  OpenNebula API（現有 300+ 隻）           │
│                                         │
│  GET /hostpool/info      → 查 GPU 狀態   │
│  GET /vmpool/info        → 查誰在用       │
│  PUT /vm/action/:id      → suspend/resume│
│  PUT /user/quota/:id     → 調整配額       │
│  POST /vm/schedadd/:id   → 設定排程       │
└─────────────────────────────────────────┘
```

**調度引擎需自建的功能：**

| 功能 | 說明 | 呼叫的現有 API |
|------|------|---------------|
| GPU 資源總覽 | 聚合所有 Host 的 GPU 使用狀態 | `GET /hostpool/info` + `GET /host/info/:id` |
| 行事曆排程 | 前端行事曆 UI + 後端定時任務 | `POST /vm/schedadd/:id` 或自建 cron |
| VIP 插隊執行 | 找出佔用目標 GPU 的 VM → stop → 啟動 VIP VM | `GET /host/info/:id` → `PUT /vm/action/:id` |
| 插隊恢復 | VIP 結束後恢復原本的 VM | `PUT /vm/action/:id` body: `{action:"resume"}` |
| 配額動態調整 | 依時段調整使用者/群組配額 | `PUT /user/quota/:id` / `PUT /group/quota/:id` |

**現有 API 覆蓋率：70%** — API 夠用，但需自建調度邏輯和行事曆 UI。

---

## VIP 插隊具體實現流程

```
觸發：管理員在前端點擊「VIP 插隊」按鈕

步驟 1：查詢目標 GPU 目前被誰使用
  → GET /host/info/:hostId
  → 找到 PCI_DEVICES 中 CLASS=0300 的 GPU
  → 取得 VM_ID（目前佔用的 VM）

步驟 2：stop 佔用 GPU 的 VM（保留工作狀態，釋放 GPU）
  → PUT /vm/action/:vmId  body: { action: "stop" }
  → 等待 VM 狀態變為 STOPPED（WebSocket Hook 即時通知）

步驟 3：啟動 VIP 的 VM（已預建好，目前是 STOPPED/POWEROFF 狀態）
  → PUT /vm/action/:vipVmId  body: { action: "resume" }
  → 或 PUT /template/instantiate/:templateId（如果還沒建 VM）

步驟 4：VIP 結束後，反向操作
  → PUT /vm/action/:vipVmId  body: { action: "stop" }
  → PUT /vm/action/:vmId  body: { action: "resume" }

全程使用現有 API，不需要修改 OpenNebula 核心。
```

---

## 最終結論

### 能力評估表

| 需求 | 現有 API 支援度 | 需自建部分 |
|------|----------------|-----------|
| 建立/管理 GPU VM | 100% | 無 |
| 定時開機/關機（排程） | 100% | 無，用 `vm.schedadd` |
| 暫停/恢復 VM | 100% | 無，用 `vm.action` |
| 使用者配額控制 | 90% | GPU 數量需間接控制（用 CPU 配額） |
| 動態配額調整 | 80% | API 可用，需自建定時切換邏輯 |
| VIP 插隊（stop A → start B） | 90% | API 完整，需自建操作流程 UI |
| 行事曆 UI | 0% | 完全自建（OpenNebula 無此功能） |
| GPU 資源總覽看板 | 30% | API 可查，需自建聚合視圖 |
| GPU 時數統計 | 20% | Showback 不含 GPU，需自建 |

### 建議方案

**第一階段（用現有 API 即可）：**
1. 用 `vm.schedadd` 設定每台 GPU VM 的開機/關機排程
2. 用 `vm.action` 的 suspend/stop/resume 實現手動 VIP 插隊
3. 用 `user.quota` / `group.quota` 控制資源上限

**第二階段（需自建）：**
1. 建立**行事曆 UI**，讓管理員在日曆上拖放設定時段
2. 行事曆後端呼叫 `vm.schedadd` / `vm.scheddelete` 管理排程
3. 建立 **VIP 插隊按鈕**，後端串接 stop → resume 流程
4. 建立 **GPU 資源看板**，聚合 `hostpool/info` 的 PCI 裝置資訊

**第三階段（進階）：**
1. 自建 GPU 調度引擎，自動化插隊和恢復流程
2. GPU 時數統計與計費系統
3. 學生自助預約 GPU 時段

### 一句話結論

> **現有 300+ 隻 API 可以完成 VIP 插隊的核心操作（stop VM A → resume VM B），但「行事曆排程 UI」和「自動化調度邏輯」需要自建。API 是夠的，缺的是業務層。**
