import client from './client.js'

// 注意：backend 代理 /api/one/* 回傳 { id, message, data: {...} } (XML-RPC 結構)
// axios `.data` 是 backend body，OpenNebula 資料在 body.data 多一層

// 取得 dashboard 統計數字
export async function getDashboardStats() {
  const [hostsRes, vmsRes, appsRes] = await Promise.all([
    client.get('/one/hostpool/info'),
    client.get('/one/vmpool/info/paginated', { params: { extended: 1, filter: -2 } }),
    client.get('/applications', { params: { status: 'pending' } }),
  ])

  // hostpool/info 是 XML-RPC 代理：response = { id, message, data: { HOST_POOL: {...} } }
  const hosts = hostsRes.data?.data?.HOST_POOL?.HOST || []
  const hostList = Array.isArray(hosts) ? hosts : [hosts]

  // 計算 GPU 總數（只算 VGA class 的 PCI 裝置）
  let gpuCount = 0
  for (const h of hostList) {
    const pcis = h.HOST_SHARE?.PCI_DEVICES?.PCI
    if (pcis) {
      const arr = Array.isArray(pcis) ? pcis : [pcis]
      gpuCount += arr.filter((p) => p.CLASS === '0300').length
    }
  }

  // vmpool/info/paginated 是功能路由：response = { id, message, data: [...] }
  const vms = vmsRes.data?.data || []
  const vmList = Array.isArray(vms) ? vms : []
  const runningVMCount = vmList.filter((v) => v.STATE === '3').length

  // /applications：response = { applications: [...] }
  const apps = appsRes.data?.applications || []
  const pendingApplicationCount = Array.isArray(apps) ? apps.length : 0

  return {
    hostCount: hostList.length,
    gpuCount,
    runningVMCount,
    pendingApplicationCount,
  }
}

// 取得 host 列表（含 GPU 資訊）
export async function getHostsWithGPU() {
  const poolRes = await client.get('/one/hostpool/info')
  // XML-RPC 代理 response 多一層 data
  const hosts = poolRes.data?.data?.HOST_POOL?.HOST || []
  const hostList = Array.isArray(hosts) ? hosts : [hosts]

  const results = await Promise.all(
    hostList.map(async (h) => {
      const detailRes = await client.get(`/one/host/info/${h.ID}`)
      const host = detailRes.data?.data?.HOST || h

      const rawPCI = host.HOST_SHARE?.PCI_DEVICES?.PCI
      const pciArr = rawPCI ? (Array.isArray(rawPCI) ? rawPCI : [rawPCI]) : []

      // 只保留 GPU（VGA class 0300）
      const gpus = pciArr.filter((p) => p.CLASS === '0300')

      // 對有 VM 佔用的 GPU，取 VM 名稱
      const gpusWithVMName = await Promise.all(
        gpus.map(async (gpu) => {
          if (gpu.VMID && gpu.VMID !== '-1') {
            try {
              const vmRes = await client.get(`/one/vm/info/${gpu.VMID}`)
              const vmName = vmRes.data?.data?.VM?.NAME || null
              return { ...gpu, VM_NAME: vmName }
            } catch {
              return { ...gpu, VM_NAME: null }
            }
          }
          return { ...gpu, VM_NAME: null }
        })
      )

      return {
        ID: host.ID,
        NAME: host.NAME,
        STATE: host.STATE,
        HOST_SHARE: host.HOST_SHARE,
        PCI: gpusWithVMName,
      }
    })
  )

  return results
}
