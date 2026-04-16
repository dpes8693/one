import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAlerts } from '../../api/alerts.js'

const ALERT_TYPE_LABEL = {
  gpu_memory_high: 'GPU 記憶體過高',
  gpu_util_high: 'GPU 使用率過高',
  gpu_temp_high: 'GPU 溫度過高',
}

export default function AdminAlerts() {
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['alerts', filterFrom, filterTo],
    queryFn: () => getAlerts({
      from: filterFrom || undefined,
      to: filterTo || undefined,
    }),
  })
  const alerts = Array.isArray(alertsData?.alerts) ? alertsData.alerts : []

  function formatDate(iso) {
    return new Date(iso).toLocaleString('zh-TW')
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">GPU 告警</h1>

      {/* 篩選器 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4">
        <div>
          <label htmlFor="alert-from" className="block text-xs text-gray-500 mb-1">開始日期</label>
          <input
            id="alert-from"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="alert-to" className="block text-xs text-gray-500 mb-1">結束日期</label>
          <input
            id="alert-to"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* 告警卡片 */}
      {isLoading ? (
        <div className="text-gray-500">載入中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {alerts.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full">目前沒有告警紀錄</p>
          )}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white rounded-lg border border-orange-200 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                  {alert.alert_type}
                </span>
                <span className="text-xs text-gray-400">{formatDate(alert.created_at)}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800">
                VM #{alert.vm_id}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type}
              </p>
              <p className="text-lg font-bold text-orange-600 mt-2">
                {alert.metric_value}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
