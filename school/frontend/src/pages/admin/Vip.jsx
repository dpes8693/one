import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getHostsWithGPU } from '../../api/dashboard.js'
import { getVMList } from '../../api/one.js'
import { preempt, restore, listActive } from '../../api/vip.js'

// Host 狀態對應文字
const HOST_STATE = { '0': 'INIT', '1': 'MONITORING_MONITORED', '2': 'MONITORED', '3': 'ERROR', '4': 'DISABLED' }

export default function AdminVip() {
  const qc = useQueryClient()
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [dialogGpu, setDialogGpu] = useState(null) // 目前正在插隊的 GPU
  const [selectedVMId, setSelectedVMId] = useState(null)

  const { data: hosts = [], isLoading: hostsLoading } = useQuery({
    queryKey: ['hostsWithGPU'],
    queryFn: getHostsWithGPU,
  })

  const { data: vmData } = useQuery({
    queryKey: ['vmpool', 'all'],
    queryFn: () => getVMList(),
  })
  // getVMList 回 backend body = { id, message, data: [...] }
  const allVMs = Array.isArray(vmData?.data) ? vmData.data : []

  const { data: activePreemptions = [] } = useQuery({
    queryKey: ['vip', 'active'],
    queryFn: listActive,
  })

  const preemptMutation = useMutation({
    mutationFn: preempt,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hostsWithGPU'] })
      qc.invalidateQueries({ queryKey: ['vip', 'active'] })
      setDialogGpu(null)
      setSelectedVMId(null)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hostsWithGPU'] })
      qc.invalidateQueries({ queryKey: ['vip', 'active'] })
    },
  })

  // 選取第一個 host（預設）
  const selectedHost = hosts.find((h) => h.ID === selectedHostId) || hosts[0] || null

  // POWEROFF VM 列表（STATE=4）可供 VIP 選擇
  const poweroffVMs = allVMs.filter((v) => v.STATE === '4')

  function handlePreemptClick(gpu) {
    setDialogGpu(gpu)
    setSelectedVMId(null)
  }

  function handleConfirmPreempt() {
    if (!selectedVMId || !selectedHost) return
    preemptMutation.mutate({
      vip_vm_id: selectedVMId,
      target_host_id: selectedHost.ID,
    })
  }

  if (hostsLoading) {
    return (
      <div className="p-6 text-gray-500">載入中...</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">VIP 插隊管理</h1>

      {/* Host 選擇 */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-600 mr-3">Host：</label>
        <select
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          value={selectedHost?.ID || ''}
          onChange={(e) => setSelectedHostId(e.target.value)}
        >
          {hosts.map((h) => (
            <option key={h.ID} value={h.ID}>
              {h.NAME} (id={h.ID})
            </option>
          ))}
        </select>
      </section>

      {/* GPU 列表 */}
      {selectedHost && (
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-700 mb-3">GPU 列表</h2>
          {selectedHost.PCI.length === 0 && (
            <p className="text-sm text-gray-500">此 Host 沒有 GPU 裝置</p>
          )}
          <div className="space-y-3">
            {selectedHost.PCI.map((gpu, idx) => {
              const occupied = gpu.VMID && gpu.VMID !== '-1'
              return (
                <div
                  key={gpu.SHORT_ADDRESS}
                  className="flex items-center justify-between border border-gray-100 rounded-lg p-3 bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      GPU {idx + 1}：{gpu.DEVICE_NAME}
                      <span className="ml-2 text-xs text-gray-400">({gpu.SHORT_ADDRESS})</span>
                    </p>
                    {occupied ? (
                      <p className="text-xs text-orange-600 mt-0.5">
                        目前佔用：VM #{gpu.VMID}
                        {gpu.VM_NAME ? ` "${gpu.VM_NAME}"` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-green-600 mt-0.5">空閒</p>
                    )}
                  </div>
                  {occupied && (
                    <button
                      onClick={() => handlePreemptClick(gpu)}
                      className="ml-4 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      插隊 VIP
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 進行中的插隊 */}
      {activePreemptions.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-700 mb-3">進行中的插隊</h2>
          <div className="space-y-2">
            {activePreemptions.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border border-gray-100 rounded p-2">
                <span className="text-gray-700">
                  #{p.id}  VIP VM #{p.vip_vm_id} → 暫停了 #{p.preempted_vm_id}
                </span>
                <button
                  onClick={() => restoreMutation.mutate({ vip_preemption_id: p.id })}
                  disabled={restoreMutation.isPending}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  還原
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 插隊對話框 */}
      {dialogGpu && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">選擇 VIP 虛擬機</h3>
            <p className="text-sm text-gray-500 mb-4">
              將插隊至 GPU {dialogGpu.SHORT_ADDRESS}（目前由 VM #{dialogGpu.VMID} 佔用）
            </p>

            {poweroffVMs.length === 0 ? (
              <p className="text-sm text-gray-500">沒有可用的 POWEROFF VM</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {poweroffVMs.map((vm) => (
                  <label
                    key={vm.ID}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedVMId === vm.ID
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="vip-vm"
                      value={vm.ID}
                      checked={selectedVMId === vm.ID}
                      onChange={() => setSelectedVMId(vm.ID)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">
                      {vm.NAME}
                      <span className="ml-2 text-xs text-gray-400">#{vm.ID}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {preemptMutation.isError && (
              <p className="text-sm text-red-600 mb-3">插隊失敗，請稍後再試</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDialogGpu(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmPreempt}
                disabled={!selectedVMId || preemptMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {preemptMutation.isPending ? '處理中...' : '確認插隊'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
