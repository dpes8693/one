import { useState } from 'react'
import { Link } from 'react-router-dom'
import { submitApplication } from '../api/applications.js'

const GPU_SPECS = [
  { value: 'rtx4070ti', label: 'RTX 4070 Ti（標準）' },
  { value: 'a100', label: 'A100（進階）' },
]

export default function Apply() {
  const [form, setForm] = useState({
    student_name: '',
    student_id: '',
    email: '',
    purpose: '',
    gpu_spec: 'rtx4070ti',
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await submitApplication(form)
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.message || '送出失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-sm text-center">
          <div className="text-5xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">申請已送出</h2>
          <p className="text-sm text-gray-500 mb-4">
            您的申請已成功送出，管理員審核通過後，您將收到 Email 通知，
            內含帳號密碼與 SSH 連線資訊。
          </p>
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            返回登入頁
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-10">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">申請 GPU 使用權限</h2>
        <p className="text-sm text-gray-500 mb-6">填寫以下資料，管理員審核後將發送通知 Email</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                type="text"
                required
                value={form.student_name}
                onChange={(e) => update('student_name', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="王小明"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">學號</label>
              <input
                type="text"
                required
                value={form.student_id}
                onChange={(e) => update('student_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="B11234567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="student@school.edu.tw"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GPU 規格需求</label>
            <select
              value={form.gpu_spec}
              onChange={(e) => update('gpu_spec', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GPU_SPECS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              使用用途說明
            </label>
            <textarea
              required
              rows={4}
              value={form.purpose}
              onChange={(e) => update('purpose', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="請說明您的研究題目或課程需求，例如：深度學習模型訓練..."
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
            {loading ? '送出中...' : '送出申請'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-gray-500 hover:underline">
            已有帳號？返回登入
          </Link>
        </div>
      </div>
    </div>
  )
}
