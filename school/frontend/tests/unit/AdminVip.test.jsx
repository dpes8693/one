import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminVip from '../../src/pages/admin/Vip.jsx'

// Mock API 模組
vi.mock('../../src/api/vip.js', () => ({
  preempt: vi.fn(),
  restore: vi.fn(),
  listActive: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/api/one.js', () => ({
  getVMList: vi.fn().mockResolvedValue({
    data: [
      {
        ID: '20',
        NAME: 'VIP-VM-20',
        STATE: '4', // POWEROFF
        USER_TEMPLATE: { USER_PRIORITY: '10' },
      },
    ],
  }),
}))

// Mock hostpool 與 host info
vi.mock('../../src/api/dashboard.js', () => ({
  getHostsWithGPU: vi.fn().mockResolvedValue([
    {
      ID: '0',
      NAME: '10.1.1.79',
      PCI: [
        {
          SHORT_ADDRESS: '01:00.0',
          VENDOR_NAME: 'NVIDIA Corporation',
          DEVICE_NAME: 'AD104 [GeForce RTX 4070 Ti]',
          CLASS_NAME: 'VGA compatible controller',
          VMID: '0',
        },
      ],
    },
  ]),
}))

function renderVip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminVip />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AdminVip 頁面', () => {
  it('1. 渲染 Host 選擇下拉', async () => {
    renderVip()
    await waitFor(() => {
      expect(screen.getByText(/10\.1\.1\.79/)).toBeDefined()
    })
  })

  it('2. 顯示 GPU 列表', async () => {
    renderVip()
    await waitFor(() => {
      expect(screen.getByText(/RTX 4070 Ti/i)).toBeDefined()
    })
  })

  it('3. 點「插隊 VIP」開啟對話框', async () => {
    renderVip()
    // 等待 GPU 列表載入
    await waitFor(() => {
      expect(screen.getByText(/RTX 4070 Ti/i)).toBeDefined()
    })
    const btn = screen.getByRole('button', { name: /插隊 VIP/ })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/選擇 VIP 虛擬機/i)).toBeDefined()
    })
  })

  it('4. 對話框顯示可選 VM 列表', async () => {
    renderVip()
    await waitFor(() => {
      expect(screen.getByText(/RTX 4070 Ti/i)).toBeDefined()
    })
    const btn = screen.getByRole('button', { name: /插隊 VIP/ })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/VIP-VM-20/)).toBeDefined()
    })
  })

  it('5. 確認後呼叫 preempt API（mock）', async () => {
    const { preempt } = await import('../../src/api/vip.js')
    preempt.mockResolvedValue({ vip_preemption_id: 5, preempted_vm_id: 10 })

    renderVip()
    await waitFor(() => {
      expect(screen.getByText(/RTX 4070 Ti/i)).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /插隊 VIP/ }))
    await waitFor(() => {
      expect(screen.getByText(/VIP-VM-20/)).toBeDefined()
    })
    // 選擇 VM
    fireEvent.click(screen.getByText(/VIP-VM-20/))
    // 點確認
    const confirmBtn = screen.getByRole('button', { name: /確認插隊/ })
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(preempt).toHaveBeenCalled()
      const callArg = preempt.mock.calls[0][0]
      expect(callArg.vip_vm_id).toBe('20')
    })
  })
})
