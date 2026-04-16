# GPU 算力平台

## 專案目標

基於 OpenNebula 開源專案，建立一個「GPU 算力平台」前端應用。核心策略是**前端換皮**：保留 OpenNebula 的底層基礎設施與後端 API，重新打造一個簡潔的前端介面，讓學校師生能透過網頁操作 VM，取得 SSH 連線資訊後，用自己的電腦 SSH 連入 VM 執行 GPU 運算。

## 使用情境

1. 學校管理員/老師透過網頁後台建立與管理 GPU VM
2. 學生在網頁上申請/開啟 VM
3. VM 開好後，平台提供 SSH 連線資訊（IP、Port、帳號等）
4. 學生用自己的電腦 SSH 連入 VM，使用學校購買的高階 GPU 進行運算

## 技術架構

### OpenNebula Fireedge 前端（參考/改造對象）

- **路徑**: `src/fireedge/src/`
- **技術棧**: React 17 + Redux Toolkit + MUI 5 + React Router 5 + Webpack 5
- **結構**:
  - `client/` — Sunstone 前端應用入口、路由、store
  - `server/` — Node.js 後端（Express），代理 OpenNebula API
  - `modules/` — 共用模組
    - `components/` — UI 元件（Cards、Buttons、Forms、Tables 等）
    - `containers/` — 頁面容器
    - `features/` — 功能模組
      - `OneApi/` — **最關鍵**：封裝所有 OpenNebula REST API 呼叫（vm.js、host.js、image.js、vmTemplate.js 等）
      - `Auth/` — 認證
    - `models/` — 資料模型
    - `hooks/` — 自訂 React hooks
    - `providers/` — Context providers
    - `constants/` — 常數定義
    - `utils/` — 工具函式

### 關鍵 API 檔案

與 VM 生命週期相關的核心 API 封裝：
- `src/fireedge/src/modules/features/OneApi/vm.js` — VM 操作（建立、啟動、關閉、刪除等）
- `src/fireedge/src/modules/features/OneApi/vmTemplate.js` — VM 範本
- `src/fireedge/src/modules/features/OneApi/host.js` — 主機管理
- `src/fireedge/src/modules/features/OneApi/image.js` — 映像檔管理
- `src/fireedge/src/modules/features/OneApi/network.js` — 網路配置
- `src/fireedge/src/modules/features/OneApi/auth.js` — 認證

## 工作原則

- **分析優先**：在修改或建立新功能前，先充分理解 OpenNebula 現有的 API 呼叫方式與資料流
- **最大化複用**：盡量複用 `modules/features/OneApi/` 中已封裝好的 API 函式，不重複造輪子
- **簡化介面**：新前端只需要 VM 生命週期管理 + SSH 資訊顯示的功能，不需要 OpenNebula 完整的管理功能
- **中文介面**：平台面向台灣的學校用戶，介面以繁體中文為主
- **回應語言**：所有回應與說明請使用繁體中文
