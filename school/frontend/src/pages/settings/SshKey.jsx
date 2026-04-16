import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getSshKey, updateSshKey } from '../../api/sshKey.js'

function isValidSshKey(key) {
  const trimmed = key.trim()
  return trimmed.startsWith('ssh-rsa ') || trimmed.startsWith('ssh-ed25519 ')
}

export default function SshKey() {
  const [keyValue, setKeyValue] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sshKey'],
    queryFn: getSshKey,
  })

  useEffect(() => {
    if (data?.ssh_public_key) {
      setKeyValue(data.ssh_public_key)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: updateSshKey,
    onSuccess: () => {
      setSuccess(true)
      setError('')
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: () => {
      setError('儲存失敗，請稍後再試')
    },
  })

  function handleSave() {
    setSuccess(false)
    if (!isValidSshKey(keyValue)) {
      setError('格式錯誤：SSH 公鑰必須以 ssh-rsa 或 ssh-ed25519 開頭')
      return
    }
    setError('')
    saveMutation.mutate(keyValue.trim())
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">SSH 金鑰管理</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <p className="text-sm text-gray-500">
          請填入您的 SSH 公鑰（格式：ssh-rsa 或 ssh-ed25519 開頭）。
          平台會在建立 VM 時自動注入您的公鑰，讓您可以直接 SSH 連入。
        </p>

        {isLoading ? (
          <div className="text-gray-400 text-sm">載入中...</div>
        ) : (
          <textarea
            value={keyValue}
            onChange={(e) => { setKeyValue(e.target.value); setError(''); setSuccess(false) }}
            rows={5}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="ssh-rsa AAAA... 或 ssh-ed25519 AAAA..."
          />
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600">已更新 SSH 公鑰</p>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
