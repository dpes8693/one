// routes/register.js
// Sprint 5 Task #9: 學生註冊 API（含驗證碼節流）
// 三個端點：
//   POST /api/register          學生送出註冊 → 寄驗證碼
//   POST /api/register/verify   貼驗證碼 → 進入待審
//   POST /api/register/resend   重寄驗證碼（節流）
//
// 規格依據：school/docs/SPEC_V2.md（R1-R6 + Mermaid 註冊時序圖）
// 不需登入；email 一律小寫化處理避免大小寫繞過節流。
import express from 'express'
import bcrypt from 'bcrypt'
import pool from '../db.js'
import { sendVerificationCode } from '../services/notifier.js'

const router = express.Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_COOLDOWN_SEC = 60 // 60 秒冷卻
const HOUR_MS = 60 * 60 * 1000
const BCRYPT_COST = 10

// ---------------- helpers ----------------

/**
 * 從 system_settings 撈一組 key → value（含 fallback 預設）
 */
async function loadSettings() {
  const defaults = {
    verification_code_ttl_min: '5',
    verification_max_per_hour: '5',
    verification_max_attempts: '3',
    verification_lockout_minutes: '30',
  }
  try {
    const r = await pool.query('SELECT key, value FROM system_settings')
    const map = { ...defaults }
    for (const row of r.rows) map[row.key] = row.value
    return map
  } catch (err) {
    console.error('[Register] 讀 system_settings 失敗，使用預設:', err.message)
    return defaults
  }
}

/** 產 6 位數字驗證碼（zero-padded） */
function genCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

/**
 * 節流檢查 — 寄信前呼叫
 * 回傳 { ok: true } 或 { ok: false, status, error }
 */
function checkSendThrottle(throttleRow, settings) {
  if (!throttleRow) return { ok: true }

  const now = Date.now()

  // 60 秒冷卻
  if (throttleRow.last_sent_at) {
    const last = new Date(throttleRow.last_sent_at).getTime()
    if (now - last < RESEND_COOLDOWN_SEC * 1000) {
      const remain = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (now - last)) / 1000)
      return {
        ok: false,
        status: 429,
        error: `請於 ${remain} 秒後再試`,
      }
    }
  }

  // 每小時上限
  const max = parseInt(settings.verification_max_per_hour, 10) || 5
  const windowStart = throttleRow.hour_window_start
    ? new Date(throttleRow.hour_window_start).getTime()
    : 0
  const windowExpired = now - windowStart >= HOUR_MS
  const count = windowExpired ? 0 : (throttleRow.hourly_count || 0)
  if (count >= max) {
    return {
      ok: false,
      status: 429,
      error: `每小時最多 ${max} 次驗證信，請稍後再試`,
    }
  }

  return { ok: true }
}

/**
 * upsert verification_throttle — 寄出後呼叫
 * 重置 hour_window_start（若 1 小時已過）
 */
async function bumpThrottle(email, prev) {
  const now = new Date()
  const HOUR = HOUR_MS

  let windowStart = prev?.hour_window_start ? new Date(prev.hour_window_start) : now
  let count = prev?.hourly_count || 0
  if (now.getTime() - windowStart.getTime() >= HOUR) {
    windowStart = now
    count = 0
  }
  count += 1

  await pool.query(
    `INSERT INTO verification_throttle (email, last_sent_at, hourly_count, hour_window_start)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       last_sent_at = EXCLUDED.last_sent_at,
       hourly_count = EXCLUDED.hourly_count,
       hour_window_start = EXCLUDED.hour_window_start`,
    [email, now, count, windowStart]
  )
}

/** 寄一次驗證碼並 upsert 一筆 pending_registrations */
async function issueCodeAndSend({ email, settings, mode, password_hash, name, student_id, memo, existing }) {
  const code = genCode()
  const ttlMin = parseInt(settings.verification_code_ttl_min, 10) || 5
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000)

  if (mode === 'insert') {
    await pool.query(
      `INSERT INTO pending_registrations
         (email, password_hash, name, student_id, memo, verification_code, code_expires_at, status, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_email', false)
       RETURNING id`,
      [email, password_hash, name, student_id, memo || null, code, expiresAt]
    )
  } else if (mode === 'update_pending') {
    // 同 email 已有 pending_email：可能要更新資料 + 換驗證碼
    if (password_hash) {
      await pool.query(
        `UPDATE pending_registrations
           SET password_hash = $3, name = $4, student_id = $5, memo = $6,
               verification_code = $1, code_expires_at = $2,
               verified = false, status = 'pending_email'
         WHERE email = $7 AND status = 'pending_email'`,
        [code, expiresAt, password_hash, name, student_id, memo || null, email]
      )
    } else {
      // resend：只更新驗證碼
      await pool.query(
        `UPDATE pending_registrations
           SET verification_code = $1, code_expires_at = $2
         WHERE email = $3 AND status = 'pending_email'`,
        [code, expiresAt, email]
      )
    }
  }

  await sendVerificationCode({ email, code, ttlMinutes: ttlMin })
}

// ---------------- POST /api/register ----------------

router.post('/', async (req, res) => {
  try {
    const { email: rawEmail, password, name, student_id, memo } = req.body || {}

    // 1. 欄位驗證
    if (!rawEmail || !password || !name || !student_id) {
      return res.status(400).json({ error: '請填寫 email、密碼、姓名與學號' })
    }
    const email = String(rawEmail).trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'email 格式錯誤' })
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: '密碼至少 8 字元' })
    }

    const settings = await loadSettings()

    // 2. 節流檢查
    const t = await pool.query(
      `SELECT email, last_sent_at, hourly_count, hour_window_start, failed_attempts, locked_until
         FROM verification_throttle WHERE email = $1`,
      [email]
    )
    const throttle = t.rows[0]
    const guard = checkSendThrottle(throttle, settings)
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error })

    // 3. password hash
    const password_hash = await bcrypt.hash(String(password), BCRYPT_COST)

    // 4. 看有沒有舊 pending_email
    const existing = await pool.query(
      `SELECT id FROM pending_registrations WHERE email = $1 AND status = 'pending_email'`,
      [email]
    )
    const mode = existing.rows.length > 0 ? 'update_pending' : 'insert'

    // 5. 寄信 + DB
    await issueCodeAndSend({
      email, settings, mode, password_hash, name, student_id, memo,
      existing: existing.rows[0],
    })

    // 6. 更新節流
    await bumpThrottle(email, throttle)

    return res.json({ ok: true, message: '驗證碼已寄出' })
  } catch (err) {
    console.error('[Register] 註冊失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' })
  }
})

// ---------------- POST /api/register/verify ----------------

router.post('/verify', async (req, res) => {
  try {
    const { email: rawEmail, code } = req.body || {}
    if (!rawEmail || !code) {
      return res.status(400).json({ error: '請提供 email 與驗證碼' })
    }
    const email = String(rawEmail).trim().toLowerCase()

    const settings = await loadSettings()
    const maxAttempts = parseInt(settings.verification_max_attempts, 10) || 3
    const lockoutMin = parseInt(settings.verification_lockout_minutes, 10) || 30

    // 1. 找 pending
    const p = await pool.query(
      `SELECT id, email, verification_code, code_expires_at
         FROM pending_registrations
        WHERE email = $1 AND status = 'pending_email'
        ORDER BY id DESC LIMIT 1`,
      [email]
    )
    if (p.rows.length === 0) {
      return res.status(400).json({ error: '請先完成註冊' })
    }
    const pending = p.rows[0]

    // 2. 檢查鎖定
    const t = await pool.query(
      `SELECT email, last_sent_at, hourly_count, hour_window_start, failed_attempts, locked_until
         FROM verification_throttle WHERE email = $1`,
      [email]
    )
    const throttle = t.rows[0]
    if (throttle?.locked_until && new Date(throttle.locked_until).getTime() > Date.now()) {
      const remainMin = Math.ceil(
        (new Date(throttle.locked_until).getTime() - Date.now()) / 60000
      )
      return res.status(410).json({
        error: `錯誤次數過多，請於 ${remainMin} 分鐘後再試`,
      })
    }

    // 3. 過期檢查
    if (!pending.code_expires_at ||
        new Date(pending.code_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: '驗證碼已過期，請重新申請' })
    }

    // 4. 比對
    if (String(pending.verification_code).trim() !== String(code).trim()) {
      const newAttempts = (throttle?.failed_attempts || 0) + 1

      if (newAttempts >= maxAttempts) {
        const lockUntil = new Date(Date.now() + lockoutMin * 60 * 1000)
        // upsert throttle 鎖定
        if (throttle) {
          await pool.query(
            `UPDATE verification_throttle
                SET failed_attempts = $1, locked_until = $2
              WHERE email = $3`,
            [newAttempts, lockUntil, email]
          )
        } else {
          await pool.query(
            `INSERT INTO verification_throttle
               (email, last_sent_at, hourly_count, hour_window_start, failed_attempts, locked_until)
             VALUES ($1, NULL, 0, NULL, $2, $3)
             ON CONFLICT (email) DO UPDATE SET
               failed_attempts = EXCLUDED.failed_attempts,
               locked_until = EXCLUDED.locked_until`,
            [email, newAttempts, lockUntil]
          )
        }
        return res.status(410).json({
          error: `錯誤次數過多，請於 ${lockoutMin} 分鐘後再試`,
        })
      }

      // 一般錯誤：累加 failed_attempts
      if (throttle) {
        await pool.query(
          `UPDATE verification_throttle
              SET failed_attempts = $1, locked_until = NULL
            WHERE email = $2`,
          [newAttempts, email]
        )
      } else {
        await pool.query(
          `INSERT INTO verification_throttle
             (email, last_sent_at, hourly_count, hour_window_start, failed_attempts, locked_until)
           VALUES ($1, NULL, 0, NULL, $2, NULL)
           ON CONFLICT (email) DO UPDATE SET failed_attempts = EXCLUDED.failed_attempts`,
          [email, newAttempts]
        )
      }
      return res.status(400).json({
        error: `驗證碼錯誤（剩餘 ${maxAttempts - newAttempts} 次）`,
      })
    }

    // 5. 成功 → 改 pending_review
    await pool.query(
      `UPDATE pending_registrations
          SET verified = true, status = 'pending_review', verification_code = NULL
        WHERE email = $1 AND status = 'pending_email'`,
      [email]
    )
    // 重置 failed_attempts
    if (throttle) {
      await pool.query(
        `UPDATE verification_throttle
            SET failed_attempts = 0, locked_until = NULL
          WHERE email = $1`,
        [email]
      )
    }

    return res.json({ ok: true, message: '驗證成功，等待管理員審核' })
  } catch (err) {
    console.error('[Register] 驗證失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' })
  }
})

// ---------------- POST /api/register/resend ----------------

router.post('/resend', async (req, res) => {
  try {
    const { email: rawEmail } = req.body || {}
    if (!rawEmail) return res.status(400).json({ error: '請提供 email' })
    const email = String(rawEmail).trim().toLowerCase()

    const settings = await loadSettings()

    // 必須有 pending 才能重寄
    const p = await pool.query(
      `SELECT id FROM pending_registrations
        WHERE email = $1 AND status = 'pending_email'
        ORDER BY id DESC LIMIT 1`,
      [email]
    )
    if (p.rows.length === 0) {
      return res.status(400).json({ error: '查無待驗證的註冊資料，請先送出註冊' })
    }

    // 節流
    const t = await pool.query(
      `SELECT email, last_sent_at, hourly_count, hour_window_start, failed_attempts, locked_until
         FROM verification_throttle WHERE email = $1`,
      [email]
    )
    const throttle = t.rows[0]
    const guard = checkSendThrottle(throttle, settings)
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error })

    await issueCodeAndSend({
      email, settings, mode: 'update_pending',
      password_hash: null, name: null, student_id: null, memo: null,
    })
    await bumpThrottle(email, throttle)

    return res.json({ ok: true, message: '驗證碼已重寄' })
  } catch (err) {
    console.error('[Register] 重寄失敗:', err.message)
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' })
  }
})

export default router
