import client from './client.js'

export async function getSchedules() {
  const res = await client.get('/schedules')
  return res.data
}

export async function createSchedule(payload) {
  const res = await client.post('/schedules', payload)
  return res.data
}

export async function updateSchedule(id, payload) {
  const res = await client.put(`/schedules/${id}`, payload)
  return res.data
}

export async function deleteSchedule(id) {
  const res = await client.delete(`/schedules/${id}`)
  return res.data
}
