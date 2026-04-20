import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../api/register.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    student_id: '',
    memo: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // 前端驗證
    if (!form.email || !form.password || !form.confirmPassword || !form.name || !form.student_id) {
      setError('請填寫所有必填欄位')
      return
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      setError('email 格式錯誤')
      return
    }
    if (form.password.length < 8) {
      setError('密碼至少 8 字元')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('兩次密碼輸入不一致')
      return
    }

    setLoading(true)
    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        student_id: form.student_id.trim(),
        memo: form.memo?.trim() || undefined,
      })
      navigate(`/register/verify?email=${encodeURIComponent(form.email.trim())}`)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || '註冊失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-8">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">學生註冊</h2>
        <p className="text-sm text-gray-500 mb-6">填寫資料後將收到 email 驗證碼</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼 *（至少 8 字元）</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="至少 8 字元"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">確認密碼 *</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="再次輸入密碼"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="王小明"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">學號 *</label>
            <input
              type="text"
              value={form.student_id}
              onChange={(e) => update('student_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="B12345678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
            <input
              type="text"
              value={form.memo}
              onChange={(e) => update('memo', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：資工系大三"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '送出中...' : '送出註冊'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            已經有帳號？返回登入
          </Link>
        </div>
      </div>
    </div>
  )
}
