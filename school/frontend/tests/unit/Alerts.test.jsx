import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/alerts.js', () => ({
  getAlerts: vi.fn().mockResolvedValue({
    alerts: [
      {
        id: 1,
        vm_id: 42,
        alert_type: 'gpu_memory_high',
        metric_value: 95.5,
        created_at: '2026-04-16T10:00:00.000Z',
      },
      {
        id: 2,
        vm_id: 43,
        alert_type: 'gpu_util_high',
        metric_value: 98.0,
        created_at: '2026-04-16T11:00:00.000Z',
      },
    ],
  }),
}))

import AdminAlerts from '../../src/pages/admin/Alerts.jsx'

function renderAlerts() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminAlerts />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AdminAlerts GPU 告警頁面', () => {
  it('1. 渲染頁面標題', () => {
    renderAlerts()
    expect(screen.getByText(/GPU 告警/)).toBeDefined()
  })

  it('2. 載入後顯示告警卡片（VM ID）', async () => {
    renderAlerts()
    await waitFor(() => {
      expect(screen.getAllByText(/VM #42|vm_id.*42|42/).length).toBeGreaterThan(0)
    })
  })

  it('3. 顯示告警類型', async () => {
    renderAlerts()
    await waitFor(() => {
      expect(screen.getByText(/gpu_memory_high/)).toBeDefined()
    })
  })

  it('4. 顯示指標值', async () => {
    renderAlerts()
    await waitFor(() => {
      expect(screen.getByText(/95\.5|95,5/)).toBeDefined()
    })
  })

  it('5. 渲染日期篩選欄位', () => {
    renderAlerts()
    expect(screen.getByLabelText(/開始日期/)).toBeDefined()
  })

  it('6. 顯示兩筆告警資料', async () => {
    renderAlerts()
    await waitFor(() => {
      expect(screen.getByText(/gpu_util_high/)).toBeDefined()
    })
  })
})
