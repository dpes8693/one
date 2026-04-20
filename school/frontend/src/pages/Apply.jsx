// frontend/src/pages/Apply.jsx
// Sprint 5 Task #17：申請新預約頁
// 三大區塊：
//   1) 行事曆（30 天視窗，逐日 24 個整點 cell；每 cell 顯示「該時段可用 GPU 數」）
//   2) 規格輸入（Template + 4 欄位 CPU / RAM / Disk / GPU）
//   3) 摘要 + 即時驗證 + 送出
import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTemplates,
  getAvailability,
  createApplication,
} from '../api/applications.js'

// ============================================================================
// 時間 / Slot 工具（純 logic，方便測試）
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const HOURS_PER_DAY = 24
const DAY_WINDOW = 30 // 30 天視窗

/**
 * 取得「指定 Date 的當天 00:00 的 UTC 時間戳」
 * 雖然 UI 用 UTC 顯示有點怪（時差會差數小時），但 backend 整點是依 UTC 算，
 * 為了「點到的 cell = 送出的 slot」一致，前後端統一用 UTC。
 */
export function getDayStartUTC(dayOffset = 0) {
  const now = new Date()
  // 取當下 UTC 整日
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
  return start + dayOffset * DAY_MS
}

/**
 * 給 day offset (0=today UTC) 與 hour (0-23) 回傳整點 ISO（含 Z）
 */
export function hourSlotISO(dayOffset, hour) {
  const ts = getDayStartUTC(dayOffset) + hour * HOUR_MS
  return new Date(ts).toISOString()
}

/**
 * 把已選的整點 startISO 集合（每個代表 1 小時）合併成最少 slot 陣列。
 * 連續整點合成一段；不連續則切為多段。
 * 輸入：Set<ISO> 或 ISO 陣列
 * 輸出：[{ start_at, end_at }, ...]，依 start_at 排序
 */
export function mergeSlots(startSet) {
  const arr = Array.isArray(startSet) ? [...startSet] : [...startSet]
  if (arr.length === 0) return []

  // 先排序
  const sorted = arr
    .map((s) => new Date(s).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)

  const merged = []
  let segStart = sorted[0]
  let segEnd = sorted[0] + HOUR_MS

  for (let i = 1; i < sorted.length; i++) {
    const ts = sorted[i]
    if (ts === segEnd) {
      // 連續，延伸
      segEnd = ts + HOUR_MS
    } else {
      merged.push({
        start_at: new Date(segStart).toISOString(),
        end_at: new Date(segEnd).toISOString(),
      })
      segStart = ts
      segEnd = ts + HOUR_MS
    }
  }
  merged.push({
    start_at: new Date(segStart).toISOString(),
    end_at: new Date(segEnd).toISOString(),
  })
  return merged
}

/**
 * 比對每個已選 cell 的需求 vs 可用，回傳超量 cell 清單
 * 輸入：
 *   selected: Set<startISO>
 *   demand: { cpu, ram_gb, disk_gb, gpu_count }
 *   availabilityMap: { [startISO]: { cpu, ram_gb, disk_gb, gpu } }
 * 輸出：[{ start_at, missing: [...] }]
 */
export function checkResourceViolations(selected, demand, availabilityMap) {
  const violations = []
  for (const startISO of selected) {
    const av = availabilityMap[startISO]
    if (!av) continue // 若 availability 還沒回，跳過（送出時 backend 會擋）
    const missing = []
    if (demand.cpu > av.cpu) missing.push(`CPU ${demand.cpu} > ${av.cpu}`)
    if (demand.ram_gb > av.ram_gb)
      missing.push(`RAM ${demand.ram_gb}G > ${av.ram_gb}G`)
    if (demand.disk_gb > av.disk_gb)
      missing.push(`Disk ${demand.disk_gb}G > ${av.disk_gb}G`)
    if (demand.gpu_count > av.gpu)
      missing.push(`GPU ${demand.gpu_count} > ${av.gpu}`)
    if (missing.length) violations.push({ start_at: startISO, missing })
  }
  return violations
}

/**
 * 把 availability 陣列轉為 map：startISO → available
 */
export function buildAvailabilityMap(list) {
  const m = {}
  if (!Array.isArray(list)) return m
  for (const row of list) {
    if (!row?.start_at) continue
    // backend 可能回 string 或 Date，統一 normalize 成 ISO（含 Z）
    const iso = new Date(row.start_at).toISOString()
    m[iso] = row.available || {}
  }
  return m
}

// ============================================================================
// UI 小元件
// ============================================================================

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
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

function formatDayLabel(dayOffset) {
  const ts = getDayStartUTC(dayOffset)
  const d = new Date(ts)
  // 用本地語系（zh-TW）顯示「4/20 (週一)」
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const weekdayMap = ['日', '一', '二', '三', '四', '五', '六']
  const wd = weekdayMap[d.getUTCDay()]
  if (dayOffset === 0) return `今天 ${month}/${day}`
  if (dayOffset === 1) return `明天 ${month}/${day}`
  return `${month}/${day} (週${wd})`
}

function formatHourLabel(hour) {
  const h = String(hour).padStart(2, '0')
  const next = String((hour + 1) % 24).padStart(2, '0')
  return `${h}:00 - ${next}:00`
}

// ============================================================================
// 主元件
// ============================================================================

export default function Apply() {
  const qc = useQueryClient()

  // ---- 狀態 ----
  const [activeDay, setActiveDay] = useState(0) // 0..29
  const [selected, setSelected] = useState(() => new Set()) // Set<startISO>
  const [form, setForm] = useState({
    cpu: 1,
    ram_gb: 1,
    disk_gb: 10,
    gpu_count: 1,
  })
  const [toast, setToast] = useState(null)

  // ---- API ----
  const { data: tpl, isLoading: tplLoading, isError: tplError } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  })

  // 拉 30 天可用度
  const fromISO = useMemo(() => new Date(getDayStartUTC(0)).toISOString(), [])
  const toISO = useMemo(
    () => new Date(getDayStartUTC(DAY_WINDOW)).toISOString(),
    []
  )
  const { data: availability, isLoading: avLoading } = useQuery({
    queryKey: ['availability', fromISO, toISO],
    queryFn: () => getAvailability(fromISO, toISO),
  })

  const availabilityMap = useMemo(
    () => buildAvailabilityMap(availability),
    [availability]
  )

  // template 載入後，自動填入 defaults（只填一次：當 form 還是初值時）
  useEffect(() => {
    if (!tpl?.defaults) return
    setForm((prev) => ({
      cpu: tpl.defaults.cpu ?? prev.cpu,
      ram_gb: tpl.defaults.ram_gb ?? prev.ram_gb,
      disk_gb: tpl.defaults.disk_gb ?? prev.disk_gb,
      gpu_count: tpl.defaults.gpu_count ?? prev.gpu_count,
    }))
  }, [tpl])

  // ---- mutation ----
  const mut = useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      setToast({ type: 'success', message: '已送出，等待管理員審核' })
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['availability'] })
      qc.invalidateQueries({ queryKey: ['my-applications'] })
    },
    onError: (err) => {
      const body = err?.response?.data
      if (body?.violations?.length) {
        const lines = body.violations
          .map((v) => `${v.start_at}：${(v.missing || []).join('、')}`)
          .join(' / ')
        setToast({ type: 'error', message: `資源不足：${lines}` })
      } else {
        const msg = body?.error || err?.message || '送出失敗'
        setToast({ type: 'error', message: `送出失敗：${msg}` })
      }
    },
  })

  // ---- 衍生值 ----
  const slots = useMemo(() => mergeSlots(selected), [selected])
  const totalHours = selected.size
  const violations = useMemo(
    () =>
      checkResourceViolations(
        selected,
        {
          cpu: Number(form.cpu) || 0,
          ram_gb: Number(form.ram_gb) || 0,
          disk_gb: Number(form.disk_gb) || 0,
          gpu_count: Number(form.gpu_count) || 0,
        },
        availabilityMap
      ),
    [selected, form, availabilityMap]
  )

  const canSubmit =
    !mut.isPending &&
    selected.size > 0 &&
    violations.length === 0 &&
    Number(form.cpu) > 0 &&
    Number(form.ram_gb) > 0 &&
    Number(form.disk_gb) > 0 &&
    Number(form.gpu_count) >= 0 &&
    !!tpl?.id

  // ---- 行為 ----
  function toggleCell(startISO) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(startISO)) next.delete(startISO)
      else next.add(startISO)
      return next
    })
  }

  function updateForm(field, value) {
    const n = parseInt(value, 10)
    setForm((prev) => ({ ...prev, [field]: Number.isFinite(n) ? n : 0 }))
  }

  function handleSubmit() {
    if (!canSubmit) return
    mut.mutate({
      template_id: tpl.id,
      cpu: Number(form.cpu),
      ram_gb: Number(form.ram_gb),
      disk_gb: Number(form.disk_gb),
      gpu_count: Number(form.gpu_count),
      slots,
    })
  }

  // ---- 渲染 ----
  const nowTs = Date.now()

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">申請新預約</h1>
        <p className="text-sm text-gray-500">
          選時段 + 選 Template + 微調規格，送出後待管理員審核
        </p>
      </div>

      {/* 區 1：行事曆 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">選擇時段</h2>
          <span className="text-xs text-gray-500">
            時間以 UTC 顯示；每格 1 小時，可跨天多選
          </span>
        </div>

        {/* 日期 tabs（橫向 scroll） */}
        <div className="overflow-x-auto -mx-2 px-2 pb-2 mb-3 border-b border-gray-100">
          <div className="flex gap-2 min-w-max">
            {Array.from({ length: DAY_WINDOW }, (_, i) => i).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDay(d)}
                data-testid={`day-tab-${d}`}
                className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap border transition-colors ${
                  activeDay === d
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {formatDayLabel(d)}
              </button>
            ))}
          </div>
        </div>

        {/* 24 cell grid（每列一小時） */}
        {avLoading && (
          <div className="text-center text-gray-400 py-6 text-sm">
            載入可用度中...
          </div>
        )}
        {!avLoading && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
            data-testid="hour-grid"
          >
            {Array.from({ length: HOURS_PER_DAY }, (_, h) => h).map((hour) => {
              const startISO = hourSlotISO(activeDay, hour)
              const ts = new Date(startISO).getTime()
              const av = availabilityMap[startISO]
              const isSelected = selected.has(startISO)
              const isPast = ts < nowTs
              const gpuLeft = av?.gpu ?? null
              const isFull = gpuLeft !== null && gpuLeft <= 0
              const disabled = isPast

              let cls =
                'border rounded-md px-2 py-2 text-left transition-colors flex flex-col gap-0.5 '
              if (disabled)
                cls += 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed '
              else if (isSelected)
                cls += 'bg-blue-200 border-blue-500 text-blue-900 '
              else if (isFull)
                cls += 'bg-red-50 border-red-200 text-red-700 cursor-not-allowed '
              else cls += 'bg-white border-gray-200 hover:bg-blue-50 text-gray-700 '

              const tooltip = av
                ? `可用 ${av.gpu ?? 0} GPU / ${av.ram_gb ?? 0}G RAM / ${av.cpu ?? 0} 核 / ${av.disk_gb ?? 0}G Disk`
                : '無資料'

              return (
                <button
                  key={hour}
                  type="button"
                  data-testid={`cell-${activeDay}-${hour}`}
                  data-iso={startISO}
                  disabled={disabled || isFull}
                  onClick={() => toggleCell(startISO)}
                  title={tooltip}
                  className={cls}
                >
                  <span className="text-xs font-medium">
                    {formatHourLabel(hour)}
                  </span>
                  <span className="text-xs">
                    {av
                      ? `可用 ${av.gpu ?? 0} GPU`
                      : isPast
                      ? '已過'
                      : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* 區 2：Template + 規格 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">VM 規格</h2>

        {tplLoading && (
          <p className="text-sm text-gray-400">載入 Template 中...</p>
        )}
        {tplError && (
          <p className="text-sm text-red-600">載入 Template 失敗</p>
        )}
        {tpl && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template
              </label>
              <select
                data-testid="template-select"
                value={tpl.id}
                disabled
                className="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
              >
                <option value={tpl.id}>{tpl.name}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                目前學校只有 1 個 base Template；可調整下方 4 欄位覆寫預設規格。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SpecInput
                label="CPU 核數"
                field="cpu"
                value={form.cpu}
                onChange={updateForm}
                min={1}
                hint="至少 1 核"
              />
              <SpecInput
                label="RAM (GB)"
                field="ram_gb"
                value={form.ram_gb}
                onChange={updateForm}
                min={1}
                hint="至少 1 GB"
              />
              <SpecInput
                label="磁碟 (GB)"
                field="disk_gb"
                value={form.disk_gb}
                onChange={updateForm}
                min={1}
                hint="至少 1 GB"
              />
              <SpecInput
                label="GPU 卡數"
                field="gpu_count"
                value={form.gpu_count}
                onChange={updateForm}
                min={0}
                hint="0–8 張"
              />
            </div>
          </>
        )}
      </section>

      {/* 區 3：摘要 + 送出 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">摘要</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-3">
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-xs text-gray-500">已選時段</p>
            <p className="text-lg font-semibold">
              {selected.size} 個 cell / {slots.length} 個區段
            </p>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-xs text-gray-500">總時數</p>
            <p className="text-lg font-semibold">{totalHours} 小時</p>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-xs text-gray-500">每時段需要</p>
            <p className="text-sm">
              CPU {form.cpu} / RAM {form.ram_gb}G / Disk {form.disk_gb}G / GPU{' '}
              {form.gpu_count}
            </p>
          </div>
        </div>

        {violations.length > 0 && (
          <div
            data-testid="violation-warning"
            className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
          >
            <p className="font-semibold mb-1">資源不足警告</p>
            <ul className="list-disc list-inside space-y-0.5">
              {violations.map((v) => (
                <li key={v.start_at}>
                  {v.start_at}：{v.missing.join('、')}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          data-testid="submit-btn"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full sm:w-60 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mut.isPending ? '送出中...' : '送出申請'}
        </button>
        {selected.size === 0 && (
          <p className="text-xs text-gray-500 mt-2">請先選擇至少一個時段</p>
        )}
      </section>

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

function SpecInput({ label, field, value, onChange, min = 0, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="number"
        data-testid={`spec-${field}`}
        value={value}
        min={min}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}
