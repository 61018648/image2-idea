import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import {
  createAdminUser,
  detectAdminModels,
  getAdminConfig,
  getAdminGenerationLogs,
  getAdminOrders,
  getAdminOverview,
  getAdminPlans,
  getAdminUsers,
  adjustAdminUserCredits,
  updateAdminConfig,
  updateAdminUser,
  upsertAdminPlan,
} from '../lib/platformAdminApi'
import type {
  PlatformAdminConfigResponse,
  PlatformAdminGenerationLogResponse,
  PlatformAdminOrderResponse,
  PlatformAdminStatsResponse,
  PlatformAdminUserResponse,
  PlatformAdminUpdateConfigRequest,
  PlatformPlanResponse,
} from '../lib/platformApiContracts'
import { getPlatformAuthSession } from '../lib/platformAuthApi'
import { useStore } from '../store'
import { CloseIcon, CodeIcon, EditIcon, HistoryIcon, LinkIcon, PlusIcon, RefreshIcon, SettingsIcon, UserIcon } from './icons'

type AdminTab = 'dashboard' | 'config' | 'plans' | 'users' | 'orders' | 'generationLogs'
type ConfigForm = PlatformAdminConfigResponse['config'] & { openaiApiKey: string; epayKey: string }
type UserForm = { username: string; email: string; phone: string; adminNote: string; password: string; displayName: string; role: 'user' | 'admin'; availableCredits: string }
type PlanForm = { id: string; name: string; uses: string; priceYuan: string; enabled: boolean }
type EditUserForm = {
  user: PlatformAdminUserResponse
  username: string
  email: string
  phone: string
  adminNote: string
  displayName: string
  password: string
  status: 'active' | 'disabled'
}
type CreditAdjustForm = { user: PlatformAdminUserResponse; mode: 'increase' | 'decrease'; amount: string; description: string }

const emptyUserForm: UserForm = { username: '', email: '', phone: '', adminNote: '', password: '', displayName: '', role: 'user', availableCredits: '0' }
const emptyPlanForm: PlanForm = { id: '', name: '', uses: '100', priceYuan: '9.9', enabled: true }

function formatMoney(cents: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/20'
}

function toConfigForm(config: PlatformAdminConfigResponse['config']): ConfigForm {
  return { ...config, upstreamTimeoutMs: Math.max(5, Math.round(config.upstreamTimeoutMs / 1000)), openaiApiKey: '', epayKey: '' }
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </label>
  )
}

function StatusPill({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' }) {
  const classes = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes[tone]}`}>{label}</span>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <h3 className="text-base font-semibold text-gray-950 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const settings = useStore((s) => s.settings)
  const setAppMode = useStore((s) => s.setAppMode)
  const showToast = useStore((s) => s.showToast)
  const activeProfile = getActiveApiProfile(settings)
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [loading, setLoading] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<PlatformAdminStatsResponse | null>(null)
  const [config, setConfig] = useState<PlatformAdminConfigResponse['config'] | null>(null)
  const [configForm, setConfigForm] = useState<ConfigForm | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [users, setUsers] = useState<PlatformAdminUserResponse[]>([])
  const [orders, setOrders] = useState<PlatformAdminOrderResponse[]>([])
  const [plans, setPlans] = useState<PlatformPlanResponse[]>([])
  const [logs, setLogs] = useState<PlatformAdminGenerationLogResponse[]>([])
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm)
  const [editingPlan, setEditingPlan] = useState<PlanForm | null>(null)
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null)
  const [adjustingCredits, setAdjustingCredits] = useState<CreditAdjustForm | null>(null)
  const [detectingModels, setDetectingModels] = useState(false)

  const createRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    let value = ''
    for (let index = 0; index < 10; index += 1) value += chars[Math.floor(Math.random() * chars.length)]
    return value
  }

  const tabs = useMemo(() => [
    { id: 'dashboard' as const, label: '仪表盘', description: '关键指标与风险概览', icon: <CodeIcon className="h-4 w-4" /> },
    { id: 'config' as const, label: '站点配置', description: '模型、支付与计费参数', icon: <SettingsIcon className="h-4 w-4" /> },
    { id: 'plans' as const, label: '套餐设置', description: '次数包与单价', icon: <LinkIcon className="h-4 w-4" /> },
    { id: 'users' as const, label: '用户管理', description: '资料、密码与积分', icon: <UserIcon className="h-4 w-4" /> },
    { id: 'orders' as const, label: '订单管理', description: '支付订单与套餐记录', icon: <HistoryIcon className="h-4 w-4" /> },
    { id: 'generationLogs' as const, label: '生图日志', description: '参数、消耗与结果状态', icon: <EditIcon className="h-4 w-4" /> },
  ], [])

  const refresh = async () => {
    if (activeProfile.provider !== 'platform') {
      setAppMode('auth')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const session = await getPlatformAuthSession(activeProfile.baseUrl)
      if (session.user.role !== 'admin') {
        setError('当前账号没有管理员权限')
        return
      }
      const [overviewResponse, configResponse, usersResponse, ordersResponse, plansResponse, logsResponse] = await Promise.all([
        getAdminOverview(activeProfile.baseUrl),
        getAdminConfig(activeProfile.baseUrl),
        getAdminUsers(activeProfile.baseUrl, 100),
        getAdminOrders(activeProfile.baseUrl, 100),
        getAdminPlans(activeProfile.baseUrl),
        getAdminGenerationLogs(activeProfile.baseUrl, 100),
      ])
      setOverview(overviewResponse)
      setConfig(configResponse.config)
      setConfigForm(toConfigForm(configResponse.config))
      setUsers(usersResponse.users)
      setOrders(ordersResponse.orders)
      setPlans(plansResponse.plans)
      setLogs(logsResponse.logs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'Unauthorized') {
        setAppMode('auth')
        return
      }
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (window.location.pathname !== '/admin') window.history.replaceState(null, '', '/admin')
    void refresh()
  }, [activeProfile.baseUrl, activeProfile.provider])

  const patchConfigForm = (patch: Partial<ConfigForm>) => setConfigForm((current) => current ? { ...current, ...patch } : current)

  const saveConfig = async () => {
    if (!configForm) return
    setSavingConfig(true)
    try {
      const payload: PlatformAdminUpdateConfigRequest = {
        siteName: configForm.siteName,
        publicBaseUrl: configForm.publicBaseUrl,
        supportEmail: configForm.supportEmail,
        openaiBaseUrl: configForm.openaiBaseUrl || configForm.imageBaseUrl,
        openaiImageModel: configForm.openaiImageModel || configForm.imageModel,
        upstreamTimeoutMs: Math.max(5, Number(configForm.upstreamTimeoutMs) || 120) * 1000,
        creditsPerImage: Number(configForm.creditsPerImage) || 1,
        allowUserApiConfig: false,
        epayEnabled: configForm.epayEnabled,
        epayGatewayUrl: configForm.epayGatewayUrl,
        epayPid: configForm.epayPid,
        epayReturnUrl: configForm.epayReturnUrl,
        epayNotifyUrl: configForm.epayNotifyUrl,
      }
      if (configForm.openaiApiKey.trim()) payload.openaiApiKey = configForm.openaiApiKey.trim()
      if (configForm.epayKey.trim()) payload.epayKey = configForm.epayKey.trim()
      const response = await updateAdminConfig(activeProfile.baseUrl, payload)
      setConfig(response.config)
      setConfigForm(toConfigForm(response.config))
      showToast('站点配置已保存', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const detectModels = async () => {
    if (!configForm) return
    setDetectingModels(true)
    try {
      const response = await detectAdminModels(activeProfile.baseUrl, {
        baseUrl: configForm.openaiBaseUrl || configForm.imageBaseUrl,
        apiKey: configForm.openaiApiKey || undefined,
      })
      setAvailableModels(response.models)
      if (response.models.length && !(configForm.openaiImageModel || configForm.imageModel)) {
        patchConfigForm({ openaiImageModel: response.models[0], imageModel: response.models[0] })
      }
      showToast(response.models.length ? `检测到 ${response.models.length} 个模型` : '接口可访问，但未返回模型列表', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setDetectingModels(false)
    }
  }

  const savePlan = async () => {
    if (!editingPlan) return
    setSavingConfig(true)
    try {
      const response = await upsertAdminPlan(activeProfile.baseUrl, {
        id: editingPlan.id,
        name: editingPlan.name,
        credits: Number(editingPlan.uses) || 0,
        priceCents: Math.round((Number(editingPlan.priceYuan) || 0) * 100),
        currency: 'CNY',
        enabled: editingPlan.enabled,
      })
      setPlans((items) => {
        const exists = items.some((item) => item.id === response.plan.id)
        return exists ? items.map((item) => item.id === response.plan.id ? response.plan : item) : [...items, response.plan]
      })
      setEditingPlan(null)
      showToast('套餐已保存', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const submitCreateUser = async () => {
    setSavingUser(true)
    try {
      await createAdminUser(activeProfile.baseUrl, {
        username: userForm.username,
        email: userForm.email,
        phone: userForm.phone,
        adminNote: userForm.adminNote,
        password: userForm.password,
        displayName: userForm.displayName,
        role: userForm.role,
        availableCredits: Number(userForm.availableCredits) || 0,
      })
      setShowCreateUser(false)
      setUserForm(emptyUserForm)
      showToast('用户已添加', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingUser(false)
    }
  }

  const submitEditUser = async () => {
    if (!editingUser) return
    setSavingUser(true)
    try {
      const userResponse = await updateAdminUser(activeProfile.baseUrl, {
        userId: editingUser.user.id,
        username: editingUser.username,
        email: editingUser.email,
        phone: editingUser.phone,
        adminNote: editingUser.adminNote,
        displayName: editingUser.displayName,
        status: editingUser.status,
        ...(editingUser.password ? { password: editingUser.password } : {}),
      })
      setUsers((items) => items.map((item) => item.id === editingUser.user.id ? {
        ...item,
        username: userResponse.user.username,
        email: userResponse.user.email,
        phone: userResponse.user.phone,
        adminNote: userResponse.user.adminNote,
        displayName: userResponse.user.displayName,
        status: userResponse.user.status,
      } : item))
      setEditingUser(null)
      showToast('用户资料已更新', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingUser(false)
    }
  }

  const submitAdjustCredits = async () => {
    if (!adjustingCredits) return
    const amount = Math.max(0, Math.trunc(Number(adjustingCredits.amount) || 0))
    if (!amount) {
      showToast('请输入调整积分', 'error')
      return
    }
    setSavingUser(true)
    try {
      const signedAmount = adjustingCredits.mode === 'decrease' ? -amount : amount
      const response = await adjustAdminUserCredits(activeProfile.baseUrl, {
        userId: adjustingCredits.user.id,
        amount: signedAmount,
        description: adjustingCredits.description || (signedAmount > 0 ? '后台增加积分' : '后台减少积分'),
      })
      setUsers((items) => items.map((item) => item.id === adjustingCredits.user.id ? { ...item, availableCredits: response.balance.availableCredits } : item))
      setAdjustingCredits(null)
      showToast('积分已调整', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingUser(false)
    }
  }

  return (
    <main className="safe-area-x mx-auto max-w-7xl px-4 pb-24 pt-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">后台管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">面向运营、财务、用户与生成任务的管理工作台。</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]">
          <RefreshIcon className="h-4 w-4" />
          刷新数据
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div>}

      <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-white/[0.08] dark:bg-gray-950 lg:sticky lg:top-24 lg:self-start">
          <nav className="grid gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left transition ${active ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-white/15 text-white dark:bg-black/10 dark:text-gray-950' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300'}`}>{tab.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className={`mt-0.5 block truncate text-xs ${active ? 'text-white/70 dark:text-gray-600' : 'text-gray-400'}`}>{tab.description}</span>
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {activeTab === 'dashboard' && (
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="累计收入" value={loading ? '...' : formatMoney(overview?.billing.revenueCents ?? 0)} hint={`${overview?.billing.paidOrders ?? 0} 笔已支付`} />
              <StatCard label="注册用户" value={loading ? '...' : overview?.billing.users ?? 0} hint={`${overview?.billing.availableCredits ?? 0} 可用积分`} />
              <StatCard label="订单总数" value={loading ? '...' : overview?.billing.orders ?? 0} hint={`${overview?.billing.pendingOrders ?? 0} 待支付`} />
              <StatCard label="生成任务" value={loading ? '...' : overview?.jobs.total ?? 0} hint={`${overview?.jobs.running ?? 0} 运行中 / ${overview?.jobs.failed ?? 0} 失败`} />
            </div>
          )}

          {activeTab === 'config' && configForm && (
            <section className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">站点配置</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">图片生成统一由平台后端托管，计费规则在这里配置。</p>
                  </div>
                  <button type="button" onClick={() => void saveConfig()} disabled={savingConfig} className="inline-flex items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                    {savingConfig ? '保存中...' : '保存配置'}
                  </button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field label="站点名称"><input className={inputClass()} value={configForm.siteName} onChange={(e) => patchConfigForm({ siteName: e.target.value })} /></Field>
                  <Field label="公开访问地址"><input className={inputClass()} value={configForm.publicBaseUrl} onChange={(e) => patchConfigForm({ publicBaseUrl: e.target.value })} placeholder="https://example.com" /></Field>
                  <Field label="客服邮箱"><input className={inputClass()} value={configForm.supportEmail} onChange={(e) => patchConfigForm({ supportEmail: e.target.value })} placeholder="support@example.com" /></Field>
                  <Field label="每张图消耗积分" hint="高质量、大尺寸仍会叠加倍率。"><input className={inputClass()} type="number" min={1} value={configForm.creditsPerImage} onChange={(e) => patchConfigForm({ creditsPerImage: Number(e.target.value) })} /></Field>
                  <Field label="上游 API Base URL"><input className={inputClass()} value={configForm.openaiBaseUrl || configForm.imageBaseUrl} onChange={(e) => patchConfigForm({ openaiBaseUrl: e.target.value, imageBaseUrl: e.target.value })} /></Field>
                  <Field label="图片模型 ID" hint="填写 Base URL 和 API Key 后，可检测上游支持的模型。">
                    <div className="flex gap-2">
                      <input className={inputClass()} list="admin-upstream-models" value={configForm.openaiImageModel || configForm.imageModel} onChange={(e) => patchConfigForm({ openaiImageModel: e.target.value, imageModel: e.target.value })} />
                      <button type="button" onClick={() => void detectModels()} disabled={detectingModels} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                        {detectingModels ? '检测中' : '检测模型'}
                      </button>
                    </div>
                    <datalist id="admin-upstream-models">
                      {availableModels.map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </Field>
                  <Field label="上游超时（秒）" hint="生图通常需要 60-120 秒，建议设置 180 秒以上。"><input className={inputClass()} type="number" min={5} max={600} value={configForm.upstreamTimeoutMs} onChange={(e) => patchConfigForm({ upstreamTimeoutMs: Number(e.target.value) })} /></Field>
                  <Field label="上游 API Key" hint={config?.hasOpenaiApiKey ? `已保存：${config.openaiApiKeyMasked}，留空则不修改` : '尚未保存 API Key'}><input className={inputClass()} type="password" value={configForm.openaiApiKey} onChange={(e) => patchConfigForm({ openaiApiKey: e.target.value })} /></Field>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">支付渠道</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field label="启用易支付">
                    <button type="button" onClick={() => patchConfigForm({ epayEnabled: !configForm.epayEnabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${configForm.epayEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${configForm.epayEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </Field>
                  <Field label="易支付网关"><input className={inputClass()} value={configForm.epayGatewayUrl} onChange={(e) => patchConfigForm({ epayGatewayUrl: e.target.value })} placeholder="https://pay.example.com" /></Field>
                  <Field label="商户 PID"><input className={inputClass()} value={configForm.epayPid} onChange={(e) => patchConfigForm({ epayPid: e.target.value })} /></Field>
                  <Field label="商户 Key" hint={config?.epayKeyMasked ? `已保存：${config.epayKeyMasked}，留空则不修改` : '尚未保存商户 Key'}><input className={inputClass()} type="password" value={configForm.epayKey} onChange={(e) => patchConfigForm({ epayKey: e.target.value })} /></Field>
                  <Field label="同步返回地址"><input className={inputClass()} value={configForm.epayReturnUrl} onChange={(e) => patchConfigForm({ epayReturnUrl: e.target.value })} /></Field>
                  <Field label="异步通知地址"><input className={inputClass()} value={configForm.epayNotifyUrl} onChange={(e) => patchConfigForm({ epayNotifyUrl: e.target.value })} placeholder="/api/platform/payments/epay/notify" /></Field>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'plans' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">套餐设置</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">配置用户中心展示的次数包。未购买套餐或次数用完时，生图按站点配置扣积分。</p>
                </div>
                <button type="button" onClick={() => setEditingPlan(emptyPlanForm)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <PlusIcon className="h-4 w-4" />
                  添加套餐
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                      <th className="py-2 pr-4 font-medium">套餐 ID</th>
                      <th className="py-2 pr-4 font-medium">名称</th>
                      <th className="py-2 pr-4 font-medium">包含次数</th>
                      <th className="py-2 pr-4 font-medium">价格</th>
                      <th className="py-2 pr-4 font-medium">状态</th>
                      <th className="py-2 pr-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id} className="border-b border-gray-100 dark:border-white/[0.06]">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{plan.id}</td>
                        <td className="py-3 pr-4 font-medium text-gray-950 dark:text-white">{plan.name}</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{plan.credits} 次</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatMoney(plan.priceCents)}</td>
                        <td className="py-3 pr-4"><StatusPill tone={plan.enabled ? 'green' : 'gray'} label={plan.enabled ? '上架' : '下架'} /></td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() => setEditingPlan({ id: plan.id, name: plan.name, uses: String(plan.credits), priceYuan: String(plan.priceCents / 100), enabled: plan.enabled })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]"
                          >
                            <EditIcon className="h-3.5 w-3.5" />
                            编辑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'users' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">用户管理</h3>
                <button type="button" onClick={() => setShowCreateUser(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <PlusIcon className="h-4 w-4" />
                  添加用户
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                      <th className="py-2 pr-4 font-medium">ID</th>
                      <th className="py-2 pr-4 font-medium">用户</th>
                      <th className="py-2 pr-4 font-medium">角色</th>
                      <th className="py-2 pr-4 font-medium">积分</th>
                      <th className="py-2 pr-4 font-medium">状态</th>
                      <th className="py-2 pr-4 font-medium">消费</th>
                      <th className="py-2 pr-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-gray-100 dark:border-white/[0.06]">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{user.id}</td>
                        <td className="py-3 pr-4"><div className="font-medium text-gray-950 dark:text-white">{user.displayName || user.username || user.id}</div><div className="text-xs text-gray-500">{user.username || '-'} · {user.email || '未绑定邮箱'}</div></td>
                        <td className="py-3 pr-4"><StatusPill tone={user.role === 'admin' ? 'blue' : 'gray'} label={user.role} /></td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{user.availableCredits}</span>
                            <button type="button" onClick={() => setAdjustingCredits({ user, mode: 'increase', amount: '', description: '' })} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">调整</button>
                          </div>
                        </td>
                        <td className="py-3 pr-4"><StatusPill tone={user.status === 'active' ? 'green' : 'red'} label={user.status === 'active' ? '启用' : '禁用'} /></td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatMoney(user.paidAmountCents)}</td>
                        <td className="py-3 pr-4">
                          <button type="button" onClick={() => setEditingUser({ user, username: user.username || '', email: user.email || '', phone: user.phone || '', adminNote: user.adminNote || '', displayName: user.displayName || '', password: '', status: user.status === 'disabled' ? 'disabled' : 'active' })} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                            <EditIcon className="h-3.5 w-3.5" />
                            编辑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'orders' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">订单管理</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400"><tr className="border-b border-gray-200 dark:border-white/[0.08]"><th className="py-2 pr-4 font-medium">订单</th><th className="py-2 pr-4 font-medium">用户</th><th className="py-2 pr-4 font-medium">套餐</th><th className="py-2 pr-4 font-medium">金额</th><th className="py-2 pr-4 font-medium">次数</th><th className="py-2 pr-4 font-medium">渠道</th><th className="py-2 pr-4 font-medium">状态</th><th className="py-2 pr-4 font-medium">创建时间</th></tr></thead>
                  <tbody>{orders.map((order) => <tr key={order.id} className="border-b border-gray-100 dark:border-white/[0.06]"><td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{order.id}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.userDisplayName || order.userEmail || order.userId}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.planId}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatMoney(order.amountCents)}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.credits} 次</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.provider}</td><td className="py-3 pr-4"><StatusPill tone={order.status === 'paid' ? 'green' : order.status === 'pending' ? 'amber' : 'red'} label={order.status} /></td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(order.createdAt)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'generationLogs' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">生图日志</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400"><tr className="border-b border-gray-200 dark:border-white/[0.08]"><th className="py-2 pr-4 font-medium">任务</th><th className="py-2 pr-4 font-medium">用户</th><th className="py-2 pr-4 font-medium">提示词</th><th className="py-2 pr-4 font-medium">尺寸</th><th className="py-2 pr-4 font-medium">质量</th><th className="py-2 pr-4 font-medium">格式</th><th className="py-2 pr-4 font-medium">数量</th><th className="py-2 pr-4 font-medium">参考图</th><th className="py-2 pr-4 font-medium">消耗</th><th className="py-2 pr-4 font-medium">状态</th><th className="py-2 pr-4 font-medium">时间</th></tr></thead>
                  <tbody>{logs.map((log) => <tr key={log.id} className="border-b border-gray-100 align-top dark:border-white/[0.06]"><td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{log.id}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.userDisplayName || log.userEmail || log.userId}</td><td className="max-w-[280px] py-3 pr-4 text-gray-600 dark:text-gray-300"><div className="line-clamp-2" title={log.prompt}>{log.prompt}</div>{log.errorMessage && <div className="mt-1 text-xs text-red-600">{log.errorMessage}</div>}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.size}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.quality}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.outputFormat}{log.outputCompression != null ? ` / ${log.outputCompression}` : ''}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.n}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.inputImageCount}{log.hasMask ? ' + mask' : ''}</td><td className="py-3 pr-4 font-semibold text-gray-800 dark:text-gray-100">{log.costCredits}</td><td className="py-3 pr-4"><StatusPill tone={log.status === 'succeeded' ? 'green' : log.status === 'failed' ? 'red' : 'amber'} label={log.status} /></td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(log.createdAt)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </section>

      {showCreateUser && (
        <Modal title="添加用户" onClose={() => setShowCreateUser(false)}>
          <div className="grid gap-4">
            <Field label="用户名"><input className={inputClass()} value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} /></Field>
            <Field label="邮箱"><input className={inputClass()} value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="选填" /></Field>
            <Field label="手机号"><input className={inputClass()} value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="选填" /></Field>
            <Field label="管理员备注"><input className={inputClass()} value={userForm.adminNote} onChange={(e) => setUserForm({ ...userForm, adminNote: e.target.value })} placeholder="选填，仅后台可见" /></Field>
            <Field label="初始密码"><input className={inputClass()} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></Field>
            <Field label="昵称"><input className={inputClass()} value={userForm.displayName} onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })} /></Field>
            <Field label="角色"><select className={inputClass()} value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value === 'admin' ? 'admin' : 'user' })}><option value="user">普通用户</option><option value="admin">管理员</option></select></Field>
            <Field label="初始积分"><input className={inputClass()} type="number" min={0} value={userForm.availableCredits} onChange={(e) => setUserForm({ ...userForm, availableCredits: e.target.value })} /></Field>
            <button type="button" disabled={savingUser} onClick={() => void submitCreateUser()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{savingUser ? '创建中...' : '创建用户'}</button>
          </div>
        </Modal>
      )}

      {editingPlan && (
        <Modal title="编辑套餐" onClose={() => setEditingPlan(null)}>
          <div className="grid gap-4">
            <Field label="套餐 ID" hint="创建后会作为订单关联标识，建议使用英文、数字、中划线。">
              <input className={inputClass()} value={editingPlan.id} onChange={(e) => setEditingPlan({ ...editingPlan, id: e.target.value })} />
            </Field>
            <Field label="套餐名称"><input className={inputClass()} value={editingPlan.name} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} /></Field>
            <Field label="包含次数"><input className={inputClass()} type="number" min={1} value={editingPlan.uses} onChange={(e) => setEditingPlan({ ...editingPlan, uses: e.target.value })} /></Field>
            <Field label="价格（人民币元）"><input className={inputClass()} type="number" min={0} step="0.01" value={editingPlan.priceYuan} onChange={(e) => setEditingPlan({ ...editingPlan, priceYuan: e.target.value })} /></Field>
            <Field label="上架状态">
              <button type="button" onClick={() => setEditingPlan({ ...editingPlan, enabled: !editingPlan.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${editingPlan.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${editingPlan.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </Field>
            <button type="button" disabled={savingConfig} onClick={() => void savePlan()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{savingConfig ? '保存中...' : '保存套餐'}</button>
          </div>
        </Modal>
      )}

      {editingUser && (
        <Modal title="编辑用户" onClose={() => setEditingUser(null)}>
          <div className="grid gap-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"><div className="font-medium text-gray-950 dark:text-white">ID: {editingUser.user.id}</div></div>
            <Field label="用户名"><input className={inputClass()} value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} /></Field>
            <Field label="昵称"><input className={inputClass()} value={editingUser.displayName} onChange={(e) => setEditingUser({ ...editingUser, displayName: e.target.value })} /></Field>
            <Field label="邮箱"><input className={inputClass()} value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} placeholder="选填" /></Field>
            <Field label="手机号"><input className={inputClass()} value={editingUser.phone} onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })} placeholder="选填" /></Field>
            <Field label="管理员备注"><input className={inputClass()} value={editingUser.adminNote} onChange={(e) => setEditingUser({ ...editingUser, adminNote: e.target.value })} placeholder="仅后台可见" /></Field>
            <Field label="账号状态">
              <select className={inputClass()} value={editingUser.status} onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value === 'disabled' ? 'disabled' : 'active' })}>
                <option value="active">启用</option>
                <option value="disabled">禁用</option>
              </select>
            </Field>
            <Field label="新密码" hint="留空则不修改密码。">
              <div className="flex gap-2">
                <input className={inputClass()} type="text" value={editingUser.password} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} placeholder="可手动输入新密码" />
                <button
                  type="button"
                  onClick={() => setEditingUser({ ...editingUser, password: createRandomPassword() })}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-950 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  title="生成 10 位随机密码"
                  aria-label="生成 10 位随机密码"
                >
                  <RefreshIcon className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <button type="button" disabled={savingUser} onClick={() => void submitEditUser()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{savingUser ? '保存中...' : '保存修改'}</button>
          </div>
        </Modal>
      )}

      {adjustingCredits && (
        <Modal title="调整用户积分" onClose={() => setAdjustingCredits(null)}>
          <div className="grid gap-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
              <div className="font-medium text-gray-950 dark:text-white">{adjustingCredits.user.displayName || adjustingCredits.user.username || adjustingCredits.user.id}</div>
              <div className="mt-1">当前积分：{adjustingCredits.user.availableCredits}</div>
            </div>
            <Field label="调整方式">
              <select className={inputClass()} value={adjustingCredits.mode} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, mode: e.target.value === 'decrease' ? 'decrease' : 'increase' })}>
                <option value="increase">增加积分</option>
                <option value="decrease">减少积分</option>
              </select>
            </Field>
            <Field label="积分数量"><input className={inputClass()} type="number" min={1} value={adjustingCredits.amount} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, amount: e.target.value })} /></Field>
            <Field label="操作备注"><input className={inputClass()} value={adjustingCredits.description} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, description: e.target.value })} placeholder="例如：客服补偿、违规扣减、手动修正" /></Field>
            <button type="button" disabled={savingUser} onClick={() => void submitAdjustCredits()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{savingUser ? '处理中...' : '确认调整'}</button>
          </div>
        </Modal>
      )}
    </main>
  )
}
