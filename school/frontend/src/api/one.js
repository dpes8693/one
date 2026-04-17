import client from './client.js'

// VM 列表（學生自己的 VM，filter=-1 表示只看自己的）
export async function getVMList() {
  const res = await client.get('/one/vmpool/info/paginated', {
    params: { extended: 1, filter: -1, pageSize: 200 },
  })
  return res.data
}

// 學生 Dashboard 用：filter=-2 取得目前使用者可見的所有 VM（含完整 extended 內容）
// 回傳完整 axios response（保留 res.data.data 結構），讓前端做防禦解析
export async function getMyVMsPaginated() {
  return client.get('/one/vmpool/info/paginated', {
    params: { extended: 1, filter: -2, pageSize: 200 },
  })
}

// VM 詳情
export async function getVMInfo(id) {
  const res = await client.get(`/one/vm/info/${id}`)
  return res.data
}

// VM 操作（resume / poweroff / terminate / reboot）
export async function vmAction(id, action) {
  const res = await client.put(`/one/vm/action/${id}`, { action })
  return res.data
}

// 取得 VM Template 列表（管理員用）
export async function getTemplates() {
  const res = await client.get('/one/templatepool/info', {
    params: { filter: -2 },
  })
  return res.data
}
