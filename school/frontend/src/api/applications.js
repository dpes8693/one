import client from './client.js'

export async function submitApplication(data) {
  const res = await client.post('/applications', data)
  return res.data
}

export async function getApplications(status) {
  const params = status ? { status } : {}
  const res = await client.get('/applications', { params })
  return res.data
}

export async function approveApplication(id, { template_id, quota }) {
  const res = await client.put(`/applications/${id}/approve`, { template_id, quota })
  return res.data
}

export async function rejectApplication(id, reason) {
  const res = await client.put(`/applications/${id}/reject`, { reason })
  return res.data
}
