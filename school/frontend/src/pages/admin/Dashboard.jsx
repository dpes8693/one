import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getHostsWithGPU } from '../../api/dashboard.js'
import { getAlerts } from '../../api/alerts.js'
import { listActive } from '../../api/vip.js'

const HOST_STATE_LABEL = {
  '0': 'INIT',
  '1': 'MONITORING',
  '2': 'MONITORED',
  '3': 'ERROR',
  '4': 'DISABLED',
}

function StatCard({ label, value, color = 'blue' }) {
  const colorMap = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    red: 'text-red-600',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color] || colorMap.blue}`}>{value}</p>
    </div>
  )
}

function GPUCard({ gpu }) {
  const occupied = gpu.VMID && gpu.VMID !== '-1'
  return (
    <div className={`rounded-lg border p-3 ${occupied ? 'border-orange-300 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
      <p className="text-sm font-semibold text-gray-800">
        {gpu.VENDOR_NAME}
      </p>
      <p className="text-xs text-gray-600 mt-0.5">{gpu.DEVICE_NAME}</p>
      <p className="text-xs text-gray-400 mt-0.5">{gpu.SHORT_ADDRESS}</p>
      {occupied ? (
        <p className="text-xs text-orange-700 mt-1 font-medium">
          佔用：{gpu.VM_NAME ? `VM "${gpu.VM_NAME}"` : `VM #${gpu.VMID}`}
        </p>
      ) : (
        <p className="text-xs text-green-700 mt-1 font-medium">空閒</p>
      )}
    </div>
  )
}

function HostCard({ host }) {
  const share = host.HOST_SHARE || {}
  const cpuUsage = Number(share.CPU_USAGE || 0)
  const totalCPU = Number(share.TOTAL_CPU || 1)
  const memUsageMB = Math.round(Number(share.MEM_USAGE || 0) / 1024)
  const totalMemMB = Math.round(Number(share.TOTAL_MEM || 0) / 1024)
  const stateLabel = HOST_STATE_LABEL[host.STATE] || host.STATE

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-800">
          {host.NAME}
          <span className="ml-2 text-xs text-gray-400">(id={host.ID})</span>
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          host.STATE === '2' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {stateLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-4">
        <div>CPU：{cpuUsage} / {totalCPU}</div>
        <div>RAM：{memUsageMB} / {Math.round(totalMemMB / 1024)} GB</div>
        <div>執行中 VM：{share.RUNNING_VMS || 0}</div>
      </div>

      {host.PCI && host.PCI.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">GPU：</p>
          <div className="grid grid-cols-1 gap-2">
            {host.PCI.map((gpu) => (
              <GPUCard key={gpu.SHORT_ADDRESS} gpu={gpu} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">無 GPU 裝置</p>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: getDashboardStats,
  })

  const { data: hosts = [], isLoading: hostsLoading } = useQuery({
    queryKey: ['hostsWithGPU'],
    queryFn: getHostsWithGPU,
  })

  // 最近 1 小時的告警
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recentAlerts = [] } = useQuery({
    queryKey: ['alerts', 'recent-1h'],
    queryFn: () => getAlerts({ from: oneHourAgo }),
  })

  // 進行中 VIP 插隊
  const { data: activeVip = [] } = useQuery({
    queryKey: ['vip', 'active'],
    queryFn: listActive,
  })

  if (statsLoading || hostsLoading) {
    return <div className="p-6 text-gray-500">載入中...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">GPU 資源總覽</h1>

      {/* 基本總覽卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Hosts" value={stats?.hostCount ?? 0} color="blue" />
        <StatCard label="GPUs" value={stats?.gpuCount ?? 0} color="green" />
        <StatCard label="執行中 VM" value={stats?.runningVMCount ?? 0} color="orange" />
        <StatCard label="待審申請" value={stats?.pendingApplicationCount ?? 0} color="purple" />
      </div>

      {/* 增強卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="GPU 告警（近 1 小時）" value={recentAlerts.length} color="red" />
        <StatCard label="VIP 插隊（進行中）" value={activeVip.length} color="orange" />
      </div>

      {/* Host 列表 */}
      <div className="space-y-4">
        {hosts.length === 0 && (
          <p className="text-sm text-gray-500">沒有可用的 Host</p>
        )}
        {hosts.map((host) => (
          <HostCard key={host.ID} host={host} />
        ))}
      </div>
    </div>
  )
}
