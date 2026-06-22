'use client'

import { useEffect, useMemo, useState } from 'react'

type Status = { installed: boolean; envExists: boolean }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-800">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-gray-500">{hint}</span>}
    </label>
  )
}

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

export default function InstallClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    databaseUrl: 'postgresql://image-idea:itEjcwrABR7DaFkj@postgres:5432/image-idea?schema=public',
    siteName: 'Image Idea',
    publicBaseUrl: '',
    adminUsername: 'admin',
    adminEmail: 'admin@admin.com',
    adminPassword: '',
    overwrite: false,
  })

  useEffect(() => {
    fetch('/api/install')
      .then((response) => response.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus({ installed: false, envExists: false }))
      .finally(() => setLoadingStatus(false))
  }, [])

  const canSubmit = useMemo(() => (
    form.databaseUrl.trim().length > 0
    && form.adminUsername.trim().length >= 3
    && form.adminPassword.length >= 8
    && (!status?.installed || form.overwrite)
  ), [form, status])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error?.message || '安装失败')
      setMessage(data.message || '安装完成，请重启服务。')
      setStatus({ installed: true, envExists: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Image Idea 安装向导</h1>
          <p className="mt-2 text-sm text-gray-600">初始化 PostgreSQL 数据库、写入运行环境变量，并创建第一个管理员账号。</p>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            {loadingStatus ? '正在检测安装状态...' : status?.installed ? '检测到系统已经安装。需要重新初始化时请勾选覆盖安装。' : '尚未检测到管理员账号，可以开始安装。'}
            {status?.envExists && <span className="ml-2 text-gray-500">已存在 server/.env。</span>}
          </div>

          <div className="grid gap-4">
            <Field label="PostgreSQL DATABASE_URL" hint="Docker 部署时不要填 127.0.0.1，请填数据库容器服务名，例如 postgres；宿主机数据库请填宿主机可访问 IP。">
              <input className={inputClass} value={form.databaseUrl} onChange={(e) => setForm({ ...form, databaseUrl: e.target.value })} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="站点标题">
                <input className={inputClass} value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
              </Field>
              <Field label="站点 URL" hint="例如 https://example.com，可先留空。">
                <input className={inputClass} value={form.publicBaseUrl} onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="管理员用户名">
                <input className={inputClass} value={form.adminUsername} onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} />
              </Field>
              <Field label="管理员邮箱">
                <input className={inputClass} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="管理员密码" hint="至少 8 位，安装后用于登录后台。">
              <input className={inputClass} type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </Field>

            {status?.installed && (
              <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <input type="checkbox" checked={form.overwrite} onChange={(e) => setForm({ ...form, overwrite: e.target.checked })} />
                覆盖安装：重置管理员账号并补齐默认套餐和站点配置
              </label>
            )}

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={() => void submit()}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '安装中...' : '开始安装'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
