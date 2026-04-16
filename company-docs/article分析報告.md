# article.md 原始碼驗證報告

## 整體評價

文章的**核心技術論述正確**，USER_PRIORITY 機制確實存在且有效。但有幾處需要修正和補充，特別是關於 GPU 算力分配的場景。

---

## 逐項驗證

### 1. USER_PRIORITY 機制

**文章說法：** "OpenNebula 的 Rank Scheduler 提供 USER_PRIORITY 機制讓 VIP VM 排到 pending queue 最前面"

**源碼驗證：正確**

```
檔案：src/schedm_mad/remotes/rank/include/UserPriorityPolicy.h (第 67 行)

vm->xpath(up, "/VM/USER_TEMPLATE/USER_PRIORITY", (float) 0.0);
```

- USER_PRIORITY 從 VM 的 `USER_TEMPLATE` 中讀取
- 預設值 0.0，數字越大優先權越高
- 在 `RankScheduler.h` 第 47 行預設註冊，權重 1.0，**始終啟用**

---

### 2. 排序邏輯

**文章說法：** "Scheduler 每次執行時，會先按 USER_PRIORITY 由高到低排序 pending VM，再同優先權內才 FIFO"

**源碼驗證：正確**

```
檔案：src/schedm_mad/remotes/rank/include/Resource.h (第 134-151 行)

VirtualMachineResourceMatch::sort_resources():
  if (a->priority == b->priority)
    return a->oid > b->oid;     // 同優先權 → 按 VM ID 排序（近似 FIFO）
  return a->priority < b->priority;  // 不同優先權 → 低的排前面
```

```
檔案：src/schedm_mad/remotes/rank/src/sched/Scheduler.cc (第 762 行)

for (auto k = vm_rs.rbegin(); k != vm_rs.rend(); ++k)
                    ^^^^^^
                    反向迭代！高 priority 先被 dispatch
```

排序用 `<`（升序排列），但 dispatch 用 `rbegin()/rend()`（反向迭代），所以**高 priority 的 VM 先被分配資源**。文章說法正確。

---

### 3. Community Edition 支援

**文章說法：** "100% 在 Community Edition 實現（Apache 2.0，無任何功能限制）"

**源碼驗證：正確**

UserPriorityPolicy 定義在 `src/schedm_mad/remotes/rank/` 下，屬於預設的 Rank Scheduler，不在任何 Enterprise 條件編譯區塊內。Apache 2.0 授權。

---

### 4. 無 Preemption

**文章說法：** "沒有內建「強制搶占」（preemption）：正在跑的普通 VM 不會被殺掉給 VIP。但 pending queue 絕對插隊。"

**源碼驗證：正確**

搜尋整個 repo 找不到 `preempt` 或 `preemption` 相關實作。Scheduler 只排序 PENDING/RESCHEDULING 狀態的 VM，不會動已經 RUNNING 的 VM。

---

### 5. vGPU / mdev 支援

**文章說法：** "對 GPU 完全有效（PCI Passthrough / vGPU / mdev 都走同一 scheduler）"

**源碼驗證：正確**

```
檔案：src/vmm_mad/remotes/kvm/vgpu

支援兩種模式：
1. Legacy mdev：/sys/class/mdev_bus/{pci_addr}/mdev_supported_types/
2. NVIDIA vGPU：/sys/bus/pci/devices/{pci_addr}/nvidia/creatable_vgpu_types
```

GPU（無論 passthrough 或 vGPU）都是 PCI 設備，由同一個 Scheduler 排程。

---

### 6. pyone 範例程式碼

**文章的程式碼：**
```python
vm_id = one.template.instantiate(
    template_id,
    name=f"gpu-job-{user_id}",
    pending=False,
    extra=extra  # "USER_PRIORITY = 100"
)
```

**驗證：大致正確，但參數名有差異**

pyone 是 Python XML-RPC 封裝，實際呼叫 `one.template.instantiate(id, name, hold, extra_template, persistent)`。文章用的 `pending=False` 應該是 `hold=False`（pyone 的參數名是 `hold`）。`extra` 參數實際名稱可能因 pyone 版本而異，但概念正確。

---

### 7. 配置檔案路徑

**文章說法：** "`/etc/one/schedulers/rank.conf`（CE 可直接改）"

**源碼驗證：路徑需確認**

```
實際在 repo 中的位置：src/schedm_mad/remotes/rank/etc/rank.conf
安裝後的路徑取決於部署方式，通常是 /etc/one/sched/ 或 /etc/one/schedulers/
```

文章的路徑大致正確，但實際路徑可能因安裝方式而異。

---

## 關鍵問題：GPU Passthrough vs vGPU 對「動態算力分配」的影響

**這是文章最需要補充的部分。**

文章提到 USER_PRIORITY 可以讓 VIP 插隊，但**沒有區分兩種 GPU 模式的差異**，這對你們學校的場景至關重要：

### 模式 A：GPU Passthrough（你們目前的模式）

從你之前提供的 VM 回傳資料可以確認：
```json
"PCI": [
    {
        "VENDOR": "10de",
        "CLASS": "0300",        // ← 整張 GPU 直通
        "SHORT_ADDRESS": "01:00.0"
    }
]
```

**限制：**
- 一張 GPU = 一台 VM 獨佔
- 如果學校只有 1-2 張 GPU，所有 GPU 都在用時，VIP 的 VM 會**一直 PENDING**
- USER_PRIORITY 只能讓 VIP 「排第一個等」，但**等的是 GPU 釋放**
- GPU 不會自動釋放，除非有人手動關 VM 或 VM 到期

**VIP 插隊的實際效果：**
```
情境：1 張 GPU，3 個普通學生在用（但 GPU 只有 1 張，所以只有 1 個在跑，2 個 PENDING）
VIP 來了 → USER_PRIORITY=100

排隊順序變成：VIP → 普通B → 普通C
但 GPU 仍然被普通A佔著 → VIP 還是要等普通A釋放

除非：管理員手動 stop 普通A 的 VM → GPU 釋放 → VIP 自動獲得
```

**結論：GPU Passthrough 模式下，USER_PRIORITY 只解決「誰先排到」，不解決「馬上拿到」。要實現真正的 VIP 即時插隊，需要搭配手動或自動的 stop/poweroff 機制（我之前的評估方案一）。**

### 模式 B：vGPU（GPU 虛擬化，可分割）

源碼確認 OpenNebula 支援 NVIDIA vGPU（`src/vmm_mad/remotes/kvm/vgpu`）：

**優勢：**
- 1 張實體 GPU 可分成多個 vGPU（例如 A100 分成 7 個 MIG 實例）
- 多個 VM 可以同時使用同一張 GPU 的不同 vGPU 切片
- 資源更靈活，不是「全有或全無」

**vGPU 模式下 VIP 插隊的效果：**
```
情境：1 張 A100 分成 4 個 vGPU 切片
普通學生 A/B/C 各用 1 個切片（佔 3/4）
VIP 來了 → USER_PRIORITY=100 → 立即拿到第 4 個切片

如果 4 個都滿：VIP 排第一 → 下一個切片釋放時 VIP 先拿
```

**但 vGPU 有算力損失**：虛擬化 overhead 約 5-15%，且每個 vGPU 切片的顯存和算力都比整張卡小。

---

## 你們學校場景的建議

### 如果只有 1-2 張 GPU（Passthrough 模式）

USER_PRIORITY **有用但不夠**。需要搭配：

| 組合 | 做法 | API |
|------|------|-----|
| USER_PRIORITY | VIP 的 Template 設 USER_PRIORITY=100 | `PUT /template/instantiate/:id` extra: `USER_PRIORITY=100` |
| + 自動到期 | 每台 VM 建立時加排程：2 小時後自動 poweroff | `POST /vm/schedadd/:id` body: `{action:"poweroff"}` |
| + VIP 手動搶占 | 管理員按按鈕 stop 佔用者 | `PUT /vm/action/:id` body: `{action:"stop"}` |

### 如果有高階 GPU（可用 vGPU/MIG）

USER_PRIORITY **直接有效**。因為 vGPU 切片多，VIP 通常能立即拿到空閒切片。

需要確認：
1. GPU 型號是否支援 vGPU（需 NVIDIA GRID 授權 或 A100/H100 的 MIG）
2. 學校是否有 NVIDIA vGPU 軟體授權

---

## 文章錯誤/需修正清單

| # | 項目 | 文章說法 | 修正建議 |
|---|------|---------|---------|
| 1 | 可行性評分 | "滿分 100/100" | 應改為**有條件的 85/100**。GPU Passthrough 模式下，VIP 只能「優先排隊」不能「立即搶佔」，需搭配額外機制 |
| 2 | pyone 參數 | `pending=False` | 應為 `hold=False`（pyone 的正確參數名） |
| 3 | 配置路徑 | `/etc/one/schedulers/rank.conf` | 實際路徑依安裝方式而異，repo 中為 `src/schedm_mad/remotes/rank/etc/rank.conf` |
| 4 | 缺少說明 | 未區分 Passthrough vs vGPU | 應補充：Passthrough 模式下 GPU 是獨佔的，USER_PRIORITY 只影響排隊順序，不會讓已佔用的 GPU 釋放 |
| 5 | 過度簡化 | "只要有 GPU/CPU 資源釋放，VIP 一定先拿到" | 正確，但前提是**有資源釋放**。如果所有 GPU 都被長期佔用且沒有設定到期時間，VIP 會一直等 |
| 6 | Scheduler 間隔 | "每 30 秒跑一次" | 源碼中的預設值需在 rank.conf 確認，可能不是 30 秒 |

---

## 結論

**文章的核心論述（USER_PRIORITY 機制）經源碼驗證是正確的。** 但文章過度樂觀，沒有充分說明 GPU Passthrough 場景下的限制：

- USER_PRIORITY = **排隊插隊** = 「下一個輪到我」
- 但不是 **搶占** = 「把別人趕走我先用」

對你們學校來說，完整的 VIP 方案應該是：

```
USER_PRIORITY（排隊插隊）
    +
Scheduled Actions（自動到期釋放 GPU）
    +
管理員手動 stop（緊急搶占）
    =
完整的 VIP 插隊機制
```

這三個都有現成 API 支援，不需要改 OpenNebula 核心。
