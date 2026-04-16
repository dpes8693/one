import client from './client.js'

// VIP 插隊：暫停目前佔用 GPU 的 VM，啟動 VIP VM
export async function preempt({ vip_vm_id, target_host_id }) {
  const res = await client.post('/vip/preempt', { vip_vm_id, target_host_id })
  return res.data
}

// 還原：把被暫停的 VM 恢復
export async function restore({ vip_preemption_id }) {
  const res = await client.post('/vip/restore', { vip_preemption_id })
  return res.data
}

// 列出進行中的插隊紀錄
export async function listActive() {
  const res = await client.get('/vip/active')
  return res.data
}
