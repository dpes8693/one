import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from '../../src/pages/Login.jsx'

function renderLogin() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter><Login /></BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Login page', () => {
  it('renders login form', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /登入/ })).toBeDefined()
  })
})
