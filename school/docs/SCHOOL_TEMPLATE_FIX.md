# 學校 GPU Template SSH Key 修復指南

> 對象：學校 OpenNebula 管理員
> 目的：讓學生上傳到平台的 SSH 公鑰能在開機後自動寫入 VM，達成「免密碼 SSH 登入」

---

## 1. 問題說明

GPU 算力平台的流程是：

1. 學生在「設定 → SSH Key」頁面上傳自己的 SSH 公鑰
2. 平台會把公鑰寫入該學生在 OpenNebula 對應使用者的 `USER_TEMPLATE/SSH_PUBLIC_KEY`
3. 當學生開新的 VM 時，OpenNebula 應該透過 **cloud-init / one-context** 把這把公鑰自動寫到 VM 的 `~/.ssh/authorized_keys`

**目前的狀況：** 學校現有的 GPU VM Template（ID = `1`）的 `CONTEXT` 區塊**沒有設定 `SSH_PUBLIC_KEY`**，所以即使學生公鑰已經正確存到 OpenNebula，VM 開好後也不會被注入，學生 `ssh root@<VM_IP>` 會被要求密碼或直接被拒絕。

---

## 2. 原理

OpenNebula 在 VM Template 的 `CONTEXT` 區塊支援一組特殊變數，其中 `$USER[SSH_PUBLIC_KEY]` 會在 VM 開機時，被替換成「**該 VM 擁有者**在 OpenNebula 上設定的 `USER_TEMPLATE/SSH_PUBLIC_KEY`」。

只要 Template `CONTEXT` 裡有：

```
SSH_PUBLIC_KEY = "$USER[SSH_PUBLIC_KEY]"
```

VM 內的 one-context / cloud-init 套件就會自動把這個值寫入 root（或預設使用者）的 `~/.ssh/authorized_keys`，學生即可免密碼 SSH 連入。

---

## 3. 修復步驟

### 方法 A：用 Sunstone GUI（推薦）

1. 用 oneadmin 帳號登入 Sunstone：
   <http://10.1.1.79:2616>
2. 左側選單點 **Templates → VMs**
3. 找到 GPU Template（**ID = 1**），點進去
4. 右上角點 **Update**
5. 切到 **Context** 頁籤
6. 找到 **SSH** 區塊，勾選「**Add SSH contextualization**」
7. 在欄位裡填入：
   ```
   $USER[SSH_PUBLIC_KEY]
   ```
   （**注意：是這串字面值，不是要貼某把實體的公鑰**）
8. 拉到頁面最下方按 **Update** 儲存

### 方法 B：直接改 Raw Template（如果 GUI 找不到欄位）

在 Sunstone 的 Template 編輯頁，切到「**Wizard ↔ Advanced**」中的 **Advanced** 模式，把 `CONTEXT` 區塊改成包含 `SSH_PUBLIC_KEY`：

```text
CONTEXT = [
  NETWORK = "YES",
  SSH_PUBLIC_KEY = "$USER[SSH_PUBLIC_KEY]" ]
```

> 如果原本已經有其他 CONTEXT 設定（例如 `TOKEN`、`START_SCRIPT`），**保留它們**，只新增 `SSH_PUBLIC_KEY` 這一行即可。

或在 OpenNebula 主機的 CLI 上直接更新（需要 oneadmin 權限）：

```bash
onetemplate update 1 --append <<'EOF'
CONTEXT=[
  NETWORK="YES",
  SSH_PUBLIC_KEY="$USER[SSH_PUBLIC_KEY]"
]
EOF
```

---

## 4. 驗證

修完之後，請依下列步驟驗證：

1. 用任一學生帳號登入 GPU 算力平台
2. 到「**設定 → SSH Key**」貼上一把測試用的 SSH 公鑰（例如自己筆電 `~/.ssh/id_ed25519.pub`）
3. 回到「VM 管理」，**重新開一台新的 VM**（用 ID=1 這個 Template）
4. 等待 1 ~ 2 分鐘，讓 VM 內的 cloud-init / one-context 跑完
5. 從學生的電腦執行：
   ```bash
   ssh root@<VM_IP>
   ```
   應該**不需要密碼**就能直接登入

如果能進得去，就完成修復。

---

## 5. 疑難排解

| 症狀 | 可能原因 | 處理方式 |
| --- | --- | --- |
| 已經開過的 VM SSH 還是進不去 | 修 Template 不會回頭套用到舊 VM | 把舊 VM **關掉重開**（terminate + 重新 instantiate），不是 reboot |
| 新 VM 也進不去 | VM image 沒裝 one-context / cloud-init | 換成有預裝的 image（OpenNebula Marketplace 的 Ubuntu / CentOS cloud image 都有內建） |
| `Permission denied (publickey)` | 學生上傳的公鑰格式錯了 | 確認公鑰是 `ssh-rsa AAAA...` 或 `ssh-ed25519 AAAA...` 開頭的「**單行純文字**」，不是私鑰、不是 `.pub` 檔的 base64 內容 |
| 公鑰有送進 OpenNebula 嗎？ | 不確定平台寫入是否成功 | 在 OpenNebula CLI 跑 `oneuser show <USER_ID>`，看 `USER TEMPLATE` 區塊有沒有 `SSH_PUBLIC_KEY=...` |
| Template 改了但 VM 內還是空的 | `$USER[...]` 沒被替換 | 確認 Template `CONTEXT` 裡寫的是 **`$USER[SSH_PUBLIC_KEY]`**（含中括號、變數名全大寫），不是 `${USER.SSH_PUBLIC_KEY}` 之類 |

---

## 附錄：快速檢查清單

- [ ] Template ID = 1 的 `CONTEXT` 含 `SSH_PUBLIC_KEY="$USER[SSH_PUBLIC_KEY]"`
- [ ] VM image 有內建 one-context 或 cloud-init
- [ ] 學生帳號的 `USER_TEMPLATE/SSH_PUBLIC_KEY` 有值
- [ ] 是用「新開的 VM」測試，而不是修改前就已經存在的 VM

完成以上四項，學生即可一鍵 SSH 進入 GPU VM。
