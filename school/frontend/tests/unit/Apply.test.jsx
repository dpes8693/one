// tests/unit/Apply.test.jsx
// Sprint 5 Task #17：Apply.jsx 測試
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/applications.js', () => ({
  getTemplates: vi.fn(),
  getAvailability: vi.fn(),
  createApplication: vi.fn(),
}))

import Apply, {
  mergeSlots,
  checkResourceViolations,
  buildAvailabilityMap,
  hourSlotISO,
  getDayStartUTC,
} from '../../src/pages/Apply.jsx'
import {
  getTemplates,
  getAvailability,
  createApplication,
} from '../../src/api/applications.js'

const TPL = {
  id: 1,
  name: 'Ubuntu 24.04 + RTX 4070Ti',
  defaults: { cpu: 4, ram_gb: 8, disk_gb: 50, gpu_count: 1 },
}

// 產一個 30 天 × 24 小時的 availability 假資料
function makeAvailability({ gpuFor = () => 8 } = {}) {
  const out = []
  for (let d = 0; d < 30; d++) {
    for (let h = 0; h < 24; h++) {
      const startISO = hourSlotISO(d, h)
      const endTs = new Date(startISO).getTime() + 60 * 60 * 1000
      out.push({
        start_at: startISO,
        end_at: new Date(endTs).toISOString(),
        available: {
          cpu: 32,
          ram_gb: 64,
          disk_gb: 2000,
          gpu: gpuFor(d, h),
        },
      })
    }
  }
  return out
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Apply />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

/**
 * 切到第 d 天（先 waitFor 確認 tab 已渲染、availability 已載入），
 * 點完後 waitFor 該天 cell-d-0 出現，避免後續 querySelector 拿到 null。
 */
async function switchToDay(d) {
  await waitFor(() => {
    const tab = document.querySelector(`[data-testid="day-tab-${d}"]`)
    expect(tab).not.toBeNull()
  })
  fireEvent.click(document.querySelector(`[data-testid="day-tab-${d}"]`))
  await waitFor(() => {
    const c = document.querySelector(`[data-testid="cell-${d}-0"]`)
    expect(c).not.toBeNull()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getTemplates.mockResolvedValue(TPL)
  getAvailability.mockResolvedValue(makeAvailability())
  createApplication.mockResolvedValue({ ok: true, application_id: 99, slots: [] })
})

// ============================================================================
// 純 logic 測試
// ============================================================================

describe('Apply 純 logic', () => {
  it('mergeSlots: 連續 3 個整點 → 合成 1 段', () => {
    const a = '2026-04-25T08:00:00.000Z'
    const b = '2026-04-25T09:00:00.000Z'
    const c = '2026-04-25T10:00:00.000Z'
    const out = mergeSlots(new Set([a, b, c]))
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      start_at: '2026-04-25T08:00:00.000Z',
      end_at: '2026-04-25T11:00:00.000Z',
    })
  })

  it('mergeSlots: 不連續整點 → 切成多段', () => {
    const a = '2026-04-25T08:00:00.000Z'
    const c = '2026-04-25T10:00:00.000Z'
    const out = mergeSlots(new Set([a, c]))
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      start_at: '2026-04-25T08:00:00.000Z',
      end_at: '2026-04-25T09:00:00.000Z',
    })
    expect(out[1]).toEqual({
      start_at: '2026-04-25T10:00:00.000Z',
      end_at: '2026-04-25T11:00:00.000Z',
    })
  })

  it('mergeSlots: 跨天連續 → 合成 1 段（end 跨日）', () => {
    const a = '2026-04-25T22:00:00.000Z'
    const b = '2026-04-25T23:00:00.000Z'
    const c = '2026-04-26T00:00:00.000Z'
    const out = mergeSlots([a, b, c])
    expect(out).toHaveLength(1)
    expect(out[0].start_at).toBe('2026-04-25T22:00:00.000Z')
    expect(out[0].end_at).toBe('2026-04-26T01:00:00.000Z')
  })

  it('mergeSlots: 空集合 → []', () => {
    expect(mergeSlots(new Set())).toEqual([])
  })

  it('checkResourceViolations: 全部夠用 → 空陣列', () => {
    const startISO = '2026-04-25T10:00:00.000Z'
    const map = {
      [startISO]: { cpu: 32, ram_gb: 64, disk_gb: 2000, gpu: 8 },
    }
    const v = checkResourceViolations(
      new Set([startISO]),
      { cpu: 4, ram_gb: 8, disk_gb: 50, gpu_count: 1 },
      map
    )
    expect(v).toEqual([])
  })

  it('checkResourceViolations: GPU 不足 → 回 violation', () => {
    const startISO = '2026-04-25T10:00:00.000Z'
    const map = {
      [startISO]: { cpu: 32, ram_gb: 64, disk_gb: 2000, gpu: 0 },
    }
    const v = checkResourceViolations(
      new Set([startISO]),
      { cpu: 4, ram_gb: 8, disk_gb: 50, gpu_count: 2 },
      map
    )
    expect(v).toHaveLength(1)
    expect(v[0].start_at).toBe(startISO)
    expect(v[0].missing.join(',')).toMatch(/GPU/)
  })

  it('buildAvailabilityMap: 把陣列轉為 ISO map', () => {
    const list = [
      {
        start_at: '2026-04-25T10:00:00.000Z',
        end_at: '2026-04-25T11:00:00.000Z',
        available: { cpu: 32, ram_gb: 64, disk_gb: 2000, gpu: 8 },
      },
    ]
    const m = buildAvailabilityMap(list)
    expect(m['2026-04-25T10:00:00.000Z']).toEqual({
      cpu: 32,
      ram_gb: 64,
      disk_gb: 2000,
      gpu: 8,
    })
  })
})

// ============================================================================
// 元件渲染 / 互動測試
// ============================================================================

describe('Apply 元件', () => {
  it('1. 渲染頁面標題「申請新預約」', async () => {
    renderPage()
    expect(screen.getByText(/申請新預約/)).toBeDefined()
  })

  it('2. 渲染 30 個日期 tabs', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('[data-testid="day-tab-0"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="day-tab-29"]')).not.toBeNull()
    })
  })

  it('3. 渲染 24 個 cell', async () => {
    renderPage()
    await switchToDay(1)
    for (let h = 0; h < 24; h++) {
      const c = document.querySelector(`[data-testid="cell-1-${h}"]`)
      expect(c).not.toBeNull()
    }
  })

  it('4. Template 載入後自動填入 4 欄位 defaults', async () => {
    renderPage()
    await waitFor(() => {
      const cpu = document.querySelector('[data-testid="spec-cpu"]')
      expect(cpu?.value).toBe('4')
    })
    expect(document.querySelector('[data-testid="spec-ram_gb"]').value).toBe('8')
    expect(document.querySelector('[data-testid="spec-disk_gb"]').value).toBe('50')
    expect(document.querySelector('[data-testid="spec-gpu_count"]').value).toBe('1')
  })

  it('5. 點 cell → 高亮（class 含 bg-blue-200）', async () => {
    renderPage()
    await switchToDay(1)
    const cell = document.querySelector('[data-testid="cell-1-10"]')
    expect(cell.className).not.toContain('bg-blue-200')
    fireEvent.click(cell)
    await waitFor(() => {
      const after = document.querySelector('[data-testid="cell-1-10"]')
      expect(after.className).toContain('bg-blue-200')
    })
  })

  it('6. 切換日期 tab 後再點 cell（跨天選取） → 摘要顯示 2 個 cell', async () => {
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))
    await switchToDay(2)
    fireEvent.click(document.querySelector('[data-testid="cell-2-9"]'))
    await waitFor(() => {
      expect(screen.getByText(/2 個 cell/)).toBeDefined()
    })
  })

  it('7. 連續 cell → 摘要顯示 1 個區段', async () => {
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))
    fireEvent.click(document.querySelector('[data-testid="cell-1-10"]'))
    fireEvent.click(document.querySelector('[data-testid="cell-1-11"]'))
    await waitFor(() => {
      expect(screen.getByText(/3 個 cell \/ 1 個區段/)).toBeDefined()
      expect(screen.getByText(/3 小時/)).toBeDefined()
    })
  })

  it('8. 不連續 cell → 摘要顯示 2 個區段', async () => {
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))
    fireEvent.click(document.querySelector('[data-testid="cell-1-14"]'))
    await waitFor(() => {
      expect(screen.getByText(/2 個 cell \/ 2 個區段/)).toBeDefined()
    })
  })

  it('9. GPU 數調高超過該 cell 可用 → 顯示警告 + 按鈕禁用', async () => {
    getAvailability.mockResolvedValue(
      makeAvailability({
        gpuFor: (d, h) => (d === 1 && h === 9 ? 1 : 8),
      })
    )
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))
    const gpuInput = document.querySelector('[data-testid="spec-gpu_count"]')
    fireEvent.change(gpuInput, { target: { value: '5' } })

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="violation-warning"]')
      ).not.toBeNull()
    })
    const submit = document.querySelector('[data-testid="submit-btn"]')
    expect(submit.disabled).toBe(true)
  })

  it('10. 送出 → 呼叫 createApplication 帶正確 payload', async () => {
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))
    fireEvent.click(document.querySelector('[data-testid="cell-1-10"]'))

    await waitFor(() => {
      const btn = document.querySelector('[data-testid="submit-btn"]')
      expect(btn.disabled).toBe(false)
    })
    fireEvent.click(document.querySelector('[data-testid="submit-btn"]'))

    await waitFor(() => {
      expect(createApplication).toHaveBeenCalledTimes(1)
    })
    const arg = createApplication.mock.calls[0][0]
    expect(arg.template_id).toBe(1)
    expect(arg.cpu).toBe(4)
    expect(arg.ram_gb).toBe(8)
    expect(arg.gpu_count).toBe(1)
    expect(arg.slots).toHaveLength(1) // 連續合併
    expect(arg.slots[0]).toEqual({
      start_at: hourSlotISO(1, 9),
      end_at: hourSlotISO(1, 11),
    })
  })

  it('11. 送出成功 → 顯示 toast + 清空 selected', async () => {
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))

    await waitFor(() => {
      const btn = document.querySelector('[data-testid="submit-btn"]')
      expect(btn.disabled).toBe(false)
    })
    fireEvent.click(document.querySelector('[data-testid="submit-btn"]'))

    await waitFor(() => {
      expect(screen.getByText(/已送出，等待管理員審核/)).toBeDefined()
    })
    await waitFor(() => {
      const cell = document.querySelector('[data-testid="cell-1-9"]')
      expect(cell.className).not.toContain('bg-blue-200')
    })
    expect(screen.getByText(/0 個 cell/)).toBeDefined()
  })

  it('12. 送出失敗 (409 violations) → 顯示違規清單 toast', async () => {
    createApplication.mockRejectedValue({
      response: {
        data: {
          ok: false,
          violations: [
            { start_at: '2026-04-25T09:00:00.000Z', missing: ['GPU 5 > 1'] },
          ],
        },
      },
    })
    renderPage()
    await switchToDay(1)
    fireEvent.click(document.querySelector('[data-testid="cell-1-9"]'))

    await waitFor(() => {
      const btn = document.querySelector('[data-testid="submit-btn"]')
      expect(btn.disabled).toBe(false)
    })
    fireEvent.click(document.querySelector('[data-testid="submit-btn"]'))

    await waitFor(() => {
      expect(screen.getByText(/資源不足/)).toBeDefined()
    })
  })

  it('13. 未選任何 cell → 送出鈕 disabled', async () => {
    renderPage()
    await waitFor(() => {
      const btn = document.querySelector('[data-testid="submit-btn"]')
      expect(btn).not.toBeNull()
      expect(btn.disabled).toBe(true)
    })
  })

  it('14. cell tooltip 顯示 4 種資源餘量', async () => {
    renderPage()
    await switchToDay(1)
    const cell = document.querySelector('[data-testid="cell-1-10"]')
    expect(cell.title).toMatch(/可用 8 GPU \/ 64G RAM \/ 32 核 \/ 2000G Disk/)
  })

  it('15. 全 0 GPU 的 cell 標紅且禁用', async () => {
    getAvailability.mockResolvedValue(
      makeAvailability({
        gpuFor: (d, h) => (d === 1 && h === 12 ? 0 : 8),
      })
    )
    renderPage()
    await switchToDay(1)
    await waitFor(() => {
      const cell = document.querySelector('[data-testid="cell-1-12"]')
      expect(cell.className).toMatch(/bg-red-50/)
      expect(cell.disabled).toBe(true)
    })
  })
})
