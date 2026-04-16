import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret'

export function makeAdminToken(overrides = {}) {
  const payload = {
    id: 1,
    username: 'oneadmin',
    one_user_name: 'oneadmin',
    one_user_id: 1,
    one_token: 'fake-one-token',
    role: 'admin',
    ...overrides,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}
