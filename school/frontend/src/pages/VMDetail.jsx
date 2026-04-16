import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getVMInfo, vmAction } from '../api/one.js'

const STATE_MAP = {
  0: { label: '初始化中', color: 'text-yellow-600' },
  1: { label: '等待中', color: 'text-gray-500' },
  2: { label: '持有中', color: 'text-gray-500' },
  3: { label: '執行中', color: 'text-green-600' },
  4: { label: '已停止', color: 'text-gray-500' },
  5: { label: '已暫停', color: 'text-yellow-600' },
  6: { label: '已關機', color: 'text-gray-500' },
  7: { label: '已關機（等待）', color: 'text-gray-500' },
  8: { label: '刪除中', color: 'text-red-600' },
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 break-all">{value || '—'}</span>
    </div>
  )
}

function GpuBar({ label, value, max = 100, unit = '%' }) {
  const pct = max > 0 ? Math.min((parseFloat(value) / max) * 100, 100) : 0
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span>
          {parseFloat(value).toFixed(1)} {unit}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function VMDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vm', id],
    queryFn: () => getVMInfo(id),
    refetchInterval: 15_000,
  })

  const actionMutation = useMutation({
    mutationFn: (action) => vmAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })

  function handleAction(action) {
    if (action === 'terminate' && !confirm('確定要刪除此虛擬機嗎？此操作無法復原。')) return
    actionMutation.mutate(action)
  }

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400 py-16">載入中...</div>
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入失敗：{error?.message}
        </div>
      </div>
    )
  }

  const vm = data?.data?.VM
  if (!vm) {
    return <div className="p-6 text-gray-400">找不到此虛擬機</div>
  }

  const state = parseInt(vm.STATE, 10)
  const stateInfo = STATE_MAP[state] || { label: `狀態 ${state}`, color: 'text-gray-500' }
  const isRunning = state === 3
  const isPoweredOff = [4, 5, 6, 7].includes(state)

  const nic = vm.TEMPLATE?.NIC
  const ip = Array.isArray(nic) ? nic[0]?.IP : nic?.IP
  const monitoring = vm.MONITORING || {}
  const hasGpu = monitoring.GPU_COUNT && parseInt(monitoring.GPU_COUNT) > 0

  return (
    <div className="p-6 max-w-3xl">
      {/* 標題與操作 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button
            onClick={() => navigate('/vms')}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1 block"
          >
            &larr; 返回列表
          </button>
          <h2 className="text-xl font-bold text-gray-800">{vm.NAME}</h2>
          <p className={`text-sm font-medium mt-0.5 ${stateInfo.color}`}>{stateInfo.label}</p>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {isPoweredOff && (
            <button
              onClick={() => handleAction('resume')}
              disabled={actionMutation.isPending}
              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              開機
            </button>
          )}
          {isRunning && (
            <>
              <button
                onClick={() => handleAction('poweroff')}
                disabled={actionMutation.isPending}
                className="text-sm bg-yellow-500 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-600 disabled:opacity-50"
              >
                關機
              </button>
              <button
                onClick={() => handleAction('reboot')}
                disabled={actionMutation.isPending}
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                重啟
              </button>
            </>
          )}
          <button
            onClick={() => handleAction('terminate')}
            disabled={actionMutation.isPending}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      </div>

      {actionMutation.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          操作失敗：{actionMutation.error?.response?.data?.message || '請稍後再試'}
        </div>
      )}

      {/* SSH 連線資訊 */}
      {isRunning && ip && (
        <Section title="SSH 連線資訊">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 mb-2">
            ssh root@{ip}
          </div>
          <p className="text-xs text-gray-500">
            確保您已上傳 SSH 公鑰，或使用管理員提供的密碼登入。
          </p>
        </Section>
      )}

      {isRunning && !ip && (
        <Section title="SSH 連線資訊">
          <p className="text-sm text-gray-500">
            IP 位址尚未取得（VM 可能使用 DHCP，請聯繫管理員確認 IP）
          </p>
        </Section>
      )}

      {/* 基本資訊 */}
      <Section title="基本資訊">
        <InfoRow label="VM ID" value={vm.ID} />
        <InfoRow label="擁有者" value={vm.UNAME} />
        <InfoRow label="IP 位址" value={ip} />
        <InfoRow label="CPU" value={vm.TEMPLATE?.CPU ? `${vm.TEMPLATE.CPU} 核` : null} />
        <InfoRow
          label="記憶體"
          value={vm.TEMPLATE?.MEMORY ? `${Math.round(vm.TEMPLATE.MEMORY / 1024)} GB` : null}
        />
      </Section>

      {/* GPU 監控 */}
      {hasGpu && (
        <Section title="GPU 即時監控">
          <GpuBar label="GPU 使用率" value={monitoring.GPU_UTILIZATION || 0} max={100} unit="%" />
          <GpuBar
            label="GPU 記憶體使用率"
            value={monitoring.GPU_MEMORY_UTILIZATION || 0}
            max={100}
            unit="%"
          />
          <GpuBar
            label="GPU 功耗"
            value={monitoring.GPU_POWER_USAGE || 0}
            max={300}
            unit="W"
          />
          <div className="mt-2 text-xs text-gray-500 space-y-0.5">
            <div>
              可用記憶體：
              {monitoring.GPU_MEMORY_FREE
                ? `${(parseFloat(monitoring.GPU_MEMORY_FREE) / 1024).toFixed(1)} GB`
                : '—'}
            </div>
            <div>GPU 數量：{monitoring.GPU_COUNT}</div>
          </div>
        </Section>
      )}

      {/* CPU/記憶體監控 */}
      <Section title="系統監控">
        <GpuBar label="CPU 使用率" value={monitoring.CPU || 0} max={100} unit="%" />
        <div className="text-xs text-gray-500 mt-1">
          記憶體：
          {monitoring.MEMORY
            ? `${(parseFloat(monitoring.MEMORY) / 1024 / 1024).toFixed(1)} GB`
            : '—'}
        </div>
      </Section>
    </div>
  )
}
