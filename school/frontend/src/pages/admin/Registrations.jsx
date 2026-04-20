// Sprint 5 Task #12: admin 註冊審核頁
// 對應 SPEC_V2.md「③ 管理員審核」流程
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listRegistrations,
  approveRegistration,
  rejectRegistration,
} from '../../api/registrations.js'

const TABS = [
  { key: 'pending_review', label: '待審核' },
  { key: 'approved', label: '已通過' },
  { key: 'rejected', label: '已拒絕' },
  { key: 'all', label: '全部' },
]

const STATUS_TEXT = {
  pending_email: '待 email 驗證',
  pending_review: '待審核',
  approved: '已通過',
  rejected: '已拒絕',
}

const STATUS_BADGE = {
  pending_email: 'bg-gray-200 text-gray-700',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

function formatTime(s) {
  if (!s) return '-'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString('zh-TW', { hour12: false })
  } catch {
    return s
  }
}

// ---- Toast（簡易版，3 秒自動消失） ----
function Toast({ message, onClose }) {
  return (
    <div className="fixed top-6 right-6 z-[60] bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-300 hover:text-white">×</button>
    </div>
  )
}

// ---- 通過 Modal ----
function ApproveModal({ reg, onClose, onConfirm, error, loading }) {
  const [mode, setMode] = useState('auto') // auto | manual
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    if (mode === 'manual') {
      if (!password || password.length < 8) {
        setLocalError('自訂密碼長度需至少 8 字')
        return
      }
      onConfirm(password)
    } else {
      onConfirm(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">確認通過註冊</h3>
        <p className="text-sm text-gray-500 mb-4">
          將為 <span className="font-medium text-gray-700">{reg.name}</span>（學號 {reg.student_id}）建立 OpenNebula 帳號並寄出密碼信。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700 mb-1">密碼設定</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="pw-mode"
                value="auto"
                checked={mode === 'auto'}
                onChange={() => setMode('auto')}
                className="accent-blue-600"
              />
              自動產生密碼（系統隨機 12 字）
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="pw-mode"
                value="manual"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="accent-blue-600"
              />
              自訂密碼（至少 8 字）
            </label>
          </fieldset>

          {mode === 'manual' && (
            <div>
              <label htmlFor="approve-password" className="block text-sm font-medium text-gray-700 mb-1">
                密碼
              </label>
              <input
                id="approve-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 字"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {(localError || error) && (
            <p className="text-sm text-red-600">{localError || `通過失敗：${error}`}</p>
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
              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : '確認通過'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- 拒絕 Modal ----
function RejectModal({ reg, onClose, onConfirm, error, loading }) {
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    if (!reason.trim()) {
      setLocalError('請輸入拒絕原因')
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">確認拒絕</h3>
        <p className="text-sm text-gray-500 mb-4">
          將拒絕 <span className="font-medium text-gray-700">{reg.name}</span>（{reg.email}）的註冊申請，並寄出拒絕信。
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
              拒絕原因（必填）
            </label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="例如：學號不符合本校格式、Memo 資訊不足等"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {(localError || error) && (
            <p className="text-sm text-red-600">{localError || `拒絕失敗：${error}`}</p>
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
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? '處理中...' : '確認拒絕'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- 顯示產生密碼的 Modal（approve 成功後） ----
function PasswordRevealModal({ password, studentId, onClose }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">已通過審核</h3>
        <p className="text-sm text-gray-500 mb-4">
          已為學號 <span className="font-medium text-gray-700">{studentId}</span> 建立 OpenNebula 帳號，並寄出密碼信。
          以下為產生的密碼（僅此一次顯示）：
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3 font-mono text-sm break-all text-gray-800">
          {password}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 border border-blue-300 text-blue-700 py-2 rounded-lg text-sm hover:bg-blue-50"
          >
            {copied ? '已複製' : '複製密碼'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminRegistrations() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('pending_review')
  const [approveTarget, setApproveTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [revealed, setRevealed] = useState(null) // { password, studentId }
  const [toast, setToast] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const { data: registrations = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'registrations', status],
    queryFn: () => listRegistrations(status),
  })

  const approveMut = useMutation({
    mutationFn: ({ id, password }) => approveRegistration(id, password),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'registrations'] })
      const target = approveTarget
      setApproveTarget(null)
      showToast('成功通過，已寄信給學生')
      if (data?.generated_password) {
        setRevealed({
          password: data.generated_password,
          studentId: target?.student_id ?? '',
        })
      }
    },
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => rejectRegistration(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'registrations'] })
      setRejectTarget(null)
      showToast('已拒絕並寄信')
    },
  })

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-800">註冊審核</h1>

      {/* 篩選 tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              status === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-16 text-gray-400">載入中...</div>}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入註冊列表失敗
        </div>
      )}

      {!isLoading && !isError && registrations.length === 0 && (
        <div className="text-center py-16 text-gray-400">沒有註冊申請</div>
      )}

      {registrations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">學號</th>
                <th className="px-4 py-3 font-medium">Memo</th>
                <th className="px-4 py-3 font-medium">送出時間</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registrations.map((r) => {
                const canReview = r.status === 'pending_review'
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{r.id}</td>
                    <td className="px-4 py-3 text-gray-800">{r.email}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-gray-700">{r.student_id}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={r.memo || ''}>
                      {r.memo || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatTime(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_TEXT[r.status] || r.status}
                      </span>
                      {r.status === 'rejected' && r.reject_reason && (
                        <div className="mt-1 text-xs text-red-600 max-w-xs" title={r.reject_reason}>
                          原因：{r.reject_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canReview ? (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => setApproveTarget(r)}
                            className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            通過
                          </button>
                          <button
                            onClick={() => setRejectTarget(r)}
                            className="px-2.5 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            拒絕
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {approveTarget && (
        <ApproveModal
          reg={approveTarget}
          loading={approveMut.isPending}
          error={
            approveMut.isError
              ? approveMut.error?.response?.data?.error || approveMut.error?.message || '未知錯誤'
              : ''
          }
          onClose={() => {
            approveMut.reset()
            setApproveTarget(null)
          }}
          onConfirm={(password) =>
            approveMut.mutate({ id: approveTarget.id, password })
          }
        />
      )}

      {rejectTarget && (
        <RejectModal
          reg={rejectTarget}
          loading={rejectMut.isPending}
          error={
            rejectMut.isError
              ? rejectMut.error?.response?.data?.error || rejectMut.error?.message || '未知錯誤'
              : ''
          }
          onClose={() => {
            rejectMut.reset()
            setRejectTarget(null)
          }}
          onConfirm={(reason) =>
            rejectMut.mutate({ id: rejectTarget.id, reason })
          }
        />
      )}

      {revealed && (
        <PasswordRevealModal
          password={revealed.password}
          studentId={revealed.studentId}
          onClose={() => setRevealed(null)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
