// frontend/src/components/ResourceViolationBanner.jsx
// Sprint 5 Task #19：資源警告 banner
//
// 用法：
//   <ResourceViolationBanner
//     violations={[{ resource: 'gpu', slot: { start_at, end_at }, requested, available, total }]}
//     onReject={() => ...}     // 點「拒絕此申請」
//     onClose={() => ...}      // 點「關閉警告」
//   />
//
// violations 形狀（與 backend resourceInventory.checkResourceAvailable 對齊）：
//   { resource: 'cpu' | 'ram_gb' | 'disk_gb' | 'gpu',
//     slot: { start_at, end_at },
//     requested, available, total }

const RESOURCE_LABEL = {
  cpu: { name: 'CPU', unit: '核' },
  ram_gb: { name: 'RAM', unit: 'GB' },
  disk_gb: { name: '磁碟', unit: 'GB' },
  gpu: { name: 'GPU', unit: '張' },
}

function fmtTime(s) {
  if (!s) return ''
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return String(s)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mo}/${dd} ${hh}:${mm}`
  } catch {
    return String(s)
  }
}

function fmtSlot(slot) {
  if (!slot) return ''
  const start = fmtTime(slot.start_at)
  const end = fmtTime(slot.end_at)
  if (!start && !end) return ''
  return `${start}–${end}`
}

export default function ResourceViolationBanner({ violations, onReject, onClose }) {
  const list = Array.isArray(violations) ? violations : []
  if (list.length === 0) return null

  return (
    <div
      role="alert"
      data-testid="resource-violation-banner"
      className="bg-red-50 border border-red-300 rounded-xl p-4 mb-3 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none" aria-hidden="true">⚠</div>
        <div className="flex-1">
          <h4 className="text-red-800 font-semibold text-sm mb-2">
            資源不足，無法通過此申請
          </h4>
          <ul className="space-y-1 text-sm text-red-700 list-disc pl-5">
            {list.map((v, i) => {
              const meta = RESOURCE_LABEL[v.resource] || { name: v.resource, unit: '' }
              const slotText = fmtSlot(v.slot)
              return (
                <li key={`${v.resource}-${i}`}>
                  {slotText && <span className="font-medium">{slotText} 時段：</span>}
                  {meta.name} 需求 {v.requested}{meta.unit}，可用 {v.available}{meta.unit}
                  （總量 {v.total}{meta.unit}）
                </li>
              )
            })}
          </ul>

          <div className="flex gap-2 mt-3">
            {onReject && (
              <button
                type="button"
                onClick={onReject}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
              >
                拒絕此申請
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100"
              >
                關閉警告
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
