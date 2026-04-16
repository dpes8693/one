#!/usr/bin/env node
/**
 * GPU 算力平台 E2E 測試 wrapper
 *
 * 執行方式：
 *   node scripts/test-e2e.js
 *
 * 前置條件：
 *   - Backend 已在 port 4000 運行
 *   - Frontend 已在 port 3000 運行
 *   - PostgreSQL 已在 port 5433 運行（gpu-platform-db container）
 *
 * 實際測試由 frontend/playwright.config.js + frontend/e2e/ 執行。
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = join(__dirname, '..', 'frontend')

console.log('=== GPU 算力平台 Playwright E2E 測試 ===')
console.log(`測試目錄：${frontendDir}/e2e/`)
console.log('啟動 Playwright 測試...\n')

try {
  execSync('npm run test:e2e', {
    cwd: frontendDir,
    stdio: 'inherit',
  })
  console.log('\n全部通過！截圖已儲存至 frontend/e2e/screenshots/')
} catch (err) {
  console.error('\nE2E 測試失敗，請查看上方錯誤訊息。')
  process.exit(1)
}
