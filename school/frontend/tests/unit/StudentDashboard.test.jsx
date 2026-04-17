import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 預設 mock：空列表（單一測試會 override）
vi.mock('../../src/api/one.js', () => ({
  getMyVMsPaginated: vi.fn().mockResolvedValue({ data: { data: [] } }),
  vmAction: vi.fn().mockResolvedValue({}),
}))

import StudentDashboard from '../../src/pages/StudentDashboard.jsx'
import { getMyVMsPaginated, vmAction } from '../../src/api/one.js'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <StudentDashboard />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('StudentDashboard 學生 Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyVMsPaginated.mockResolvedValue({ data: { data: [] } })
  })

  it('1. 渲染頁面標題「我的 GPU」', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/我的 GPU/)).toBeDefined()
    })
  })

  it('2. 無 VM 時顯示空狀態提示', async () => {
    getMyVMsPaginated.mockResolvedValue({ data: { data: [] } })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/尚無虛擬機/)).toBeDefined()
    })
  })

  it('3. 顯示總 VM 數、執行中、待開機統計卡片', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          { ID: '1', NAME: 'vm-a', STATE: '3', TEMPLATE: { NIC: { IP: '10.0.0.1' } } },
          { ID: '2', NAME: 'vm-b', STATE: '8', TEMPLATE: {} },
          { ID: '3', NAME: 'vm-c', STATE: '3', TEMPLATE: {} },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/總 VM 數/)).toBeDefined()
      expect(screen.getByText(/執行中/)).toBeDefined()
      expect(screen.getByText(/待開機/)).toBeDefined()
    })
  })

  it('4. 有 VM 且有 IP 時顯示 SSH 連線資訊（含 ssh 指令）', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          {
            ID: '10',
            NAME: 'gpu-vm-10',
            STATE: '3',
            TEMPLATE: {
              NIC: { IP: '192.168.1.50' },
              PCI: { DEVICE_NAME: 'AD104 [GeForce RTX 4070 Ti]' },
            },
          },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/gpu-vm-10/)).toBeDefined()
      // IP 會出現在 IP 欄位 + ssh 指令裡，使用 getAllByText
      expect(screen.getAllByText(/192\.168\.1\.50/).length).toBeGreaterThan(0)
      // ssh 指令文字
      expect(screen.getByText(/ssh root@192\.168\.1\.50/)).toBeDefined()
    })
  })

  it('5. IP 為空時顯示等待提示', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          {
            ID: '11',
            NAME: 'gpu-vm-11',
            STATE: '3',
            TEMPLATE: {},
          },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/尚未取得 IP/)).toBeDefined()
    })
  })

  it('6. 從 VM_POOL.VM (XML-RPC 結構) 也能解析', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: {
          VM_POOL: {
            VM: { ID: '20', NAME: 'xmlrpc-vm', STATE: '3', TEMPLATE: { NIC: { IP: '10.0.0.20' } } },
          },
        },
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/xmlrpc-vm/)).toBeDefined()
    })
  })

  it('7. 顯示 GPU 卡名稱（從 TEMPLATE.PCI.DEVICE_NAME）', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          {
            ID: '12',
            NAME: 'gpu-vm-12',
            STATE: '3',
            TEMPLATE: {
              NIC: { IP: '10.0.0.12' },
              PCI: [
                { DEVICE_NAME: 'AD104 [GeForce RTX 4070 Ti]', CLASS: '0300' },
              ],
            },
          },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/RTX 4070 Ti/)).toBeDefined()
    })
  })

  it('8. 點「開機」會呼叫 vmAction(id, "resume")', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          { ID: '30', NAME: 'off-vm', STATE: '8', TEMPLATE: {} },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/off-vm/)).toBeDefined()
    })
    const btn = screen.getByRole('button', { name: /開機/ })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(vmAction).toHaveBeenCalledWith('30', 'resume')
    })
  })

  it('9. ETH0_IP 也能當作 IP 來源（NIC 為空時）', async () => {
    getMyVMsPaginated.mockResolvedValue({
      data: {
        data: [
          {
            ID: '40',
            NAME: 'ctx-vm',
            STATE: '3',
            TEMPLATE: { CONTEXT: { ETH0_IP: '10.9.9.9' } },
          },
        ],
      },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/10\.9\.9\.9/).length).toBeGreaterThan(0)
    })
  })
})
