import { ADMIN_USER, ADMIN_PASS } from "./_credentials.js"
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotDir = path.join(__dirname, 'screenshots')

test.describe('A. 認證流程', () => {
  test('A1 - 登入頁能渲染（標題、帳密欄位、登入按鈕）', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h2').first()).toContainText('GPU 算力平台')
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await page.screenshot({ path: `${screenshotDir}/A1-login-page.png`, fullPage: true })
  })

  test('A2 - 錯誤帳密 → 後端回 401，頁面不跳轉到 /vms', async ({ page }) => {
    // 監聽 API 回應
    const loginResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/auth/login'),
      { timeout: 10000 }
    )

    await page.goto('/login')
    await page.fill('input[type="text"]', 'wronguser')
    await page.fill('input[type="password"]', 'wrongpass')
    await page.click('button[type="submit"]')

    // 等待登入 API 回應
    const loginResponse = await loginResponsePromise
    expect(loginResponse.status()).toBe(401)

    // 確認頁面沒有跳轉到 /vms（登入失敗）
    await page.waitForTimeout(2000)
    expect(page.url()).toContain('/login')

    await page.screenshot({ path: `${screenshotDir}/A2-login-error.png`, fullPage: true })
  })

  test('A3 - 正確帳密 → 跳轉 /vms，sidebar 顯示 oneadmin', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', ADMIN_USER)
    await page.fill('input[type="password"]', ADMIN_PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/vms', { timeout: 15000 })
    await page.waitForLoadState('networkidle')
    // sidebar 顯示使用者名稱
    const sidebar = page.locator('aside')
    await expect(sidebar).toContainText(ADMIN_USER)
    await page.screenshot({ path: `${screenshotDir}/A3-login-success.png`, fullPage: true })
  })

  test('A4 - 點登出 → 回到 /login，localStorage 已清', async ({ page }) => {
    // 先登入
    await page.goto('/login')
    await page.fill('input[type="text"]', ADMIN_USER)
    await page.fill('input[type="password"]', ADMIN_PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/vms', { timeout: 15000 })
    // 點登出按鈕
    await page.locator('button', { hasText: '登出' }).click()
    await page.waitForURL('**/login', { timeout: 10000 })
    // 確認 localStorage 已清除
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeNull()
    await page.screenshot({ path: `${screenshotDir}/A4-logout.png`, fullPage: true })
  })
})
