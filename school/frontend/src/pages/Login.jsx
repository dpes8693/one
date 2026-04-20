import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../api/auth.js'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ user: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await login(form.user, form.password)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/student/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || '帳號或密碼錯誤')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">GPU 算力平台</h2>
        <p className="text-sm text-gray-500 mb-6">請輸入帳號密碼登入</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
            <input
              type="text"
              required
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="輸入帳號"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="輸入密碼"
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
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <div>
            <Link to="/register" className="text-sm text-blue-600 hover:underline">
              還沒帳號？立即註冊
            </Link>
          </div>
          <div>
            <Link to="/apply" className="text-sm text-blue-600 hover:underline">
              申請 GPU 使用權限
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
