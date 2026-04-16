// 登入用的測試帳密 — 從環境變數讀，不硬寫
// 自動從 school/.env 載入（路徑：相對本檔案的 ../../.env）
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 顯式載入 school/.env（無論 cwd 在哪都能找到）
dotenvConfig({ path: join(__dirname, '..', '..', '.env') })

export const ADMIN_USER = process.env.ADMIN_USER || process.env.OPENNEBULA_USER || 'oneadmin'
export const ADMIN_PASS =
  process.env.ADMIN_PASS ||
  process.env.OPENNEBULA_PASS ||
  (() => {
    throw new Error(
      '請在 school/.env 設定 OPENNEBULA_PASS=... 或 export ADMIN_PASS=... 後再跑 e2e'
    )
  })()
