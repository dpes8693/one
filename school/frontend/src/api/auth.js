import client from './client.js'

export async function login(user, password) {
  const res = await client.post('/auth/login', { user, password })
  return res.data
}

export async function logout() {
  await client.post('/auth/logout')
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}
