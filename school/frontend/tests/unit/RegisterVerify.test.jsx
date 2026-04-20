import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../src/api/register.js', () => ({
  register: vi.fn(),
  verifyRegister: vi.fn().mockResolvedValue({ ok: true }),
  resendCode: vi.fn().mockResolvedValue({ ok: true }),
}))

import RegisterVerify from '../../src/pages/RegisterVerify.jsx'

function renderPage(email = 'student@example.com') {
  return render(
    <MemoryRouter initialEntries={[`/register/verify?email=${encodeURIComponent(email)}`]}>
      <RegisterVerify />
    </MemoryRouter>
  )
}

describe('RegisterVerify 驗證碼頁', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. 渲染顯示 email', () => {
    renderPage('foo@bar.com')
    expect(screen.getByText(/foo@bar.com/)).toBeDefined()
    expect(screen.getByRole('button', { name: /^驗證$/ })).toBeDefined()
  })

  it('2. 渲染重寄按鈕（一開始可點）', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /重寄驗證碼/ })).toBeDefined()
  })

  it('3. 驗證成功 navigate /register/pending', async () => {
    const mod = await import('../../src/api/register.js')
    mod.verifyRegister.mockClear()
    mod.verifyRegister.mockResolvedValueOnce({ ok: true })
    renderPage('s@e.com')
    const input = document.querySelector('input[inputmode="numeric"]')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^驗證$/ }))
    await waitFor(() => {
      expect(mod.verifyRegister).toHaveBeenCalledWith({ email: 's@e.com', code: '123456' })
      expect(mockNavigate).toHaveBeenCalledWith('/register/pending')
    })
  })

  it('4. 驗證失敗顯示後端錯誤訊息', async () => {
    const mod = await import('../../src/api/register.js')
    mod.verifyRegister.mockClear()
    mod.verifyRegister.mockRejectedValueOnce({
      response: { data: { error: '驗證碼錯誤（剩餘 2 次）' } },
    })
    renderPage()
    const input = document.querySelector('input[inputmode="numeric"]')
    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /^驗證$/ }))
    await waitFor(() => {
      expect(screen.getByText(/驗證碼錯誤/)).toBeDefined()
    })
  })

  it('5. 點重寄按鈕後啟動 60 秒倒數，按鈕禁用', async () => {
    const mod = await import('../../src/api/register.js')
    mod.resendCode.mockClear()
    mod.resendCode.mockResolvedValueOnce({ ok: true })
    renderPage('a@b.com')

    const resendBtn = screen.getByRole('button', { name: /重寄驗證碼/ })
    fireEvent.click(resendBtn)

    // 等 resendCode resolve + setCountdown 觸發 re-render
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /重寄驗證碼.*60s/ })
      expect(btn).toBeDefined()
      expect(btn.disabled).toBe(true)
    })

    // 確認 60 秒倒數從 60 起步（顯示 60s）
    expect(screen.getByRole('button', { name: /60s/ })).toBeDefined()
    // 確認 API 確實被呼叫過
    expect(mod.resendCode).toHaveBeenCalledWith({ email: 'a@b.com' })
  })
})
