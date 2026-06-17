import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { loginPlatformUser, registerPlatformUser } from '../lib/platformAuthApi'
import { useStore } from '../store'

type Mode = 'login' | 'register'

interface PlatformAuthModalProps {
  baseUrl: string
  onClose: () => void
  onAuthenticated: () => void
}

export default function PlatformAuthModal({ baseUrl, onClose, onAuthenticated }: PlatformAuthModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const showToast = useStore((s) => s.showToast)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    setError(null)
  }, [mode])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const request = { email, password }
      if (mode === 'register') {
        await registerPlatformUser(baseUrl, request)
      } else {
        await loginPlatformUser(baseUrl, request)
      }
      onAuthenticated()
      showToast(mode === 'register' ? '注册成功' : '登录成功', 'success')
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[106] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">平台账号</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">登录后可同步余额与账单</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'register' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            注册
          </button>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
              placeholder="name@example.com"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">密码</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
              placeholder="至少 8 位"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
