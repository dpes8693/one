// 自動 mock — vitest 會在 vi.mock('...opennebula') 時使用此檔案
const { vi } = require('vitest')

module.exports = {
  callFireEdge: vi.fn(),
  getAdminToken: vi.fn().mockResolvedValue('fake-admin-token'),
  createUser: vi.fn().mockResolvedValue({ id: 999 }),
  setUserQuota: vi.fn().mockResolvedValue({ ok: true }),
}
