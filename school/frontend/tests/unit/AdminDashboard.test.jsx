import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminDashboard from '../../src/pages/admin/Dashboard.jsx'

vi.mock('../../src/api/dashboard.js', () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    hostCount: 1,
    gpuCount: 1,
    runningVMCount: 1,
    pendingApplicationCount: 9,
  }),
  getHostsWithGPU: vi.fn().mockResolvedValue([
    {
      ID: '0',
      NAME: '10.1.1.79',
      STATE: '2',
      HOST_SHARE: {
        CPU_USAGE: '400',
        TOTAL_CPU: '2400',
        MEM_USAGE: '16777216',
        TOTAL_MEM: '65347080',
        RUNNING_VMS: '1',
      },
      PCI: [
        {
          SHORT_ADDRESS: '01:00.0',
          VENDOR_NAME: 'NVIDIA Corporation',
          DEVICE_NAME: 'AD104 [GeForce RTX 4070 Ti]',
          CLASS_NAME: 'VGA compatible controller',
          VMID: '0',
          VM_NAME: 'Ubuntu 2404-GPU -0',
        },
        {
          SHORT_ADDRESS: '02:00.0',
          VENDOR_NAME: 'NVIDIA Corporation',
          DEVICE_NAME: 'AD104 [GeForce RTX 4070 Ti]',
          CLASS_NAME: 'VGA compatible controller',
          VMID: '-1',
          VM_NAME: null,
        },
      ],
    },
  ]),
}))

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

describe('AdminDashboard 頁面', () => {
  it('1. 初始渲染顯示 Loading 狀態', () => {
    renderDashboard()
    expect(screen.getByText(/載入中|Loading/i)).toBeDefined()
  })

  it('2. 載入後顯示 Host 卡片', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/10\.1\.1\.79/)).toBeDefined()
    })
  })

  it('3. GPU 顯示 VENDOR_NAME / DEVICE_NAME', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getAllByText(/NVIDIA Corporation/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/RTX 4070 Ti/i).length).toBeGreaterThan(0)
    })
  })

  it('4. GPU 被佔用時顯示 VM 名稱', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/Ubuntu 2404-GPU/i)).toBeDefined()
    })
  })

  it('5. GPU 空閒時顯示「空閒」', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/空閒/)).toBeDefined()
    })
  })

  it('6. 顯示總覽卡片（Hosts、GPUs、執行中 VM、待審申請）', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getAllByText(/Hosts/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/GPUs/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/執行中/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/待審申請/i)).toBeDefined()
    })
  })
})
