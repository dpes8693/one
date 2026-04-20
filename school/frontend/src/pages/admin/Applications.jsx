import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApplications, approveApplication, rejectApplication } from '../../api/applications.js'
import ResourceViolationBanner from '../../components/ResourceViolationBanner.jsx'

const STATUS_MAP = {
  pending: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通過', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-800' },
}

// ---- Toast（簡易版，4 秒自動消失） ----
function Toast({ message, onClose }) {
  return (
    <div className="fixed top-6 right-6 z-[60] bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-300 hover:text-white" aria-label="關閉通知">×</button>
    </div>
  )
}

// ---- 拒絕 Modal（Sprint 5 #19：與 #12 風格統一） ----
function RejectModal({ application, onConfirm, onClose, loading, error }) {
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
        <h3 className="text-lg font-semibold text-gray-800 mb-1">確認拒絕申請</h3>
        <p className="text-sm text-gray-500 mb-4">
          拒絕 <span className="font-medium text-gray-700">{application.student_name || application.user_email || `#${application.id}`}</span>
          {application.student_id ? `（${application.student_id}）` : ''}的申請，系統會寄信通知學生。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
              拒絕原因
            </label>
            <textarea
              id="reject-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="請填寫拒絕原因..."
            />
            {(localError || error) && (
              <p className="text-xs text-red-600 mt-1">{localError || error}</p>
            )}
          </div>

          <div className="flex gap-2">
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

// 從 axios 錯誤抽出 409 violations；找不到回 null
function extractViolations(err) {
  const status = err?.response?.status
  if (status !== 409) return null
  const body = err?.response?.data
  const v = body?.violations
  if (Array.isArray(v) && v.length > 0) return v
  return null
}

// 把 backend 回傳的 gpu_allocations（{ slotId: [1,3,5], ... }）攤平去重排序
function flattenAllocations(alloc) {
  if (!alloc || typeof alloc !== 'object') return []
  const set = new Set()
  for (const arr of Object.values(alloc)) {
    if (Array.isArray(arr)) {
      for (const n of arr) {
        const num = parseInt(n, 10)
        if (Number.isFinite(num)) set.add(num)
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

export default function Applications() {
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('pending')
  const [rejectingApp, setRejectingApp] = useState(null)
  const [toast, setToast] = useState('')
  // { [appId]: violations[] } —— 控制 banner 顯示與通過鈕禁用
  const [violationsByAppId, setViolationsByAppId] = useState({})
  // { [appId]: number[] } —— 通過後從 PUT 回傳的已分配 GPU 編號（覆蓋 server 端資料）
  const [allocByAppId, setAllocByAppId] = useState({})
  // 紀錄當前正在 approve 的 app id，避免按鈕重複點
  const [approvingId, setApprovingId] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['applications', filterStatus],
    queryFn: () => getApplications(filterStatus || undefined),
  })

  const approveMutation = useMutation({
    mutationFn: (id) => approveApplication(id),
    onSuccess: (resp, id) => {
      const gpus = flattenAllocations(resp?.gpu_allocations)
      setAllocByAppId((m) => ({ ...m, [id]: gpus }))
      // 清掉 violations（若先前有）
      setViolationsByAppId((m) => {
        if (!(id in m)) return m
        const next = { ...m }
        delete next[id]
        return next
      })
      const gpuMsg = gpus.length > 0 ? `，已分配 GPU 編號 [${gpus.join(', ')}]` : ''
      showToast(`已通過、已寄信給學生${gpuMsg}`)
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
    onError: (err, id) => {
      const v = extractViolations(err)
      if (v) {
        setViolationsByAppId((m) => ({ ...m, [id]: v }))
      } else {
        showToast(err?.response?.data?.error || '通過失敗，請稍後再試')
      }
    },
    onSettled: () => setApprovingId(null),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => rejectApplication(id, reason),
    onSuccess: (_resp, vars) => {
      // 拒絕成功後也清掉該列 violations
      setViolationsByAppId((m) => {
        if (!(vars.id in m)) return m
        const next = { ...m }
        delete next[vars.id]
        return next
      })
      setRejectingApp(null)
      showToast('已拒絕並寄信給學生')
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
  })

  const applications = data?.applications || []

  function handleApprove(app) {
    if (violationsByAppId[app.id]) return // 已被 banner 鎖住
    setApprovingId(app.id)
    approveMutation.mutate(app.id)
  }

  function clearViolations(appId) {
    setViolationsByAppId((m) => {
      if (!(appId in m)) return m
      const next = { ...m }
      delete next[appId]
      return next
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-800">申請審核</h2>

        <div className="flex gap-1">
          {['pending', 'approved', 'rejected', ''].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filterStatus === s
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === '' ? '全部' : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {rejectMutation.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          拒絕操作失敗，請稍後再試
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-400">載入中...</div>}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入失敗
        </div>
      )}

      {!isLoading && applications.length === 0 && (
        <div className="text-center py-16 text-gray-400">無申請紀錄</div>
      )}

      <div className="space-y-3">
        {applications.map((app) => {
          const statusInfo =
            STATUS_MAP[app.status] || { label: app.status, color: 'bg-gray-100 text-gray-600' }
          const violations = violationsByAppId[app.id]
          const isLocked = !!violations
          const isApproving = approvingId === app.id && approveMutation.isPending
          // 已分配 GPU：優先用我們本地紀錄；否則用後端送來的
          const allocFromServer = (() => {
            if (!app.gpu_allocations) return []
            return flattenAllocations(app.gpu_allocations)
          })()
          const allocList = allocByAppId[app.id] || allocFromServer

          return (
            <div key={app.id} data-testid={`app-row-${app.id}`}>
              {violations && (
                <ResourceViolationBanner
                  violations={violations}
                  onReject={() => {
                    clearViolations(app.id)
                    setRejectingApp(app)
                  }}
                  onClose={() => clearViolations(app.id)}
                />
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-800">
                        {app.student_name || app.user_email || `#${app.id}`}
                      </h3>
                      {app.student_id && (
                        <span className="text-gray-400 text-sm">{app.student_id}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    {app.email && <p className="text-sm text-gray-500 mb-1">{app.email}</p>}
                    {app.gpu_spec && (
                      <p className="text-sm text-gray-600">
                        <span className="text-gray-400">GPU 需求：</span>
                        {app.gpu_spec}
                      </p>
                    )}
                    {app.purpose && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="text-gray-400">用途：</span>
                        {app.purpose}
                      </p>
                    )}
                    {app.reject_reason && (
                      <p className="text-sm text-red-600 mt-1">
                        <span className="text-gray-400">拒絕原因：</span>
                        {app.reject_reason}
                      </p>
                    )}
                    {app.status === 'approved' && allocList.length > 0 && (
                      <p
                        className="text-sm text-green-700 mt-1"
                        data-testid={`gpu-alloc-${app.id}`}
                      >
                        <span className="text-gray-400">GPU 編號：</span>
                        {allocList.join(', ')}
                      </p>
                    )}
                    {app.created_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        申請時間：{new Date(app.created_at).toLocaleString('zh-TW')}
                      </p>
                    )}
                  </div>

                  {app.status === 'pending' && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleApprove(app)}
                        disabled={isLocked || isApproving}
                        title={isLocked ? '資源不足' : ''}
                        className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                          isLocked
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
                        }`}
                      >
                        {isApproving ? '處理中...' : '通過'}
                      </button>
                      <button
                        onClick={() => setRejectingApp(app)}
                        className="text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50"
                      >
                        拒絕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rejectingApp && (
        <RejectModal
          application={rejectingApp}
          loading={rejectMutation.isPending}
          error={rejectMutation.isError ? '拒絕失敗，請稍後再試' : ''}
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectingApp.id, reason })}
          onClose={() => setRejectingApp(null)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
