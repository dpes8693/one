import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getVMList, vmAction } from '../api/one.js'

// STATE 對照：https://docs.opennebula.io/7.0/integration_and_development/system_interfaces/api.html#id12
const STATE_MAP = {
  0: { label: '初始化中', color: 'bg-yellow-100 text-yellow-800' },
  1: { label: '等待中', color: 'bg-gray-100 text-gray-600' },
  2: { label: '持有中', color: 'bg-gray-100 text-gray-600' },
  3: { label: '執行中', color: 'bg-green-100 text-green-800' },
  4: { label: '已停止', color: 'bg-gray-100 text-gray-600' },
  5: { label: '已暫停', color: 'bg-yellow-100 text-yellow-800' },
  6: { label: '已關機', color: 'bg-gray-100 text-gray-600' },
  7: { label: '已關機（等待）', color: 'bg-gray-100 text-gray-600' },
  8: { label: '刪除中', color: 'bg-red-100 text-red-800' },
}

function getStateInfo(stateNum) {
  return STATE_MAP[stateNum] || { label: `狀態 ${stateNum}`, color: 'bg-gray-100 text-gray-600' }
}

function getVMIP(vm) {
  const nic = vm.TEMPLATE?.NIC
  if (!nic) return null
  if (Array.isArray(nic)) return nic[0]?.IP || null
  return nic.IP || null
}

function VMCard({ vm, onAction }) {
  const state = parseInt(vm.STATE, 10)
  const stateInfo = getStateInfo(state)
  const isRunning = state === 3
  const isPoweredOff = state === 8 || state === 6 || state === 4
  const ip = getVMIP(vm)
  const gpuUtil = vm.MONITORING?.GPU_UTILIZATION

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{vm.NAME}</h3>
          <p className="text-xs text-gray-400 mt-0.5">ID: {vm.ID}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${stateInfo.color}`}>
          {stateInfo.label}
        </span>
      </div>

      <div className="space-y-1 mb-4 text-sm">
        <div className="flex gap-2 text-gray-600">
          <span className="text-gray-400 w-8">IP</span>
          <span>{ip || '—'}</span>
        </div>
        {gpuUtil !== undefined && (
          <div className="flex gap-2 text-gray-600">
            <span className="text-gray-400 w-8">GPU</span>
            <span>{parseFloat(gpuUtil).toFixed(0)}%</span>
          </div>
        )}
        <div className="flex gap-2 text-gray-600">
          <span className="text-gray-400 w-8">CPU</span>
          <span>{vm.TEMPLATE?.CPU || '—'} 核</span>
        </div>
        <div className="flex gap-2 text-gray-600">
          <span className="text-gray-400 w-8">RAM</span>
          <span>{vm.TEMPLATE?.MEMORY ? `${Math.round(vm.TEMPLATE.MEMORY / 1024)} GB` : '—'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          to={`/vms/${vm.ID}`}
          className="flex-1 text-center text-xs border border-gray-300 text-gray-700 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          詳情
        </Link>
        {isPoweredOff && (
          <button
            onClick={() => onAction(vm.ID, 'resume')}
            className="flex-1 text-xs bg-green-600 text-white py-1.5 rounded-lg hover:bg-green-700 transition-colors"
          >
            開機
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => onAction(vm.ID, 'poweroff')}
            className="flex-1 text-xs bg-yellow-500 text-white py-1.5 rounded-lg hover:bg-yellow-600 transition-colors"
          >
            關機
          </button>
        )}
      </div>
    </div>
  )
}

export default function VMList() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vms'],
    queryFn: getVMList,
    refetchInterval: 30_000,
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }) => vmAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })

  function handleAction(id, action) {
    actionMutation.mutate({ id, action })
  }

  const vms = (() => {
    if (!data) return []
    // /vmpool/info/paginated（功能路由）回傳 data 是 array
    // /vmpool/info（XML-RPC 代理）回傳 data.VM_POOL.VM
    const pool = data.data
    if (Array.isArray(pool)) return pool
    const xmlrpcPool = pool?.VM_POOL?.VM
    if (!xmlrpcPool) return []
    return Array.isArray(xmlrpcPool) ? xmlrpcPool : [xmlrpcPool]
  })()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">我的虛擬機</h2>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['vms'] })}
          className="text-sm text-blue-600 hover:underline"
        >
          重新整理
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入失敗：{error?.message || '未知錯誤'}
        </div>
      )}

      {!isLoading && !isError && vms.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">尚無虛擬機</p>
          <p className="text-sm">申請通過後，管理員將為您建立 GPU 虛擬機</p>
        </div>
      )}

      {actionMutation.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          操作失敗：{actionMutation.error?.response?.data?.message || '請稍後再試'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {vms.map((vm) => (
          <VMCard key={vm.ID} vm={vm} onAction={handleAction} />
        ))}
      </div>
    </div>
  )
}
