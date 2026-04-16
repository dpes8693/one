import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '../../api/audit.js'

const PAGE_SIZE = 20

export default function AdminAudit() {
  const [filterAction, setFilterAction] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [page, setPage] = useState(1)

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => getAuditLogs(),
  })
  const logs = Array.isArray(auditData?.logs) ? auditData.logs : []

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (filterAction && !log.action.includes(filterAction)) return false
      if (filterUser && !log.user_id.includes(filterUser)) return false
      if (filterFrom && log.created_at < filterFrom) return false
      if (filterTo && log.created_at > filterTo + 'T23:59:59') return false
      return true
    })
  }, [logs, filterAction, filterUser, filterFrom, filterTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function formatDate(iso) {
    return new Date(iso).toLocaleString('zh-TW')
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">審計日誌</h1>

      {/* 篩選器 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4">
        <div>
          <label htmlFor="filter-from" className="block text-xs text-gray-500 mb-1">開始日期</label>
          <input
            id="filter-from"
            type="date"
            value={filterFrom}
            onChange={(e) => { setFilterFrom(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="filter-to" className="block text-xs text-gray-500 mb-1">結束日期</label>
          <input
            id="filter-to"
            type="date"
            value={filterTo}
            onChange={(e) => { setFilterTo(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="filter-action" className="block text-xs text-gray-500 mb-1">動作類型</label>
          <input
            id="filter-action"
            type="text"
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
            placeholder="例：vm_start"
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="filter-user" className="block text-xs text-gray-500 mb-1">使用者</label>
          <input
            id="filter-user"
            type="text"
            value={filterUser}
            onChange={(e) => { setFilterUser(e.target.value); setPage(1) }}
            placeholder="User ID"
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* 表格 */}
      {isLoading ? (
        <div className="text-gray-500">載入中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">時間</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">使用者</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">動作</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">目標</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">無符合條件的紀錄</td>
                </tr>
              )}
              {paged.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{log.user_id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{log.target}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            上一頁
          </button>
          <span className="text-sm text-gray-500">
            第 {page} / {totalPages} 頁
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  )
}
