import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApplications, approveApplication, rejectApplication } from '../../api/applications.js'
import { getTemplates } from '../../api/one.js'

const STATUS_MAP = {
  pending: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通過', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-800' },
}

function ApproveModal({ application, templates, onConfirm, onClose }) {
  const [templateId, setTemplateId] = useState('')
  const [quota, setQuota] = useState('1')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await onConfirm({ template_id: parseInt(templateId), quota: parseInt(quota) })
    setLoading(false)
  }

  const tmplList = (() => {
    const pool = templates?.data?.VMTEMPLATE_POOL?.VMTEMPLATE
    if (!pool) return []
    return Array.isArray(pool) ? pool : [pool]
  })()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">通過申請</h3>
        <p className="text-sm text-gray-500 mb-4">
          為 {application.student_name}（{application.student_id}）建立 VM
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VM Template</label>
            <select
              required
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">請選擇 Template</option>
              {tmplList.map((t) => (
                <option key={t.ID} value={t.ID}>
                  {t.NAME}（ID: {t.ID}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              VM 配額（台數上限）
            </label>
            <input
              type="number"
              required
              min={1}
              max={10}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

function RejectModal({ application, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await onConfirm(reason)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">拒絕申請</h3>
        <p className="text-sm text-gray-500 mb-4">
          拒絕 {application.student_name}（{application.student_id}）的申請
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">拒絕原因</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="請填寫拒絕原因..."
            />
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

export default function Applications() {
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('pending')
  const [approvingApp, setApprovingApp] = useState(null)
  const [rejectingApp, setRejectingApp] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['applications', filterStatus],
    queryFn: () => getApplications(filterStatus || undefined),
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }) => approveApplication(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setApprovingApp(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => rejectApplication(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setRejectingApp(null)
    },
  })

  const applications = data?.applications || []

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

      {(approveMutation.isError || rejectMutation.isError) && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          操作失敗，請稍後再試
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
          const statusInfo = STATUS_MAP[app.status] || { label: app.status, color: 'bg-gray-100 text-gray-600' }
          return (
            <div
              key={app.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-800">
                      {app.student_name}
                    </h3>
                    <span className="text-gray-400 text-sm">{app.student_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">{app.email}</p>
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">GPU 需求：</span>
                    {app.gpu_spec}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="text-gray-400">用途：</span>
                    {app.purpose}
                  </p>
                  {app.reject_reason && (
                    <p className="text-sm text-red-600 mt-1">
                      <span className="text-gray-400">拒絕原因：</span>
                      {app.reject_reason}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    申請時間：{new Date(app.created_at).toLocaleString('zh-TW')}
                  </p>
                </div>

                {app.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setApprovingApp(app)}
                      className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                    >
                      通過
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
          )
        })}
      </div>

      {approvingApp && (
        <ApproveModal
          application={approvingApp}
          templates={templates}
          onConfirm={(payload) =>
            approveMutation.mutateAsync({ id: approvingApp.id, payload })
          }
          onClose={() => setApprovingApp(null)}
        />
      )}

      {rejectingApp && (
        <RejectModal
          application={rejectingApp}
          onConfirm={(reason) =>
            rejectMutation.mutateAsync({ id: rejectingApp.id, reason })
          }
          onClose={() => setRejectingApp(null)}
        />
      )}
    </div>
  )
}
