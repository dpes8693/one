// tests/unit/notifier.test.js
// F3: Email 通知 notifier 單元測試（TDD）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

// Mock DB pool — 測試中不真的寫 DB（改為驗證 pool.query 被呼叫）
vi.mock('../../src/db.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

// Mock config — 控制 SMTP_HOST 有無
vi.mock('../../src/config.js', () => ({
  default: {
    smtp: {
      host: null,
      port: 587,
      user: null,
      pass: null,
      from: null,
    },
    frontendUrl: 'http://localhost:3000',
  },
}))

import nodemailer from 'nodemailer'
import pool from '../../src/db.js'
import config from '../../src/config.js'

describe('notifier — 無 SMTP 設定時（fallback）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.smtp.host = null
    nodemailer.createTransport.mockReturnValue(null)
  })

  it('sendApprovalNotification: 寫入 email_notifications DB (status=sent)', async () => {
    const { sendApprovalNotification } = await import('../../src/services/notifier.js')

    await sendApprovalNotification({
      email: 'test@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'abc123',
      relatedId: 1,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['test@example.com', 'approval', 1, 'sent'])
    )
  })

  it('sendRejectionNotification: 寫入 email_notifications DB (status=sent)', async () => {
    const { sendRejectionNotification } = await import('../../src/services/notifier.js')

    await sendRejectionNotification({
      email: 'test@example.com',
      studentName: 'Mingo',
      reason: '配額不足',
      relatedId: 2,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['test@example.com', 'rejection', 2, 'sent'])
    )
  })
})

describe('notifier — 有 SMTP 設定時', () => {
  let sendMailMock

  beforeEach(() => {
    vi.clearAllMocks()
    config.smtp.host = 'smtp.example.com'
    config.smtp.user = 'user@example.com'
    config.smtp.pass = 'secret'

    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'abc123' })
    nodemailer.createTransport.mockReturnValue({
      sendMail: sendMailMock,
    })
  })

  afterEach(() => {
    config.smtp.host = null
  })

  it('呼叫 nodemailer.sendMail 發送通知', async () => {
    const { sendApprovalNotification } = await import('../../src/services/notifier.js')

    await sendApprovalNotification({
      email: 'test@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'abc123',
      relatedId: 1,
    })

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com' })
    )
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
      })
    )
  })

  it('nodemailer 失敗時，DB status=failed 並記錄 error', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP 連線失敗'))

    const { sendApprovalNotification } = await import('../../src/services/notifier.js')

    await sendApprovalNotification({
      email: 'test@example.com',
      studentName: 'Mingo',
      username: 'student_bcs114101',
      password: 'abc123',
      relatedId: 1,
    })

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_notifications'),
      expect.arrayContaining(['test@example.com', 'approval', 1, 'failed', 'SMTP 連線失敗'])
    )
  })
})
