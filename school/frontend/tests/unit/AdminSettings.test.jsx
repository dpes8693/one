import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/settings.js', () => ({
  listSettings: vi.fn(),
  updateSetting: vi.fn(),
}))

import AdminSettings from '../../src/pages/admin/Settings.jsx'
import { listSettings, updateSetting } from '../../src/api/settings.js'

const SAMPLE = {
  data: [
    { key: 'base_template_id', value: '1', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_active_reservations', value: '3', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_advance_booking_days', value: '30', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_hours_per_reservation', value: '24', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_total_cpu', value: '32', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_total_disk_gb', value: '2000', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_total_gpu', value: '8', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'max_total_ram_gb', value: '64', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'verification_code_ttl_min', value: '5', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'verification_lockout_minutes', value: '30', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'verification_max_attempts', value: '3', updated_at: '2026-04-17T00:00:00Z' },
    { key: 'verification_max_per_hour', value: '5', updated_at: '2026-04-17T00:00:00Z' },
  ],
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminSettings />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listSettings.mockResolvedValue(SAMPLE)
})

describe('AdminSettings 系統設定頁', () => {
  it('1. 渲染頁面標題', async () => {
    renderSettings()
    expect(screen.getByText(/系統設定/)).toBeDefined()
  })

  it('2. 渲染 12 筆 setting（input 數量 = 12）', async () => {
    renderSettings()
    await waitFor(() => {
      // 每個 setting 都有對應的 input id="setting-<key>"
      for (const r of SAMPLE.data) {
        const el = document.getElementById(`setting-${r.key}`)
        expect(el).not.toBeNull()
        expect(el.value).toBe(r.value)
      }
    })
  })

  it('3. 渲染四個分組標題', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText(/預約規則/)).toBeDefined()
      expect(screen.getByText(/資源上限/)).toBeDefined()
      expect(screen.getByText(/驗證碼/)).toBeDefined()
      expect(screen.getByText(/Template/)).toBeDefined()
    })
  })

  it('4. 修改某欄位 + 點儲存 → 呼叫 updateSetting', async () => {
    updateSetting.mockResolvedValue({ ok: true, key: 'max_total_cpu', value: '64' })
    renderSettings()
    await waitFor(() => {
      expect(document.getElementById('setting-max_total_cpu')).not.toBeNull()
    })

    const input = document.getElementById('setting-max_total_cpu')
    fireEvent.change(input, { target: { value: '64' } })

    // 找該列的「儲存」按鈕（多個按鈕，用 closest 父層的 button）
    const saveBtn = input.parentElement.querySelector('button')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith('max_total_cpu', '64')
    })
  })

  it('5. 儲存成功顯示 toast「已儲存 XX」', async () => {
    updateSetting.mockResolvedValue({ ok: true, key: 'max_total_gpu', value: '16' })
    renderSettings()
    await waitFor(() => {
      expect(document.getElementById('setting-max_total_gpu')).not.toBeNull()
    })

    const input = document.getElementById('setting-max_total_gpu')
    fireEvent.change(input, { target: { value: '16' } })
    fireEvent.click(input.parentElement.querySelector('button'))

    await waitFor(() => {
      expect(screen.getByText(/已儲存\s*max_total_gpu/)).toBeDefined()
    })
  })

  it('6. 儲存失敗顯示錯誤', async () => {
    updateSetting.mockRejectedValue({
      response: { data: { error: 'max_total_cpu 必須為正整數' } },
      message: 'Request failed',
    })
    renderSettings()
    await waitFor(() => {
      expect(document.getElementById('setting-max_total_cpu')).not.toBeNull()
    })

    const input = document.getElementById('setting-max_total_cpu')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(input.parentElement.querySelector('button'))

    await waitFor(() => {
      // 錯誤可能出現在 toast 或欄位旁
      expect(screen.getAllByText(/必須為正整數|失敗/).length).toBeGreaterThan(0)
    })
  })

  it('7. 未修改時儲存按鈕 disabled', async () => {
    renderSettings()
    await waitFor(() => {
      expect(document.getElementById('setting-max_total_cpu')).not.toBeNull()
    })
    const input = document.getElementById('setting-max_total_cpu')
    const btn = input.parentElement.querySelector('button')
    expect(btn.disabled).toBe(true)
  })
})
