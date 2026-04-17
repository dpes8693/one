// services/notifier.js
// Sprint 4 Task #3: SMTP 真實接通
// 雙模式：
//   - SMTP_HOST 有設 → 用 nodemailer 真寄信
//   - SMTP_HOST 沒設 → console fallback（保留 dev / 測試行為）
// 兩種模式都會寫 email_notifications DB（status=sent / failed）
import nodemailer from 'nodemailer'
import config from '../config.js'
import pool from '../db.js'

/**
 * 建立 nodemailer transporter（若有 SMTP 設定）
 * 沒設 SMTP_HOST → 回傳 null，由呼叫端走 console fallback
 */
function createTransporter() {
  if (!config.smtp.host) return null

  const opts = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: !!config.smtp.secure,
  }
  if (config.smtp.user || config.smtp.pass) {
    opts.auth = {
      user: config.smtp.user,
      pass: config.smtp.pass,
    }
  }
  return nodemailer.createTransport(opts)
}

/**
 * 寫一筆 email_notifications 紀錄
 */
async function recordNotification({ to, subject, templateType, relatedId, status, errorMessage }) {
  try {
    await pool.query(
      `INSERT INTO email_notifications
         (recipient_email, subject, template_type, related_id, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [to, subject, templateType, relatedId || null, status, errorMessage]
    )
  } catch (dbErr) {
    console.error('[Email] 寫入 DB 失敗:', dbErr.message)
  }
}

/**
 * 內部發信並寫 DB 紀錄
 * - 有 transporter（SMTP_HOST 已設）→ 真寄信
 * - 無 transporter → console fallback（仍寫 DB status=sent）
 */
async function sendEmail({ to, subject, text, templateType, relatedId }) {
  const transporter = createTransporter()
  let status = 'sent'
  let errorMessage = null

  if (transporter) {
    try {
      await transporter.sendMail({
        from: config.smtp.from || config.smtp.user,
        to,
        subject,
        text,
      })
    } catch (err) {
      status = 'failed'
      errorMessage = err.message
      console.error('[Email] 發送失敗:', err.message)
    }
  } else {
    // Fallback: console.log（學校尚未提供 SMTP；dev/測試也走這條）
    console.log('[Email] 模擬發信（未設定 SMTP_HOST）:')
    console.log(`  收件者: ${to}`)
    console.log(`  主旨: ${subject}`)
    console.log(`  內容: ${text}`)
  }

  await recordNotification({ to, subject, templateType, relatedId, status, errorMessage })
  return { status, errorMessage }
}

export async function sendApprovalNotification({ email, studentName, username, password, loginUrl, relatedId }) {
  const subject = `GPU 算力平台申請已通過 — ${studentName}`
  const text = `
您好 ${studentName}，

您的 GPU 算力平台申請已通過審核。

帳號資訊：
  帳號：${username}
  密碼：${password}
  登入網址：${loginUrl || config.frontendUrl}

請登入平台查看 VM 詳情與 SSH 連線資訊。

—GPU 算力平台
`.trim()

  return sendEmail({ to: email, subject, text, templateType: 'approval', relatedId })
}

export async function sendRejectionNotification({ email, studentName, reason, relatedId }) {
  const subject = `GPU 算力平台申請未通過 — ${studentName}`
  const text = `
您好 ${studentName}，

您的 GPU 算力平台申請未通過審核。

拒絕原因：${reason}

如有疑問，請聯絡平台管理員。

—GPU 算力平台
`.trim()

  return sendEmail({ to: email, subject, text, templateType: 'rejection', relatedId })
}

export async function sendNewApplicationNotification({ studentName, studentId, purpose }) {
  console.log('[Email] 新申請通知（管理員）:')
  console.log(`  申請人: ${studentName} (${studentId})`)
  console.log(`  用途: ${purpose}`)
}
