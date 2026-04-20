// frontend/tests/unit/AdminApplications.test.jsx
// Sprint 5 Task #19：admin 申請審核頁加「資源警告 banner」
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 必須先 mock 後 import
vi.mock('../../src/api/applications.js', () => ({
  getApplications: vi.fn(),
  approveApplication: vi.fn(),
  rejectApplication: vi.fn(),
}))

import AdminApplications from '../../src/pages/admin/Applications.jsx'
import ResourceViolationBanner from '../../src/components/ResourceViolationBanner.jsx'
import {
  getApplications,
  approveApplication,
  rejectApplication,
} from '../../src/api/applications.js'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminApplications />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

const sampleApps = {
  applications: [
    {
      id: 12,
      student_name: 'Alice',
      student_id: 'S1001',
      email: 'alice@school.edu.tw',
      gpu_spec: 'RTX 4070 x6',
      purpose: 'ML 研究',
      status: 'pending',
      created_at: '2026-04-15T10:30:00.000Z',
      reject_reason: null,
    },
    {
      id: 17,
      student_name: 'Bob',
      student_id: 'S1002',
      email: 'bob@school.edu.tw',
      gpu_spec: 'RTX 4070 x2',
      purpose: '作業',
      status: 'pending',
      created_at: '2026-04-16T09:00:00.000Z',
      reject_reason: null,
    },
  ],
}

const sampleViolations = [
  {
    resource: 'gpu',
    slot: { start_at: '2026-04-25T14:00:00.000Z', end_at: '2026-04-25T18:00:00.000Z' },
    requested: 6,
    available: 4,
    total: 8,
  },
  {
    resource: 'ram_gb',
    slot: { start_at: '2026-04-25T16:00:00.000Z', end_at: '2026-04-25T20:00:00.000Z' },
    requested: 64,
    available: 26,
    total: 64,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  getApplications.mockResolvedValue(sampleApps)
})

// =====================================================
// AdminApplications 頁面
// =====================================================

describe('AdminApplications 申請審核頁（Sprint 5 #19）', () => {
  it('1. 渲染列表（顯示 student_name、id）', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.getByText('Bob')).toBeDefined()
      expect(screen.getByText('S1001')).toBeDefined()
    })
  })

  it('2. 預設使用 pending 篩選查詢', async () => {
    renderPage()
    await waitFor(() => {
      expect(getApplications).toHaveBeenCalledWith('pending')
    })
  })

  it('3. 點通過成功 → 呼叫 approveApplication 並顯示成功 toast 含 GPU 編號', async () => {
    approveApplication.mockResolvedValue({
      ok: true,
      application_id: 12,
      gpu_allocations: { 101: [1, 2, 3] },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())

    // Alice 那列的「通過」按鈕（第一個）
    const approveBtns = screen.getAllByRole('button', { name: /^通過$/ })
    fireEvent.click(approveBtns[0])

    await waitFor(() => {
      expect(approveApplication).toHaveBeenCalledWith(12)
    })
    await waitFor(() => {
      expect(screen.getByText(/已通過、已寄信給學生.*GPU 編號 \[1, 2, 3\]/)).toBeDefined()
    })
  })

  it('4. 點通過失敗 409 → 顯示 violations banner，且該列「通過」鈕變 disabled', async () => {
    approveApplication.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'resource_exceeded',
          violations: sampleViolations,
        },
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())

    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])

    // banner 顯示
    await waitFor(() => {
      expect(screen.getByTestId('resource-violation-banner')).toBeDefined()
      expect(screen.getByText(/資源不足，無法通過此申請/)).toBeDefined()
    })

    // 該列的「通過」鈕應 disabled
    const aliceRow = screen.getByTestId('app-row-12')
    const aliceApproveBtn = aliceRow.querySelector('button')
    expect(aliceApproveBtn).toBeTruthy()
    // 找該列裡名稱叫「通過」的按鈕
    const buttons = aliceRow.querySelectorAll('button')
    const approveBtn = Array.from(buttons).find((b) => b.textContent.trim() === '通過')
    expect(approveBtn).toBeTruthy()
    expect(approveBtn.disabled).toBe(true)
    expect(approveBtn.getAttribute('title')).toBe('資源不足')
  })

  it('5. 409 banner 列出每筆 violation 的時段、需求、可用、總量', async () => {
    approveApplication.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'resource_exceeded', violations: sampleViolations },
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])

    await waitFor(() => {
      expect(screen.getByTestId('resource-violation-banner')).toBeDefined()
    })
    // GPU 行
    expect(screen.getByText(/GPU 需求 6張，可用 4張（總量 8張）/)).toBeDefined()
    // RAM 行
    expect(screen.getByText(/RAM 需求 64GB，可用 26GB（總量 64GB）/)).toBeDefined()
  })

  it('6. 點 banner「關閉警告」→ banner 消失、通過鈕恢復可用', async () => {
    approveApplication.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'resource_exceeded', violations: sampleViolations },
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])

    await waitFor(() => {
      expect(screen.getByTestId('resource-violation-banner')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /^關閉警告$/ }))

    await waitFor(() => {
      expect(screen.queryByTestId('resource-violation-banner')).toBeNull()
    })
    const aliceRow = screen.getByTestId('app-row-12')
    const approveBtn = Array.from(aliceRow.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === '通過'
    )
    expect(approveBtn.disabled).toBe(false)
  })

  it('7. 點 banner「拒絕此申請」→ 開啟拒絕 modal', async () => {
    approveApplication.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'resource_exceeded', violations: sampleViolations },
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())
    fireEvent.click(screen.getAllByRole('button', { name: /^通過$/ })[0])

    await waitFor(() => {
      expect(screen.getByTestId('resource-violation-banner')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /^拒絕此申請$/ }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /確認拒絕申請/ })).toBeDefined()
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
  })

  it('8. 點「拒絕」→ 開 modal 輸入原因 → 提交呼叫 rejectApplication', async () => {
    rejectApplication.mockResolvedValue({ ok: true })
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())

    const rejectBtns = screen.getAllByRole('button', { name: /^拒絕$/ })
    fireEvent.click(rejectBtns[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/拒絕原因/), {
      target: { value: '資源不足，請改時段' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^確認拒絕$/ }))

    await waitFor(() => {
      expect(rejectApplication).toHaveBeenCalledWith(12, '資源不足，請改時段')
    })
  })

  it('9. 拒絕未填原因 → 顯示錯誤、不呼叫 API', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined())
    fireEvent.click(screen.getAllByRole('button', { name: /^拒絕$/ })[0])
    await waitFor(() => {
      expect(screen.getByLabelText(/拒絕原因/)).toBeDefined()
    })
    // 直接送出（用 form requestSubmit 之外，可改 click 確認鈕；但 textarea required 由 jsdom 不檢查 → 走自家驗證）
    // 自家驗證：先把 required 拿掉再點，會跑進 handleSubmit 的 trim 檢查
    const textarea = screen.getByLabelText(/拒絕原因/)
    textarea.removeAttribute('required')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^確認拒絕$/ }))
    await waitFor(() => {
      expect(screen.getByText(/請輸入拒絕原因/)).toBeDefined()
    })
    expect(rejectApplication).not.toHaveBeenCalled()
  })

  it('10. 切到 approved tab 重新查詢', async () => {
    renderPage()
    await waitFor(() => expect(getApplications).toHaveBeenCalledWith('pending'))
    fireEvent.click(screen.getByRole('button', { name: /^已通過$/ }))
    await waitFor(() => {
      expect(getApplications).toHaveBeenCalledWith('approved')
    })
  })

  it('11. approved 申請若 server 帶 gpu_allocations → 顯示 GPU 編號', async () => {
    getApplications.mockResolvedValueOnce({
      applications: [
        {
          id: 88,
          student_name: 'Carol',
          student_id: 'S1003',
          status: 'approved',
          gpu_allocations: { 201: [4, 5], 202: [4, 5] },
          created_at: '2026-04-10T08:00:00.000Z',
        },
      ],
    })
    renderPage()
    await waitFor(() => {
      const el = screen.getByTestId('gpu-alloc-88')
      expect(el).toBeDefined()
      expect(el.textContent).toMatch(/4, 5/)
    })
  })
})

// =====================================================
// ResourceViolationBanner 元件單獨渲染
// =====================================================

describe('ResourceViolationBanner 元件', () => {
  it('1. violations 為空 → 不渲染', () => {
    const { container } = render(<ResourceViolationBanner violations={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('2. 顯示 GPU 違規與時段資訊', () => {
    render(
      <ResourceViolationBanner
        violations={[
          {
            resource: 'gpu',
            slot: { start_at: '2026-04-25T14:00:00.000Z', end_at: '2026-04-25T18:00:00.000Z' },
            requested: 6,
            available: 4,
            total: 8,
          },
        ]}
      />
    )
    expect(screen.getByText(/資源不足，無法通過此申請/)).toBeDefined()
    expect(screen.getByText(/GPU 需求 6張，可用 4張（總量 8張）/)).toBeDefined()
  })

  it('3. 點「拒絕此申請」呼叫 onReject', () => {
    const onReject = vi.fn()
    render(
      <ResourceViolationBanner
        violations={[
          {
            resource: 'cpu',
            slot: { start_at: '2026-04-25T09:00:00.000Z', end_at: '2026-04-25T12:00:00.000Z' },
            requested: 32,
            available: 12,
            total: 32,
          },
        ]}
        onReject={onReject}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^拒絕此申請$/ }))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('4. 點「關閉警告」呼叫 onClose', () => {
    const onClose = vi.fn()
    render(
      <ResourceViolationBanner
        violations={[
          {
            resource: 'disk_gb',
            slot: { start_at: '2026-04-25T09:00:00.000Z', end_at: '2026-04-25T12:00:00.000Z' },
            requested: 500,
            available: 100,
            total: 2000,
          },
        ]}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^關閉警告$/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('5. 多筆 violations 各自渲染一行', () => {
    render(
      <ResourceViolationBanner
        violations={[
          {
            resource: 'gpu',
            slot: { start_at: '2026-04-25T14:00:00.000Z', end_at: '2026-04-25T18:00:00.000Z' },
            requested: 6,
            available: 4,
            total: 8,
          },
          {
            resource: 'ram_gb',
            slot: { start_at: '2026-04-25T16:00:00.000Z', end_at: '2026-04-25T20:00:00.000Z' },
            requested: 64,
            available: 26,
            total: 64,
          },
        ]}
      />
    )
    expect(screen.getByText(/GPU 需求 6張/)).toBeDefined()
    expect(screen.getByText(/RAM 需求 64GB/)).toBeDefined()
  })
})
