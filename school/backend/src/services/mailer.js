// services/mailer.js
// Sprint 4 Task #3: SMTP 真實接通
// 對外公開的 mailer 介面 — 實作見 ./notifier.js（雙模式：real SMTP + console fallback）
// 此檔以 alias 形式重新導出，現有 routes 仍可繼續 import notifier.js（向後相容）
export {
  sendApprovalNotification,
  sendRejectionNotification,
  sendNewApplicationNotification,
} from './notifier.js'
