import client from './client.js'

export async function getAlerts({ from, to, limit } = {}) {
  const res = await client.get('/alerts', { params: { from, to, limit } })
  return res.data
}
