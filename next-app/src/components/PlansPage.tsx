import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import {
  cancelPlatformOrder,
  createPlatformCheckout,
  getPlatformBalance,
  getPlatformOrder,
  getPlatformPlans,
  getPlatformPublicConfig,
  listPlatformOrders,
  resumePlatformCheckout,
} from '../lib/platformAccountApi'
import type { PlatformBalanceResponse, PlatformOrderResponse, PlatformPlanResponse, PlatformPublicConfigResponse } from '../lib/platformApiContracts'
import { getPlatformAuthSession } from '../lib/platformAuthApi'
import { toUserFacingErrorMessage } from '../lib/userFacingErrors'
import { useStore } from '../store'
import { CloseIcon, LinkIcon } from './icons'

type CheckoutPaymentType = 'alipay' | 'wxpay' | 'qqpay'
const DEFAULT_PAYMENT_TYPES: CheckoutPaymentType[] = ['alipay']
const ORDER_REFRESH_COOLDOWN_MS = 10_000
const PAYMENT_METHODS: Array<{ value: CheckoutPaymentType; label: string; iconClassName: string; mark: string }> = [
  { value: 'alipay', label: '支付宝', iconClassName: 'bg-[#1677ff] text-white', mark: '支' },
  { value: 'wxpay', label: '微信支付', iconClassName: 'bg-[#07c160] text-white', mark: '微' },
  { value: 'qqpay', label: 'QQ 钱包', iconClassName: 'bg-gray-950 text-white dark:bg-white dark:text-gray-950', mark: 'Q' },
]

interface CheckoutState {
  order: PlatformOrderResponse
  status?: 'not_configured' | 'redirect' | 'qr_code' | 'balance_paid'
  checkoutUrl?: string
  qrCodeUrl?: string
  message?: string
}

function formatMoney(cents: number, currency: 'USD' | 'CNY' = 'CNY') {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'CNY' ? 0 : 2,
    maximumFractionDigits: currency === 'CNY' ? 0 : 2,
  }).format(cents / 100)
}

function formatOrderStatus(status: PlatformOrderResponse['status']) {
  if (status === 'paid') return '已支付'
  if (status === 'cancelled') return '已取消'
  if (status === 'expired') return '已过期'
  return '待支付'
}

function orderStatusTone(status: PlatformOrderResponse['status']) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
  if (status === 'pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
}

export default function PlansPage() {
  const settings = useStore((s) => s.settings)
  const setAppMode = useStore((s) => s.setAppMode)
  const showToast = useStore((s) => s.showToast)
  const activeProfile = getActiveApiProfile(settings)
  const paidOrderToastRef = useRef<string | null>(null)
  const lastOrderRefreshAtRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<PlatformPlanResponse[]>([])
  const [orders, setOrders] = useState<PlatformOrderResponse[]>([])
  const [balance, setBalance] = useState<PlatformBalanceResponse['balance'] | null>(null)
  const [publicConfig, setPublicConfig] = useState<PlatformPublicConfigResponse['config'] | null>(null)
  const [checkoutPlan, setCheckoutPlan] = useState<PlatformPlanResponse | null>(null)
  const [checkoutPaymentType, setCheckoutPaymentType] = useState<CheckoutPaymentType>('alipay')
  const [checkoutResult, setCheckoutResult] = useState<CheckoutState | null>(null)
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [refreshingOrder, setRefreshingOrder] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const pendingOrder = orders.find((order) => order.status === 'pending') ?? null
  const enabledPaymentTypes = (publicConfig?.epayPaymentTypes?.length ? publicConfig.epayPaymentTypes : DEFAULT_PAYMENT_TYPES) as CheckoutPaymentType[]
  const enabledPaymentMethods = PAYMENT_METHODS.filter((method) => enabledPaymentTypes.includes(method.value))
  const balanceUnitCents = Math.max(1, publicConfig?.balanceUnitCents ?? 100)
  const availableBalance = balance?.availableCredits ?? 0
  const estimatedBalanceApplied = checkoutPlan ? Math.max(0, Math.min(availableBalance, Math.floor(checkoutPlan.priceCents / balanceUnitCents))) : 0
  const estimatedBalanceAppliedCents = estimatedBalanceApplied * balanceUnitCents
  const estimatedPayableCents = checkoutPlan ? Math.max(0, checkoutPlan.priceCents - estimatedBalanceAppliedCents) : 0
  const canPayWithBalanceOnly = Boolean(checkoutPlan && estimatedPayableCents === 0)
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000))
  const recommendedPlanId = useMemo(() => plans.reduce<PlatformPlanResponse | null>((best, plan) => (!best || plan.credits > best.credits ? plan : best), null)?.id ?? null, [plans])

  const refresh = async () => {
    if (activeProfile.provider !== 'platform') {
      setAppMode('auth')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await getPlatformAuthSession(activeProfile.baseUrl)
      const [plansResponse, ordersResponse, balanceResponse, configResponse] = await Promise.all([
        getPlatformPlans(activeProfile.baseUrl),
        listPlatformOrders(activeProfile.baseUrl, 20),
        getPlatformBalance(activeProfile.baseUrl),
        getPlatformPublicConfig(activeProfile.baseUrl).catch(() => null),
      ])
      setPlans(plansResponse.plans.filter((plan) => plan.enabled))
      setOrders(ordersResponse.orders)
      setBalance(balanceResponse.balance)
      setPublicConfig(configResponse?.config ?? null)
    } catch (err) {
      const message = toUserFacingErrorMessage(err)
      if (/请先登录/.test(message)) {
        window.history.pushState(null, '', '/auth')
        setAppMode('auth')
        return
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (window.location.pathname !== '/plans') window.history.replaceState(null, '', '/plans')
    void refresh()
  }, [activeProfile.baseUrl, activeProfile.provider])

  useEffect(() => {
    if (cooldownUntil <= nowMs) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [cooldownUntil, nowMs])

  useEffect(() => {
    if (!enabledPaymentTypes.includes(checkoutPaymentType)) setCheckoutPaymentType(enabledPaymentTypes[0] ?? 'alipay')
  }, [checkoutPaymentType, enabledPaymentTypes])

  const openUserOrders = () => {
    window.history.pushState(null, '', '/user?tab=orders')
    setAppMode('user-center')
  }

  const resumePendingCheckout = async (order: PlatformOrderResponse) => {
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
      showToast(toUserFacingErrorMessage(err), 'error')
    }
  }

  const openCheckout = (plan: PlatformPlanResponse) => {
    if (pendingOrder) {
      setCheckoutPlan(plans.find((item) => item.id === pendingOrder.planId) ?? plan)
      setCheckoutResult({ order: pendingOrder, message: '当前已有待支付订单，请先完成支付或取消后再购买新套餐。' })
      showToast('你还有待支付订单，请先完成支付或取消订单', 'info')
      void resumePendingCheckout(pendingOrder)
      return
    }
    setCheckoutPlan(plan)
    setCheckoutResult(null)
    setCheckoutPaymentType(enabledPaymentTypes[0] ?? 'alipay')
  }

  const createCheckout = async () => {
    if (!checkoutPlan) return
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
      showToast(response.checkout.status === 'balance_paid' ? '余额支付成功，套餐已入账' : response.checkout.checkoutUrl ? '支付订单已创建' : response.checkout.message || '订单已创建', response.checkout.status === 'balance_paid' || response.checkout.checkoutUrl ? 'success' : 'info')
      await refresh()
    } catch (err) {
      showToast(toUserFacingErrorMessage(err), 'error')
    } finally {
      setBuyingPlanId(null)
    }
  }

  const refreshOrder = async (silent = false) => {
    if (!checkoutResult) return
    const now = Date.now()
    const nextAllowedAt = lastOrderRefreshAtRef.current + ORDER_REFRESH_COOLDOWN_MS
    if (now < nextAllowedAt) {
      setCooldownUntil(nextAllowedAt)
      if (!silent) showToast(`${Math.ceil((nextAllowedAt - now) / 1000)} 秒后可再次刷新`, 'info')
      return
    }
    lastOrderRefreshAtRef.current = now
    setNowMs(now)
    setCooldownUntil(now + ORDER_REFRESH_COOLDOWN_MS)
    if (!silent) setRefreshingOrder(true)
    try {
      const response = await getPlatformOrder(activeProfile.baseUrl, checkoutResult.order.id)
      setCheckoutResult((current) => current ? { ...current, order: response.order } : current)
      setOrders((current) => current.map((order) => order.id === response.order.id ? response.order : order))
      if (response.order.status === 'paid' && paidOrderToastRef.current !== response.order.id) {
        paidOrderToastRef.current = response.order.id
        showToast('支付已确认，套餐已入账', 'success')
        await refresh()
      } else if (!silent) {
        showToast('订单状态已刷新', 'info')
      }
    } catch (err) {
      if (!silent) showToast(toUserFacingErrorMessage(err), 'error')
    } finally {
      if (!silent) setRefreshingOrder(false)
    }
  }

  const openCheckoutUrl = () => {
    if (!checkoutResult?.checkoutUrl) return
    window.open(checkoutResult.checkoutUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => void refreshOrder(true), 10_000)
    window.setTimeout(() => void refreshOrder(true), 30_000)
  }

  const cancelOrder = async (order: PlatformOrderResponse) => {
    setCancellingOrderId(order.id)
    try {
      const response = await cancelPlatformOrder(activeProfile.baseUrl, order.id)
      setOrders((current) => current.map((item) => item.id === response.order.id ? response.order : item))
      setCheckoutResult((current) => current?.order.id === response.order.id ? { ...current, order: response.order } : current)
      showToast('订单已取消，可以重新购买套餐', 'success')
      await refresh()
    } catch (err) {
      showToast(toUserFacingErrorMessage(err), 'error')
    } finally {
      setCancellingOrderId(null)
    }
  }

  return (
    <main className="plans-page-enter safe-area-x mx-auto max-w-7xl px-4 pb-24 pt-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-[#f8f5ef] p-5 shadow-sm dark:border-white/[0.08] dark:bg-gray-950 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:42px_42px] dark:bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="inline-flex rounded-full border border-gray-900/10 bg-white/70 px-3 py-1 text-xs font-bold text-gray-700 shadow-sm backdrop-blur dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200">套餐充值中心</div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl">为持续创作购买余额与套餐</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-600 dark:text-gray-300">套餐次数会优先用于平台托管生图，用完后按后台配置从余额扣费。余额也可以抵扣套餐订单，减少第三方支付金额。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.05]">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">可用余额</div>
              <div className="mt-2 text-3xl font-black text-gray-950 dark:text-white">{loading ? '...' : availableBalance}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">可抵扣套餐与单次生图</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.05]">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">可售套餐</div>
              <div className="mt-2 text-3xl font-black text-gray-950 dark:text-white">{loading ? '...' : plans.length}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">后台启用后自动展示</div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div>}
      {pendingOrder && (
        <div className="plans-page-stagger mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">当前有待支付订单</div>
            <div className="mt-1">为避免重复下单，请先完成支付或取消订单后再购买新套餐。</div>
          </div>
          <button type="button" onClick={openUserOrders} className="rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950">查看订单</button>
        </div>
      )}

      <section className="plans-page-stagger mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = plan.id === recommendedPlanId || (plans.length === 1 && index === 0)
          const unitPrice = plan.credits > 0 ? plan.priceCents / 100 / plan.credits : 0
          return (
            <article key={plan.id} className={`group relative flex min-h-[330px] overflow-hidden rounded-[1.65rem] border p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${featured ? 'border-gray-950 bg-gray-950 text-white shadow-gray-950/20 dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 bg-white text-gray-950 dark:border-white/[0.08] dark:bg-gray-950 dark:text-white'}`}>
              <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-blue-500/15 blur-2xl" />
              <div className="relative flex w-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${featured ? 'bg-white/12 text-white ring-1 ring-white/15 dark:bg-gray-950/10 dark:text-gray-950 dark:ring-gray-950/10' : 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'}`}>
                      {featured ? '推荐套餐' : '标准套餐'}
                    </div>
                    <h2 className="text-xl font-black tracking-tight">{plan.name}</h2>
                    <p className={`mt-2 text-sm leading-6 ${featured ? 'text-white/68 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{plan.description || '?????????????????'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${featured ? 'bg-emerald-400/20 text-emerald-100 dark:bg-emerald-100 dark:text-emerald-700' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>可购买</span>
                </div>

                <div className="mt-8">
                  <div className="flex items-end gap-2">
                    <div className="text-4xl font-black tracking-tight">{formatMoney(plan.priceCents, plan.currency)}</div>
                    <div className={`pb-1 text-sm ${featured ? 'text-white/55 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>/ 套餐</div>
                  </div>
                  <div className={`mt-2 text-sm ${featured ? 'text-white/70 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>包含 {plan.credits.toLocaleString('zh-CN')} 次，约 ¥{unitPrice.toFixed(2)} / 次</div>
                </div>

                <div className={`mt-6 grid gap-2 border-t pt-5 text-sm ${featured ? 'border-white/15 text-white/78 dark:border-gray-950/10 dark:text-gray-700' : 'border-gray-200 text-gray-600 dark:border-white/[0.08] dark:text-gray-300'}`}>
                  <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />优先扣套餐次数</div>
                  <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />余额自动抵扣订单</div>
                  <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />生成失败自动退款</div>
                </div>

                <button type="button" disabled={Boolean(pendingOrder) || buyingPlanId === plan.id} onClick={() => openCheckout(plan)} className={`mt-auto rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${featured ? 'bg-white text-gray-950 hover:bg-blue-50 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800' : 'bg-gray-950 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}>
                  {pendingOrder ? '请先处理待支付订单' : buyingPlanId === plan.id ? '处理中...' : '立即购买'}
                </button>
              </div>
            </article>
          )
        })}
        {!loading && !plans.length && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400 md:col-span-2 xl:col-span-3">暂无可售套餐，请在后台启用套餐。</div>}
      </section>

      {checkoutPlan && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="plans-checkout-enter relative w-full max-w-2xl rounded-[1.5rem] border border-gray-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-gray-950">
            <div className="border-b border-gray-100 px-5 py-4 pr-16 dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-black text-gray-950 dark:text-white">确认订单</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{checkoutPlan.name} · {checkoutPlan.credits.toLocaleString('zh-CN')} 次生成</p>
              </div>
              <button type="button" onClick={() => { setCheckoutPlan(null); setCheckoutResult(null) }} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-white" aria-label="关闭">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="text-xs text-gray-500">套餐原价</div><div className="mt-1 font-black">{formatMoney(checkoutPlan.priceCents, checkoutPlan.currency)}</div></div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="text-xs text-gray-500">余额抵扣</div><div className="mt-1 font-black text-emerald-600">-{formatMoney(checkoutResult?.order.balanceAppliedCents ?? estimatedBalanceAppliedCents, checkoutPlan.currency)}</div></div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="text-xs text-gray-500">还需支付</div><div className="mt-1 font-black">{formatMoney(checkoutResult?.order.amountCents ?? estimatedPayableCents, checkoutPlan.currency)}</div></div>
              </div>

              {!canPayWithBalanceOnly && (
                <div className={`grid gap-2 ${enabledPaymentMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                  {enabledPaymentMethods.map(({ value, label, iconClassName, mark }) => (
                    <button key={value} type="button" onClick={() => setCheckoutPaymentType(value)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${checkoutPaymentType === value ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-black ${iconClassName}`}>{mark}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {checkoutResult && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatusTone(checkoutResult.order.status)}`}>{formatOrderStatus(checkoutResult.order.status)}</span>
                        <span className="font-mono text-xs text-gray-500">{checkoutResult.order.id}</span>
                      </div>
                      {checkoutResult.message && <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{checkoutResult.message}</div>}
                    </div>
                    <div className="text-left font-black sm:text-right">{formatMoney(checkoutResult.order.amountCents, checkoutResult.order.currency)}</div>
                  </div>
                  {checkoutResult.qrCodeUrl && <div className="mt-4 flex justify-center"><img src={checkoutResult.qrCodeUrl} alt="支付二维码" className="h-40 w-40 rounded-xl border border-gray-200 bg-white object-contain p-2" /></div>}
                </div>
              )}

              <div className={`grid gap-2 ${checkoutResult?.checkoutUrl ? 'sm:grid-cols-2 xl:grid-cols-3' : checkoutResult ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                {!checkoutResult && <button type="button" onClick={() => void createCheckout()} disabled={buyingPlanId === checkoutPlan.id || (!canPayWithBalanceOnly && !enabledPaymentMethods.length)} className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">{buyingPlanId === checkoutPlan.id ? '创建订单中...' : canPayWithBalanceOnly ? '使用余额购买' : '创建支付订单'}</button>}
                {checkoutResult && <button type="button" onClick={() => void refreshOrder()} disabled={refreshingOrder || cooldownSeconds > 0} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]">{refreshingOrder ? '刷新中...' : cooldownSeconds > 0 ? `${cooldownSeconds}s 后可刷新` : '刷新订单状态'}</button>}
                {checkoutResult?.order.status === 'pending' && <button type="button" onClick={() => void cancelOrder(checkoutResult.order)} disabled={cancellingOrderId === checkoutResult.order.id} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/20 dark:text-red-200 dark:hover:bg-red-500/10">{cancellingOrderId === checkoutResult.order.id ? '取消中...' : '取消订单'}</button>}
                {checkoutResult?.checkoutUrl && <button type="button" onClick={openCheckoutUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700"><LinkIcon className="h-4 w-4" />打开收银台</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
