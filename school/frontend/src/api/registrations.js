// frontend/src/api/registrations.js
// Sprint 5 Task #12: admin 註冊審核相關 API 封裝
// 對應後端 routes/registrationsAdmin.js 三個端點，皆需 admin role JWT。
import client from './client.js'

/**
 * GET /api/admin/registrations?status=pending_review|all|approved|rejected
 * backend 回 { data: [...] }，這裡解套後直接回陣列。
 * @param {string} status - 預設 'pending_review'
 * @returns {Promise<Array>}
 */
export async function listRegistrations(status = 'pending_review') {
  const res = await client.get('/admin/registrations', {
    params: { status },
  })
  // backend response: { data: [ ... ] }
  return Array.isArray(res.data?.data) ? res.data.data : []
}

/**
 * POST /api/admin/registrations/:id/approve
 * 通過註冊；可選帶自訂密碼，否則由 backend 隨機產生。
 * 回應：{ ok, one_user_id, generated_password }
 * @param {number|string} id
 * @param {string|null} password - 可選；不提供則由後端產生
 */
export async function approveRegistration(id, password = null) {
  const body = password ? { password } : {}
  const res = await client.post(`/admin/registrations/${id}/approve`, body)
  return res.data
}

/**
 * POST /api/admin/registrations/:id/reject
 * 拒絕註冊；reason 必填。
 * @param {number|string} id
 * @param {string} reason
 */
export async function rejectRegistration(id, reason) {
  const res = await client.post(`/admin/registrations/${id}/reject`, { reason })
  return res.data
}
