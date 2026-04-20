import { Link } from 'react-router-dom'

export default function RegisterPending() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-3">註冊已送出</h2>
        <div className="space-y-2 text-sm text-gray-600 mb-6">
          <p>您的註冊已送出，請等待管理員審核。</p>
          <p>審核結果會以 email 通知您。</p>
          <p>審核通過後，您會收到 SSH 帳號與密碼。</p>
        </div>

        <Link
          to="/login"
          className="inline-block w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          返回登入
        </Link>
      </div>
    </div>
  )
}
