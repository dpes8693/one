import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../src/api/sshKey.js', () => ({
  getSshKey: vi.fn().mockResolvedValue({ ssh_public_key: 'ssh-rsa AAAAB3NzaC1yc2EAAAA test@example.com' }),
  updateSshKey: vi.fn().mockResolvedValue({ success: true }),
}))

import SshKey from '../../src/pages/settings/SshKey.jsx'

function renderSshKey() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <SshKey />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('SshKey SSH 金鑰管理頁面', () => {
  it('1. 渲染頁面標題', () => {
    renderSshKey()
    expect(screen.getByText(/SSH 金鑰/)).toBeDefined()
  })

  it('2. 載入後顯示現有 SSH 公鑰', async () => {
    renderSshKey()
    await waitFor(() => {
      const textarea = screen.getByRole('textbox')
      expect(textarea.value).toContain('ssh-rsa')
    })
  })

  it('3. 渲染儲存按鈕', () => {
    renderSshKey()
    expect(screen.getByRole('button', { name: /儲存/ })).toBeDefined()
  })

  it('4. SSH key 格式錯誤時顯示錯誤訊息', async () => {
    renderSshKey()
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'invalid-key' } })
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))
    await waitFor(() => {
      // 使用 getAllByText 避免多元素問題，確認有錯誤 class 的段落
      const errorEls = document.querySelectorAll('.text-red-600')
      expect(errorEls.length).toBeGreaterThan(0)
    })
  })

  it('5. 合法的 ssh-rsa key 可以儲存', async () => {
    const mod = await import('../../src/api/sshKey.js')
    mod.updateSshKey.mockClear()
    renderSshKey()
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'ssh-rsa AAAAB3Nza test@host' } })
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))
    await waitFor(() => {
      expect(mod.updateSshKey).toHaveBeenCalled()
      expect(mod.updateSshKey.mock.calls[0][0]).toBe('ssh-rsa AAAAB3Nza test@host')
    })
  })

  it('6. 合法的 ssh-ed25519 key 可以儲存', async () => {
    const mod = await import('../../src/api/sshKey.js')
    mod.updateSshKey.mockClear()
    renderSshKey()
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test@host' } })
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))
    await waitFor(() => {
      expect(mod.updateSshKey).toHaveBeenCalled()
      expect(mod.updateSshKey.mock.calls[0][0]).toBe('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test@host')
    })
  })

  it('7. 儲存成功後顯示成功訊息', async () => {
    renderSshKey()
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDefined()
    })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'ssh-rsa AAAAB3Nza test@host' } })
    fireEvent.click(screen.getByRole('button', { name: /儲存/ }))
    await waitFor(() => {
      expect(screen.getByText(/儲存成功|已更新/)).toBeDefined()
    })
  })
})
