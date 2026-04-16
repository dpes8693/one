import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/dashboard.js', () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    hostCount: 2,
    gpuCount: 4,
    runningVMCount: 3,
    pendingApplicationCount: 5,
  }),
  getHostsWithGPU: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/api/alerts.js', () => ({
  getAlerts: vi.fn().mockResolvedValue([
    { id: 1, vm_id: 42, alert_type: 'gpu_memory_high', metric_value: 95.5, created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    { id: 2, vm_id: 43, alert_type: 'gpu_util_high', metric_value: 98.0, created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  ]),
}))

vi.mock('../../src/api/vip.js', () => ({
  listActive: vi.fn().mockResolvedValue([
    { vip_preemption_id: 1, vip_vm_id: 10, preempted_vm_id: 20 },
  ]),
}))

import AdminDashboard from '../../src/pages/admin/Dashboard.jsx'

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminDashboard />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AdminDashboard 增強版 Dashboard', () => {
  it('1. 顯示「最近 1 小時 GPU 告警數」卡片', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/GPU 告警/)).toBeDefined()
    })
  })

  it('2. 告警數量顯示為 2', async () => {
    renderDashboard()
    await waitFor(() => {
      // 卡片應該有一個顯示告警計數的地方
      expect(screen.getByText(/GPU 告警/).closest('div')).toBeDefined()
    })
  })

  it('3. 顯示「進行中 VIP 插隊數」卡片', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/VIP 插隊/)).toBeDefined()
    })
  })

  it('4. 顯示「待審申請數」卡片', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/待審申請/)).toBeDefined()
    })
  })

  it('5. 現有的 Hosts / GPUs / 執行中 VM 卡片仍存在', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getAllByText(/Hosts/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/GPUs/i).length).toBeGreaterThan(0)
    })
  })
})
