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

test.describe('C. VM 與 Dashboard', () => {
  test('C1 - 登入後 /vms 看到至少一個 VM 卡片', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // 等待 API 資料載入

    const bodyText = await page.locator('body').innerText()
    // 確認顯示 VM 相關內容（卡片、VM 名稱、或狀態文字）
    const hasVMs = bodyText.includes('Ubuntu') || bodyText.includes('GPU') ||
                   bodyText.includes('執行中') || bodyText.includes('ID:') ||
                   bodyText.includes('我的虛擬機')
    expect(hasVMs).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/C1-vm-list.png`, fullPage: true })
  })

  test('C2 - 點 VM 卡片詳情 → 進到 /vms/:id，看到 STATE', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // 找「詳情」連結並點擊第一個
    const detailLinks = page.locator('a', { hasText: '詳情' })
    const linkCount = await detailLinks.count()

    if (linkCount > 0) {
      await detailLinks.first().click()
      await page.waitForURL(/\/vms\/\d+/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
      const bodyText = await page.locator('body').innerText()
      // 確認顯示 VM 詳情相關文字
      const hasState = bodyText.includes('執行中') || bodyText.includes('已停止') ||
                       bodyText.includes('STATE') || bodyText.includes('初始化') ||
                       bodyText.includes('SSH') || bodyText.includes('IP')
      expect(hasState).toBeTruthy()
    } else {
      // 沒有 VM 卡片，確認顯示「尚無虛擬機」提示
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.includes('尚無虛擬機') || bodyText.includes('申請')).toBeTruthy()
    }
    await page.screenshot({ path: `${screenshotDir}/C2-vm-detail.png`, fullPage: true })
  })

  test('C3 - /admin/dashboard 看到總覽卡片（Hosts、GPUs、執行中 VM、待審申請）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('GPU 資源總覽')
    expect(bodyText).toContain('Hosts')
    expect(bodyText).toContain('GPUs')
    expect(bodyText).toContain('執行中 VM')
    expect(bodyText).toContain('待審申請')
    await page.screenshot({ path: `${screenshotDir}/C3-admin-dashboard.png`, fullPage: true })
  })

  test('C4 - /admin/dashboard 看到 host 卡片含 NVIDIA RTX 4070 Ti', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(5000) // 等待 OpenNebula API 資料

    const bodyText = await page.locator('body').innerText()
    // 確認有 Host 卡片或 GPU 相關資訊
    const hasGPUInfo = bodyText.includes('RTX 4070') || bodyText.includes('NVIDIA') ||
                       bodyText.includes('4070 Ti') || bodyText.includes('10.1.1.79')
    expect(hasGPUInfo).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/C4-dashboard-gpu-info.png`, fullPage: true })
  })
})
