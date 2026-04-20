import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import RegisterPending from '../../src/pages/RegisterPending.jsx'

function renderPage() {
  return render(
    <BrowserRouter>
      <RegisterPending />
    </BrowserRouter>
  )
}

describe('RegisterPending 等待審核頁', () => {
  it('1. 渲染標題', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /註冊已送出/ })).toBeDefined()
  })

  it('2. 顯示三段說明文字', () => {
    renderPage()
    expect(screen.getByText(/請等待管理員審核/)).toBeDefined()
    expect(screen.getByText(/email 通知/)).toBeDefined()
    expect(screen.getByText(/SSH 帳號與密碼/)).toBeDefined()
  })

  it('3. 渲染返回登入按鈕（指向 /login）', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /返回登入/ })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/login')
  })
})
