import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import {
  createPlatformCheckout,
  getPlatformAdminStats,
  getPlatformBalance,
  getPlatformLedger,
  getPlatformMe,
  getPlatformPackages,
  getPlatformPlans,
  listPlatformOrders,
  updatePlatformMe,
} from '../lib/platformAccountApi'
import type {
  PlatformAdminStatsResponse,
  PlatformBalanceResponse,
  PlatformLedgerEntryResponse,
  PlatformMeResponse,
  PlatformOrderResponse,
  PlatformPlanResponse,
  PlatformUserPlanPackageResponse,
} from '../lib/platformApiContracts'
import { getPlatformAuthSession, logoutPlatformUser } from '../lib/platformAuthApi'
import { useStore } from '../store'
import { CloseIcon, CodeIcon, CopyIcon, HistoryIcon, LinkIcon, SettingsIcon, UserIcon } from './icons'

type UserCenterTab = 'overview' | 'plans' | 'orders' | 'ledger' | 'admin'

interface UserCenterData {
  me: PlatformMeResponse | null
  balance: PlatformBalanceResponse['balance'] | null
  plans: PlatformPlanResponse[]
  packages: PlatformUserPlanPackageResponse[]
  orders: PlatformOrderResponse[]
  ledger: PlatformLedgerEntryResponse[]
  adminStats: PlatformAdminStatsResponse | null
}

const EMPTY_DATA: UserCenterData = {
  me: null,
  balance: null,
  plans: [],
  packages: [],
  orders: [],
  ledger: [],
  adminStats: null,
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
  const showToast = useStore((s) => s.showToast)
  const activeProfile = getActiveApiProfile(settings)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<UserCenterTab>('overview')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
  const [checkoutPlan, setCheckoutPlan] = useState<PlatformPlanResponse | null>(null)
  const [checkoutPaymentType, setCheckoutPaymentType] = useState<'alipay' | 'wxpay' | 'qqpay'>('alipay')
  const [checkoutResult, setCheckoutResult] = useState<{ order: PlatformOrderResponse; checkoutUrl?: string; message?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<UserCenterData>(EMPTY_DATA)
  const [profileDraft, setProfileDraft] = useState({ displayName: '', email: '', phone: '', avatarUrl: '' })

  const isAdmin = data.me?.user.mode === 'development' || data.me?.user.role === 'admin'
  const avatarUrl = profileDraft.avatarUrl || data.me?.account.avatarUrl || ''

  const tabs = useMemo(() => {
    const items: Array<{ id: UserCenterTab; label: string; description: string; icon: ReactNode }> = [
      { id: 'overview', label: '账号资料', description: '资料、积分与账号状态', icon: <UserIcon className="h-4 w-4" /> },
      { id: 'plans', label: '套餐订阅', description: '选择次数包并购买订阅', icon: <LinkIcon className="h-4 w-4" /> },
      { id: 'orders', label: '订单记录', description: '充值与支付记录', icon: <HistoryIcon className="h-4 w-4" /> },
      { id: 'ledger', label: '积分流水', description: '积分变动明细', icon: <HistoryIcon className="h-4 w-4" /> },
    ]
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
      const [me, balance, plans, packagesResponse, orders, ledger, adminStats] = await Promise.all([
        getPlatformMe(activeProfile.baseUrl),
        getPlatformBalance(activeProfile.baseUrl),
        getPlatformPlans(activeProfile.baseUrl),
        getPlatformPackages(activeProfile.baseUrl),
        listPlatformOrders(activeProfile.baseUrl, 50),
        getPlatformLedger(activeProfile.baseUrl, 50),
        getPlatformAdminStats(activeProfile.baseUrl).catch(() => null),
      ])
      setData({ me, balance: balance.balance, plans: plans.plans, packages: packagesResponse.packages, orders: orders.orders, ledger: ledger.entries, adminStats })
      setProfileDraft({
        displayName: me.account.displayName ?? '',
        email: me.user.email ?? '',
        phone: me.account.phone ?? '',
        avatarUrl: me.account.avatarUrl ?? '',
      })
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
    setBuyingPlanId(checkoutPlan.id)
    try {
      const response = await createPlatformCheckout(activeProfile.baseUrl, { planId: checkoutPlan.id, provider: 'epay', paymentType: checkoutPaymentType })
      setCheckoutResult({ order: response.order, checkoutUrl: response.checkout.checkoutUrl, message: response.checkout.message })
      showToast(response.checkout.checkoutUrl ? '支付链接已生成' : response.checkout.message || '订单已创建，支付渠道待配置', response.checkout.checkoutUrl ? 'success' : 'info')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBuyingPlanId(null)
    }
  }

  const copyOrderId = async (orderId: string) => {
    try {
      await copyTextToClipboard(orderId)
      showToast('订单号已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制订单号失败', err), 'error')
    }
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
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? { id: 'overview', label: '账号资料', description: '资料、积分与账号状态', icon: null }

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
              <StatCard label="积分" value={loading ? '...' : data.balance?.availableCredits ?? 0} hint="可用于按次扣费" />
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
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看当前账号状态、积分和套餐次数。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="可用积分" value={loading ? '...' : data.balance?.availableCredits ?? 0} hint="无套餐次数时按次扣费" />
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
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">生图会优先扣除套餐包次数，用完后再按积分扣费。</p>
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
                  const featured = index === 1 || (data.plans.length === 1 && index === 0)
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
                            <p className={`mt-2 text-sm ${featured ? 'text-white/72' : 'text-gray-500 dark:text-gray-400'}`}>适合稳定创作、批量出图与商业项目交付。</p>
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
                          <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${featured ? 'bg-blue-200' : 'bg-blue-500'}`} />优先扣套餐次数，用完扣积分</div>
                          <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${featured ? 'bg-blue-200' : 'bg-blue-500'}`} />适配商业创作工作流</div>
                        </div>

                        <button
                          type="button"
                          disabled={!plan.enabled || buyingPlanId === plan.id}
                          onClick={() => {
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
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatOrderStatus(order.status)}</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.orders.length && <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">暂无订单</div>}
              </div>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-950 dark:text-white">积分流水</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看积分充值、扣费、退款和调整记录。</p>
              </div>
              <div className="space-y-2">
                {data.ledger.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-gray-950 dark:text-white">{formatLedgerType(entry.type)} · {entry.amount > 0 ? '+' : ''}{entry.amount}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.description || entry.source} · {formatDate(entry.createdAt)}</div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">积分 {entry.balanceAfter}</div>
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
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看收入、用户、任务和积分池指标。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label="累计收入" value={loading ? '...' : formatMoney(data.adminStats?.billing.revenueCents ?? 0)} hint={`${data.adminStats?.billing.paidOrders ?? 0} 笔已支付`} />
                <StatCard label="用户数" value={loading ? '...' : data.adminStats?.billing.users ?? 0} hint="平台账号" />
                <StatCard label="平台任务" value={loading ? '...' : data.adminStats?.jobs.total ?? 0} hint={`${data.adminStats?.jobs.running ?? 0} 运行中`} />
                <StatCard label="异常队列" value={loading ? '...' : `${data.adminStats?.jobs.queued ?? 0} 排队 / ${data.adminStats?.jobs.failed ?? 0} 失败`} hint="任务状态" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="累计发放" value={data.adminStats?.billing.creditsIssued ?? 0} />
                <StatCard label="累计消耗" value={data.adminStats?.billing.creditsDebited ?? 0} />
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
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-gray-950">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">选择支付方式</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{checkoutPlan.name} · {formatMoney(checkoutPlan.priceCents, 'CNY')}</p>
              </div>
              <button type="button" onClick={() => setCheckoutPlan(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['alipay', '支付宝'],
                  ['wxpay', '微信'],
                  ['qqpay', 'QQ 钱包'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCheckoutPaymentType(value)}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${checkoutPaymentType === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/15 dark:text-blue-100' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {checkoutResult && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{checkoutResult.order.id}</span>
                    <button type="button" onClick={() => void copyOrderId(checkoutResult.order.id)} className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white" title="复制订单号">
                      <CopyIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {checkoutResult.message && <div className="mt-2 text-xs text-amber-600 dark:text-amber-200">{checkoutResult.message}</div>}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => void buyPlan()} disabled={buyingPlanId === checkoutPlan.id} className="flex-1 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">
                  {buyingPlanId === checkoutPlan.id ? '生成中...' : '生成支付链接'}
                </button>
                {checkoutResult?.checkoutUrl && (
                  <button type="button" onClick={() => window.location.href = checkoutResult.checkoutUrl!} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                    去支付
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
