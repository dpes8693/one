import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSettings, updateSetting } from '../../api/settings.js'

// ---- 設定欄位元資料：分組、label、placeholder ----
const FIELDS = {
  reservation: {
    title: '預約規則',
    items: [
      { key: 'max_active_reservations', label: '每位學生有效預約上限（筆）' },
      { key: 'max_hours_per_reservation', label: '每筆預約最長時數（小時）' },
      { key: 'max_advance_booking_days', label: '可預約多遠的未來（天）' },
    ],
  },
  resource: {
    title: '資源上限',
    items: [
      { key: 'max_total_cpu', label: '系統總 CPU 核數' },
      { key: 'max_total_ram_gb', label: '系統總 RAM（GB）' },
      { key: 'max_total_disk_gb', label: '系統總磁碟（GB）' },
      { key: 'max_total_gpu', label: '系統總 GPU 卡數' },
    ],
  },
  verification: {
    title: '驗證碼',
    items: [
      { key: 'verification_code_ttl_min', label: '驗證碼有效時間（分鐘）' },
      { key: 'verification_max_per_hour', label: '每小時可寄發次數' },
      { key: 'verification_max_attempts', label: '允許錯誤次數' },
      { key: 'verification_lockout_minutes', label: '鎖定時間（分鐘）' },
    ],
  },
  template: {
    title: 'Template',
    items: [
      { key: 'base_template_id', label: '學校 base VM Template ID' },
    ],
  },
}

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors =
    type === 'success'
      ? 'bg-green-50 border-green-200 text-green-700'
      : 'bg-red-50 border-red-200 text-red-700'

  return (
    <div
      role="status"
      className={`fixed top-4 right-4 z-50 border rounded-lg px-4 py-2 text-sm shadow-md ${colors}`}
    >
      {message}
    </div>
  )
}

function SettingRow({ item, currentValue, onSave, isSaving, errorMsg }) {
  const [val, setVal] = useState(currentValue ?? '')

  // 當 query 重新拉資料把 currentValue 換掉時同步
  useEffect(() => {
    setVal(currentValue ?? '')
  }, [currentValue])

  const dirty = String(val) !== String(currentValue ?? '')

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
      <label
        htmlFor={`setting-${item.key}`}
        className="sm:w-72 text-sm text-gray-700"
      >
        {item.label}
        <span className="ml-1 text-xs text-gray-400">（{item.key}）</span>
      </label>
      <input
        id={`setting-${item.key}`}
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => onSave(item.key, val)}
        disabled={isSaving || !dirty}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? '儲存中...' : '儲存'}
      </button>
      {errorMsg && (
        <span className="text-xs text-red-600 sm:ml-2">{errorMsg}</span>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  )
}

export default function AdminSettings() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)
  const [rowError, setRowError] = useState({}) // { [key]: msg }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: listSettings,
  })

  // settings 轉為 map：{ key: value }
  const rows = data?.data || []
  const valueMap = {}
  for (const r of rows) valueMap[r.key] = r.value

  const mut = useMutation({
    mutationFn: ({ key, value }) => updateSetting(key, value),
    onSuccess: (_resp, vars) => {
      setRowError((m) => ({ ...m, [vars.key]: '' }))
      setToast({ type: 'success', message: `已儲存 ${vars.key}` })
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: (err, vars) => {
      const msg =
        err?.response?.data?.error || err?.message || '儲存失敗'
      setRowError((m) => ({ ...m, [vars.key]: msg }))
      setToast({ type: 'error', message: `儲存失敗：${msg}` })
    },
  })

  function handleSave(key, value) {
    mut.mutate({ key, value })
  }

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-800">系統設定</h1>
      <p className="text-sm text-gray-500">
        調整預約規則、資源上限、驗證碼策略與 Template。每個欄位獨立儲存。
      </p>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入系統設定失敗
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-4">
          {Object.entries(FIELDS).map(([groupKey, group]) => (
            <Section key={groupKey} title={group.title}>
              {group.items.map((item) => (
                <SettingRow
                  key={item.key}
                  item={item}
                  currentValue={valueMap[item.key]}
                  onSave={handleSave}
                  isSaving={
                    mut.isPending && mut.variables?.key === item.key
                  }
                  errorMsg={rowError[item.key] || ''}
                />
              ))}
            </Section>
          ))}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
