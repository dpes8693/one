// tests/unit/password.test.js
// Sprint 5 Task #10: 隨機密碼工具單元測試
import { describe, it, expect } from 'vitest'
import { generateRandomPassword, PASSWORD_CHARSETS } from '../../src/utils/password.js'

const { UPPER, LOWER, DIGIT, SYMBOL } = PASSWORD_CHARSETS

function hasAny(str, charset) {
  for (const ch of str) {
    if (charset.includes(ch)) return true
  }
  return false
}

describe('generateRandomPassword', () => {
  it('預設長度 12', () => {
    const pw = generateRandomPassword()
    expect(pw).toHaveLength(12)
  })

  it('指定長度可控（16 / 20）', () => {
    expect(generateRandomPassword(16)).toHaveLength(16)
    expect(generateRandomPassword(20)).toHaveLength(20)
  })

  it('每次產的密碼都不同（連產 50 次幾乎不會碰撞）', () => {
    const set = new Set()
    for (let i = 0; i < 50; i++) {
      set.add(generateRandomPassword())
    }
    expect(set.size).toBe(50)
  })

  it('必含 4 種字元類型（大寫/小寫/數字/特殊）', () => {
    for (let i = 0; i < 30; i++) {
      const pw = generateRandomPassword()
      expect(hasAny(pw, UPPER)).toBe(true)
      expect(hasAny(pw, LOWER)).toBe(true)
      expect(hasAny(pw, DIGIT)).toBe(true)
      expect(hasAny(pw, SYMBOL)).toBe(true)
    }
  })

  it('長度 < 4 應拋例外', () => {
    expect(() => generateRandomPassword(3)).toThrow()
    expect(() => generateRandomPassword(0)).toThrow()
  })

  it('不含字元集外的字元（避免空白、引號等）', () => {
    const allowed = UPPER + LOWER + DIGIT + SYMBOL
    for (let i = 0; i < 20; i++) {
      const pw = generateRandomPassword()
      for (const ch of pw) {
        expect(allowed.includes(ch)).toBe(true)
      }
    }
  })
})
