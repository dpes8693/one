在 OpenNebula 的 **VM 容器虛擬化架構** 中，**Virtual Networks (虛擬網路)** 和 **Virtual Routers (虛擬路由器)** 是兩個完全不同層級的網路資源，就像 **L2 交換機** 跟 **L3 路由器** 的差別。以下用教練式的清楚方式幫你拆解它們的差異、定位與實際使用情境：

### 1. Virtual Network (虛擬網路，簡稱 VNet)

這是 OpenNebula 最基礎的 **網路隔離與連接資源**，類似一個 **虛擬的 L2 廣播域 (Broadcast Domain)**。

- **主要功能**：
  - 定義 VM 的網路連接方式（橋接、VLAN、VXLAN、Open vSwitch 等）。
  - 管理 IP 位址池（Address Ranges）：IPv4 / IPv6 / Dual Stack。
  - 提供 MAC 位址、Gateway、DNS、MTU 等給 VM（透過 contextualization 自動注入）。
  - 支援 Security Groups（防火牆規則）、QoS 頻寬限制。

- **本質**：它是一個 **虛擬的網路區段**（類似 VLAN 或 VXLAN VNI），讓多台 VM 可以互相通訊，或連接到物理網路。
- **沒有路由功能**：同一張 VNet 內的 VM 可以 L2 直接通訊，但**不同 VNet 之間預設無法互通**（除非你手動加路由或用 Virtual Router）。

**常見類型**：

- Bridged（直接橋接到 host 的 bridge）
- 802.1Q VLAN
- VXLAN（跨 host overlay）
- Open vSwitch 等

**在 Sunstone 的位置**：Networks → Virtual Networks

### 2. Virtual Router (虛擬路由器，簡稱 VR 或 VRouter)

這是一個 **特殊的 VM 類型**（實際上是一個輕量 Alpine Linux 虛擬機器），專門負責 **L3 路由與網路服務**。

- **主要功能**（新版 VR 基於 one-apps）：
  - 在多個 Virtual Networks 之間進行路由（inter-VNet routing）。
  - 提供 NAT（讓私有 VNet 上網）。
  - DHCP、DNS Forwarder。
  - Floating IP 管理、端口轉發。
  - 高可用性（HA with Keepalived）。
  - Router4 / NAT4 等 VNF（Virtual Network Functions）。

- **本質**：它是一台 **專門的路由器 VM**，會掛載多張 NIC（分別連到不同的 Virtual Networks），然後在這些網路之間轉發封包、做 NAT、設定 gateway。

- **為什麼需要它**？
  - 單純的 Virtual Network 無法跨網段路由。
  - 當你有「前端公網 VNet」 + 「後端私有 VNet」時，就需要 Virtual Router 來當 gateway + NAT 出口。

**在 Sunstone 的位置**：Instances → Virtual Routers（或透過 Marketplace 部署 Service Virtual Router）

### 簡單比喻（容器/VM 架構角度）

- **Virtual Network** → 像 Docker 的 **bridge 網路** 或 Kubernetes 的 **Pod CIDR / Service CIDR**（一個網路平面）。
- **Virtual Router** → 像你在容器環境中跑的 **metalLB + nginx-ingress** 或 **Calico/BGP router**，負責跨網路的路由與對外連線。

或者更傳統一點：

- Virtual Network = 交換機（Switch） + 子網路（Subnet）
- Virtual Router = 路由器（Router） + 閘道（Gateway）

### 實際使用時的關係

1. 你先建立多張 **Virtual Networks**（例如：public-vnet、private-app-vnet、private-db-vnet）。
2. 再部署一台 **Virtual Router**，讓它同時掛上 public-vnet 和 private-app-vnet。
3. 然後在 private VNet 的模板裡，把 Gateway 指向 Virtual Router 的 IP。
4. VM 啟動後，就會自動把 Virtual Router 當成預設閘道，上網或跨網段通訊都透過 VR 處理。

### 常見混淆點提醒

- **Virtual Routers 不是 Virtual Networks**：VR 本身也需要掛載到 VNet 上，它是「消費者」而不是「定義者」。
- 新版 OpenNebula（6.x/7.x）已經把 Virtual Router 改成 Marketplace 的 Appliance（Service Virtual Router），比舊版的純 VRouter 強大很多，強烈建議用新的 one-apps 版本。
- 如果你的環境很簡單（所有 VM 在同一張 VNet），其實不需要 Virtual Router。
- 如果需要多租戶隔離、NAT、上網、跨 VNet 通訊，就一定要用 Virtual Router。

想實際操作嗎？告訴我你目前的架構（例如有沒有跨 host、要不要 NAT、VXLAN 還是 VLAN），我可以直接給你建立 VNet + VR 的 step-by-step 範例模板，或是推薦最佳實踐配置。

有沒有哪部分還不清楚？我們繼續深挖！
