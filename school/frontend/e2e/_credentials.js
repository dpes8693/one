// 登入用的測試帳密 — 從環境變數讀，不硬寫
// 跑測試前要 export ADMIN_USER / ADMIN_PASS，或從 ../../.env 載入
import 'dotenv/config'

export const ADMIN_USER = process.env.ADMIN_USER || process.env.OPENNEBULA_USER || 'oneadmin'
export const ADMIN_PASS =
  process.env.ADMIN_PASS ||
  process.env.OPENNEBULA_PASS ||
  (() => {
    throw new Error(
      '請在 school/.env 設定 OPENNEBULA_PASS=... 或 export ADMIN_PASS=... 後再跑 e2e'
    )
  })()
