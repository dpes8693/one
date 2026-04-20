import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'

// 必須在 import 元件前 mock
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../src/api/register.js', () => ({
  register: vi.fn().mockResolvedValue({ ok: true }),
  verifyRegister: vi.fn(),
  resendCode: vi.fn(),
}))

import Register from '../../src/pages/Register.jsx'

function renderPage() {
  return render(
    <BrowserRouter>
      <Register />
    </BrowserRouter>
  )
}

describe('Register 註冊頁', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('1. 渲染所有欄位', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/your@email.com/)).toBeDefined()
    expect(screen.getAllByPlaceholderText(/至少 8 字元|再次輸入密碼/).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(/王小明/)).toBeDefined()
    expect(screen.getByPlaceholderText(/B12345678/)).toBeDefined()
    expect(screen.getByPlaceholderText(/資工系/)).toBeDefined()
    expect(screen.getByRole('button', { name: /送出註冊/ })).toBeDefined()
  })

  it('2. 必填欄位空白送出顯示錯誤', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /送出註冊/ }))
    await waitFor(() => {
      expect(screen.getByText(/請填寫所有必填欄位/)).toBeDefined()
    })
  })

  it('3. 密碼不一致顯示錯誤', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/your@email.com/), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText(/^至少 8 字元$/), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/再次輸入密碼/), { target: { value: 'password999' } })
    fireEvent.change(screen.getByPlaceholderText(/王小明/), { target: { value: '小明' } })
    fireEvent.change(screen.getByPlaceholderText(/B12345678/), { target: { value: 'B123' } })
    fireEvent.click(screen.getByRole('button', { name: /送出註冊/ }))
    await waitFor(() => {
      expect(screen.getByText(/兩次密碼輸入不一致/)).toBeDefined()
    })
  })

  it('4. email 格式錯誤顯示錯誤', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/your@email.com/), { target: { value: 'not-an-email' } })
    fireEvent.change(screen.getByPlaceholderText(/^至少 8 字元$/), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/再次輸入密碼/), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/王小明/), { target: { value: '小明' } })
    fireEvent.change(screen.getByPlaceholderText(/B12345678/), { target: { value: 'B123' } })
    fireEvent.click(screen.getByRole('button', { name: /送出註冊/ }))
    await waitFor(() => {
      expect(screen.getByText(/email 格式錯誤/)).toBeDefined()
    })
  })

  it('5. 送出成功 → navigate /register/verify', async () => {
    const mod = await import('../../src/api/register.js')
    mod.register.mockClear()
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/your@email.com/), { target: { value: 'student@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/^至少 8 字元$/), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/再次輸入密碼/), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/王小明/), { target: { value: '小明' } })
    fireEvent.change(screen.getByPlaceholderText(/B12345678/), { target: { value: 'B12345678' } })
    fireEvent.click(screen.getByRole('button', { name: /送出註冊/ }))

    await waitFor(() => {
      expect(mod.register).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/register/verify?email=')
      )
    })
  })
})
