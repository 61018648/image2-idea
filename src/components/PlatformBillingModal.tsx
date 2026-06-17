import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { createPlatformCheckout, createPlatformOrder, getPlatformAdminStats, getPlatformBalance, getPlatformLedger, getPlatformMe, getPlatformPlans, listPlatformOrders, notifyDevPlatformPayment } from '../lib/platformAccountApi'
import type { PlatformAdminStatsResponse, PlatformBalanceResponse, PlatformGenerationJobResponse, PlatformLedgerEntryResponse, PlatformOrderResponse, PlatformPlanResponse, PlatformUserInfo } from '../lib/platformApiContracts'
import { logoutPlatformUser } from '../lib/platformAuthApi'
import { listPlatformGenerations } from '../lib/platformGenerationApi'
import { useStore } from '../store'
import { CodeIcon, HistoryIcon, RefreshIcon, SettingsIcon } from './icons'

type BillingTab = 'overview' | 'plans' | 'orders' | 'jobs' | 'ledger' | 'ops'

interface PlatformBillingModalProps {
  baseUrl: string
  onClose: () => void
}

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

function formatPlanPrice(plan: PlatformPlanResponse): string {
  return formatPrice(plan.priceCents, plan.currency)
}

function formatLedgerType(type: PlatformLedgerEntryResponse['type']): string {
  if (type === 'purchase') return '购买'
  if (type === 'debit') return '扣费'
  if (type === 'refund') return '退款'
  if (type === 'grant') return '赠送'
  return '调整'
}

function formatJobStatus(status: PlatformGenerationJobResponse['status']): string {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '生成中'
  if (status === 'succeeded') return '已完成'
  if (status === 'failed') return '失败'
  return '已取消'
}

function formatOrderStatus(status: PlatformOrderResponse['status']): string {
  if (status === 'paid') return '已支付'
  if (status === 'cancelled') return '已取消'
  if (status === 'expired') return '已过期'
  return '待支付'
}

function formatOrderProvider(provider: PlatformOrderResponse['provider']): string {
  if (provider === 'stripe') return 'Stripe'
  if (provider === 'wechat') return '微信'
  if (provider === 'alipay') return '支付宝'
  return '开发态'
}

function formatDateTime(value?: string): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function getUnitPrice(plan: PlatformPlanResponse): string {
  if (!plan.credits) return '-'
  return `${(plan.priceCents / plan.credits / 100).toFixed(3)} ${plan.currency}/credit`
}

function StatusPill({ children, tone = 'gray' }: { children: string; tone?: 'gray' | 'green' | 'blue' | 'amber' | 'red' }) {
  const className = {
    gray: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200',
  }[tone]
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-5 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="font-semibold text-gray-800 dark:text-gray-100">{title}</div>
      <div className="mt-1 text-gray-500 dark:text-gray-400">{body}</div>
    </div>
  )
}

export default function PlatformBillingModal({ baseUrl, onClose }: PlatformBillingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const showToast = useStore((s) => s.showToast)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const [tab, setTab] = useState<BillingTab>('overview')
  const [user, setUser] = useState<PlatformUserInfo | null>(null)
  const [balance, setBalance] = useState<PlatformBalanceResponse['balance'] | null>(null)
  const [plans, setPlans] = useState<PlatformPlanResponse[]>([])
  const [ledger, setLedger] = useState<PlatformLedgerEntryResponse[]>([])
  const [orders, setOrders] = useState<PlatformOrderResponse[]>([])
  const [jobs, setJobs] = useState<PlatformGenerationJobResponse[]>([])
  const [adminStats, setAdminStats] = useState<PlatformAdminStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [workingPlanId, setWorkingPlanId] = useState<string | null>(null)
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  const refresh = async () => {
    setError(null)
    const [meResponse, balanceResponse, plansResponse, ledgerResponse, ordersResponse, jobsResponse] = await Promise.all([
      getPlatformMe(baseUrl),
      getPlatformBalance(baseUrl),
      getPlatformPlans(baseUrl),
      getPlatformLedger(baseUrl, 40),
      listPlatformOrders(baseUrl, 30),
      listPlatformGenerations({ baseUrl }),
    ])
    setUser(meResponse.user)
    setBalance(balanceResponse.balance)
    setPlans(plansResponse.plans.filter((plan) => plan.enabled))
    setLedger(ledgerResponse.entries)
    setOrders(ordersResponse.orders)
    setJobs(jobsResponse.jobs)
    setAdminStats(await getPlatformAdminStats(baseUrl).catch(() => null))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refresh()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl])

  const planStats = useMemo(() => {
    const recommended = plans.reduce<PlatformPlanResponse | null>((best, plan) => (!best || plan.credits > best.credits ? plan : best), null)
    const paidOrders = orders.filter((order) => order.status === 'paid')
    return {
      recommended,
      paidOrders,
      totalPurchasedCredits: paidOrders.reduce((sum, order) => sum + order.credits, 0),
      totalPaidCents: paidOrders.reduce((sum, order) => sum + order.amountCents, 0),
    }
  }, [orders, plans])

  const handleLogout = async () => {
    try {
      await logoutPlatformUser(baseUrl)
      window.dispatchEvent(new Event('platform-billing-updated'))
      showToast('已退出平台账号', 'success')
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    }
  }

  const handleCreateDevOrder = async (plan: PlatformPlanResponse) => {
    setWorkingPlanId(plan.id)
    try {
      const { order } = await createPlatformOrder(baseUrl, { planId: plan.id, provider: 'dev' })
      await notifyDevPlatformPayment(baseUrl, {
        provider: 'dev',
        providerEventId: `evt-dev-${order.id}`,
        orderId: order.id,
        paidAmountCents: order.amountCents,
      })
      await refresh()
      window.dispatchEvent(new Event('platform-billing-updated'))
      showToast(`已购买 ${plan.credits} credits`, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    } finally {
      setWorkingPlanId(null)
    }
  }

  const handleCreateCheckout = async (plan: PlatformPlanResponse) => {
    setWorkingPlanId(plan.id)
    try {
      const { checkout } = await createPlatformCheckout(baseUrl, { planId: plan.id, provider: 'stripe' })
      await refresh()
      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl
        return
      }
      const message = checkout.message || '真实支付收银台待接入'
      setCheckoutNotice(message)
      showToast(message, 'info')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(message, 'error')
    } finally {
      setWorkingPlanId(null)
    }
  }

  const tabs: Array<{ id: BillingTab; label: string }> = [
    { id: 'overview', label: '概览' },
    { id: 'plans', label: '套餐' },
    { id: 'orders', label: '订单' },
    { id: 'jobs', label: '任务' },
    { id: 'ledger', label: '流水' },
    ...(adminStats ? [{ id: 'ops' as const, label: '运营' }] : []),
  ]

  const renderPlanButton = (plan: PlatformPlanResponse) => {
    const busy = workingPlanId === plan.id
    if (user?.mode === 'development') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleCreateDevOrder(plan)}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? '处理中...' : '开发态购买'}
        </button>
      )
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => handleCreateCheckout(plan)}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
      >
        {busy ? '处理中...' : '购买套餐'}
      </button>
    )
  }

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[105] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 grid max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950/95 dark:ring-white/10 lg:grid-cols-[240px_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="border-b border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3 lg:block">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">Billing</div>
              <h3 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">计费中心</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">余额、套餐、订单和任务都在这里闭环。</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200 lg:hidden"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/80 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="text-xs text-gray-500 dark:text-gray-400">当前余额</div>
            <div className="mt-1 text-4xl font-semibold text-gray-950 dark:text-white">{balance?.availableCredits ?? 0}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">credits</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone={user?.mode === 'development' ? 'amber' : 'blue'}>{user?.mode === 'development' ? '开发模式' : '真实账号'}</StatusPill>
              {adminStats ? <StatusPill tone="green">管理员</StatusPill> : null}
            </div>
          </div>

          <nav className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${tab === item.id ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-4 hidden space-y-2 lg:block">
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              <RefreshIcon className="h-4 w-4" />
              刷新数据
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              <SettingsIcon className="h-4 w-4" />
              平台设置
            </button>
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4 custom-scrollbar sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold text-gray-950 dark:text-white">钱包与运营面板</h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {user?.email ? user.email : user?.id ?? '未知用户'} · {orders.length} 个订单 · {jobs.length} 个任务
              </p>
            </div>
            <div className="flex items-center gap-2">
              {user?.mode === 'authenticated' && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                >
                  退出
                </button>
              )}
              <button
                onClick={onClose}
                className="hidden rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200 lg:block"
                aria-label="关闭"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {checkoutNotice && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              {checkoutNotice}。订单已创建，接入真实支付后会跳转到收银台。
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">正在加载计费数据...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div>
          ) : (
            <div className="space-y-5">
              {tab === 'overview' && (
                <>
                  <section className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-300">可用余额</div>
                      <div className="mt-2 text-3xl font-semibold text-blue-700 dark:text-blue-100">{balance?.availableCredits ?? 0}</div>
                      <div className="mt-1 text-xs text-blue-600/70 dark:text-blue-200/70">credits</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">已购积分</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{planStats.totalPurchasedCredits}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">累计充值</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">支付金额</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{formatPrice(planStats.totalPaidCents, orders[0]?.currency ?? 'USD')}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">已支付订单</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">平台任务</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{jobs.length}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">最近 50 条</div>
                    </div>
                  </section>

                  <section className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-gray-950 dark:text-white">推荐充值</h5>
                        <button className="text-xs font-semibold text-blue-600 dark:text-blue-300" onClick={() => setTab('plans')}>查看套餐</button>
                      </div>
                      {planStats.recommended ? (
                        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold text-gray-950 dark:text-white">{planStats.recommended.name}</div>
                              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{planStats.recommended.credits} credits · {getUnitPrice(planStats.recommended)}</div>
                            </div>
                            <div className="text-right text-lg font-semibold text-gray-950 dark:text-white">{formatPlanPrice(planStats.recommended)}</div>
                          </div>
                          {renderPlanButton(planStats.recommended)}
                        </div>
                      ) : (
                        <EmptyState title="暂无可售套餐" body="请在后端配置套餐后再开放购买。" />
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-gray-950 dark:text-white">最近任务</h5>
                        <button className="text-xs font-semibold text-blue-600 dark:text-blue-300" onClick={() => setTab('jobs')}>查看任务</button>
                      </div>
                      {jobs.length ? jobs.slice(0, 3).map((job) => (
                        <div key={job.id} className="border-b border-gray-100 py-3 last:border-b-0 dark:border-white/[0.06]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{job.request?.prompt || job.id}</div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(job.createdAt)} · {job.costCredits} credits</div>
                            </div>
                            <StatusPill tone={job.status === 'succeeded' ? 'green' : job.status === 'failed' ? 'red' : 'amber'}>{formatJobStatus(job.status)}</StatusPill>
                          </div>
                        </div>
                      )) : <EmptyState title="暂无平台任务" body="使用平台模式提交生图后，任务会在这里显示。" />}
                    </div>
                  </section>
                </>
              )}

              {tab === 'plans' && (
                <section className="grid gap-4 md:grid-cols-3">
                  {plans.length ? plans.map((plan) => (
                    <div key={plan.id} className={`rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${plan.id === planStats.recommended?.id ? 'border-blue-300 shadow-sm dark:border-blue-500/30' : 'border-gray-200 dark:border-white/[0.08]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold text-gray-950 dark:text-white">{plan.name}</div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{plan.id}</div>
                        </div>
                        {plan.id === planStats.recommended?.id ? <StatusPill tone="blue">推荐</StatusPill> : null}
                      </div>
                      <div className="mt-5 text-4xl font-semibold text-gray-950 dark:text-white">{plan.credits}</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">credits</div>
                      <div className="mt-4 rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
                        <div className="text-lg font-semibold text-gray-950 dark:text-white">{formatPlanPrice(plan)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{getUnitPrice(plan)}</div>
                      </div>
                      {renderPlanButton(plan)}
                    </div>
                  )) : <EmptyState title="暂无可售套餐" body="后端暂未返回启用状态的套餐。" />}
                </section>
              )}

              {tab === 'orders' && (
                <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {orders.length ? orders.map((order) => (
                    <div key={order.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-white/[0.06] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-gray-950 dark:text-white">{formatOrderStatus(order.status)}</div>
                          <StatusPill tone={order.status === 'paid' ? 'green' : 'amber'}>{formatOrderProvider(order.provider)}</StatusPill>
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{order.id} · {formatDateTime(order.createdAt)}</div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-sm font-semibold text-gray-950 dark:text-white">{formatPrice(order.amountCents, order.currency)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{order.credits} credits</div>
                      </div>
                    </div>
                  )) : <EmptyState title="暂无订单" body="购买套餐后，订单会保存在这里。" />}
                </section>
              )}

              {tab === 'jobs' && (
                <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {jobs.length ? jobs.map((job) => (
                    <div key={job.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-white/[0.06] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-medium text-gray-950 dark:text-white">{job.request?.prompt || job.id}</div>
                          <StatusPill tone={job.status === 'succeeded' ? 'green' : job.status === 'failed' ? 'red' : 'amber'}>{formatJobStatus(job.status)}</StatusPill>
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{job.id} · {formatDateTime(job.createdAt)}</div>
                        {job.errorMessage && <div className="mt-2 text-xs text-red-600 dark:text-red-300">{job.errorMessage}</div>}
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-sm font-semibold text-gray-950 dark:text-white">{job.costCredits} credits</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{job.images.length} 张图</div>
                      </div>
                    </div>
                  )) : <EmptyState title="暂无平台任务" body="提交平台托管生图后会生成任务记录。" />}
                </section>
              )}

              {tab === 'ledger' && (
                <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {ledger.length ? ledger.map((entry) => (
                    <div key={entry.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-white/[0.06] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-950 dark:text-white">{formatLedgerType(entry.type)}</div>
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{entry.description || entry.source} · {formatDateTime(entry.createdAt)}</div>
                      </div>
                      <div className={`text-left text-lg font-semibold sm:text-right ${entry.amount >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-100'}`}>
                        {entry.amount > 0 ? '+' : ''}{entry.amount}
                        <div className="text-xs font-normal text-gray-500 dark:text-gray-400">余额 {entry.balanceAfter}</div>
                      </div>
                    </div>
                  )) : <EmptyState title="暂无流水" body="充值、扣费和退款会记录为积分流水。" />}
                </section>
              )}

              {tab === 'ops' && adminStats && (
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">用户</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{adminStats.billing.users}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">订单</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{adminStats.billing.orders}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">收入</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{formatPrice(adminStats.billing.revenueCents, orders[0]?.currency ?? 'USD')}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-xs text-gray-500 dark:text-gray-400">任务</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{adminStats.jobs.total}</div>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <h5 className="text-sm font-semibold text-gray-950 dark:text-white">积分流向</h5>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">已发放</span><span className="font-semibold text-emerald-600">{adminStats.billing.creditsIssued}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">已扣减</span><span className="font-semibold text-gray-950 dark:text-white">{adminStats.billing.creditsDebited}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">平台余额</span><span className="font-semibold text-gray-950 dark:text-white">{adminStats.billing.availableCredits}</span></div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <h5 className="text-sm font-semibold text-gray-950 dark:text-white">任务状态</h5>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><HistoryIcon className="mb-2 h-4 w-4 text-gray-500" />排队 {adminStats.jobs.queued}</div>
                        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><RefreshIcon className="mb-2 h-4 w-4 text-gray-500" />运行 {adminStats.jobs.running}</div>
                        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><CodeIcon className="mb-2 h-4 w-4 text-gray-500" />成功 {adminStats.jobs.succeeded}</div>
                        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><CodeIcon className="mb-2 h-4 w-4 text-gray-500" />失败 {adminStats.jobs.failed}</div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>,
    document.body,
  )
}
