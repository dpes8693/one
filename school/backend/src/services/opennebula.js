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
 * Sprint 5 Task #16：實例化 Template 為 VM
 *  - POST /template/instantiate/:id
 *  - body: { templateId, vmName, instantiateOptions: { template: [...] } }
 *  - 回傳 OpenNebula 的 VM 物件（FireEdge 不同版本格式不同，scheduler 端自行容忍）
 */
export async function instantiateTemplate(token, templateId, vmName, instantiateOptions) {
  const body = {
    templateId,
    vmName,
    instantiateOptions: instantiateOptions || {},
  }
  return callFireEdge('POST', `/template/instantiate/${templateId}`, body, token)
}

/**
 * Sprint 5 Task #16：取 VM 的 NIC[0].IP（DHCP 可能為空）
 */
export async function getVmIp(token, vmId) {
  const info = await callFireEdge('GET', `/vm/info/${vmId}`, null, token)
  const vm = info?.data?.VM || info?.VM || {}
  const tpl = vm.TEMPLATE || {}
  let nics = tpl.NIC
  if (!nics) return ''
  if (!Array.isArray(nics)) nics = [nics]
  for (const n of nics) {
    if (n?.IP) return String(n.IP)
  }
  return ''
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
