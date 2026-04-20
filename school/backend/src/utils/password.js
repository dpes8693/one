// utils/password.js
// Sprint 5 Task #10: 隨機密碼產生器
// 規格：A-Z + a-z + 0-9 + 特殊字元 !@#$%^&*，長度預設 12
// 保證每種字元類型至少出現一個（避免隨機到全字母無數字）。
import { randomBytes, randomInt } from 'node:crypto'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGIT = '0123456789'
const SYMBOL = '!@#$%^&*'
const ALL = UPPER + LOWER + DIGIT + SYMBOL

/**
 * 從字元集中以 crypto.randomInt 取 N 個字元
 */
function pick(charset, n) {
  let out = ''
  for (let i = 0; i < n; i++) {
    out += charset[randomInt(0, charset.length)]
  }
  return out
}

/**
 * Fisher–Yates shuffle，使用 crypto 隨機
 */
function shuffle(str) {
  const arr = str.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

/**
 * 產生隨機密碼
 *   - length 至少 4（因為要保證 4 種字元類型各 1）
 *   - 預設 12
 */
export function generateRandomPassword(length = 12) {
  if (typeof length !== 'number' || length < 4) {
    throw new Error('密碼長度至少 4')
  }
  // 每類各保底 1 個
  const guaranteed = pick(UPPER, 1) + pick(LOWER, 1) + pick(DIGIT, 1) + pick(SYMBOL, 1)
  // 其餘從全字元集填滿
  const rest = pick(ALL, length - 4)
  return shuffle(guaranteed + rest)
}

export const PASSWORD_CHARSETS = { UPPER, LOWER, DIGIT, SYMBOL, ALL }
