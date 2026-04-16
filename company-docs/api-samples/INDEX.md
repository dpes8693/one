# API Samples 索引

學校環境（10.1.1.79）真實採集的 OpenNebula FireEdge API Response 範例。

**採集日期：** 2026-04-16
**環境：** **學校測試機**（10.1.1.79），OpenNebula 7.x，1 台 KVM Host，1 張 RTX 4070 Ti，1 個 VM

> ⚠️ **重要：這是測試環境，非未來正式環境**
> - 測試機只有 1 張消費級 RTX 4070 Ti（不支援 vGPU/MIG）
> - 正式環境 GPU 規格、數量、Host 配置可能完全不同
> - 本範例用途：**驗證 API 結構與資料格式**，不是規劃資源容量
> - GPU 平台架構設計時，假設要支援多 GPU、多 Host、可能含 A100/H100 等資料中心級卡

---

## 認證方式（重要）

學校環境的 FireEdge **不使用 cookie**，要用 Bearer Token：

```bash
# 1. 登入取得 token（密碼存在 env/test-pc.md，已 gitignore）
source <(grep '^OPENNEBULA_' env/test-pc.md)  # 載入 USER/PASS
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"user\":\"$OPENNEBULA_USER\",\"token\":\"$OPENNEBULA_PASS\"}" \
  http://10.1.1.79:2616/fireedge/api/auth/ | jq -r '.data.token')

# 2. 之後所有請求帶 Authorization header
curl -H "Authorization: Bearer $TOKEN" \
  http://10.1.1.79:2616/fireedge/api/vm/info/0
```

> 註：Sunstone 前端用 `withCredentials: true` 走 cookie，但 server set-cookie 在這個環境沒生效。實測直接用 Bearer Token 可成功，且程式碼路徑也支援。

---

## 重大發現

### 1. OpenNebula 原生支援 GPU 監控（不用 DCGM！）

`vm/info/:id` 回傳的 `MONITORING` 欄位直接含 GPU 資料：

```json
{
  "GPU_COUNT": "1",
  "GPU_MEMORY_FREE": "11885.0",
  "GPU_MEMORY_UTILIZATION": "0.0",
  "GPU_POWER_USAGE": "0.0",
  "GPU_UTILIZATION": "0.0",
  "GPU_UTILIZATION_FORECAST": "0.0"  // 還有 ML 預測欄位
}
```

**影響：** 之前文件說「需自建 DCGM exporter」是錯的。GPU 監控可直接從現有 API 拿，不用部署任何額外服務。

### 2. PCI/NUMA 位於 HOST_SHARE 而非 TEMPLATE

之前 `xmlrpc-api.yml` 說「`HOST_SHARE.PCI_DEVICES`」是對的，但要強調：
- `HOST.HOST_SHARE.PCI_DEVICES.PCI[]` — Host 上的 GPU 列表
- `HOST.HOST_SHARE.NUMA_NODES.NODE[]` — NUMA 拓撲
- `VM.TEMPLATE.PCI[]` — VM 配置的 PCI（只是請求，實際 GPU 在 HOST_SHARE）

### 3. PCI_DEVICES 含人類可讀資訊

```json
{
  "VENDOR": "10de",
  "VENDOR_NAME": "NVIDIA Corporation",       // ← 不用自己對照 vendor ID 表
  "DEVICE": "2782",
  "DEVICE_NAME": "NVIDIA Corporation AD104 [GeForce RTX 4070 Ti]",  // ← 完整型號
  "CLASS": "0300",
  "CLASS_NAME": "VGA compatible controller",
  "VMID": "0"  // ← 哪台 VM 在用，-1 表示空閒
}
```

GPU 資源看板可直接渲染這些欄位。

### 4. SSH IP 取得問題確認

DHCP 模式下 IP 取不到的原因：
- VM 用 `lan-dhcp-onebr3` 網路（ETHER 類型，不分配 IP）
- `MONITORING` 欄位**沒有** ETH0_IP（QEMU Guest Agent 是 disabled）
- VM info 的 `VM_QEMU_PING: "QEMU Guest Agent monitoring disabled"`

**解法：**
1. **改用固定 IP**：用 `vxlan-private` 網路（172.16.10.0/24，IP4 類型），IP 會出現在 NIC 欄位
2. **啟用 QEMU Guest Agent**：在 VM 內安裝 `qemu-guest-agent`，IP 就會出現在 MONITORING

### 5. GPU Template 有 SSH key bug

`Template ID=1 (Ubuntu 2404-GPU)` 的 SSH_PUBLIC_KEY 是硬寫的 root key，不是動態 `$USER[SSH_PUBLIC_KEY]`。學生無法用自己的 key 登入。

**修正方向：** 自建微服務在建 Template 時要設成 `"$USER[SSH_PUBLIC_KEY]"`，並且學生帳號的 USER_TEMPLATE 要寫入 `SSH_PUBLIC_KEY`。

---

## 學校測試機環境快照

> ⚠️ 以下是**測試機**現況，正式環境會有差異。這份快照只用來理解資料結構，不能用來規劃容量。

| 項目 | 數量/狀態 |
|------|----------|
| Host | 1 台（10.1.1.79，**測試機**） |
| GPU | 1 張 NVIDIA RTX 4070 Ti（消費級，**不支援 vGPU/MIG**；正式環境可能不同） |
| VM | 1 台（Ubuntu 2404-GPU -0，RUNNING） |
| Template | 2 個（Ubuntu 24.04 普通版 + GPU 版） |
| Image | 1 個（Ubuntu 24.04） |
| Network | 2 個（DHCP bridge + vxlan-private） |
| User | 預設帳號（oneadmin） |
| Group | 2 個預設群組（oneadmin、users） |
| Cluster | 預設 1 個 |
| ACL | 待確認 |
| Marketplace App | 126 個（內建） |
| VDC | 待確認 |
| 配額 | 全部無限制（未設） |

---

## 檔案索引

### VM / VMPool（vm/）

| 檔案 | API | 用途 |
|------|-----|------|
| [vmpool-info.json](vm/vmpool-info.json) | `GET /vmpool/info?filter=-2` | 基本 VM 列表 |
| [vmpool-info-paginated.json](vm/vmpool-info-paginated.json) | `GET /vmpool/info/paginated?extended=1&filter=-2&pageSize=200` | 分頁列表（前端常用） |
| [vmpool-infoextended.json](vm/vmpool-infoextended.json) | `GET /vmpool/infoextended?filter=-2` | 擴展列表 |
| [vm-info-0.json](vm/vm-info-0.json) | `GET /vm/info/0` | **VM 詳情（最重要，含 GPU MONITORING）** |
| [vm-monitoring-0.json](vm/vm-monitoring-0.json) | `GET /vm/monitoring/0` | VM 歷史監控（2.1 MB，時序資料） |
| [vmpool-monitoring.json](vm/vmpool-monitoring.json) | `GET /vmpool/monitoring?filter=-2` | 所有 VM 監控 |
| [vmpool-accounting.json](vm/vmpool-accounting.json) | `GET /vmpool/accounting?filter=-2` | 帳務紀錄（300 KB） |

### Host / Cluster（host/）

| 檔案 | API | 用途 |
|------|-----|------|
| [hostpool-info.json](host/hostpool-info.json) | `GET /hostpool/info` | Host 列表 |
| [host-info-0.json](host/host-info-0.json) | `GET /host/info/0` | **Host 詳情（含 PCI_DEVICES，GPU 看板來源）** |
| [host-monitoring-0.json](host/host-monitoring-0.json) | `GET /host/monitoring/0` | Host 歷史監控 |
| [hostpool-monitoring.json](host/hostpool-monitoring.json) | `GET /hostpool/monitoring` | 所有 Host 監控 |
| [hostpool-admininfo.json](host/hostpool-admininfo.json) | `GET /hostpool/admininfo` | 管理員視角 |
| [clusterpool-info.json](host/clusterpool-info.json) | `GET /clusterpool/info` | 叢集列表 |
| [cluster-info-0.json](host/cluster-info-0.json) | `GET /cluster/info/0` | 叢集詳情 |
| [cluster-admininfo-0.json](host/cluster-admininfo-0.json) | `GET /cluster/admininfo/0` | 叢集管理資訊 |

### Template（template/）

| 檔案 | API | 用途 |
|------|-----|------|
| [templatepool-info.json](template/templatepool-info.json) | `GET /templatepool/info?filter=-2` | Template 列表 |
| [template-info-0-extended.json](template/template-info-0-extended.json) | `GET /template/info/0?extended=true` | Ubuntu 24.04 普通版 |
| [template-info-1-extended.json](template/template-info-1-extended.json) | `GET /template/info/1?extended=true` | **GPU Template（學校的 GPU 範本）** |

### Storage（storage/）

| 檔案 | API | 用途 |
|------|-----|------|
| [datastorepool-info.json](storage/datastorepool-info.json) | `GET /datastorepool/info` | Datastore 列表 |
| [datastore-info-0.json](storage/datastore-info-0.json) | `GET /datastore/info/0` | Datastore 詳情 |
| [imagepool-info.json](storage/imagepool-info.json) | `GET /imagepool/info?filter=-2` | Image 列表 |
| [image-info-0.json](storage/image-info-0.json) | `GET /image/info/0` | Image 詳情 |

### Network（network/）

| 檔案 | API | 用途 |
|------|-----|------|
| [vnpool-info.json](network/vnpool-info.json) | `GET /vnpool/info?filter=-2` | 虛擬網路列表 |
| [vntemplatepool-info.json](network/vntemplatepool-info.json) | `GET /vntemplatepool/info?filter=-2` | 網路範本列表（空）|

### User / Group（user/, group/）

| 檔案 | API | 用途 |
|------|-----|------|
| [userpool-info.json](user/userpool-info.json) | `GET /userpool/info` | 使用者列表 |
| [user-info-oneadmin.json](user/user-info-oneadmin.json) | `GET /user/info/0` | oneadmin 詳情（含配額）|
| [userquota-info.json](user/userquota-info.json) | `GET /userquota/info` | 預設使用者配額 |
| [grouppool-info.json](group/grouppool-info.json) | `GET /grouppool/info` | 群組列表 |
| [group-info-0.json](group/group-info-0.json) | `GET /group/info/0` | oneadmin 群組詳情 |
| [groupquota-info.json](group/groupquota-info.json) | `GET /groupquota/info` | 預設群組配額 |

### 其他（acl/, zone/, system/, vmgroup/, secgroup/, vdc/, market/）

| 檔案 | API | 用途 |
|------|-----|------|
| [acl/acl-info.json](acl/acl-info.json) | `GET /acl/info` | ACL 規則 |
| [zone/zonepool-info.json](zone/zonepool-info.json) | `GET /zonepool/info` | Zone 列表 |
| [zone/zone-info-0.json](zone/zone-info-0.json) | `GET /zone/info/0` | Zone 詳情 |
| [system/system-version.json](system/system-version.json) | `GET /system/version` | OpenNebula 版本 |
| [system/system-config.json](system/system-config.json) | `GET /system/config` | OpenNebula 設定 |
| [system/sunstone-views.json](system/sunstone-views.json) | `GET /sunstone/views` | Sunstone view（93 KB）|
| [system/sunstone-config.json](system/sunstone-config.json) | `GET /sunstone/config` | Sunstone 設定 |
| [vmgroup/vmgrouppool-info.json](vmgroup/vmgrouppool-info.json) | `GET /vmgrouppool/info?filter=-2` | VM Group 列表（空）|
| [secgroup/secgrouppool-info.json](secgroup/secgrouppool-info.json) | `GET /secgrouppool/info?filter=-2` | 安全群組列表 |
| [secgroup/secgroup-info-0.json](secgroup/secgroup-info-0.json) | `GET /secgroup/info/0` | 安全群組詳情 |
| [vdc/vdcpool-info.json](vdc/vdcpool-info.json) | `GET /vdcpool/info` | VDC 列表 |
| [market/marketpool-info.json](market/marketpool-info.json) | `GET /marketpool/info` | Marketplace 列表 |
| [market/marketapppool-info.json](market/marketapppool-info.json) | `GET /marketapppool/info?filter=-2` | App 列表（126 個，564 KB）|

---

## 採集失敗的 API

| API | 狀態 | 原因 |
|-----|------|------|
| `GET /vm/0/logs` | 404 | 路由不存在或需要特殊權限 |
| `GET /vn/info/0` | 404 | ID=0 的虛擬網路不存在（學校的網路 ID 是 4 和 5） |

---

## 對 GPU 算力平台規劃的修正

### 需更新的文件

| 文件 | 需修正 |
|------|--------|
| `＿前端路由API對照表.md` | GPU 監控告警可移除 P1 自建（用現有 API），將 DCGM 部分改為**可選**強化 |
| `xmlrpc-api.yml` | `/host/info/:id` 描述需強調 PCI_DEVICES 的 DEVICE_NAME/VENDOR_NAME 欄位 |
| `xmlrpc-api.yml` | `/vm/info/:id` 描述需新增 MONITORING 含 GPU_* 欄位 |
| `系統架構規劃.md` | PostgreSQL 的 `gpu_metrics` 表可改為「快照備份用」，主要監控直接打 OpenNebula API |

### 更新後的「需自建」清單

```
P0 必自建：
  ✓ 申請審核流程       — OpenNebula 沒有
  ✓ 行事曆資源分配 UI  — OpenNebula 沒有
  ✓ VIP 緊急插隊       — 需串接 stop/resume 邏輯
  ✓ 操作審計日誌       — OpenNebula 沒有
  ✗ GPU 資源總覽看板   — **改為「組裝」**：直接呼叫 host/info/:id 渲染

P1 建議自建：
  ✓ Email 註冊/驗證
  ✓ GPU 數量配額（用 CPU 間接控制）
  ✓ 使用時數限制（用排程動作）
  ✗ GPU 監控告警       — **改為「組裝」**：定期輪詢 vm/info 的 MONITORING.GPU_*
```

---

## 工具腳本

### 重新採集（如果環境有變動）

```bash
cd /Users/rich/Documents/GitHub/one/company-docs/api-samples
bash _login.sh                    # 重新登入取 token
TOKEN=$(cat token.txt)
curl -H "Authorization: Bearer $TOKEN" \
  "http://10.1.1.79:2616/fireedge/api/<endpoint>" | jq > <output>.json
```

### 註冊新 API 採集

可參考 `_login.sh` 寫法，未來開發 GPU 平台時新增 schedule/quota 等 API 採集。
