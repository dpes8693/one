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

/**
 * Sprint 5 Task #9: 寄送註冊驗證碼
 */
export async function sendVerificationCode({ email, code, ttlMinutes = 5 }) {
  const subject = 'GPU 平台註冊驗證碼'
  const text = `您的驗證碼：${code}，${ttlMinutes} 分鐘內有效`
  return sendEmail({ to: email, subject, text, templateType: 'verification' })
}

/**
 * Sprint 5 Task #10: 註冊審核「通過」通知
 *   - sshUsername = 學號（OpenNebula user）
 *   - sshPassword = 後端隨機產的明文密碼（學生收到要妥善保管）
 *   - 本函式不存明文，只寫 DB email_notifications 紀錄寄信狀態
 */
export async function sendApprovalEmail(email, sshUsername, sshPassword) {
  const subject = 'GPU 平台申請通過'
  const text = `
您好，

您的 GPU 算力平台申請已通過審核。

SSH 連線帳號：${sshUsername}
SSH 連線密碼：${sshPassword}

請妥善保存以上密碼（系統不會再次顯示）。
之後 VM 開機後您可用此帳密 SSH 進入 VM 使用 GPU。

—GPU 算力平台
`.trim()

  return sendEmail({ to: email, subject, text, templateType: 'approval' })
}

/**
 * Sprint 5 Task #10: 註冊審核「拒絕」通知
 */
export async function sendRejectionEmail(email, reason) {
  const subject = 'GPU 平台申請未通過'
  const text = `
您好，

很抱歉，您的 GPU 算力平台申請未通過審核。

拒絕原因：${reason}

如有疑問請聯絡平台管理員，或修正後重新註冊。

—GPU 算力平台
`.trim()

  return sendEmail({ to: email, subject, text, templateType: 'rejection' })
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

/**
 * Sprint 5 Task #15：預約申請審核「通過」通知
 *  - email：學生 email
 *  - application：{ id, cpu, ram_gb, disk_gb, gpu_count }
 *  - slots：[{ start_at, end_at }, ...]
 */
export async function sendReservationApprovedEmail(email, application, slots = []) {
  const subject = '預約申請通過'
  const slotLines = slots
    .map((s, i) => `  ${i + 1}. ${s.start_at} ~ ${s.end_at}`)
    .join('\n')
  const text = `
您好，

您的 GPU 算力平台預約申請（編號 #${application?.id ?? '-'}）已通過審核。

預約時段：
${slotLines || '  （無時段資料）'}

VM 規格：
  CPU：${application?.cpu ?? '-'} 核
  RAM：${application?.ram_gb ?? '-'} GB
  Disk：${application?.disk_gb ?? '-'} GB
  GPU：${application?.gpu_count ?? '-'} 張

到了開始時間，系統會自動為您開機，並另寄 SSH 連線資訊。

—GPU 算力平台
`.trim()

  return sendEmail({
    to: email,
    subject,
    text,
    templateType: 'reservation_approved',
    relatedId: application?.id ?? null,
  })
}

/**
 * Sprint 5 Task #15：預約申請審核「拒絕」通知
 */
export async function sendReservationRejectedEmail(email, reason) {
  const subject = '預約申請未通過'
  const text = `
您好，

很抱歉，您的 GPU 算力平台預約申請未通過審核。

拒絕原因：${reason}

如有疑問請聯絡平台管理員。

—GPU 算力平台
`.trim()

  return sendEmail({
    to: email,
    subject,
    text,
    templateType: 'reservation_rejected',
  })
}

export async function sendNewApplicationNotification({ studentName, studentId, purpose }) {
  console.log('[Email] 新申請通知（管理員）:')
  console.log(`  申請人: ${studentName} (${studentId})`)
  console.log(`  用途: ${purpose}`)
}

// ============================================================
// Sprint 5 Task #16: Scheduler 自動開機/關機 通知
// ============================================================

/**
 * VM 開機成功 → 通知學生（含 SSH 連線資訊）
 * SPEC N5：email 給學生「VM 已開 + SSH 連線資訊（IP/Port/帳密）」
 */
export async function sendVmReadyEmail(email, vmName, sshHost, sshPort, sshUser) {
  const subject = `VM 已開機 — ${vmName}`
  const text = `
您好，

您預約的 GPU VM 已自動開機：

  VM 名稱：${vmName}
  SSH 主機：${sshHost || '(尚未取得 IP，請稍後查看平台)'}
  SSH Port：${sshPort || 22}
  SSH 帳號：${sshUser || 'root'}
  SSH 密碼：請使用您註冊時收到的密碼

到結束時間系統將自動關機並釋放 GPU。

—GPU 算力平台
`.trim()

  return sendEmail({
    to: email,
    subject,
    text,
    templateType: 'vm_ready',
  })
}

/**
 * VM 開機失敗 → 通知 admin（SPEC Q6=B：不 retry，立刻通知）
 */
export async function sendVmFailureNotification(adminEmail, vmName, error) {
  const subject = `[GPU 平台] VM 自動開機失敗 — ${vmName}`
  const text = `
管理員您好，

VM ${vmName} 自動開機失敗，請儘速處理。

錯誤訊息：
${error}

請檢查 OpenNebula 狀態 / 資源 / Template 設定。

—GPU 算力平台 Scheduler
`.trim()

  return sendEmail({
    to: adminEmail,
    subject,
    text,
    templateType: 'vm_failure_admin',
  })
}

/**
 * VM 開機失敗 → 通知學生（簡訊風格，不揭露技術細節）
 */
export async function sendVmFailureToStudent(email) {
  const subject = 'VM 開機失敗'
  const text = `
您好，

很抱歉，您預約的 GPU VM 開機失敗，已通知系統管理員處理。
請聯絡管理員協助安排補時段或退款。

造成不便敬請見諒。

—GPU 算力平台
`.trim()

  return sendEmail({
    to: email,
    subject,
    text,
    templateType: 'vm_failure_student',
  })
}

/**
 * VM 結束（time-up terminate） → 通知學生
 */
export async function sendVmEndedEmail(email, vmName) {
  const subject = `VM 已結束 — ${vmName}`
  const text = `
您好，

您預約的 GPU VM 已到結束時間，系統已自動關機並釋放 GPU。

  VM 名稱：${vmName}

提醒：本平台 VM 結束後不保留磁碟資料，請確認重要檔案已備份。
如需繼續使用，請重新預約。

—GPU 算力平台
`.trim()

  return sendEmail({
    to: email,
    subject,
    text,
    templateType: 'vm_ended',
  })
}
