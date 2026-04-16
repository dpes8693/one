import client from './client.js'

export async function getSshKey() {
  const res = await client.get('/users/me/ssh-key')
  return res.data
}

export async function updateSshKey(ssh_public_key) {
  const res = await client.put('/users/me/ssh-key', { ssh_public_key })
  return res.data
}
