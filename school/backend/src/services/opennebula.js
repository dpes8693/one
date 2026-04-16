import config from '../config.js'

const BASE_URL = config.opennebula.url

/**
 * 呼叫 FireEdge API 的通用 helper
 */
export async function callFireEdge(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const options = { method, headers }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const url = `${BASE_URL}/fireedge/api${path}`
  const res = await fetch(url, options)
  const data = await res.json()

  if (!res.ok) {
    const msg = data?.message || `HTTP ${res.status}`
    throw new Error(`FireEdge 錯誤 [${res.status}]: ${msg}`)
  }
  return data
}

/**
 * 用 oneadmin 帳密登入，取得管理員 token
 */
export async function getAdminToken() {
  const res = await fetch(`${BASE_URL}/fireedge/api/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: config.opennebula.user,
      token: config.opennebula.pass,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data?.data?.token) {
    throw new Error('無法取得 oneadmin token')
  }
  return data.data.token
}

/**
 * 建立使用者帳號
 */
export async function createUser(adminToken, username, password) {
  return callFireEdge(
    'POST',
    '/user/allocate',
    { user: username, token: password },
    adminToken
  )
}

/**
 * 設定使用者配額
 */
export async function setUserQuota(adminToken, userId, quota) {
  const quotaXml = `<USER_QUOTA>
    <VM_QUOTA>
      <VM>
        <VMS>${quota.vms || 1}</VMS>
        <CPU>${quota.cpu || 2}</CPU>
        <MEMORY>${quota.memory || 2048}</MEMORY>
        <SYSTEM_DISK_SIZE>-1</SYSTEM_DISK_SIZE>
      </VM>
    </VM_QUOTA>
  </USER_QUOTA>`

  return callFireEdge(
    'PUT',
    `/user/quota/${userId}`,
    { template: quotaXml },
    adminToken
  )
}
