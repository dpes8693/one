import nodemailer from 'nodemailer'
import config from '../config.js'
import pool from '../db.js'

/**
 * 建立 nodemailer transporter（若有 SMTP 設定）
 */
function createTransporter() {
  if (!config.smtp.host) return null
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  })
}

/**
 * 內部發信並寫 DB 紀錄
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
    // Fallback: console.log
    console.log('[Email] 模擬發信（未設定 SMTP）:')
    console.log(`  收件者: ${to}`)
    console.log(`  主旨: ${subject}`)
    console.log(`  內容: ${text}`)
  }

  // 寫 email_notifications 紀錄
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
