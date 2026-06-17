import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { createPlatformCheckout, createPlatformOrder, getPlatformAdminStats, getPlatformBalance, getPlatformLedger, getPlatformMe, getPlatformPlans, listPlatformOrders, notifyDevPlatformPayment } from '../lib/platformAccountApi'
import type { PlatformAdminStatsResponse, PlatformBalanceResponse, PlatformGenerationJobResponse, PlatformLedgerEntryResponse, PlatformOrderResponse, PlatformPlanResponse, PlatformUserInfo } from '../lib/platformApiContracts'
import { logoutPlatformUser } from '../lib/platformAuthApi'
import { listPlatformGenerations } from '../lib/platformGenerationApi'
import { useStore } from '../store'

interface PlatformBillingModalProps {
  baseUrl: string
  onClose: () => void
}

function formatPrice(plan: PlatformPlanResponse): string {
  return `${(plan.priceCents / 100).toFixed(2)} ${plan.currency}`
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

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function PlatformBillingModal({ baseUrl, onClose }: PlatformBillingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const showToast = useStore((s) => s.showToast)
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
    const [meResponse, balanceResponse, plansResponse, ledgerResponse, ordersResponse, jobsResponse, statsResponse] = await Promise.all([
      getPlatformMe(baseUrl),
      getPlatformBalance(baseUrl),
      getPlatformPlans(baseUrl),
      getPlatformLedger(baseUrl, 20),
      listPlatformOrders(baseUrl, 10),
      listPlatformGenerations({ baseUrl }),
      getPlatformAdminStats(baseUrl),
    ])
    setUser(meResponse.user)
    setBalance(balanceResponse.balance)
    setPlans(plansResponse.plans.filter((plan) => plan.enabled))
    setLedger(ledgerResponse.entries)
    setOrders(ordersResponse.orders)
    setJobs(jobsResponse.jobs)
    setAdminStats(statsResponse)
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
      showToast(`已购买 ${plan.credits} 积分`, 'success')
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

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[105] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">平台账单中心</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">余额、套餐和积分流水</p>
          </div>
          <div className="flex items-center gap-2">
            {user?.mode === 'authenticated' && (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              >
                退出
              </button>
            )}
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
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">正在加载平台账单...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">商业化平台 MVP 已启用</div>
                    <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-100/75">
                      已接入用户会话、积分余额、套餐订单、任务扣费、最近订单和支付收银台占位。
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-white/10 dark:text-amber-100">
                    {user?.mode === 'development' ? '开发模式' : '真实账号'}
                  </div>
                </div>
                {checkoutNotice && (
                  <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-400/20 dark:bg-white/[0.06] dark:text-amber-100">
                    {checkoutNotice}。当前已创建待支付订单，后续接入 Stripe / 微信 / 支付宝后会跳转到真实收银台。
                  </div>
                )}
              </section>

              <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">用户数</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{adminStats?.billing.users ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">订单数</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{adminStats?.billing.orders ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">已支付</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{adminStats?.billing.paidOrders ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">收入</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{((adminStats?.billing.revenueCents ?? 0) / 100).toFixed(2)}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{orders[0]?.currency ?? 'USD'}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">任务</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{adminStats?.jobs.total ?? jobs.length}</div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-300">当前余额</div>
                  <div className="mt-2 text-3xl font-bold text-blue-700 dark:text-blue-100">{balance?.availableCredits ?? 0}</div>
                  <div className="mt-1 text-xs text-blue-600/70 dark:text-blue-200/70">credits</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">平台用户</div>
                  <div className="mt-2 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{user?.id ?? '未知用户'}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">模式：{user?.mode === 'development' ? '开发态' : '已认证'}</div>
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">套餐</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <div key={plan.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{plan.name}</div>
                      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{plan.credits}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">credits / {formatPrice(plan)}</div>
                      {user?.mode === 'development' ? (
                        <button
                          type="button"
                          disabled={workingPlanId === plan.id}
                          onClick={() => handleCreateDevOrder(plan)}
                          className="mt-4 w-full rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {workingPlanId === plan.id ? '处理中...' : '开发态购买'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={workingPlanId === plan.id}
                          onClick={() => handleCreateCheckout(plan)}
                          className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                        >
                          {workingPlanId === plan.id ? '处理中...' : user?.mode === 'development' ? '开发态购买' : '购买'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">最近订单</h4>
                <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {orders.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">暂无订单</div>
                  ) : orders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-white/[0.06]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatOrderStatus(order.status)}</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{formatOrderProvider(order.provider)} · {order.credits} credits</div>
                        <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{formatDateTime(order.createdAt)}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                        <div>{(order.amountCents / 100).toFixed(2)} {order.currency}</div>
                        <div className="mt-1 font-mono text-[10px] text-gray-400">{order.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">最近平台任务</h4>
                <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {jobs.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">暂无平台任务</div>
                  ) : jobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-white/[0.06]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatJobStatus(job.status)}</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{job.request?.prompt || job.id}</div>
                        <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{formatDateTime(job.createdAt)} · {job.costCredits} credits</div>
                      </div>
                      <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {job.images.length > 0 ? `${job.images.length} 张` : '无图'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">最近流水</h4>
                <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
                  {ledger.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">暂无流水</div>
                  ) : ledger.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-white/[0.06]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatLedgerType(entry.type)}</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{entry.description || entry.source}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-semibold ${entry.amount >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-200'}`}>
                        {entry.amount > 0 ? '+' : ''}{entry.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
