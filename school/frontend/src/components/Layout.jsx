import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { logout } from '../api/auth.js'

function SidebarLink({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="px-3 pt-4 pb-1 text-xs text-gray-500 uppercase tracking-wider select-none">
      {children}
    </p>
  )
}

export default function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // 即使 API 失敗也要清除本地狀態
    }
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 側邊欄 */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">GPU 算力平台</h1>
          <p className="text-xs text-gray-400 mt-1">{user?.name || user?.user || '使用者'}</p>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {/* 主要功能 */}
          <SidebarLink to="/student/dashboard">我的 GPU</SidebarLink>
          <SidebarLink to="/vms">我的虛擬機</SidebarLink>

          {/* 設定群組（所有人可見） */}
          <SectionLabel>設定</SectionLabel>
          <SidebarLink to="/settings/ssh-key">SSH 金鑰</SidebarLink>

          {/* 管理群組（admin only） */}
          {isAdmin && (
            <>
              <SectionLabel>管理</SectionLabel>
              <SidebarLink to="/admin/dashboard">GPU 資源總覽</SidebarLink>
              <SidebarLink to="/admin/applications">申請審核</SidebarLink>
              <SidebarLink to="/admin/users">使用者管理</SidebarLink>
              <SidebarLink to="/admin/vip">VIP 管理</SidebarLink>
              <SidebarLink to="/admin/schedules">排程行事曆</SidebarLink>
              <SidebarLink to="/admin/audit">審計日誌</SidebarLink>
              <SidebarLink to="/admin/alerts">GPU 告警</SidebarLink>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            登出
          </button>
        </div>
      </aside>

      {/* 主內容 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
