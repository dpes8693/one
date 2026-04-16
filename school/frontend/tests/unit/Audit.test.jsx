import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/audit.js', () => ({
  getAuditLogs: vi.fn().mockResolvedValue({
    logs: [
      {
        id: 1,
        created_at: '2026-04-16T10:00:00.000Z',
        user_id: 'student1',
        action: 'vm_start',
        target: 'VM #42',
        ip: '192.168.1.100',
      },
      {
        id: 2,
        created_at: '2026-04-16T11:00:00.000Z',
        user_id: 'admin',
        action: 'vm_stop',
        target: 'VM #43',
        ip: '10.0.0.1',
      },
    ],
  }),
}))

import AdminAudit from '../../src/pages/admin/Audit.jsx'

function renderAudit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminAudit />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AdminAudit 操作審計日誌頁面', () => {
  it('1. 渲染頁面標題', () => {
    renderAudit()
    expect(screen.getByText(/審計日誌/)).toBeDefined()
  })

  it('2. 載入後顯示審計紀錄（使用者）', async () => {
    renderAudit()
    await waitFor(() => {
      expect(screen.getByText(/student1/)).toBeDefined()
    })
  })

  it('3. 顯示動作欄位', async () => {
    renderAudit()
    await waitFor(() => {
      expect(screen.getByText(/vm_start/)).toBeDefined()
    })
  })

  it('4. 顯示目標欄位', async () => {
    renderAudit()
    await waitFor(() => {
      expect(screen.getByText(/VM #42/)).toBeDefined()
    })
  })

  it('5. 顯示 IP 欄位', async () => {
    renderAudit()
    await waitFor(() => {
      expect(screen.getByText(/192\.168\.1\.100/)).toBeDefined()
    })
  })

  it('6. 渲染動作篩選器', () => {
    renderAudit()
    expect(screen.getByLabelText(/動作類型/)).toBeDefined()
  })

  it('7. 渲染日期篩選器', () => {
    renderAudit()
    expect(screen.getByLabelText(/開始日期/)).toBeDefined()
  })

  it('8. 篩選後顯示符合條件的紀錄', async () => {
    renderAudit()
    await waitFor(() => {
      expect(screen.getByText(/student1/)).toBeDefined()
    })
    const input = screen.getByLabelText(/使用者/)
    fireEvent.change(input, { target: { value: 'admin' } })
    await waitFor(() => {
      expect(screen.queryByText(/student1/)).toBeNull()
      expect(screen.getByText(/admin/)).toBeDefined()
    })
  })
})
