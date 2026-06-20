import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import {
  cancelPlatformOrder,
  createPlatformCheckout,
  getPlatformAdminStats,
  getPlatformBalance,
  getPlatformLedger,
  getPlatformMe,
  getPlatformOrder,
  getPlatformPackages,
  getPlatformPlans,
  getPlatformPublicConfig,
  listPlatformOrders,
  resumePlatformCheckout,
  sendPlatformProfileEmailCode,
  updatePlatformMe,
} from '../lib/platformAccountApi'
import type {
  PlatformAdminStatsResponse,
  PlatformBalanceResponse,
  PlatformGenerationJobResponse,
  PlatformLedgerEntryResponse,
  PlatformMeResponse,
  PlatformOrderResponse,
  PlatformPlanResponse,
  PlatformPublicConfigResponse,
  PlatformUserPlanPackageResponse,
} from '../lib/platformApiContracts'
import { getPlatformAuthSession, logoutPlatformUser } from '../lib/platformAuthApi'
import { buildPlatformApiUrl, listPlatformGenerations } from '../lib/platformGenerationApi'
import { useStore } from '../store'
import { CloseIcon, CodeIcon, CopyIcon, EditIcon, HistoryIcon, LinkIcon, SettingsIcon, UserIcon } from './icons'

type UserCenterTab = 'overview' | 'plans' | 'orders' | 'jobs' | 'ledger' | 'admin'
type CheckoutPaymentType = 'alipay' | 'wxpay' | 'qqpay'
const DEFAULT_PAYMENT_TYPES: CheckoutPaymentType[] = ['alipay']
const PAYMENT_METHODS: Array<{ value: CheckoutPaymentType; label: string; iconClassName: string; mark: string }> = [
  { value: 'alipay', label: '支付宝', iconClassName: 'bg-[#1677ff] text-white', mark: '支' },
  { value: 'wxpay', label: '微信支付', iconClassName: 'bg-[#07c160] text-white', mark: '微' },
  { value: 'qqpay', label: 'QQ 钱包', iconClassName: 'bg-gray-950 text-white dark:bg-white dark:text-gray-950', mark: 'Q' },
]
const ORDER_REFRESH_COOLDOWN_MS = 10_000
type CheckoutResultState = {
  order: PlatformOrderResponse
  status?: 'not_configured' | 'redirect' | 'qr_code' | 'balance_paid'
  checkoutUrl?: string
  qrCodeUrl?: string
  message?: string
}

interface UserCenterData {
  me: PlatformMeResponse | null
  balance: PlatformBalanceResponse['balance'] | null
  plans: PlatformPlanResponse[]
  packages: PlatformUserPlanPackageResponse[]
  orders: PlatformOrderResponse[]
  jobs: PlatformGenerationJobResponse[]
  ledger: PlatformLedgerEntryResponse[]
  adminStats: PlatformAdminStatsResponse | null
  publicConfig: PlatformPublicConfigResponse['config'] | null
}

const EMPTY_DATA: UserCenterData = {
  me: null,
  balance: null,
  plans: [],
  packages: [],
  orders: [],
  jobs: [],
  ledger: [],
  adminStats: null,
  publicConfig: null,
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMoney(cents: number, currency: 'USD' | 'CNY' = 'CNY') {
  const normalizedCurrency = currency === 'USD' ? 'USD' : 'CNY'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: normalizedCurrency === 'CNY' ? 0 : 2,
    maximumFractionDigits: normalizedCurrency === 'CNY' ? 0 : 2,
  }).format(cents / 100)
}

function formatOrderStatus(status: PlatformOrderResponse['status']) {
  if (status === 'paid') return '已支付'
  if (status === 'cancelled') return '已取消'
  if (status === 'expired') return '已过期'
  return '待支付'
}

function formatLedgerType(type: PlatformLedgerEntryResponse['type']) {
  if (type === 'purchase') return '充值'
  if (type === 'debit') return '扣费'
  if (type === 'refund') return '退款'
  if (type === 'grant') return '赠送'
  return '调整'
}

function formatPaymentType(type: CheckoutPaymentType) {
  if (type === 'wxpay') return '微信支付'
  if (type === 'qqpay') return 'QQ 钱包'
  return '支付宝'
}

function orderStatusTone(status: PlatformOrderResponse['status']) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
  if (status === 'pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
}

function formatJobStatus(status: PlatformGenerationJobResponse['status']) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '生成中'
  if (status === 'succeeded') return '已完成'
  if (status === 'failed') return '失败'
  return '已取消'
}

function jobStatusTone(status: PlatformGenerationJobResponse['status']) {
  if (status === 'succeeded') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
  if (status === 'failed' || status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
}

function resolvePlatformImageUrl(baseUrl: string, value: string) {
  if (!value.startsWith('/api/platform/assets/')) return value
  return buildPlatformApiUrl(baseUrl, value)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  )
}

function NavIcon({ children, active }: { children: ReactNode; active: boolean }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white/15 text-white dark:bg-black/10 dark:text-gray-950' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300'}`}>
      {children}
    </span>
  )
}

export default function UserCenterPage() {
  const settings = useStore((s) => s.settings)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const activeProfile = getActiveApiProfile(settings)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const paidOrderToastRef = useRef<string | null>(null)
  const lastOrderRefreshAtRef = useRef(0)
  const [activeTab, setActiveTab] = useState<UserCenterTab>('overview')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [refreshingCheckoutOrder, setRefreshingCheckoutOrder] = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<PlatformPlanResponse | null>(null)
  const [checkoutPaymentType, setCheckoutPaymentType] = useState<CheckoutPaymentType>('alipay')
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResultState | null>(null)
  const [orderRefreshCooldownUntil, setOrderRefreshCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<UserCenterData>(EMPTY_DATA)
  const [profileDraft, setProfileDraft] = useState({ displayName: '', email: '', phone: '', avatarUrl: '' })
  const [emailVerificationCode, setEmailVerificationCode] = useState('')
  const [sendingEmailCode, setSendingEmailCode] = useState(false)

  const isAdmin = data.me?.user.mode === 'development' || data.me?.user.role === 'admin'
  const avatarUrl = profileDraft.avatarUrl || data.me?.account.avatarUrl || ''
  const profileEmailChanged = profileDraft.email.trim().toLowerCase() !== (data.me?.user.email ?? '').trim().toLowerCase()
  const profileEmailVerificationRequired = Boolean(data.publicConfig?.emailVerificationOnProfileUpdate && profileEmailChanged && profileDraft.email.trim())

  const tabs = useMemo(() => {
    const items: Array<{ id: UserCenterTab; label: string; description: string; icon: ReactNode }> = [
      { id: 'overview', label: '账号资料', description: '资料、余额与账号状态', icon: <UserIcon className="h-4 w-4" /> },
      { id: 'plans', label: '套餐订阅', description: '选择次数包并购买订阅', icon: <LinkIcon className="h-4 w-4" /> },
      { id: 'orders', label: '订单记录', description: '充值与支付记录', icon: <HistoryIcon className="h-4 w-4" /> },
      { id: 'ledger', label: '余额流水', description: '余额变动明细', icon: <HistoryIcon className="h-4 w-4" /> },
    ]
    items.splice(3, 0, { id: 'jobs', label: '生图记录', description: '提示词、结果图与扣费记录', icon: <EditIcon className="h-4 w-4" /> })
    if (isAdmin) items.push({ id: 'admin', label: '运营后台', description: '收入、用户和任务指标', icon: <CodeIcon className="h-4 w-4" /> })
    return items
  }, [isAdmin])

  const refresh = async () => {
    if (activeProfile.provider !== 'platform') {
      setAppMode('auth')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await getPlatformAuthSession(activeProfile.baseUrl)
      const [me, balance, plans, packagesResponse, orders, jobs, ledger, adminStats] = await Promise.all([
        getPlatformMe(activeProfile.baseUrl),
        getPlatformBalance(activeProfile.baseUrl),
        getPlatformPlans(activeProfile.baseUrl),
        getPlatformPackages(activeProfile.baseUrl),
        listPlatformOrders(activeProfile.baseUrl, 50),
        listPlatformGenerations({ baseUrl: activeProfile.baseUrl }).catch(() => ({ jobs: [] })),
        getPlatformLedger(activeProfile.baseUrl, 50),
        getPlatformAdminStats(activeProfile.baseUrl).catch(() => null),
      ])
      const publicConfig = await getPlatformPublicConfig(activeProfile.baseUrl).then((response) => response.config).catch(() => null)
      setData({ me, balance: balance.balance, plans: plans.plans, packages: packagesResponse.packages, orders: orders.orders, jobs: jobs.jobs, ledger: ledger.entries, adminStats, publicConfig })
      setProfileDraft({
        displayName: me.account.displayName ?? '',
        email: me.user.email ?? '',
        phone: me.account.phone ?? '',
        avatarUrl: me.account.avatarUrl ?? '',
      })
      setEmailVerificationCode('')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'Unauthorized') {
        setAppMode('auth')
        return
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (window.location.pathname !== '/user') window.history.replaceState(null, '', '/user')
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'plans') setActiveTab('plans')
    void refresh()
  }, [activeProfile.baseUrl, activeProfile.provider])

  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) setActiveTab('overview')
  }, [activeTab, isAdmin])

  useEffect(() => {
    const enabledTypes = data.publicConfig?.epayPaymentTypes?.length ? data.publicConfig.epayPaymentTypes : DEFAULT_PAYMENT_TYPES
    if (!enabledTypes.includes(checkoutPaymentType)) setCheckoutPaymentType(enabledTypes[0] ?? 'alipay')
  }, [checkoutPaymentType, data.publicConfig?.epayPaymentTypes])

  useEffect(() => {
    if (orderRefreshCooldownUntil <= nowMs) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [nowMs, orderRefreshCooldownUntil])

  const handleAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error')
      return
    }
    if (file.size > 256 * 1024) {
      showToast('头像图片请控制在 256KB 以内', 'error')
      return
    }
    const avatarUrl = await fileToDataUrl(file)
    setProfileDraft((draft) => ({ ...draft, avatarUrl }))
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const response = await updatePlatformMe(activeProfile.baseUrl, {
        displayName: profileDraft.displayName,
        email: profileDraft.email,
        emailVerificationCode: profileEmailVerificationRequired ? emailVerificationCode : undefined,
        phone: profileDraft.phone,
        avatarUrl: profileDraft.avatarUrl,
      })
      setData((current) => ({ ...current, me: response }))
      showToast('资料已保存', 'success')
      window.dispatchEvent(new Event('platform-billing-updated'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const buyPlan = async () => {
    if (!checkoutPlan) return
    const existingPendingOrder = data.orders.find((order) => order.status === 'pending')
    if (existingPendingOrder && existingPendingOrder.id !== checkoutResult?.order.id) {
      void continueOrderPayment(existingPendingOrder)
      setActiveTab('orders')
      showToast('你还有待支付订单，请先完成支付或取消订单', 'info')
      return
    }
    setBuyingPlanId(checkoutPlan.id)
    try {
      const response = await createPlatformCheckout(activeProfile.baseUrl, { planId: checkoutPlan.id, provider: 'epay', paymentType: checkoutPaymentType })
      setCheckoutResult({
        order: response.order,
        status: response.checkout.status,
        checkoutUrl: response.checkout.checkoutUrl,
        qrCodeUrl: response.checkout.qrCodeUrl,
        message: response.checkout.message,
      })
      showToast(response.checkout.status === 'balance_paid' ? '余额支付成功，套餐已入账' : response.checkout.checkoutUrl ? '支付链接已生成' : response.checkout.message || '订单已创建，支付渠道待配置', response.checkout.status === 'balance_paid' || response.checkout.checkoutUrl ? 'success' : 'info')
      await refresh()
    } catch (err) {
      const pendingOrder = data.orders.find((order) => order.status === 'pending')
      const errorCode = err instanceof Error && 'code' in err ? (err as Error & { code?: string }).code : ''
      if (err instanceof Error && (errorCode === 'pending_order_exists' || /pending order/i.test(err.message)) && pendingOrder) {
        void continueOrderPayment(pendingOrder)
        setActiveTab('orders')
        showToast('你还有待支付订单，请先完成支付或取消订单', 'info')
      } else {
        showToast(err instanceof Error ? err.message : String(err), 'error')
      }
    } finally {
      setBuyingPlanId(null)
    }
  }

  const refreshCheckoutOrder = async (options: { silent?: boolean } = {}) => {
    if (!checkoutResult) return null
    const now = Date.now()
    const nextAllowedAt = lastOrderRefreshAtRef.current + ORDER_REFRESH_COOLDOWN_MS
    if (now < nextAllowedAt) {
      setOrderRefreshCooldownUntil(nextAllowedAt)
      if (!options.silent) showToast(`请 ${Math.ceil((nextAllowedAt - now) / 1000)} 秒后再刷新订单状态`, 'info')
      return null
    }
    lastOrderRefreshAtRef.current = now
    setNowMs(now)
    setOrderRefreshCooldownUntil(now + ORDER_REFRESH_COOLDOWN_MS)
    if (!options.silent) setRefreshingCheckoutOrder(true)
    try {
      const response = await getPlatformOrder(activeProfile.baseUrl, checkoutResult.order.id)
      setCheckoutResult((current) => current ? { ...current, order: response.order } : current)
      setData((current) => ({
        ...current,
        orders: current.orders.map((order) => (order.id === response.order.id ? response.order : order)),
      }))
      if (response.order.status === 'paid' && paidOrderToastRef.current !== response.order.id) {
        paidOrderToastRef.current = response.order.id
        showToast('支付已确认，套餐已入账', 'success')
        await refresh()
      } else if (!options.silent) {
        showToast('订单状态已刷新', 'info')
      }
      return response.order
    } catch (err) {
      if (!options.silent) showToast(err instanceof Error ? err.message : String(err), 'error')
      return null
    } finally {
      if (!options.silent) setRefreshingCheckoutOrder(false)
    }
  }

  const openCheckoutUrl = () => {
    if (!checkoutResult?.checkoutUrl) return
    window.open(checkoutResult.checkoutUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => void refreshCheckoutOrder({ silent: true }), 10_000)
    window.setTimeout(() => void refreshCheckoutOrder({ silent: true }), 30_000)
  }

  const copyOrderId = async (orderId: string) => {
    try {
      await copyTextToClipboard(orderId)
      showToast('订单号已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制订单号失败', err), 'error')
    }
  }

  const continueOrderPayment = async (order: PlatformOrderResponse) => {
    const plan = data.plans.find((item) => item.id === order.planId) ?? {
      id: order.planId,
      name: order.planId,
      credits: order.credits,
      priceCents: order.originalAmountCents || order.amountCents + (order.balanceAppliedCents ?? 0),
      currency: order.currency,
      enabled: true,
      recommended: false,
      description: '',
    }
    setCheckoutPlan(plan)
    setCheckoutPaymentType('alipay')
    paidOrderToastRef.current = order.status === 'paid' ? order.id : null
    setCheckoutResult({ order, message: order.status === 'pending' ? '该订单已创建，请继续完成支付或取消订单后重新购买。' : undefined })
    if (order.status !== 'pending') return
    try {
      const response = await resumePlatformCheckout(activeProfile.baseUrl, order.id, { paymentType: checkoutPaymentType })
      setCheckoutResult({
        order: response.order,
        status: response.checkout.status,
        checkoutUrl: response.checkout.checkoutUrl,
        qrCodeUrl: response.checkout.qrCodeUrl,
        message: response.checkout.message,
      })
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const sendProfileEmailCode = async () => {
    if (!profileDraft.email.trim()) {
      showToast('请先输入邮箱', 'info')
      return
    }
    setSendingEmailCode(true)
    try {
      await sendPlatformProfileEmailCode(activeProfile.baseUrl, profileDraft.email.trim())
      showToast('验证码已发送，请查看邮箱', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSendingEmailCode(false)
    }
  }

  const cancelOrderNow = async (order: PlatformOrderResponse) => {
    setCancellingOrderId(order.id)
    try {
      const response = await cancelPlatformOrder(activeProfile.baseUrl, order.id)
      setData((current) => ({
        ...current,
        orders: current.orders.map((item) => item.id === response.order.id ? response.order : item),
      }))
      setCheckoutResult((current) => current?.order.id === response.order.id ? { ...current, order: response.order } : current)
      if (checkoutResult?.order.id === response.order.id) setCheckoutPlan(null)
      showToast('订单已取消，可以重新购买套餐', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setCancellingOrderId(null)
    }
  }

  const cancelOrder = (order: PlatformOrderResponse) => {
    setConfirmDialog({
      title: '取消待支付订单',
      message: `确定取消订单 \`${order.id}\` 吗？\n取消后这笔订单不会继续占用购买通道，你可以重新选择套餐并创建新订单。`,
      confirmText: '取消订单',
      cancelText: '先保留',
      tone: 'danger',
      action: () => void cancelOrderNow(order),
    })
  }

  const handleLogout = async () => {
    try {
      await logoutPlatformUser(activeProfile.baseUrl)
      window.dispatchEvent(new Event('platform-billing-updated'))
      showToast('已退出登录', 'success')
      setAppMode('auth')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const accountLabel = data.me?.user.email ?? data.me?.user.id ?? '平台用户'
  const openAdminPage = () => {
    window.history.pushState(null, '', '/admin')
    setAppMode('admin')
  }

  const displayName = data.me?.account.displayName ?? accountLabel
  const activePackages = data.packages.filter((item) => item.status === 'active' && item.remainingUses > 0)
  const packageRemainingUses = activePackages.reduce((sum, item) => sum + item.remainingUses, 0)
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? { id: 'overview', label: '账号资料', description: '资料、余额与账号状态', icon: null }
  const pendingOrder = data.orders.find((order) => order.status === 'pending') ?? null
  const enabledPaymentTypes = (data.publicConfig?.epayPaymentTypes?.length ? data.publicConfig.epayPaymentTypes : DEFAULT_PAYMENT_TYPES) as CheckoutPaymentType[]
  const enabledPaymentMethods = PAYMENT_METHODS.filter((method) => enabledPaymentTypes.includes(method.value))
  const orderRefreshRemainingSeconds = Math.max(0, Math.ceil((orderRefreshCooldownUntil - nowMs) / 1000))
  const balanceUnitCents = Math.max(1, data.publicConfig?.balanceUnitCents ?? 100)
  const availableBalance = data.balance?.availableCredits ?? 0
  const estimatedBalanceApplied = checkoutPlan ? Math.max(0, Math.min(availableBalance, Math.floor(checkoutPlan.priceCents / balanceUnitCents))) : 0
  const estimatedBalanceAppliedCents = estimatedBalanceApplied * balanceUnitCents
  const estimatedPayableCents = checkoutPlan ? Math.max(0, checkoutPlan.priceCents - estimatedBalanceAppliedCents) : 0
  const canPayWithBalanceOnly = Boolean(checkoutPlan && estimatedPayableCents === 0)

  return (
    <>
    <main data-user-center className="safe-area-x mx-auto max-w-7xl px-4 pb-24 pt-6">
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div>}

      <section className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:w-72 lg:shrink-0 xl:w-80">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-white shadow-sm"
                title="上传头像"
              >
                {avatarUrl ? <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" /> : <UserIcon className="h-8 w-8" />}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] text-white opacity-0 transition group-hover:opacity-100">上传</span>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleAvatarFile(event)} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-gray-950 dark:text-white">{displayName}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${isAdmin ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>
                    {isAdmin ? '管理员' : '用户'}
                  </span>
                </div>
                <div className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{accountLabel}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">余额</div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('plans')}
                    className="rounded-lg bg-gray-950 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950"
                  >
                    充值
                  </button>
                </div>
                <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : data.balance?.availableCredits ?? 0}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">可按次扣费或抵扣套餐</div>
              </div>
              <StatCard label="套餐次数" value={loading ? '...' : packageRemainingUses} hint={`${activePackages.length} 个可用包`} />
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={openAdminPage}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <CodeIcon className="h-4 w-4" />
                进入后台管理
              </button>
            )}
          </div>

          <nav className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">用户中心</div>
            <div className="grid gap-1">
              {tabs.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}
                  >
                    <NavIcon active={active}>{tab.icon}</NavIcon>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{tab.label}</span>
                      <span className={`mt-0.5 block truncate text-xs ${active ? 'text-white/70 dark:text-gray-600' : 'text-gray-400'}`}>{tab.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              <SettingsIcon className="h-4 w-4" />
              设置
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              退出登录
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-blue-600 dark:text-blue-300">账户管理</div>
                <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">{activeTabMeta.label}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activeTabMeta.description}</p>
              </div>
              {loading && <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">数据加载中...</div>}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950 lg:p-5">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">账号概览</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看当前账号状态、余额和套餐次数。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="可用余额" value={loading ? '...' : data.balance?.availableCredits ?? 0} hint="无套餐次数时按次扣费" />
                <StatCard label="套餐剩余次数" value={loading ? '...' : packageRemainingUses} hint={`${activePackages.length} 个可用包`} />
                <StatCard label="订单数量" value={loading ? '...' : data.orders.length} hint="最近 50 条" />
                <StatCard label="注册时间" value={formatDate(data.me?.account.createdAt).split(' ')[0] || '-'} />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-950 dark:text-white">编辑资料</h4>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">更新昵称、邮箱和头像信息，左侧卡片会同步预览。</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">昵称</span>
                    <input
                      value={profileDraft.displayName}
                      onChange={(event) => setProfileDraft((draft) => ({ ...draft, displayName: event.target.value }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100"
                      placeholder="填写昵称"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">绑定邮箱</span>
                    <input
                      type="email"
                      value={profileDraft.email}
                      onChange={(event) => setProfileDraft((draft) => ({ ...draft, email: event.target.value }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100"
                      placeholder="name@example.com"
                    />
                  </label>
                  {profileEmailVerificationRequired && (
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">邮箱验证码</span>
                      <div className="flex gap-2">
                        <input
                          value={emailVerificationCode}
                          onChange={(event) => setEmailVerificationCode(event.target.value)}
                          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100"
                          placeholder="6 位验证码"
                        />
                        <button
                          type="button"
                          onClick={() => void sendProfileEmailCode()}
                          disabled={sendingEmailCode}
                          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                        >
                          {sendingEmailCode ? '发送中' : '发送验证码'}
                        </button>
                      </div>
                    </label>
                  )}
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">手机号</span>
                    <input
                      value={profileDraft.phone}
                      onChange={(event) => setProfileDraft((draft) => ({ ...draft, phone: event.target.value }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100"
                      placeholder="选填"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                  >
                    更换头像
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? '保存中...' : '保存资料'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950 dark:text-white">我的套餐包</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">生图会优先扣除套餐包次数，用完后再按余额扣费。</p>
                  </div>
                  <div className="text-sm font-semibold text-gray-950 dark:text-white">剩余 {packageRemainingUses} 次</div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {activePackages.map((item) => (
                    <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-gray-950">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-950 dark:text-white">{item.planId}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{item.remainingUses}/{item.totalUses} 次</div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, (item.remainingUses / Math.max(1, item.totalUses)) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                  {!activePackages.length && <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">暂无可用套餐包，购买后会显示剩余次数。</div>}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-950 dark:text-white">套餐订阅</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按金额购买指定次数，购买后优先用于平台托管生成。</p>
                </div>
                <div className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                  企业级托管 · 即买即用
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.plans.map((plan, index) => {
                  const featured = Boolean(plan.recommended) || (data.plans.length === 1 && index === 0)
                  const unitPrice = plan.credits > 0 ? plan.priceCents / 100 / plan.credits : 0
                  return (
                    <article
                      key={plan.id}
                      className={`group relative flex min-h-[300px] overflow-hidden rounded-3xl border p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${featured ? 'border-blue-300 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 text-white shadow-blue-500/20 dark:border-blue-300/50' : 'border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 text-gray-950 dark:border-white/[0.08] dark:from-gray-950 dark:via-gray-950 dark:to-white/[0.04] dark:text-white'}`}
                    >
                      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/20 blur-3xl" />
                      <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t from-black/[0.06] to-transparent opacity-60" />
                      <div className="relative flex w-full flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${featured ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'}`}>
                              {featured ? '推荐套餐' : '标准套餐'}
                            </div>
                            <h4 className="text-xl font-semibold tracking-tight">{plan.name}</h4>
                            <p className={`mt-2 text-sm ${featured ? 'text-white/72' : 'text-gray-500 dark:text-gray-400'}`}>{plan.description || '暂无描述'}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${plan.enabled ? (featured ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/30' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200') : (featured ? 'bg-white/10 text-white/60' : 'bg-gray-200 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300')}`}>
                            {plan.enabled ? '可购买' : '已下架'}
                          </span>
                        </div>

                        <div className="mt-7">
                          <div className="flex items-end gap-2">
                            <div className="text-4xl font-black tracking-tight">{formatMoney(plan.priceCents, 'CNY')}</div>
                            <div className={`pb-1 text-sm ${featured ? 'text-white/65' : 'text-gray-500 dark:text-gray-400'}`}>/ 套餐</div>
                          </div>
                          <div className={`mt-2 text-sm ${featured ? 'text-white/75' : 'text-gray-500 dark:text-gray-400'}`}>包含 {plan.credits.toLocaleString('zh-CN')} 次 · 约 ¥{unitPrice.toFixed(2)} / 次</div>
                        </div>

                        <div className={`mt-6 grid gap-2 border-t pt-5 text-sm ${featured ? 'border-white/15 text-white/82' : 'border-gray-200 text-gray-600 dark:border-white/[0.08] dark:text-gray-300'}`}>
                          <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${featured ? 'bg-blue-200' : 'bg-blue-500'}`} />平台托管生成次数</div>
                          <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${featured ? 'bg-blue-200' : 'bg-blue-500'}`} />优先扣套餐次数，用完扣余额</div>
                          <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${featured ? 'bg-blue-200' : 'bg-blue-500'}`} />适配商业创作工作流</div>
                        </div>

                        <button
                          type="button"
                          disabled={!plan.enabled || buyingPlanId === plan.id}
                          onClick={() => {
                            if (pendingOrder) {
                              void continueOrderPayment(pendingOrder)
                              setActiveTab('orders')
                              showToast('你还有待支付订单，请先完成支付或取消订单', 'info')
                              return
                            }
                            setCheckoutPlan(plan)
                            setCheckoutResult(null)
                            setCheckoutPaymentType('alipay')
                          }}
                          className={`mt-auto rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${featured ? 'bg-white text-gray-950 hover:bg-blue-50' : 'bg-gray-950 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
                        >
                          {buyingPlanId === plan.id ? '处理中...' : '立即购买'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">订单记录</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看最近创建的套餐购买订单。</p>
              </div>
              {pendingOrder && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  当前有待支付订单，请先完成支付或取消订单后再创建新的购买订单。
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-gray-500 dark:text-gray-400">
                    <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                      <th className="py-2 pr-4 font-medium">订单号</th>
                      <th className="py-2 pr-4 font-medium">套餐</th>
                      <th className="py-2 pr-4 font-medium">金额</th>
                      <th className="py-2 pr-4 font-medium">次数</th>
                      <th className="py-2 pr-4 font-medium">状态</th>
                      <th className="py-2 pr-4 font-medium">创建时间</th>
                      <th className="py-2 pr-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100 dark:border-white/[0.06]">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{order.id}</span>
                            <button type="button" onClick={() => void copyOrderId(order.id)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white" title="复制订单号" aria-label="复制订单号">
                              <CopyIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-gray-900 dark:text-white">{order.planId}</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatMoney(order.amountCents, order.currency)}</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{order.credits} 次</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusTone(order.status)}`}>{formatOrderStatus(order.status)}</span>
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(order.createdAt)}</td>
                        <td className="py-3 pr-4">
                          {order.status === 'pending' ? (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void continueOrderPayment(order)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                                继续支付
                              </button>
                              <button type="button" disabled={cancellingOrderId === order.id} onClick={() => void cancelOrder(order)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/20 dark:text-red-200 dark:hover:bg-red-500/10">
                                {cancellingOrderId === order.id ? '取消中...' : '取消订单'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.orders.length && <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">暂无订单</div>}
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">生图记录</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">平台托管生图会保存提示词、扣费、任务状态和结果图片。图片会写入服务端资产目录，不再只依赖浏览器本地缓存。</p>
              </div>
              <div className="grid gap-3">
                {data.jobs.map((job) => {
                  const previewImages = job.images.slice(0, 4)
                  return (
                    <article key={job.id} className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04] lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${jobStatusTone(job.status)}`}>{formatJobStatus(job.status)}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(job.createdAt)}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{job.costCredits} 余额</span>
                        </div>
                        <h4 className="mt-3 line-clamp-2 text-base font-semibold text-gray-950 dark:text-white">{job.request?.prompt || job.id}</h4>
                        <div className="mt-2 truncate font-mono text-xs text-gray-400">{job.id}</div>
                        {job.errorMessage && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{job.errorMessage}</div>}
                      </div>
                      <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
                        {previewImages.map((image, index) => {
                          const imageUrl = resolvePlatformImageUrl(activeProfile.baseUrl, image)
                          return (
                            <a
                              key={`${job.id}-${index}`}
                              href={imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-950"
                            >
                              <img src={imageUrl} alt="生成结果" className="h-full w-full object-cover" loading="lazy" />
                            </a>
                          )
                        })}
                        {!previewImages.length && (
                          <div className="col-span-4 rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500 dark:border-white/[0.12] dark:text-gray-400 lg:col-span-2">
                            暂无图片
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
                {!data.jobs.length && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">暂无生图记录，完成一次平台生图后会自动保存。</div>}
              </div>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">余额流水</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看余额充值、扣费、退款和调整记录。</p>
              </div>
              <div className="space-y-2">
                {data.ledger.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-gray-950 dark:text-white">{formatLedgerType(entry.type)} · {entry.amount > 0 ? '+' : ''}{entry.amount}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.description || entry.source} · {formatDate(entry.createdAt)}</div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">余额 {entry.balanceAfter}</div>
                  </div>
                ))}
                {!data.ledger.length && <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">暂无流水</div>}
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">运营后台</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看收入、用户、任务和余额池指标。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label="累计收入" value={loading ? '...' : formatMoney(data.adminStats?.billing.revenueCents ?? 0)} hint={`${data.adminStats?.billing.paidOrders ?? 0} 笔已支付`} />
                <StatCard label="用户数" value={loading ? '...' : data.adminStats?.billing.users ?? 0} hint="平台账号" />
                <StatCard label="平台任务" value={loading ? '...' : data.adminStats?.jobs.total ?? 0} hint={`${data.adminStats?.jobs.running ?? 0} 运行中`} />
                <StatCard label="异常队列" value={loading ? '...' : `${data.adminStats?.jobs.queued ?? 0} 排队 / ${data.adminStats?.jobs.failed ?? 0} 失败`} hint="任务状态" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="累计发放余额" value={data.adminStats?.billing.creditsIssued ?? 0} />
                <StatCard label="累计消耗余额" value={data.adminStats?.billing.creditsDebited ?? 0} />
                <StatCard label="当前可用" value={data.adminStats?.billing.availableCredits ?? 0} />
              </div>
            </div>
          )}
          </div>
        </section>
      </section>
    </main>
      {checkoutPlan && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-gray-950">
            <div className="border-b border-gray-100 px-5 py-4 pr-16 dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">确认订单并支付</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{checkoutPlan.name} · {checkoutPlan.credits.toLocaleString('zh-CN')} 次生成</p>
              </div>
              <button type="button" onClick={() => { setCheckoutPlan(null); setCheckoutResult(null) }} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white" aria-label="关闭">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">套餐</div>
                      <div className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{checkoutPlan.name}</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{checkoutPlan.credits.toLocaleString('zh-CN')} 次平台托管生成</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 dark:text-gray-400">应付</div>
                      <div className="mt-1 text-2xl font-black text-gray-950 dark:text-white">{formatMoney(checkoutPlan.priceCents, checkoutPlan.currency)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-950">优先扣套餐</div>
                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-950">订单自动入账</div>
                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-950">失败不扣次数</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/[0.08]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">支付步骤</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span className="h-2 w-2 rounded-full bg-blue-600" />确认套餐</div>
                    <div className={`flex items-center gap-2 ${checkoutResult ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}><span className={`h-2 w-2 rounded-full ${checkoutResult ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`} />生成订单</div>
                    <div className={`flex items-center gap-2 ${checkoutResult?.checkoutUrl || checkoutResult?.qrCodeUrl ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}><span className={`h-2 w-2 rounded-full ${checkoutResult?.checkoutUrl || checkoutResult?.qrCodeUrl ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`} />完成支付</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-gray-950 dark:text-white">支付方式</div>
                <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm dark:border-blue-400/20 dark:bg-blue-500/10">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-blue-700/70 dark:text-blue-100/70">套餐原价</div>
                      <div className="mt-1 font-semibold text-blue-950 dark:text-white">{formatMoney(checkoutPlan.priceCents, checkoutPlan.currency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-700/70 dark:text-blue-100/70">余额抵扣</div>
                      <div className="mt-1 font-semibold text-emerald-700 dark:text-emerald-200">
                        -{formatMoney(checkoutResult?.order.balanceAppliedCents ?? estimatedBalanceAppliedCents, checkoutPlan.currency)}
                        <span className="ml-1 text-xs font-normal text-blue-700/70 dark:text-blue-100/70">({checkoutResult?.order.balanceApplied ?? estimatedBalanceApplied} 余额)</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-700/70 dark:text-blue-100/70">还需支付</div>
                      <div className="mt-1 font-semibold text-blue-950 dark:text-white">{formatMoney(checkoutResult?.order.amountCents ?? estimatedPayableCents, checkoutPlan.currency)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-blue-700/70 dark:text-blue-100/70">
                    当前余额 {availableBalance}，后台换算为每 1 余额抵扣 {formatMoney(balanceUnitCents, checkoutPlan.currency)}。
                  </div>
                </div>
                {canPayWithBalanceOnly && !checkoutResult ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    当前余额可全额抵扣，本次购买无需跳转第三方收银台。
                  </div>
                ) : (
                  <div className={`grid gap-2 ${enabledPaymentMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {enabledPaymentMethods.map(({ value, label, iconClassName, mark }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCheckoutPaymentType(value)}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${checkoutPaymentType === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/15 dark:text-blue-100' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-black ${iconClassName}`}>{mark}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {!canPayWithBalanceOnly && !enabledPaymentMethods.length && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                    管理员尚未启用可用支付方式。
                  </div>
                )}
              </div>

              {checkoutResult && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusTone(checkoutResult.order.status)}`}>{formatOrderStatus(checkoutResult.order.status)}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatPaymentType(checkoutPaymentType)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{checkoutResult.order.id}</span>
                        <button type="button" onClick={() => void copyOrderId(checkoutResult.order.id)} className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white" title="复制订单号">
                          <CopyIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                      <div>{formatMoney(checkoutResult.order.amountCents, checkoutResult.order.currency)}</div>
                      {checkoutResult.order.balanceApplied > 0 && <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">已抵扣 {checkoutResult.order.balanceApplied} 余额</div>}
                    </div>
                  </div>
                  {checkoutResult.qrCodeUrl && (
                    <div className="mt-4 flex flex-col items-center rounded-xl bg-white p-4 dark:bg-gray-950">
                      <img src={checkoutResult.qrCodeUrl} alt="支付二维码" className="h-40 w-40 rounded-lg border border-gray-200 bg-white object-contain p-2" />
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">扫码完成支付后，订单会自动入账。</div>
                    </div>
                  )}
                  {checkoutResult.status === 'not_configured' && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                      {checkoutResult.message || '支付渠道尚未配置。订单已创建，管理员配置收银台后即可继续支付。'}
                    </div>
                  )}
                  {checkoutResult.status === 'balance_paid' && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                      {checkoutResult.message || '余额支付成功，套餐已自动入账。'}
                    </div>
                  )}
                  {checkoutResult.checkoutUrl && <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">支付链接已生成，将在新页面打开收银台。支付完成后可刷新确认状态。</div>}
                </div>
              )}

              <div className={`grid gap-2 ${checkoutResult?.checkoutUrl ? 'sm:grid-cols-2 xl:grid-cols-3' : checkoutResult ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                {!checkoutResult && (
                  <button type="button" onClick={() => void buyPlan()} disabled={buyingPlanId === checkoutPlan.id || (!canPayWithBalanceOnly && !enabledPaymentMethods.length)} className="flex-1 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">
                    {buyingPlanId === checkoutPlan.id ? '创建订单中...' : canPayWithBalanceOnly ? '使用余额购买' : '创建支付订单'}
                  </button>
                )}
                {checkoutResult && (
                  <button type="button" onClick={() => void refreshCheckoutOrder()} disabled={refreshingCheckoutOrder || orderRefreshRemainingSeconds > 0} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                    {refreshingCheckoutOrder ? '刷新中...' : orderRefreshRemainingSeconds > 0 ? `${orderRefreshRemainingSeconds}s 后可刷新` : '刷新订单状态'}
                  </button>
                )}
                {checkoutResult?.order.status === 'pending' && (
                  <button type="button" onClick={() => void cancelOrder(checkoutResult.order)} disabled={cancellingOrderId === checkoutResult.order.id} className="flex-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/20 dark:text-red-200 dark:hover:bg-red-500/10">
                    {cancellingOrderId === checkoutResult.order.id ? '取消中...' : '取消订单'}
                  </button>
                )}
                {checkoutResult?.checkoutUrl && (
                  <button type="button" onClick={openCheckoutUrl} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                    打开收银台
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
