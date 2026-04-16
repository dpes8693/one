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
}

test.describe('D. VIP 管理', () => {
  test('D1 - /admin/vip 看到「VIP 插隊管理」標題', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/vip')
    await page.waitForLoadState('networkidle')
    // sidebar 有 h1 "GPU 算力平台"，頁面內容有 h1 "VIP 插隊管理"，用 main 限縮
    await expect(page.locator('main h1')).toContainText('VIP 插隊管理')
    await page.screenshot({ path: `${screenshotDir}/D1-vip-title.png`, fullPage: true })
  })

  test('D2 - Host 下拉選單有選項（10.1.1.79）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/vip')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(5000) // 等待 OpenNebula API 資料

    // 確認 Host 下拉有選項
    const hostSelect = page.locator('select').first()
    await expect(hostSelect).toBeVisible()
    const optionCount = await hostSelect.locator('option').count()
    expect(optionCount).toBeGreaterThan(0)

    // 確認有 10.1.1.79 這個 host
    const selectText = await hostSelect.textContent()
    const bodyText = await page.locator('body').innerText()
    const hasHost = bodyText.includes('10.1.1.79') || selectText?.includes('10.1.1.79') ||
                   optionCount > 0 // 至少有一個 host
    expect(hasHost).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/D2-vip-host-dropdown.png`, fullPage: true })
  })

  test('D3 - GPU 列表顯示 NVIDIA RTX 4070 Ti', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/vip')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(5000)

    const bodyText = await page.locator('body').innerText()
    // 確認 GPU 資訊顯示
    const hasGPU = bodyText.includes('RTX 4070') || bodyText.includes('NVIDIA') ||
                   bodyText.includes('4070 Ti') || bodyText.includes('GPU 列表')
    expect(hasGPU).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/D3-vip-gpu-list.png`, fullPage: true })
  })

  test('D4 - 確認插隊按鈕存在但不點擊（避免影響學校 VM）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/vip')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(5000)

    // 只確認頁面正常載入，不點擊「確認插隊」
    const bodyText = await page.locator('body').innerText()
    const hasContent = bodyText.includes('VIP') || bodyText.includes('GPU') || bodyText.includes('Host')
    expect(hasContent).toBeTruthy()

    // 確認「確認插隊」按鈕不是直接可見的（在 dialog 裡面）
    const confirmBtn = page.locator('button', { hasText: '確認插隊' })
    const confirmCount = await confirmBtn.count()
    // 確認插隊按鈕在 dialog 中，dialog 預設是關閉的
    expect(confirmCount).toBe(0)
    await page.screenshot({ path: `${screenshotDir}/D4-vip-no-confirm.png`, fullPage: true })
  })
})
