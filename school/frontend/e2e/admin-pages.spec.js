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

test.describe('E. 各管理頁面渲染', () => {
  test('E1 - /admin/schedules 顯示「排程行事曆」', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/schedules')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    const hasSchedule = bodyText.includes('排程') || bodyText.includes('行事曆') || bodyText.includes('Calendar')
    expect(hasSchedule).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/E1-schedules.png`, fullPage: true })
  })

  test('E2 - /admin/audit 顯示「審計日誌」表格', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/audit')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    const hasAudit = bodyText.includes('審計') || bodyText.includes('日誌') || bodyText.includes('audit')
    expect(hasAudit).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/E2-audit.png`, fullPage: true })
  })

  test('E3 - /admin/alerts 顯示「GPU 告警」', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/alerts')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    const hasAlerts = bodyText.includes('告警') || bodyText.includes('GPU 告警') || bodyText.includes('alert')
    expect(hasAlerts).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/E3-alerts.png`, fullPage: true })
  })

  test('E4 - /settings/ssh-key 顯示 SSH Key 表單', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/ssh-key')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()
    const hasSSH = bodyText.includes('SSH') || bodyText.includes('ssh')
    expect(hasSSH).toBeTruthy()
    await page.screenshot({ path: `${screenshotDir}/E4-ssh-key.png`, fullPage: true })
  })
})
