import { ADMIN_USER, ADMIN_PASS } from "./_credentials.js"
import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotDir = path.join(__dirname, 'screenshots')

async function loginAsAdmin(page) {
  await page.goto('/login')
  await page.fill('input[type="text"]', ADMIN_USER)
  await page.fill('input[type="password"]', ADMIN_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/vms', { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

test.describe.configure({ mode: 'serial' })

test.describe('F. Sidebar 結構', () => {
  test('F1 - 登入後左上角顯示 oneadmin', async ({ page }) => {
    await loginAsAdmin(page)
    const sidebar = page.locator('aside')
    await expect(sidebar).toContainText(ADMIN_USER)
    await page.screenshot({ path: `${screenshotDir}/F1-sidebar-username.png`, fullPage: true })
  })

  test('F2 - Sidebar 有「我的虛擬機」連結', async ({ page }) => {
    await loginAsAdmin(page)
    const sidebar = page.locator('aside')
    await expect(sidebar.locator('a', { hasText: '我的虛擬機' })).toBeVisible()
    await page.screenshot({ path: `${screenshotDir}/F2-sidebar-vms-link.png`, fullPage: true })
  })

  // F3 已停用：SPEC v2 移除 SSH Key 機制（2026-04-17），改用 SSH 帳密
  // sidebar 不再有「設定」群組與「SSH 金鑰」連結
  test.skip('F3 - Sidebar 有「設定」群組 + SSH 金鑰 (deprecated)', async ({ page }) => {
    await loginAsAdmin(page)
    const sidebar = page.locator('aside')
    const sidebarText = await sidebar.innerText()
    expect(sidebarText).toContain('設定')
    expect(sidebarText).toContain('SSH 金鑰')
    await page.screenshot({ path: `${screenshotDir}/F3-sidebar-settings.png`, fullPage: true })
  })

  test('F4 - Sidebar 有「管理」群組 + 6 個項目', async ({ page }) => {
    await loginAsAdmin(page)
    const sidebar = page.locator('aside')
    const sidebarText = await sidebar.innerText()

    // 確認「管理」群組存在
    expect(sidebarText).toContain('管理')

    // 確認 6 個管理項目
    expect(sidebarText).toContain('GPU 資源總覽')  // Dashboard
    expect(sidebarText).toContain('申請審核')        // Applications
    expect(sidebarText).toContain('VIP 管理')       // VIP
    expect(sidebarText).toContain('排程行事曆')      // Schedules
    expect(sidebarText).toContain('審計日誌')        // Audit
    expect(sidebarText).toContain('GPU 告警')       // Alerts

    await page.screenshot({ path: `${screenshotDir}/F4-sidebar-admin-group.png`, fullPage: true })
  })
})
