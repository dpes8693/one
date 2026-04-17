import client from './client.js'

// 列出所有 OpenNebula 用戶（admin only）
// backend 會回 { users: [...] }，已 normalize 成陣列
export async function listUsers() {
  const res = await client.get('/users')
  return res.data
}

// 取得單一用戶
export async function getUser(id) {
  const res = await client.get(`/users/${id}`)
  return res.data
}

// 修改 VM 配額
// payload: { vms, cpu, memory, system_disk_size }
export async function updateQuota(id, payload) {
  const res = await client.put(`/users/${id}/quota`, payload)
  return res.data
}

// 啟用用戶
export async function enableUser(id) {
  const res = await client.put(`/users/${id}/enable`)
  return res.data
}

// 停用用戶
export async function disableUser(id) {
  const res = await client.put(`/users/${id}/disable`)
  return res.data
}

// 重設密碼
export async function resetPassword(id, password) {
  const res = await client.put(`/users/${id}/password`, { password })
  return res.data
}
