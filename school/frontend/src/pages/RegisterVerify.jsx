import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { verifyRegister, resendCode } from '../api/register.js'

const RESEND_COOLDOWN = 60

export default function RegisterVerify() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const email = params.get('email') || ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // 倒數
  useEffect(() => {
    if (countdown <= 0) return undefined
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email) {
      setError('找不到 email，請回註冊頁重新輸入')
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError('請輸入 6 位數字驗證碼')
      return
    }

    setLoading(true)
    try {
      await verifyRegister({ email, code: code.trim() })
      navigate('/register/pending')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || '驗證失敗')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (countdown > 0 || resending) return
    setError('')
    setInfo('')

    if (!email) {
      setError('找不到 email')
      return
    }

    setResending(true)
    try {
      await resendCode({ email })
      setInfo('驗證碼已重寄，請檢查信箱')
      setCountdown(RESEND_COOLDOWN)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || '重寄失敗')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">輸入驗證碼</h2>
        <p className="text-sm text-gray-500 mb-2">驗證碼已寄到</p>
        <p className="text-sm font-medium text-gray-800 mb-6 break-all">{email || '（未提供 email）'}</p>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">6 位數字驗證碼</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="------"
              autoComplete="one-time-code"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '驗證中...' : '驗證'}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {countdown > 0 ? `重寄驗證碼（${countdown}s）` : resending ? '重寄中...' : '重寄驗證碼'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/register" className="text-sm text-blue-600 hover:underline">
            返回註冊頁
          </Link>
        </div>
      </div>
    </div>
  )
}
