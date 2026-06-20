import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import {
  confirmAdminOrderPayment,
  createAdminUser,
  detectAdminModels,
  getAdminConfig,
  getAdminGenerationLogs,
  getAdminOrders,
  getAdminOverview,
  getAdminPaymentEvents,
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
  PlatformAdminPaymentEventResponse,
  PlatformAdminStatsResponse,
  PlatformAdminUserResponse,
  PlatformAdminUpdateConfigRequest,
  PlatformPlanResponse,
} from '../lib/platformApiContracts'
import { getPlatformAuthSession } from '../lib/platformAuthApi'
import { useStore } from '../store'
import { CloseIcon, CodeIcon, EditIcon, HistoryIcon, LinkIcon, PlusIcon, RefreshIcon, SettingsIcon, UserIcon } from './icons'

type AdminTab = 'dashboard' | 'config' | 'plans' | 'users' | 'orders' | 'generationLogs'
type ConfigForm = PlatformAdminConfigResponse['config'] & { openaiApiKey: string; epayKey: string; smtpPassword: string }
type UserForm = { username: string; email: string; phone: string; adminNote: string; password: string; displayName: string; role: 'user' | 'admin'; availableCredits: string }
type PlanForm = { id: string; name: string; uses: string; priceYuan: string; enabled: boolean; recommended: boolean; description: string }
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
type ConfirmPaymentForm = { order: PlatformAdminOrderResponse; providerPaymentId: string; providerEventId: string; paidAmountYuan: string; note: string }

const emptyUserForm: UserForm = { username: '', email: '', phone: '', adminNote: '', password: '', displayName: '', role: 'user', availableCredits: '0' }
const emptyPlanForm: PlanForm = { id: '', name: '', uses: '100', priceYuan: '9.9', enabled: true, recommended: false, description: '' }

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
  return { ...config, upstreamTimeoutMs: Math.max(5, Math.round(config.upstreamTimeoutMs / 1000)), openaiApiKey: '', epayKey: '', smtpPassword: '' }
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

function ToolbarInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
      placeholder={placeholder}
    />
  )
}

function ToolbarSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/[0.1] dark:bg-gray-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
    >
      {children}
    </select>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/70 px-4 py-10 text-center dark:border-white/[0.12] dark:bg-white/[0.03]">
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</div>
      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</div>
    </div>
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

function CheckItem({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold dark:bg-black/10">{ok ? '正常' : '待处理'}</span>
      </div>
      {detail && <div className="mt-1 text-xs opacity-80">{detail}</div>}
    </div>
  )
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="break-words text-sm text-gray-900 dark:text-gray-100">{value || '-'}</div>
    </div>
  )
}

function DetailDrawer({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30 backdrop-blur-sm">
      <button type="button" className="hidden flex-1 cursor-default md:block" onClick={onClose} aria-label="关闭详情" />
      <aside className="flex h-full w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-gray-950">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-950 dark:text-white">{title}</h3>
            {subtitle && <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
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
  const [imageModelMode, setImageModelMode] = useState<'preset' | 'custom'>('custom')
  const [users, setUsers] = useState<PlatformAdminUserResponse[]>([])
  const [orders, setOrders] = useState<PlatformAdminOrderResponse[]>([])
  const [paymentEvents, setPaymentEvents] = useState<PlatformAdminPaymentEventResponse[]>([])
  const [plans, setPlans] = useState<PlatformPlanResponse[]>([])
  const [logs, setLogs] = useState<PlatformAdminGenerationLogResponse[]>([])
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm)
  const [editingPlan, setEditingPlan] = useState<PlanForm | null>(null)
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null)
  const [adjustingCredits, setAdjustingCredits] = useState<CreditAdjustForm | null>(null)
  const [confirmingPayment, setConfirmingPayment] = useState<ConfirmPaymentForm | null>(null)
  const [detectingModels, setDetectingModels] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [orderQuery, setOrderQuery] = useState('')
  const [orderStatus, setOrderStatus] = useState('all')
  const [paymentEventQuery, setPaymentEventQuery] = useState('')
  const [logStatus, setLogStatus] = useState('all')
  const [logQuery, setLogQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<PlatformAdminOrderResponse | null>(null)
  const [selectedLog, setSelectedLog] = useState<PlatformAdminGenerationLogResponse | null>(null)

  const createRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    let value = ''
    for (let index = 0; index < 10; index += 1) value += chars[Math.floor(Math.random() * chars.length)]
    return value
  }

  const selectedImageModel = configForm ? (configForm.openaiImageModel || configForm.imageModel) : ''
  const imageModelIsPreset = Boolean(selectedImageModel) && availableModels.includes(selectedImageModel)

  const tabs = useMemo(() => [
    { id: 'dashboard' as const, label: '仪表盘', description: '关键指标与风险概览', icon: <CodeIcon className="h-4 w-4" /> },
    { id: 'config' as const, label: '站点配置', description: '模型、支付与计费参数', icon: <SettingsIcon className="h-4 w-4" /> },
    { id: 'plans' as const, label: '套餐设置', description: '次数包与单价', icon: <LinkIcon className="h-4 w-4" /> },
    { id: 'users' as const, label: '用户管理', description: '资料、密码与余额', icon: <UserIcon className="h-4 w-4" /> },
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
      const [overviewResponse, configResponse, usersResponse, ordersResponse, paymentEventsResponse, plansResponse, logsResponse] = await Promise.all([
        getAdminOverview(activeProfile.baseUrl),
        getAdminConfig(activeProfile.baseUrl),
        getAdminUsers(activeProfile.baseUrl, 100),
        getAdminOrders(activeProfile.baseUrl, 100),
        getAdminPaymentEvents(activeProfile.baseUrl, 50),
        getAdminPlans(activeProfile.baseUrl),
        getAdminGenerationLogs(activeProfile.baseUrl, 100),
      ])
      setOverview(overviewResponse)
      setConfig(configResponse.config)
      setConfigForm(toConfigForm(configResponse.config))
      setImageModelMode(configResponse.config.openaiImageModel ? 'preset' : 'custom')
      setUsers(usersResponse.users)
      setOrders(ordersResponse.orders)
      setPaymentEvents(paymentEventsResponse.events)
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

  const copyAdminText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label}已复制`, 'success')
    } catch {
      showToast(`复制${label}失败`, 'error')
    }
  }

  const saveConfig = async () => {
    if (!configForm) return
    setSavingConfig(true)
    try {
      const payload: PlatformAdminUpdateConfigRequest = {
        siteName: configForm.siteName,
        publicBaseUrl: configForm.publicBaseUrl,
        supportEmail: configForm.supportEmail,
        smtpEnabled: configForm.smtpEnabled,
        smtpHost: configForm.smtpHost,
        smtpPort: Number(configForm.smtpPort) || 465,
        smtpSecure: configForm.smtpSecure,
        smtpUser: configForm.smtpUser,
        smtpFromName: configForm.smtpFromName,
        smtpFromEmail: configForm.smtpFromEmail,
        emailVerificationOnRegister: configForm.emailVerificationOnRegister,
        emailVerificationOnProfileUpdate: configForm.emailVerificationOnProfileUpdate,
        openaiBaseUrl: configForm.openaiBaseUrl || configForm.imageBaseUrl,
        openaiImageModel: configForm.openaiImageModel || configForm.imageModel,
        upstreamTimeoutMs: Math.max(5, Number(configForm.upstreamTimeoutMs) || 120) * 1000,
        creditsPerImage: Number(configForm.creditsPerImage) || 1,
        balanceUnitCents: Number(configForm.balanceUnitCents) || 100,
        allowUserApiConfig: false,
        epayEnabled: configForm.epayEnabled,
        epayGatewayUrl: configForm.epayGatewayUrl,
        epayPid: configForm.epayPid,
        epayReturnUrl: configForm.epayReturnUrl,
        epayNotifyUrl: configForm.epayNotifyUrl,
        epayPaymentTypes: configForm.epayPaymentTypes?.length ? configForm.epayPaymentTypes : ['alipay'],
      }
      if (configForm.openaiApiKey.trim()) payload.openaiApiKey = configForm.openaiApiKey.trim()
      if (configForm.epayKey.trim()) payload.epayKey = configForm.epayKey.trim()
      if (configForm.smtpPassword.trim()) payload.smtpPassword = configForm.smtpPassword.trim()
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
      if (response.models.length && imageModelMode === 'preset') {
        patchConfigForm({ openaiImageModel: response.models[0], imageModel: response.models[0] })
        setImageModelMode('preset')
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
        recommended: editingPlan.recommended,
        description: editingPlan.description.trim() || undefined,
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
      showToast('请输入调整余额', 'error')
      return
    }
    setSavingUser(true)
    try {
      const signedAmount = adjustingCredits.mode === 'decrease' ? -amount : amount
      const response = await adjustAdminUserCredits(activeProfile.baseUrl, {
        userId: adjustingCredits.user.id,
        amount: signedAmount,
        description: adjustingCredits.description || (signedAmount > 0 ? '后台增加余额' : '后台减少余额'),
      })
      setUsers((items) => items.map((item) => item.id === adjustingCredits.user.id ? { ...item, availableCredits: response.balance.availableCredits } : item))
      setAdjustingCredits(null)
      showToast('余额已调整', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingUser(false)
    }
  }

  const startConfirmPayment = (order: PlatformAdminOrderResponse) => {
    setConfirmingPayment({
      order,
      providerPaymentId: '',
      providerEventId: `manual-${order.id}`,
      paidAmountYuan: String(order.amountCents / 100),
      note: '',
    })
  }

  const submitConfirmPayment = async () => {
    if (!confirmingPayment) return
    setSavingConfig(true)
    try {
      const response = await confirmAdminOrderPayment(activeProfile.baseUrl, {
        orderId: confirmingPayment.order.id,
        providerEventId: confirmingPayment.providerEventId,
        providerPaymentId: confirmingPayment.providerPaymentId || confirmingPayment.providerEventId,
        paidAmountCents: Math.round((Number(confirmingPayment.paidAmountYuan) || 0) * 100),
        note: confirmingPayment.note,
      })
      setOrders((items) => items.map((item) => item.id === response.order.id ? { ...item, ...response.order } : item))
      setSelectedOrder((current) => current?.id === response.order.id ? { ...current, ...response.order } : current)
      setConfirmingPayment(null)
      showToast(response.duplicate ? '订单已入账，无需重复处理' : '订单已确认入账', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = userQuery.trim().toLowerCase()
    if (!keyword) return users
    return users.filter((user) => [
      user.id,
      user.username,
      user.email,
      user.phone,
      user.displayName,
      user.adminNote,
      user.role,
      user.status,
    ].some((value) => String(value ?? '').toLowerCase().includes(keyword)))
  }, [userQuery, users])

  const filteredOrders = useMemo(() => {
    const keyword = orderQuery.trim().toLowerCase()
    return orders.filter((order) => {
      if (orderStatus !== 'all' && order.status !== orderStatus) return false
      if (!keyword) return true
      return [
        order.id,
        order.userId,
        order.userEmail,
        order.userDisplayName,
        order.planId,
        order.provider,
        order.providerOrderId,
        order.providerPaymentId,
        order.status,
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword))
    })
  }, [orderQuery, orderStatus, orders])

  const filteredPaymentEvents = useMemo(() => {
    const keyword = paymentEventQuery.trim().toLowerCase()
    if (!keyword) return paymentEvents
    return paymentEvents.filter((event) => [
      event.id,
      event.provider,
      event.providerEventId,
      event.orderId,
      JSON.stringify(event.raw ?? ''),
    ].some((value) => String(value ?? '').toLowerCase().includes(keyword)))
  }, [paymentEventQuery, paymentEvents])

  const filteredLogs = useMemo(() => {
    const keyword = logQuery.trim().toLowerCase()
    return logs.filter((log) => {
      const statusMatched = logStatus === 'all' || log.status === logStatus
      if (!statusMatched) return false
      if (!keyword) return true
      return [
        log.id,
        log.userId,
        log.userEmail,
        log.userDisplayName,
        log.prompt,
        log.errorMessage,
        log.size,
        log.quality,
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword))
    })
  }, [logQuery, logStatus, logs])

  const disabledUserCount = users.filter((user) => user.status !== 'active').length
  const pendingOrderCount = orders.filter((order) => order.status === 'pending').length
  const paidRevenueCents = orders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + order.amountCents, 0)
  const matchedPaymentEvents = selectedOrder ? paymentEvents.filter((event) => event.orderId === selectedOrder.id) : []
  const orphanPaymentEventCount = paymentEvents.filter((event) => !event.orderId || !orders.some((order) => order.id === event.orderId)).length
  const failedLogCount = logs.filter((log) => log.status === 'failed').length
  const runningLogCount = logs.filter((log) => log.status === 'running' || log.status === 'queued').length
  const publicBaseUrl = (configForm?.publicBaseUrl || config?.publicBaseUrl || '').replace(/\/+$/, '')
  const defaultEpayNotifyUrl = publicBaseUrl ? `${publicBaseUrl}/api/platform/payments/epay/notify` : '/api/platform/payments/epay/notify'
  const defaultEpayReturnUrl = publicBaseUrl || '/'
  const paymentChecks = configForm ? [
    { label: '易支付开关', ok: configForm.epayEnabled, detail: configForm.epayEnabled ? '用户可创建线上支付订单' : '未启用时只会生成待配置订单' },
    { label: '商户参数', ok: Boolean(configForm.epayGatewayUrl && configForm.epayPid && (configForm.epayKey || config?.epayKeyMasked)), detail: configForm.epayGatewayUrl || '需要填写网关、PID 和商户 Key' },
    { label: '公开访问地址', ok: Boolean(publicBaseUrl), detail: publicBaseUrl || '用于拼接支付回调与返回地址' },
    { label: '异步通知地址', ok: Boolean(configForm.epayNotifyUrl || publicBaseUrl), detail: configForm.epayNotifyUrl || defaultEpayNotifyUrl },
  ] : []
  const paymentReady = paymentChecks.length > 0 && paymentChecks.every((item) => item.ok)
  const toggleEpayPaymentType = (type: 'alipay' | 'wxpay' | 'qqpay') => {
    if (!configForm) return
    const current = new Set(configForm.epayPaymentTypes?.length ? configForm.epayPaymentTypes : ['alipay'])
    if (current.has(type) && current.size > 1) current.delete(type)
    else current.add(type)
    patchConfigForm({ epayPaymentTypes: Array.from(current) as ConfigForm['epayPaymentTypes'] })
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
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="累计收入" value={loading ? '...' : formatMoney(overview?.billing.revenueCents ?? 0)} hint={`${overview?.billing.paidOrders ?? 0} 笔已支付`} />
                <StatCard label="注册用户" value={loading ? '...' : overview?.billing.users ?? 0} hint={`${overview?.billing.availableCredits ?? 0} 可用余额`} />
                <StatCard label="订单总数" value={loading ? '...' : overview?.billing.orders ?? 0} hint={`${overview?.billing.pendingOrders ?? 0} 待支付`} />
                <StatCard label="生成任务" value={loading ? '...' : overview?.jobs.total ?? 0} hint={`${overview?.jobs.running ?? 0} 运行中 / ${overview?.jobs.failed ?? 0} 失败`} />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-950 dark:text-white">运营摘要</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">从最近拉取的数据中汇总收入、订单转化和任务健康度。</p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">当前缓存 {users.length} 用户 / {orders.length} 订单 / {logs.length} 任务</div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">最近订单收入</div>
                      <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{formatMoney(paidRevenueCents)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">待支付订单</div>
                      <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{pendingOrderCount}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">进行中任务</div>
                      <div className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{runningLogCount}</div>
                    </div>
                  </div>
                </section>
                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">风险提示</h3>
                  <div className="mt-4 space-y-2">
                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${paymentReady ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100'}`}>
                      <span>支付配置</span>
                      <strong>{paymentReady ? '就绪' : '待完善'}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
                      <span>待支付订单</span>
                      <strong>{pendingOrderCount}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-100">
                      <span>失败任务</span>
                      <strong>{failedLogCount}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-white/[0.04] dark:text-gray-200">
                      <span>禁用用户</span>
                      <strong>{disabledUserCount}</strong>
                    </div>
                  </div>
                </section>
              </div>
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
                  <Field label="每张图消耗余额" hint="高质量、大尺寸仍会叠加倍率。"><input className={inputClass()} type="number" min={1} value={configForm.creditsPerImage} onChange={(e) => patchConfigForm({ creditsPerImage: Number(e.target.value) })} /></Field>
                  <Field label="余额抵扣金额" hint="单位为分，例如 100 表示 1 余额可抵扣 ¥1。"><input className={inputClass()} type="number" min={1} value={configForm.balanceUnitCents} onChange={(e) => patchConfigForm({ balanceUnitCents: Number(e.target.value) })} /></Field>
                  <Field label="上游 API Base URL"><input className={inputClass()} value={configForm.openaiBaseUrl || configForm.imageBaseUrl} onChange={(e) => patchConfigForm({ openaiBaseUrl: e.target.value, imageBaseUrl: e.target.value })} /></Field>
                  <Field label="图片模型 ID" hint="填写 Base URL 和 API Key 后，可检测上游支持的模型。">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setImageModelMode('preset')}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${imageModelMode === 'preset' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/15 dark:text-blue-100' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                        >
                          选择模型
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageModelMode('custom')}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${imageModelMode === 'custom' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/15 dark:text-blue-100' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                        >
                          自定义模型 ID
                        </button>
                        <button type="button" onClick={() => void detectModels()} disabled={detectingModels} className="ml-auto shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                          {detectingModels ? '检测中' : '检测模型'}
                        </button>
                      </div>
                      {imageModelMode === 'preset' ? (
                        availableModels.length > 0 ? (
                          <select
                            className={inputClass()}
                            value={selectedImageModel && availableModels.includes(selectedImageModel) ? selectedImageModel : availableModels[0]}
                            onChange={(e) => patchConfigForm({ openaiImageModel: e.target.value, imageModel: e.target.value })}
                          >
                            {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
                          </select>
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-400">
                            先点击“检测模型”获取可选列表，或者切换到“自定义模型 ID”直接输入。
                          </div>
                        )
                      ) : (
                        <input
                          className={inputClass()}
                          value={selectedImageModel}
                          onChange={(e) => patchConfigForm({ openaiImageModel: e.target.value, imageModel: e.target.value })}
                          placeholder="填写模型 ID，例如 gpt-image-2"
                        />
                      )}
                      {availableModels.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          已检测到 {availableModels.length} 个可用模型，直接从下拉框选择即可；如果要使用自定义模型，也可以在下方直接输入。
                        </div>
                      )}
                    </div>
                  </Field>
                  <Field label="上游超时（秒）" hint="生图通常需要 60-120 秒，建议设置 180 秒以上。"><input className={inputClass()} type="number" min={5} max={600} value={configForm.upstreamTimeoutMs} onChange={(e) => patchConfigForm({ upstreamTimeoutMs: Number(e.target.value) })} /></Field>
                  <Field label="上游 API Key" hint={config?.hasOpenaiApiKey ? `已保存：${config.openaiApiKeyMasked}，留空则不修改` : '尚未保存 API Key'}><input className={inputClass()} type="password" value={configForm.openaiApiKey} onChange={(e) => patchConfigForm({ openaiApiKey: e.target.value })} /></Field>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">发信邮箱</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">用于注册验证、用户修改邮箱和后续运营通知。建议使用企业邮箱或云邮件服务 SMTP。</p>
                  </div>
                  <StatusPill tone={configForm.smtpEnabled && configForm.smtpHost && configForm.smtpFromEmail ? 'green' : 'amber'} label={configForm.smtpEnabled ? 'SMTP 已启用' : '未启用'} />
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field label="启用 SMTP 发信">
                    <button type="button" onClick={() => patchConfigForm({ smtpEnabled: !configForm.smtpEnabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${configForm.smtpEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${configForm.smtpEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </Field>
                  <Field label="注册邮箱验证">
                    <button type="button" onClick={() => patchConfigForm({ emailVerificationOnRegister: !configForm.emailVerificationOnRegister })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${configForm.emailVerificationOnRegister ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${configForm.emailVerificationOnRegister ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </Field>
                  <Field label="修改邮箱验证">
                    <button type="button" onClick={() => patchConfigForm({ emailVerificationOnProfileUpdate: !configForm.emailVerificationOnProfileUpdate })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${configForm.emailVerificationOnProfileUpdate ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${configForm.emailVerificationOnProfileUpdate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </Field>
                  <Field label="SMTP Host"><input className={inputClass()} value={configForm.smtpHost} onChange={(e) => patchConfigForm({ smtpHost: e.target.value })} placeholder="smtp.example.com" /></Field>
                  <Field label="SMTP Port"><input className={inputClass()} type="number" min={1} max={65535} value={configForm.smtpPort} onChange={(e) => patchConfigForm({ smtpPort: Number(e.target.value) })} /></Field>
                  <Field label="安全连接">
                    <select className={inputClass()} value={configForm.smtpSecure ? 'ssl' : 'plain'} onChange={(e) => patchConfigForm({ smtpSecure: e.target.value === 'ssl' })}>
                      <option value="ssl">SSL/TLS（常用 465）</option>
                      <option value="plain">普通连接（常用 25/587）</option>
                    </select>
                  </Field>
                  <Field label="SMTP 用户名"><input className={inputClass()} value={configForm.smtpUser} onChange={(e) => patchConfigForm({ smtpUser: e.target.value })} placeholder="通常为完整邮箱" /></Field>
                  <Field label="SMTP 密码" hint={config?.smtpPasswordMasked ? `已保存：${config.smtpPasswordMasked}，留空则不修改` : '尚未保存 SMTP 密码或授权码'}>
                    <input className={inputClass()} type="password" value={configForm.smtpPassword} onChange={(e) => patchConfigForm({ smtpPassword: e.target.value })} placeholder="邮箱授权码或 SMTP 密码" />
                  </Field>
                  <Field label="发件人名称"><input className={inputClass()} value={configForm.smtpFromName} onChange={(e) => patchConfigForm({ smtpFromName: e.target.value })} placeholder={configForm.siteName} /></Field>
                  <Field label="发件人邮箱"><input className={inputClass()} type="email" value={configForm.smtpFromEmail} onChange={(e) => patchConfigForm({ smtpFromEmail: e.target.value })} placeholder="noreply@example.com" /></Field>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">支付渠道</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">上线前至少完成网关、商户参数、公开地址和异步通知地址。</p>
                  </div>
                  <StatusPill tone={paymentReady ? 'green' : 'amber'} label={paymentReady ? '支付就绪' : '配置待完善'} />
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="启用易支付">
                      <button type="button" onClick={() => patchConfigForm({ epayEnabled: !configForm.epayEnabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${configForm.epayEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${configForm.epayEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </Field>
                    <Field label="开放支付方式" hint="用户端只会展示这里启用的方式，至少保留一项。">
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['alipay', '支付宝'],
                          ['wxpay', '微信'],
                          ['qqpay', 'QQ 钱包'],
                        ] as const).map(([type, label]) => {
                          const active = (configForm.epayPaymentTypes?.length ? configForm.epayPaymentTypes : ['alipay']).includes(type)
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleEpayPaymentType(type)}
                              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/15 dark:text-blue-100' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <Field label="易支付网关"><input className={inputClass()} value={configForm.epayGatewayUrl} onChange={(e) => patchConfigForm({ epayGatewayUrl: e.target.value })} placeholder="https://pay.example.com" /></Field>
                    <Field label="商户 PID"><input className={inputClass()} value={configForm.epayPid} onChange={(e) => patchConfigForm({ epayPid: e.target.value })} /></Field>
                    <Field label="商户 Key" hint={config?.epayKeyMasked ? `已保存：${config.epayKeyMasked}，留空则不修改` : '尚未保存商户 Key'}><input className={inputClass()} type="password" value={configForm.epayKey} onChange={(e) => patchConfigForm({ epayKey: e.target.value })} /></Field>
                    <Field label="同步返回地址" hint={`建议：${defaultEpayReturnUrl}`}>
                      <input className={inputClass()} value={configForm.epayReturnUrl} onChange={(e) => patchConfigForm({ epayReturnUrl: e.target.value })} />
                    </Field>
                    <Field label="异步通知地址" hint={`建议：${defaultEpayNotifyUrl}`}>
                      <input className={inputClass()} value={configForm.epayNotifyUrl} onChange={(e) => patchConfigForm({ epayNotifyUrl: e.target.value })} placeholder="/api/platform/payments/epay/notify" />
                    </Field>
                  </div>
                  <aside className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-950 dark:text-white">支付配置检查</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">保存后会影响用户中心收银台。</div>
                      </div>
                      <button type="button" onClick={() => void copyAdminText(defaultEpayNotifyUrl, '异步通知地址')} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                        复制回调
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {paymentChecks.map((item) => <CheckItem key={item.label} label={item.label} ok={item.ok} detail={item.detail} />)}
                    </div>
                  </aside>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'plans' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">套餐设置</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">配置用户中心展示的次数包。未购买套餐或次数用完时，生图按站点配置扣余额。</p>
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
                      <th className="py-2 pr-4 font-medium">推荐</th>
                      <th className="py-2 pr-4 font-medium">描述</th>
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
                        <td className="py-3 pr-4"><StatusPill tone={plan.recommended ? 'blue' : 'gray'} label={plan.recommended ? '推荐' : '普通'} /></td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{plan.description || '-'}</td>
                        <td className="py-3 pr-4"><StatusPill tone={plan.enabled ? 'green' : 'gray'} label={plan.enabled ? '上架' : '下架'} /></td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() => setEditingPlan({ id: plan.id, name: plan.name, uses: String(plan.credits), priceYuan: String(plan.priceCents / 100), enabled: plan.enabled, recommended: plan.recommended, description: plan.description || '' })}
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">用户管理</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">搜索用户名、邮箱、手机号、备注和状态，快速处理账号与额度。</p>
                </div>
                <button type="button" onClick={() => setShowCreateUser(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <PlusIcon className="h-4 w-4" />
                  添加用户
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <ToolbarInput value={userQuery} onChange={setUserQuery} placeholder="搜索用户、邮箱、手机号或备注" />
                <div className="text-xs text-gray-500 dark:text-gray-400">显示 {filteredUsers.length} / {users.length} 个用户</div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                      <th className="py-2 pr-4 font-medium">ID</th>
                      <th className="py-2 pr-4 font-medium">用户</th>
                      <th className="py-2 pr-4 font-medium">角色</th>
                      <th className="py-2 pr-4 font-medium">余额</th>
                      <th className="py-2 pr-4 font-medium">状态</th>
                      <th className="py-2 pr-4 font-medium">消费</th>
                      <th className="py-2 pr-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
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
              {!filteredUsers.length && <div className="mt-4"><EmptyState title="没有匹配的用户" description="调整搜索关键词，或点击添加用户创建新账号。" /></div>}
            </section>
          )}

          {activeTab === 'orders' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">订单管理</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按状态查看支付订单，核对套餐、渠道和入账情况。</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ToolbarInput value={orderQuery} onChange={setOrderQuery} placeholder="搜索订单、用户、交易号或套餐" />
                  <ToolbarSelect value={orderStatus} onChange={setOrderStatus}>
                    <option value="all">全部订单</option>
                    <option value="pending">待支付</option>
                    <option value="paid">已支付</option>
                    <option value="cancelled">已取消</option>
                    <option value="expired">已过期</option>
                  </ToolbarSelect>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <StatCard label="筛选结果" value={filteredOrders.length} hint={`共 ${orders.length} 笔`} />
                <StatCard label="已支付收入" value={formatMoney(paidRevenueCents)} hint="基于当前加载订单" />
                <StatCard label="待支付" value={pendingOrderCount} hint="需要关注转化或关闭" />
                <StatCard label="未匹配通知" value={orphanPaymentEventCount} hint="需核对回调订单号" />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400"><tr className="border-b border-gray-200 dark:border-white/[0.08]"><th className="py-2 pr-4 font-medium">订单</th><th className="py-2 pr-4 font-medium">用户</th><th className="py-2 pr-4 font-medium">套餐</th><th className="py-2 pr-4 font-medium">金额</th><th className="py-2 pr-4 font-medium">次数</th><th className="py-2 pr-4 font-medium">渠道</th><th className="py-2 pr-4 font-medium">状态</th><th className="py-2 pr-4 font-medium">创建时间</th><th className="py-2 pr-4 font-medium">操作</th></tr></thead>
                  <tbody>{filteredOrders.map((order) => <tr key={order.id} className="border-b border-gray-100 dark:border-white/[0.06]"><td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{order.id}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.userDisplayName || order.userEmail || order.userId}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.planId}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatMoney(order.amountCents)}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.credits} 次</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.provider}</td><td className="py-3 pr-4"><StatusPill tone={order.status === 'paid' ? 'green' : order.status === 'pending' ? 'amber' : 'red'} label={order.status} /></td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(order.createdAt)}</td><td className="py-3 pr-4"><button type="button" onClick={() => setSelectedOrder(order)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">查看</button></td></tr>)}</tbody>
                </table>
              </div>
              {!filteredOrders.length && <div className="mt-4"><EmptyState title="没有匹配的订单" description="切换订单状态筛选，或刷新最新订单数据。" /></div>}
              <section className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-950 dark:text-white">最近支付通知</h4>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">用于核对第三方回调是否进入系统，敏感签名字段已脱敏。</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <ToolbarInput value={paymentEventQuery} onChange={setPaymentEventQuery} placeholder="搜索交易号、订单号或原始通知" />
                    <div className="text-xs text-gray-500 dark:text-gray-400">显示 {filteredPaymentEvents.length} / {paymentEvents.length}</div>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-xs text-gray-500 dark:text-gray-400"><tr className="border-b border-gray-200 dark:border-white/[0.08]"><th className="py-2 pr-4 font-medium">时间</th><th className="py-2 pr-4 font-medium">渠道</th><th className="py-2 pr-4 font-medium">事件号</th><th className="py-2 pr-4 font-medium">订单号</th><th className="py-2 pr-4 font-medium">原始摘要</th></tr></thead>
                    <tbody>
                      {filteredPaymentEvents.slice(0, 12).map((event) => {
                        const matchedOrder = event.orderId ? orders.find((order) => order.id === event.orderId) : null
                        return (
                        <tr key={event.id} className="border-b border-gray-100 dark:border-white/[0.06]">
                          <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{formatDate(event.processedAt)}</td>
                          <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{event.provider}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{event.providerEventId}</td>
                          <td className="py-2 pr-4">
                            <div className="font-mono text-xs text-gray-600 dark:text-gray-300">{event.orderId || '-'}</div>
                            {!matchedOrder && <div className="mt-1 text-xs text-amber-600 dark:text-amber-200">未匹配订单</div>}
                          </td>
                          <td className="max-w-[300px] py-2 pr-4 text-xs text-gray-500 dark:text-gray-400"><div className="truncate">{JSON.stringify(event.raw)}</div></td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {!filteredPaymentEvents.length && <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">暂无匹配支付通知</div>}
                </div>
              </section>
            </section>
          )}

          {activeTab === 'generationLogs' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">生图日志</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">排查失败任务、异常提示词、扣费和生成参数。</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ToolbarInput value={logQuery} onChange={setLogQuery} placeholder="搜索任务、用户、提示词或错误" />
                  <ToolbarSelect value={logStatus} onChange={setLogStatus}>
                    <option value="all">全部状态</option>
                    <option value="queued">排队中</option>
                    <option value="running">运行中</option>
                    <option value="succeeded">已成功</option>
                    <option value="failed">已失败</option>
                    <option value="cancelled">已取消</option>
                  </ToolbarSelect>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <StatCard label="筛选结果" value={filteredLogs.length} hint={`共 ${logs.length} 条`} />
                <StatCard label="运行/排队" value={runningLogCount} />
                <StatCard label="失败任务" value={failedLogCount} />
                <StatCard label="余额消耗" value={filteredLogs.reduce((sum, log) => sum + log.costCredits, 0)} hint="当前筛选范围" />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400"><tr className="border-b border-gray-200 dark:border-white/[0.08]"><th className="py-2 pr-4 font-medium">任务</th><th className="py-2 pr-4 font-medium">用户</th><th className="py-2 pr-4 font-medium">提示词</th><th className="py-2 pr-4 font-medium">尺寸</th><th className="py-2 pr-4 font-medium">质量</th><th className="py-2 pr-4 font-medium">格式</th><th className="py-2 pr-4 font-medium">数量</th><th className="py-2 pr-4 font-medium">参考图</th><th className="py-2 pr-4 font-medium">消耗</th><th className="py-2 pr-4 font-medium">状态</th><th className="py-2 pr-4 font-medium">时间</th><th className="py-2 pr-4 font-medium">操作</th></tr></thead>
                  <tbody>{filteredLogs.map((log) => <tr key={log.id} className="border-b border-gray-100 align-top dark:border-white/[0.06]"><td className="py-3 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">{log.id}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.userDisplayName || log.userEmail || log.userId}</td><td className="max-w-[280px] py-3 pr-4 text-gray-600 dark:text-gray-300"><div className="line-clamp-2" title={log.prompt}>{log.prompt}</div>{log.errorMessage && <div className="mt-1 text-xs text-red-600">{log.errorMessage}</div>}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.size}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.quality}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.outputFormat}{log.outputCompression != null ? ` / ${log.outputCompression}` : ''}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.n}</td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{log.inputImageCount}{log.hasMask ? ' + mask' : ''}</td><td className="py-3 pr-4 font-semibold text-gray-800 dark:text-gray-100">{log.costCredits}</td><td className="py-3 pr-4"><StatusPill tone={log.status === 'succeeded' ? 'green' : log.status === 'failed' ? 'red' : 'amber'} label={log.status} /></td><td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(log.createdAt)}</td><td className="py-3 pr-4"><button type="button" onClick={() => setSelectedLog(log)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">查看</button></td></tr>)}</tbody>
                </table>
              </div>
              {!filteredLogs.length && <div className="mt-4"><EmptyState title="没有匹配的生图日志" description="切换状态或关键词，查看最近生成任务。" /></div>}
            </section>
          )}
        </div>
      </section>

      {selectedOrder && (
        <DetailDrawer
          title="订单详情"
          subtitle={selectedOrder.id}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={selectedOrder.status === 'paid' ? 'green' : selectedOrder.status === 'pending' ? 'amber' : 'red'} label={selectedOrder.status} />
              <StatusPill tone="blue" label={selectedOrder.provider} />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-200">{selectedOrder.credits} 次</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="订单号" value={<span className="font-mono text-xs">{selectedOrder.id}</span>} />
              <DetailRow label="用户" value={selectedOrder.userDisplayName || selectedOrder.userEmail || selectedOrder.userId} />
              <DetailRow label="用户 ID" value={<span className="font-mono text-xs">{selectedOrder.userId}</span>} />
              <DetailRow label="套餐" value={selectedOrder.planId} />
              <DetailRow label="金额" value={formatMoney(selectedOrder.amountCents)} />
              <DetailRow label="支付渠道" value={selectedOrder.provider} />
              <DetailRow label="渠道订单号" value={selectedOrder.providerOrderId || '-'} />
              <DetailRow label="渠道支付号" value={selectedOrder.providerPaymentId || '-'} />
              <DetailRow label="创建时间" value={formatDate(selectedOrder.createdAt)} />
              <DetailRow label="支付时间" value={formatDate(selectedOrder.paidAt)} />
            </div>
            <section className="rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
              <h4 className="text-sm font-semibold text-gray-950 dark:text-white">运营诊断</h4>
              <div className="mt-3 grid gap-2">
                <CheckItem
                  label="支付渠道配置"
                  ok={selectedOrder.provider !== 'epay' || paymentReady}
                  detail={selectedOrder.provider === 'epay' ? (paymentReady ? '易支付参数完整，可生成收银台链接' : '易支付参数不完整，用户可能只能看到待配置提示') : '非易支付订单'}
                />
                <CheckItem
                  label="到账状态"
                  ok={selectedOrder.status === 'paid'}
                  detail={selectedOrder.status === 'paid' ? `已于 ${formatDate(selectedOrder.paidAt)} 入账` : '未收到有效支付通知，需核对支付平台订单和异步通知日志'}
                />
                <CheckItem
                  label="支付凭据"
                  ok={Boolean(selectedOrder.providerPaymentId || selectedOrder.providerOrderId || selectedOrder.status === 'pending')}
                  detail={selectedOrder.providerPaymentId || selectedOrder.providerOrderId || '待支付订单通常暂无渠道支付号'}
                />
              </div>
              {selectedOrder.status === 'pending' && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
                    客服处理建议：先确认用户是否已实际付款；若已付款但未到账，检查易支付后台的异步通知地址是否为 {configForm?.epayNotifyUrl || defaultEpayNotifyUrl}，再核对商户 Key 是否一致。
                  </div>
                  <button type="button" onClick={() => startConfirmPayment(selectedOrder)} className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                    手动确认入账
                  </button>
                </div>
              )}
            </section>
            <section className="rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
              <h4 className="text-sm font-semibold text-gray-950 dark:text-white">匹配支付通知</h4>
              <div className="mt-3 space-y-2">
                {matchedPaymentEvents.map((event) => (
                  <div key={event.id} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{event.providerEventId}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(event.processedAt)}</span>
                    </div>
                    <pre className="mt-2 max-h-32 overflow-auto rounded bg-gray-950 p-2 text-xs leading-5 text-gray-100">{JSON.stringify(event.raw, null, 2)}</pre>
                  </div>
                ))}
                {!matchedPaymentEvents.length && <div className="text-sm text-gray-500 dark:text-gray-400">当前订单暂无支付通知记录。</div>}
              </div>
            </section>
          </div>
        </DetailDrawer>
      )}

      {selectedLog && (
        <DetailDrawer
          title="生图任务详情"
          subtitle={selectedLog.id}
          onClose={() => setSelectedLog(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={selectedLog.status === 'succeeded' ? 'green' : selectedLog.status === 'failed' ? 'red' : 'amber'} label={selectedLog.status} />
              <StatusPill tone="blue" label={`${selectedLog.costCredits} credits`} />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-200">{selectedLog.imageCount} 张输出</span>
            </div>
            <section className="rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">提示词</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-900 dark:text-gray-100">{selectedLog.prompt || '-'}</p>
              {selectedLog.errorMessage && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">
                  {selectedLog.errorMessage}
                </div>
              )}
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="任务 ID" value={<span className="font-mono text-xs">{selectedLog.id}</span>} />
              <DetailRow label="用户" value={selectedLog.userDisplayName || selectedLog.userEmail || selectedLog.userId} />
              <DetailRow label="用户 ID" value={<span className="font-mono text-xs">{selectedLog.userId}</span>} />
              <DetailRow label="尺寸" value={selectedLog.size} />
              <DetailRow label="质量" value={selectedLog.quality} />
              <DetailRow label="格式" value={`${selectedLog.outputFormat}${selectedLog.outputCompression != null ? ` / ${selectedLog.outputCompression}` : ''}`} />
              <DetailRow label="数量" value={selectedLog.n} />
              <DetailRow label="参考图" value={`${selectedLog.inputImageCount}${selectedLog.hasMask ? ' + mask' : ''}`} />
              <DetailRow label="创建时间" value={formatDate(selectedLog.createdAt)} />
              <DetailRow label="开始时间" value={formatDate(selectedLog.startedAt)} />
              <DetailRow label="完成时间" value={formatDate(selectedLog.finishedAt)} />
              <DetailRow label="消耗" value={`${selectedLog.costCredits} credits`} />
            </div>
            <section className="rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">原始参数</div>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-5 text-gray-100">{JSON.stringify(selectedLog.params, null, 2)}</pre>
            </section>
          </div>
        </DetailDrawer>
      )}

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
            <Field label="初始余额"><input className={inputClass()} type="number" min={0} value={userForm.availableCredits} onChange={(e) => setUserForm({ ...userForm, availableCredits: e.target.value })} /></Field>
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
            <Field label="套餐描述"><textarea className={`${inputClass()} min-h-[96px]`} value={editingPlan.description} onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })} placeholder="向用户展示的套餐说明" /></Field>
            <Field label="推荐状态">
              <button type="button" onClick={() => setEditingPlan({ ...editingPlan, recommended: !editingPlan.recommended })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${editingPlan.recommended ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${editingPlan.recommended ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </Field>
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
        <Modal title="调整用户余额" onClose={() => setAdjustingCredits(null)}>
          <div className="grid gap-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
              <div className="font-medium text-gray-950 dark:text-white">{adjustingCredits.user.displayName || adjustingCredits.user.username || adjustingCredits.user.id}</div>
              <div className="mt-1">当前余额：{adjustingCredits.user.availableCredits}</div>
            </div>
            <Field label="调整方式">
              <select className={inputClass()} value={adjustingCredits.mode} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, mode: e.target.value === 'decrease' ? 'decrease' : 'increase' })}>
                <option value="increase">增加余额</option>
                <option value="decrease">减少余额</option>
              </select>
            </Field>
            <Field label="余额数量"><input className={inputClass()} type="number" min={1} value={adjustingCredits.amount} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, amount: e.target.value })} /></Field>
            <Field label="操作备注"><input className={inputClass()} value={adjustingCredits.description} onChange={(e) => setAdjustingCredits({ ...adjustingCredits, description: e.target.value })} placeholder="例如：客服补偿、违规扣减、手动修正" /></Field>
            <button type="button" disabled={savingUser} onClick={() => void submitAdjustCredits()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{savingUser ? '处理中...' : '确认调整'}</button>
          </div>
        </Modal>
      )}

      {confirmingPayment && (
        <Modal title="手动确认入账" onClose={() => setConfirmingPayment(null)}>
          <div className="grid gap-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              仅在已从支付平台或线下凭据确认收款后使用。确认后会把订单置为已支付，并给用户发放对应套餐次数。
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
              <div className="font-medium text-gray-950 dark:text-white">{confirmingPayment.order.id}</div>
              <div className="mt-1">{confirmingPayment.order.planId} · {formatMoney(confirmingPayment.order.amountCents)} · {confirmingPayment.order.credits} 次</div>
            </div>
            <Field label="支付事件号" hint="建议填写支付平台交易号；没有则保留自动生成值。">
              <input className={inputClass()} value={confirmingPayment.providerEventId} onChange={(e) => setConfirmingPayment({ ...confirmingPayment, providerEventId: e.target.value })} />
            </Field>
            <Field label="渠道支付号" hint="用于客服和财务核对，可与支付事件号相同。">
              <input className={inputClass()} value={confirmingPayment.providerPaymentId} onChange={(e) => setConfirmingPayment({ ...confirmingPayment, providerPaymentId: e.target.value })} />
            </Field>
            <Field label="实收金额（元）">
              <input className={inputClass()} type="number" min={0} step="0.01" value={confirmingPayment.paidAmountYuan} onChange={(e) => setConfirmingPayment({ ...confirmingPayment, paidAmountYuan: e.target.value })} />
            </Field>
            <Field label="处理备注">
              <input className={inputClass()} value={confirmingPayment.note} onChange={(e) => setConfirmingPayment({ ...confirmingPayment, note: e.target.value })} placeholder="例如：易支付后台已确认收款，手动补单" />
            </Field>
            <button type="button" disabled={savingConfig} onClick={() => void submitConfirmPayment()} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">
              {savingConfig ? '处理中...' : '确认入账'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

