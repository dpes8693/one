import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock API 模組（先 mock 後 import）
vi.mock('../../src/api/registrations.js', () => ({
  listRegistrations: vi.fn(),
  approveRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
}))

import AdminRegistrations from '../../src/pages/admin/Registrations.jsx'
import {
  listRegistrations,
  approveRegistration,
  rejectRegistration,
} from '../../src/api/registrations.js'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminRegistrations />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

const sampleRegs = [
  {
    id: 1,
    email: 'alice@school.edu.tw',
    name: 'Alice',
    student_id: 'S1001',
    memo: '想做 ML 研究',
    status: 'pending_review',
    reject_reason: null,
    one_user_id: null,
    created_at: '2026-04-15T10:30:00.000Z',
    reviewed_at: null,
    reviewed_by: null,
    verified: true,
  },
  {
    id: 2,
    email: 'bob@school.edu.tw',
    name: 'Bob',
    student_id: 'S1002',
    memo: null,
    status: 'pending_review',
    reject_reason: null,
    one_user_id: null,
    created_at: '2026-04-16T08:00:00.000Z',
    reviewed_at: null,
    reviewed_by: null,
    verified: true,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  listRegistrations.mockResolvedValue(sampleRegs)
})

describe('AdminRegistrations 註冊審核頁', () => {
  it('1. 渲染頁面標題', async () => {
    renderPage()
    expect(screen.getByText(/註冊審核/)).toBeDefined()
  })

  it('2. 渲染待審核列表（顯示 email、姓名、學號）', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/alice@school\.edu\.tw/)).toBeDefined()
      expect(screen.getByText(/Alice/)).toBeDefined()
      expect(screen.getByText(/S1001/)).toBeDefined()
      expect(screen.getByText(/bob@school\.edu\.tw/)).toBeDefined()
    })
  })

  it('3. 預設使用 pending_review 狀態查詢', async () => {
    renderPage()
    await waitFor(() => {
      expect(listRegistrations).toHaveBeenCalledWith('pending_review')
    })
  })

  it('4. 空列表顯示提示', async () => {
    listRegistrations.mockResolvedValueOnce([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/沒有註冊申請/)).toBeDefined()
    })
  })

  it('5. 點「通過」按鈕開啟確認 modal', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    const approveBtns = screen.getAllByRole('button', { name: /^通過$/ })
    fireEvent.click(approveBtns[0])
    await waitFor(() => {
      expect(screen.getByText(/確認通過註冊/)).toBeDefined()
      expect(screen.getByText(/自動產生密碼/)).toBeDefined()
      expect(screen.getByText(/自訂密碼/)).toBeDefined()
    })
  })

  it('6. 通過 modal 確認（auto）後呼叫 approveRegistration(id, null)', async () => {
    approveRegistration.mockResolvedValue({
      ok: true,
      one_user_id: 99,
      generated_password: 'GeNpW123abc',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])
    await waitFor(() => {
      expect(screen.getByText(/確認通過註冊/)).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^確認通過$/ }))
    await waitFor(() => {
      expect(approveRegistration).toHaveBeenCalledWith(1, null)
    })
  })

  it('7. 通過成功後彈出顯示產生密碼的 modal', async () => {
    approveRegistration.mockResolvedValue({
      ok: true,
      one_user_id: 99,
      generated_password: 'TopSecretPW9!',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])
    await waitFor(() => {
      expect(screen.getByText(/確認通過註冊/)).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^確認通過$/ }))
    await waitFor(() => {
      expect(screen.getByText(/TopSecretPW9!/)).toBeDefined()
      expect(screen.getByText(/已通過審核/)).toBeDefined()
    })
  })

  it('8. 自訂密碼小於 8 字顯示錯誤且不呼叫 API', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])
    await waitFor(() => {
      expect(screen.getByText(/確認通過註冊/)).toBeDefined()
    })
    // 切到自訂密碼
    fireEvent.click(screen.getByLabelText(/自訂密碼/))
    fireEvent.change(screen.getByLabelText(/^密碼$/), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /^確認通過$/ }))
    await waitFor(() => {
      expect(screen.getByText(/自訂密碼長度需至少 8 字/)).toBeDefined()
    })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('9. 點「拒絕」開啟 modal', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^拒絕$/ })[0])
    await waitFor(() => {
      // h3 modal 標題
      expect(screen.getByRole('heading', { name: /確認拒絕/ })).toBeDefined()
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
  })

  it('10. 拒絕未填原因時不能送、顯示錯誤', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^拒絕$/ })[0])
    await waitFor(() => {
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^確認拒絕$/ }))
    await waitFor(() => {
      expect(screen.getByText(/請輸入拒絕原因/)).toBeDefined()
    })
    expect(rejectRegistration).not.toHaveBeenCalled()
  })

  it('11. 拒絕填原因後呼叫 rejectRegistration(id, reason)', async () => {
    rejectRegistration.mockResolvedValue({ ok: true })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^拒絕$/ })[0])
    await waitFor(() => {
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/拒絕原因/), {
      target: { value: '學號格式不符合' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^確認拒絕$/ }))
    await waitFor(() => {
      expect(rejectRegistration).toHaveBeenCalledWith(1, '學號格式不符合')
    })
  })

  it('12. 切換 tab 重新查詢（已通過）', async () => {
    renderPage()
    await waitFor(() => {
      expect(listRegistrations).toHaveBeenCalledWith('pending_review')
    })
    fireEvent.click(screen.getByRole('button', { name: /^已通過$/ }))
    await waitFor(() => {
      expect(listRegistrations).toHaveBeenCalledWith('approved')
    })
  })

  it('13. 切換 tab 重新查詢（全部）', async () => {
    renderPage()
    await waitFor(() => {
      expect(listRegistrations).toHaveBeenCalledWith('pending_review')
    })
    fireEvent.click(screen.getByRole('button', { name: /^全部$/ }))
    await waitFor(() => {
      expect(listRegistrations).toHaveBeenCalledWith('all')
    })
  })
})
