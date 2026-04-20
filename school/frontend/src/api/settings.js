import client from './client.js'

// 列出全部系統設定（admin only）
// backend 回 { data: [{ key, value, updated_at }, ...] }
export async function listSettings() {
  const res = await client.get('/admin/settings')
  return res.data
}

// 更新單一設定（admin only）
// backend 回 { ok: true, key, value }
export async function updateSetting(key, value) {
  const res = await client.put(`/admin/settings/${key}`, { value })
  return res.data
}
