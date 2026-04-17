import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getMyVMsPaginated, vmAction } from '../api/one.js'

// OpenNebula VM STATE 對照
const STATE_MAP = {
  0: { label: '初始化中', color: 'bg-yellow-100 text-yellow-800' },
  1: { label: '等待中', color: 'bg-gray-100 text-gray-600' },
  2: { label: '持有中', color: 'bg-gray-100 text-gray-600' },
  3: { label: '執行中', color: 'bg-green-100 text-green-700' },
  4: { label: '已停止', color: 'bg-gray-100 text-gray-600' },
  5: { label: '已暫停', color: 'bg-yellow-100 text-yellow-800' },
  6: { label: '已關機', color: 'bg-gray-100 text-gray-600' },
  7: { label: '已關機（等待）', color: 'bg-gray-100 text-gray-600' },
  8: { label: '已關機', color: 'bg-gray-100 text-gray-600' },
}

function getStateInfo(stateNum) {
  return STATE_MAP[stateNum] || { label: `狀態 ${stateNum}`, color: 'bg-gray-100 text-gray-600' }
}

// 從 VM TEMPLATE 取出 IP：優先 NIC[0].IP，再來 CONTEXT.ETH0_IP
function getVMIP(vm) {
  const nic = vm.TEMPLATE?.NIC
  if (nic) {
    if (Array.isArray(nic)) {
      if (nic[0]?.IP) return nic[0].IP
    } else if (nic.IP) {
      return nic.IP
    }
  }
  const ctxIp = vm.TEMPLATE?.CONTEXT?.ETH0_IP
  return ctxIp || null
}

// 從 VM TEMPLATE.PCI 取 GPU 卡名
function getGPUNames(vm) {
  const pci = vm.TEMPLATE?.PCI
  if (!pci) return []
  const arr = Array.isArray(pci) ? pci : [pci]
  return arr
    .filter((p) => !p.CLASS || p.CLASS === '0300') // 沒 CLASS 的也保留（測試資料可能省略）
    .map((p) => p.DEVICE_NAME)
    .filter(Boolean)
}

// 從各種可能的 response 結構萃取 VM 陣列
function extractVMs(rawData) {
  if (!rawData) return []
  // /vmpool/info/paginated（功能路由）：res.data.data 是陣列
  if (Array.isArray(rawData)) return rawData
  // XML-RPC 結構：res.data.data.VM_POOL.VM
  const xmlrpc = rawData?.VM_POOL?.VM
  if (xmlrpc) return Array.isArray(xmlrpc) ? xmlrpc : [xmlrpc]
  return []
}

function StatCard({ label, value, color = 'blue' }) {
  const colorMap = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color] || colorMap.blue}`}>{value}</p>
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
    >
      {copied ? '已複製' : '複製'}
    </button>
  )
}

function SshSection({ vm }) {
  const ip = getVMIP(vm)
  const sshCmd = ip ? `ssh root@${ip}` : null

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="text-xs font-semibold text-blue-800 mb-2">SSH 連線資訊</p>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-700 mb-2">
        <div>
          <p className="text-gray-400">IP</p>
          <p className="font-mono">{ip || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400">Port</p>
          <p className="font-mono">22</p>
        </div>
        <div>
          <p className="text-gray-400">帳號</p>
          <p className="font-mono">root</p>
        </div>
      </div>

      {sshCmd ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-900 text-green-400 rounded px-2 py-1.5 text-xs font-mono break-all">
            {sshCmd}
          </code>
          <CopyButton text={sshCmd} />
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          尚未取得 IP（VM 開機需 1-2 分鐘）
        </p>
      )}
    </div>
  )
}

function VMCard({ vm, onAction, isPending }) {
  const state = parseInt(vm.STATE, 10)
  const stateInfo = getStateInfo(state)
  const isRunning = state === 3
  const isPoweredOff = [4, 5, 6, 7, 8].includes(state)
  const gpuNames = getGPUNames(vm)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{vm.NAME}</h3>
          <p className="text-xs text-gray-400 mt-0.5">ID: {vm.ID}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${stateInfo.color}`}>
          {stateInfo.label}
        </span>
      </div>

      {gpuNames.length > 0 && (
        <p className="text-xs text-gray-600 mb-2">
          <span className="text-gray-400">GPU：</span>
          {gpuNames.join('、')}
        </p>
      )}

      <SshSection vm={vm} />

      <div className="flex gap-2 mt-3">
        <Link
          to={`/vms/${vm.ID}`}
          className="flex-1 text-center text-xs border border-gray-300 text-gray-700 py-1.5 rounded-lg hover:bg-gray-50"
        >
          詳情
        </Link>
        {isPoweredOff && (
          <button
            onClick={() => onAction(vm.ID, 'resume')}
            disabled={isPending}
            className="flex-1 text-xs bg-green-600 text-white py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            開機
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={() => onAction(vm.ID, 'poweroff')}
              disabled={isPending}
              className="flex-1 text-xs bg-yellow-500 text-white py-1.5 rounded-lg hover:bg-yellow-600 disabled:opacity-50"
            >
              關機
            </button>
            <button
              onClick={() => onAction(vm.ID, 'reboot')}
              disabled={isPending}
              className="flex-1 text-xs bg-blue-600 text-white py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              重啟
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function StudentDashboard() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['studentVMs'],
    queryFn: getMyVMsPaginated,
    refetchInterval: 30_000,
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }) => vmAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentVMs'] })
    },
  })

  function handleAction(id, action) {
    actionMutation.mutate({ id, action })
  }

  // axios res → res.data 是 backend body → body.data 才是 OpenNebula 資料
  const vms = extractVMs(data?.data?.data)

  const totalCount = vms.length
  const runningCount = vms.filter((v) => parseInt(v.STATE, 10) === 3).length
  const pendingCount = vms.filter((v) => {
    const s = parseInt(v.STATE, 10)
    return [0, 1, 2, 4, 5, 6, 7, 8].includes(s)
  }).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">我的 GPU</h2>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['studentVMs'] })}
          className="text-sm text-blue-600 hover:underline"
        >
          重新整理
        </button>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="總 VM 數" value={totalCount} color="blue" />
        <StatCard label="執行中" value={runningCount} color="green" />
        <StatCard label="待開機" value={pendingCount} color="orange" />
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          載入失敗：{error?.message || '未知錯誤'}
        </div>
      )}

      {actionMutation.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          操作失敗：{actionMutation.error?.response?.data?.message || '請稍後再試'}
        </div>
      )}

      {!isLoading && !isError && vms.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">尚無虛擬機</p>
          <p className="text-sm">申請通過後，管理員將為您建立 GPU 虛擬機</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vms.map((vm) => (
          <VMCard
            key={vm.ID}
            vm={vm}
            onAction={handleAction}
            isPending={actionMutation.isPending}
          />
        ))}
      </div>
    </div>
  )
}
