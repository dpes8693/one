// frontend/src/api/register.js
// Sprint 5 Task #11: 學生註冊相關 API 封裝
// 對應後端 routes/register.js 三個端點，皆為 unauthenticated。
import client from './client.js'

/**
 * POST /api/register — 送出註冊資料 → 後端寄驗證碼
 * @param {{email:string, password:string, name:string, student_id:string, memo?:string}} payload
 */
export async function register({ email, password, name, student_id, memo }) {
  const res = await client.post('/register', {
    email,
    password,
    name,
    student_id,
    memo,
  })
  return res.data
}

/**
 * POST /api/register/verify — 提交驗證碼
 * @param {{email:string, code:string}} payload
 */
export async function verifyRegister({ email, code }) {
  const res = await client.post('/register/verify', { email, code })
  return res.data
}

/**
 * POST /api/register/resend — 重寄驗證碼（後端有 60s 冷卻 + 每小時 5 次節流）
 * @param {{email:string}} payload
 */
export async function resendCode({ email }) {
  const res = await client.post('/register/resend', { email })
  return res.data
}
