import client from './client.js'

export async function getAuditLogs({ user_id, action, from, to, limit } = {}) {
  const res = await client.get('/audit', { params: { user_id, action, from, to, limit } })
  return res.data
}
