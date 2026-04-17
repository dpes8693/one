import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listUsers,
  updateQuota,
  enableUser,
  disableUser,
  resetPassword,
} from '../../api/users.js'

// 從 USER 物件抽出 VM_QUOTA.VM
function extractVmQuota(user) {
  return user?.VM_QUOTA?.VM ?? null
}

// 顯示 used / limit；limit 為空或 -1 視為「無上限」
function formatQuota(used, limit) {
  const u = used ?? '0'
  const l = limit
  if (l === undefined || l === null || l === '' || l === '-1') {
    return `${u} / ∞`
  }
  return `${u} / ${l}`
}

function QuotaModal({ user, onClose, onConfirm, error, loading }) {
  const vq = extractVmQuota(user) || {}
  const [vms, setVms] = useState(vq.VMS ?? '')
  const [cpu, setCpu] = useState(vq.CPU ?? '')
  const [memory, setMemory] = useState(vq.MEMORY ?? '')
  const [diskSize, setDiskSize] = useState(vq.SYSTEM_DISK_SIZE ?? '')

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {}
    if (vms !== '') payload.vms = parseInt(vms, 10)
    if (cpu !== '') payload.cpu = parseInt(cpu, 10)
    if (memory !== '') payload.memory = parseInt(memory, 10)
    if (diskSize !== '') payload.system_disk_size = parseInt(diskSize, 10)
    onConfirm(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">修改配額</h3>
        <p className="text-sm text-gray-500 mb-4">
          使用者：{user.NAME}（ID: {user.ID}）
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="quota-vm" className="block text-sm font-medium text-gray-700 mb-1">
              VM
            </label>
            <input
              id="quota-vm"
              type="number"
              value={vms}
              onChange={(e) => setVms(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="quota-cpu" className="block text-sm font-medium text-gray-700 mb-1">
              CPU
            </label>
            <input
              id="quota-cpu"
              type="number"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="quota-memory" className="block text-sm font-medium text-gray-700 mb-1">
              記憶體 MEMORY (MB)
            </label>
            <input
              id="quota-memory"
              type="number"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="quota-disk" className="block text-sm font-medium text-gray-700 mb-1">
              系統磁碟 SYSTEM_DISK_SIZE (MB)
            </label>
            <input
              id="quota-disk"
              type="number"
              value={diskSize}
              onChange={(e) => setDiskSize(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">配額更新失敗：{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PasswordModal({ user, onClose, onConfirm, error, loading }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    if (!password) {
      setLocalError('請輸入新密碼')
      return
    }
    if (password !== confirmPassword) {
      setLocalError('兩次輸入的密碼不一致')
      return
    }
    onConfirm(password)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">重設密碼</h3>
        <p className="text-sm text-gray-500 mb-4">
          使用者：{user.NAME}（ID: {user.ID}）
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
              新密碼
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
              確認密碼
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {(localError || error) && (
            <p className="text-sm text-red-600">{localError || `密碼更新失敗：${error}`}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const [quotaUser, setQuotaUser] = useState(null)
  const [pwUser, setPwUser] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  })

  const users = data?.users || []

  const enableMut = useMutation({
    mutationFn: (id) => enableUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const disableMut = useMutation({
    mutationFn: (id) => disableUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const quotaMut = useMutation({
    mutationFn: ({ id, payload }) => updateQuota(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setQuotaUser(null)
    },
  })

  const pwMut = useMutation({
    mutationFn: ({ id, password }) => resetPassword(id, password),
    onSuccess: () => {
      setPwUser(null)
    },
  })

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-800">使用者管理</h1>

      {isLoading && <div className="text-center py-16 text-gray-400">載入中...</div>}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入使用者列表失敗
        </div>
      )}

      {!isLoading && users.length === 0 && (
        <div className="text-center py-16 text-gray-400">沒有使用者</div>
      )}

      {users.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">名稱</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">認證方式</th>
                <th className="px-4 py-3 font-medium">VM 配額（VMS / CPU / MEM / DISK）</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const enabled = u.ENABLED === '1'
                const vq = extractVmQuota(u) || {}
                return (
                  <tr key={u.ID} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{u.ID}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{u.NAME}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {enabled ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.AUTH_DRIVER || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>VMS：{formatQuota(vq.VMS_USED, vq.VMS)}</div>
                      <div>CPU：{formatQuota(vq.CPU_USED, vq.CPU)}</div>
                      <div>MEM：{formatQuota(vq.MEMORY_USED, vq.MEMORY)}</div>
                      <div>DISK：{formatQuota(vq.SYSTEM_DISK_SIZE_USED, vq.SYSTEM_DISK_SIZE)}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        {enabled ? (
                          <button
                            onClick={() => disableMut.mutate(u.ID)}
                            disabled={disableMut.isPending}
                            className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
                          >
                            停用
                          </button>
                        ) : (
                          <button
                            onClick={() => enableMut.mutate(u.ID)}
                            disabled={enableMut.isPending}
                            className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            啟用
                          </button>
                        )}
                        <button
                          onClick={() => setQuotaUser(u)}
                          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          改配額
                        </button>
                        <button
                          onClick={() => setPwUser(u)}
                          className="px-2.5 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
                        >
                          重設密碼
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {quotaUser && (
        <QuotaModal
          user={quotaUser}
          loading={quotaMut.isPending}
          error={quotaMut.isError ? (quotaMut.error?.message || '未知錯誤') : ''}
          onClose={() => {
            quotaMut.reset()
            setQuotaUser(null)
          }}
          onConfirm={(payload) => quotaMut.mutate({ id: quotaUser.ID, payload })}
        />
      )}

      {pwUser && (
        <PasswordModal
          user={pwUser}
          loading={pwMut.isPending}
          error={pwMut.isError ? (pwMut.error?.message || '未知錯誤') : ''}
          onClose={() => {
            pwMut.reset()
            setPwUser(null)
          }}
          onConfirm={(password) => pwMut.mutate({ id: pwUser.ID, password })}
        />
      )}
    </div>
  )
}
