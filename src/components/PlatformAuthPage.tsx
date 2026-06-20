import { useEffect, useState, type FormEvent } from 'react'
import { createDefaultPlatformProfile, getActiveApiProfile } from '../lib/apiProfiles'
import { getPlatformPublicConfig } from '../lib/platformAccountApi'
import type { PlatformPublicConfigResponse } from '../lib/platformApiContracts'
import { loginPlatformUser, registerPlatformUser, sendPlatformAuthEmailCode } from '../lib/platformAuthApi'
import { useStore } from '../store'

type AuthMode = 'login' | 'register'

export default function PlatformAuthPage() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setAppMode = useStore((s) => s.setAppMode)
  const showToast = useStore((s) => s.showToast)
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [publicConfig, setPublicConfig] = useState<PlatformPublicConfigResponse['config'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeProfile = getActiveApiProfile(settings)
  const platformMode = activeProfile.provider === 'platform'
  const platformProfile = platformMode ? activeProfile : settings.profiles.find((profile) => profile.provider === 'platform') ?? createDefaultPlatformProfile()

  useEffect(() => {
    if (platformMode) return
    setSettings({
      profiles: settings.profiles.some((profile) => profile.id === platformProfile.id) ? settings.profiles : [...settings.profiles, platformProfile],
      activeProfileId: platformProfile.id,
    })
  }, [platformMode, platformProfile, setSettings, settings.profiles])

  useEffect(() => {
    setError(null)
  }, [mode])

  useEffect(() => {
    void getPlatformPublicConfig(platformProfile.baseUrl).then((response) => setPublicConfig(response.config)).catch(() => undefined)
  }, [platformProfile.baseUrl])

  const requiresRegisterEmail = mode === 'register' && Boolean(publicConfig?.emailVerificationOnRegister)

  const sendRegisterCode = async () => {
    if (!email.trim()) {
      showToast('请先输入邮箱', 'info')
      return
    }
    setSendingCode(true)
    try {
      await sendPlatformAuthEmailCode(platformProfile.baseUrl, { email: email.trim(), purpose: 'register' })
      showToast('验证码已发送，请查看邮箱', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const request = {
        username,
        password,
        ...(mode === 'register' && email.trim() ? { email: email.trim() } : {}),
        ...(mode === 'register' && verificationCode.trim() ? { verificationCode: verificationCode.trim() } : {}),
      }
      if (mode === 'register') {
        await registerPlatformUser(platformProfile.baseUrl, request)
      } else {
        await loginPlatformUser(platformProfile.baseUrl, request)
      }
      window.dispatchEvent(new Event('platform-billing-updated'))
      showToast(mode === 'register' ? '注册成功' : '登录成功', 'success')
      window.history.pushState(null, '', '/user')
      setAppMode('user-center')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="safe-area-x mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-gray-950 dark:text-white">平台账号</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">登录后进入用户中心，查看余额、订单和账号状态。</p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${mode === 'login' ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${mode === 'register' ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            注册
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">邮箱</span>
              <input
                type="email"
                autoComplete="email"
                required={requiresRegisterEmail}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
                placeholder={requiresRegisterEmail ? '用于接收注册验证码' : '选填，便于找回账号'}
              />
            </label>
          )}
          {requiresRegisterEmail && (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">邮箱验证码</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
                  placeholder="6 位验证码"
                />
                <button type="button" onClick={() => void sendRegisterCode()} disabled={sendingCode} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                  {sendingCode ? '发送中' : '发送验证码'}
                </button>
              </div>
            </label>
          )}
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">邮箱</span>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
              placeholder="请输入用户名"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">密码</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
              placeholder="至少 8 位"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </section>
    </main>
  )
}
