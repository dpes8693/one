import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock FullCalendar 元件
vi.mock('@fullcalendar/react', () => ({
  default: ({ events, dateClick, eventClick, selectable }) => (
    <div data-testid="fullcalendar">
      {events && events.map((e, i) => (
        <div
          key={i}
          data-testid="calendar-event"
          onClick={() => eventClick && eventClick({ event: { extendedProps: { scheduleId: e.extendedProps?.scheduleId } }, jsEvent: {} })}
        >
          {e.title}
        </div>
      ))}
      <button
        data-testid="simulate-date-click"
        onClick={() => dateClick && dateClick({ dateStr: '2026-04-20T10:00:00' })}
      >
        點選日期
      </button>
    </div>
  ),
}))
vi.mock('@fullcalendar/daygrid', () => ({ default: {} }))
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }))
vi.mock('@fullcalendar/interaction', () => ({ default: {} }))

vi.mock('../../src/api/schedules.js', () => ({
  getSchedules: vi.fn().mockResolvedValue({
    schedules: [
      {
        id: 1,
        one_user_id: 'user1',
        one_vm_id: 101,
        action: 'start',
        start_time: '2026-04-20T10:00:00.000Z',
        end_time: null,
      },
    ],
  }),
  createSchedule: vi.fn().mockResolvedValue({ id: 2 }),
  updateSchedule: vi.fn().mockResolvedValue({ id: 1 }),
  deleteSchedule: vi.fn().mockResolvedValue({}),
}))

import AdminSchedules from '../../src/pages/admin/Schedules.jsx'

function renderSchedules() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminSchedules />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AdminSchedules 行事曆排程頁面', () => {
  it('1. 渲染頁面標題', () => {
    renderSchedules()
    expect(screen.getByText(/排程行事曆/)).toBeDefined()
  })

  it('2. 渲染 FullCalendar 元件', () => {
    renderSchedules()
    expect(screen.getByTestId('fullcalendar')).toBeDefined()
  })

  it('3. 載入後顯示排程事件', async () => {
    renderSchedules()
    await waitFor(() => {
      expect(screen.getByText(/start/i)).toBeDefined()
    })
  })

  it('4. 點選日期觸發新增對話框', async () => {
    renderSchedules()
    const btn = screen.getByTestId('simulate-date-click')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/新增排程/)).toBeDefined()
    })
  })

  it('5. 點選事件觸發編輯對話框', async () => {
    renderSchedules()
    await waitFor(() => {
      expect(screen.getByTestId('calendar-event')).toBeDefined()
    })
    fireEvent.click(screen.getByTestId('calendar-event'))
    await waitFor(() => {
      expect(screen.getAllByText(/編輯排程|刪除/).length).toBeGreaterThan(0)
    })
  })

  it('6. 對話框包含 VM ID 輸入欄位', async () => {
    renderSchedules()
    fireEvent.click(screen.getByTestId('simulate-date-click'))
    await waitFor(() => {
      expect(screen.getByLabelText(/VM ID/)).toBeDefined()
    })
  })

  it('7. 對話框包含動作選單', async () => {
    renderSchedules()
    fireEvent.click(screen.getByTestId('simulate-date-click'))
    await waitFor(() => {
      expect(screen.getByLabelText(/動作/)).toBeDefined()
    })
  })
})
