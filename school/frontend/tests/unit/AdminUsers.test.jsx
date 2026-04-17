import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock API 模組（先 mock 後 import）
vi.mock('../../src/api/users.js', () => ({
  listUsers: vi.fn(),
  updateQuota: vi.fn(),
  enableUser: vi.fn(),
  disableUser: vi.fn(),
  resetPassword: vi.fn(),
}))

import AdminUsers from '../../src/pages/admin/Users.jsx'
import {
  listUsers,
  updateQuota,
  enableUser,
  disableUser,
  resetPassword,
} from '../../src/api/users.js'

function renderUsers() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AdminUsers />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

const sampleUsers = [
  {
    ID: '0',
    NAME: 'oneadmin',
    ENABLED: '1',
    AUTH_DRIVER: 'core',
    VM_QUOTA: {
      VM: {
        VMS: '5',
        VMS_USED: '1',
        CPU: '8',
        CPU_USED: '2',
        MEMORY: '8192',
        MEMORY_USED: '2048',
        SYSTEM_DISK_SIZE: '20480',
        SYSTEM_DISK_SIZE_USED: '4096',
      },
    },
  },
  {
    ID: '5',
    NAME: 'student1',
    ENABLED: '0',
    AUTH_DRIVER: 'core',
    VM_QUOTA: {},
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  listUsers.mockResolvedValue({ users: sampleUsers })
})

describe('AdminUsers 使用者管理頁', () => {
  it('1. 渲染頁面標題', async () => {
    renderUsers()
    expect(screen.getByText(/使用者管理/)).toBeDefined()
  })

  it('2. 渲染用戶列表（顯示名稱與 ID）', async () => {
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
      expect(screen.getByText(/student1/)).toBeDefined()
    })
  })

  it('3. 顯示啟用/停用狀態', async () => {
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    // ENABLED='1' → 啟用；ENABLED='0' → 停用
    expect(screen.getAllByText(/啟用|停用/).length).toBeGreaterThan(0)
  })

  it('4. 顯示認證方式', async () => {
    renderUsers()
    await waitFor(() => {
      expect(screen.getAllByText(/core/).length).toBeGreaterThan(0)
    })
  })

  it('5. 顯示 VM 配額（used/limit）', async () => {
    renderUsers()
    await waitFor(() => {
      // 1 / 5 (VMS used / VMS limit)
      expect(screen.getByText(/1\s*\/\s*5/)).toBeDefined()
    })
  })

  it('6. 空列表顯示提示', async () => {
    listUsers.mockResolvedValueOnce({ users: [] })
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/沒有使用者|無使用者/)).toBeDefined()
    })
  })

  it('7. 點停用按鈕觸發 disableUser mutation', async () => {
    disableUser.mockResolvedValue({ ok: true })
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    // oneadmin 是啟用狀態 → 應該顯示「停用」按鈕
    const disableBtns = screen.getAllByRole('button', { name: /^停用$/ })
    fireEvent.click(disableBtns[0])
    await waitFor(() => {
      expect(disableUser).toHaveBeenCalledWith('0')
    })
  })

  it('8. 點啟用按鈕觸發 enableUser mutation', async () => {
    enableUser.mockResolvedValue({ ok: true })
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/student1/)).toBeDefined()
    })
    // student1 是停用狀態 → 應顯示「啟用」按鈕
    const enableBtns = screen.getAllByRole('button', { name: /^啟用$/ })
    fireEvent.click(enableBtns[0])
    await waitFor(() => {
      expect(enableUser).toHaveBeenCalledWith('5')
    })
  })

  it('9. 點「改配額」開啟對話框', async () => {
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    const btn = screen.getAllByRole('button', { name: /改配額/ })[0]
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/修改配額/)).toBeDefined()
      expect(screen.getByLabelText(/VM/i)).toBeDefined()
    })
  })

  it('10. 改配額成功時呼叫 updateQuota', async () => {
    updateQuota.mockResolvedValue({ ok: true })
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /改配額/ })[0])
    await waitFor(() => {
      expect(screen.getByText(/修改配額/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/^VM$/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/^CPU$/i), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText(/記憶體|MEMORY/i), { target: { value: '16384' } })
    fireEvent.change(screen.getByLabelText(/系統磁碟|SYSTEM_DISK/i), { target: { value: '40960' } })
    fireEvent.click(screen.getByRole('button', { name: /確認|送出|儲存/ }))
    await waitFor(() => {
      expect(updateQuota).toHaveBeenCalledWith('0', {
        vms: 10,
        cpu: 16,
        memory: 16384,
        system_disk_size: 40960,
      })
    })
  })

  it('11. 改配額失敗顯示錯誤', async () => {
    updateQuota.mockRejectedValue(new Error('quota error'))
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /改配額/ })[0])
    await waitFor(() => {
      expect(screen.getByText(/修改配額/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/^VM$/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /確認|送出|儲存/ }))
    await waitFor(() => {
      expect(screen.getByText(/失敗|錯誤/)).toBeDefined()
    })
  })

  it('12. 重設密碼開啟對話框並送出', async () => {
    resetPassword.mockResolvedValue({ ok: true })
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /重設密碼/ })[0])
    await waitFor(() => {
      expect(screen.getByLabelText(/新密碼/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/新密碼/), { target: { value: 'newPass123' } })
    fireEvent.change(screen.getByLabelText(/確認密碼/), { target: { value: 'newPass123' } })
    fireEvent.click(screen.getByRole('button', { name: /確認|送出|儲存/ }))
    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith('0', 'newPass123')
    })
  })

  it('13. 重設密碼兩欄不一致時顯示錯誤且不呼叫 API', async () => {
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText(/oneadmin/)).toBeDefined()
    })
    fireEvent.click(screen.getAllByRole('button', { name: /重設密碼/ })[0])
    await waitFor(() => {
      expect(screen.getByLabelText(/新密碼/)).toBeDefined()
    })
    fireEvent.change(screen.getByLabelText(/新密碼/), { target: { value: 'aaa' } })
    fireEvent.change(screen.getByLabelText(/確認密碼/), { target: { value: 'bbb' } })
    fireEvent.click(screen.getByRole('button', { name: /確認|送出|儲存/ }))
    await waitFor(() => {
      expect(screen.getByText(/密碼不一致|不相符/)).toBeDefined()
    })
    expect(resetPassword).not.toHaveBeenCalled()
  })
})
