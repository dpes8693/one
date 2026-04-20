// frontend/src/api/applications.js
// Sprint 5 Task #17: 申請流程改寫
// 對應 backend：
//   GET    /api/templates                            列出 base Template + 預設規格
//   GET    /api/applications/availability?from=&to=  逐小時可用資源
//   GET    /api/applications                         查列表（admin / 學生）
//   POST   /api/applications                         送出申請
//   DELETE /api/applications/:id                     取消申請
//   PUT    /api/applications/:id/approve|reject      審核（既有 admin 流程）
//
// 注意：axios response → res.data 是 backend body，body 內常見 `{ data: ... }`，
// 因此真正的 payload 在 res.data.data；回傳時保留 backend body 完整結構讓呼叫端自行解套。
import client from './client.js'

// ---- Templates ----

/**
 * GET /api/templates
 * backend 回 { data: { id, name, defaults: { cpu, ram_gb, disk_gb, gpu_count } } }
 * 回傳：{ id, name, defaults }
 */
export async function getTemplates() {
  const res = await client.get('/templates')
  return res.data?.data ?? null
}

// ---- Availability ----

/**
 * GET /api/applications/availability?from=&to=
 * from / to 為 ISO 字串（含 Z）；backend 每整點回一筆。
 * backend 回 { data: [{ start_at, end_at, available: { cpu, ram_gb, disk_gb, gpu } }, ...] }
 * 回傳：陣列；無資料時回 []。
 */
export async function getAvailability(from, to) {
  const res = await client.get('/applications/availability', {
    params: { from, to },
  })
  const arr = res.data?.data
  return Array.isArray(arr) ? arr : []
}

// ---- Applications ----

/**
 * POST /api/applications
 * payload: { template_id, cpu, ram_gb, disk_gb, gpu_count, slots: [{start_at,end_at}, ...] }
 * 成功回 { ok: true, application_id, slots: [...] }
 * 失敗回 409 + { ok: false, violations: [...] } 或 { ok: false, error }
 */
export async function createApplication(payload) {
  const res = await client.post('/applications', payload)
  return res.data
}

/**
 * GET /api/applications
 * 學生視角只看自己；admin 看全部。
 * backend 回 { data: [...] }，這裡解套後直接回陣列。
 */
export async function listMyApplications() {
  const res = await client.get('/applications')
  return Array.isArray(res.data?.data) ? res.data.data : []
}

/**
 * DELETE /api/applications/:id
 * 成功回 { ok: true } 或 backend 回的內容
 */
export async function cancelApplication(id) {
  const res = await client.delete(`/applications/${id}`)
  return res.data
}

// ---- Admin 既有功能（保留供其他頁面使用） ----

/**
 * @deprecated 與 createApplication 重複，新介面請呼叫 createApplication。
 */
export async function submitApplication(data) {
  const res = await client.post('/applications', data)
  return res.data
}

export async function getApplications(status) {
  const params = status ? { status } : {}
  const res = await client.get('/applications', { params })
  return res.data
}

export async function approveApplication(id, body = {}) {
  const res = await client.put(`/applications/${id}/approve`, body)
  return res.data
}

export async function rejectApplication(id, reason) {
  const res = await client.put(`/applications/${id}/reject`, { reason })
  return res.data
}
