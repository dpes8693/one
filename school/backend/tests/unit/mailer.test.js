// tests/unit/mailer.test.js
// Sprint 4 Task #3: SMTP 真實接通 — mailer 雙模式（real SMTP + console fallback）
// TDD：先寫測試，再讓實作通過
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

// Mock DB pool — 不真寫 DB
vi.mock('../../src/db.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

// Mock config — 控制 SMTP 設定有無
vi.mock('../../src/config.js', () => ({
  default: {
    smtp: {
      host: null,
      port: 587,
      user: null,
      pass: null,
      from: null,
      secure: false,
    },
    frontendUrl: 'http://localhost:3000',
  },
}))

import nodemailer from 'nodemailer'
import pool from '../../src/db.js'
import config from '../../src/config.js'

describe('mailer — 沒設 SMTP_HOST → console fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.smtp.host = null
    nodemailer.createTransport.mockReturnValue(null)
  })

  it('不會呼叫 transporter.sendMail（fallback console mock）', async () => {
    const sendMailMock = vi.fn()
    // 即使 createTransport 被呼叫也是 null
    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'student@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 1,
    })

    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('fallback 模式仍寫 email_notifications DB (status=sent)', async () => {
    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'fallback@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 7,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['fallback@example.com', 'approval', 7, 'sent'])
    )
  })
})

describe('mailer — 有設 SMTP_HOST → real SMTP', () => {
  let sendMailMock

  beforeEach(() => {
    vi.clearAllMocks()
    config.smtp.host = 'smtp.example.com'
    config.smtp.port = 465
    config.smtp.user = 'user@example.com'
    config.smtp.pass = 'secret'
    config.smtp.from = 'noreply@example.com'
    config.smtp.secure = true

    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    nodemailer.createTransport.mockReturnValue({
      sendMail: sendMailMock,
    })
  })

  afterEach(() => {
    config.smtp.host = null
    config.smtp.secure = false
  })

  it('呼叫 nodemailer.createTransport（含 host/port/secure/auth）', async () => {
    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'real@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 2,
    })

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: expect.objectContaining({
          user: 'user@example.com',
          pass: 'secret',
        }),
      })
    )
  })

  it('呼叫 transporter.sendMail（含 from/to/subject）', async () => {
    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'real@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 2,
    })

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'real@example.com',
        subject: expect.any(String),
      })
    )
  })

  it('寄信成功 → email_notifications status=sent', async () => {
    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'success@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 3,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['success@example.com', 'approval', 3, 'sent'])
    )
  })

  it('寄信失敗 → email_notifications status=failed 並寫 error', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP auth fail'))

    const { sendApprovalNotification } = await import('../../src/services/mailer.js')

    await sendApprovalNotification({
      email: 'fail@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'pw',
      relatedId: 4,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['fail@example.com', 'approval', 4, 'failed', 'SMTP auth fail'])
    )
  })
})
