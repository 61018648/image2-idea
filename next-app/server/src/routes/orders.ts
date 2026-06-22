import { readRequiredSession } from '../auth/session.js'
import { errorResponse, getQueryNumber, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { buildEpayCheckoutUrl, readEpayConfig } from '../payments/epay.js'
import { readPlatformConfig } from '../admin/configStore.js'

interface CreateOrderBody {
  planId?: unknown
  provider?: unknown
}

interface CreateCheckoutBody {
  planId?: unknown
  provider?: unknown
  paymentType?: unknown
}

const ORDER_DETAIL_REFRESH_COOLDOWN_MS = 10_000
const orderDetailRefreshBuckets = new Map<string, number>()

export function resetOrderRefreshRateLimitForTest() {
  orderDetailRefreshBuckets.clear()
}

function normalizeProvider(value: unknown) {
  return value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'epay' || value === 'dev' ? value : 'dev'
}

function normalizeCheckoutProvider(value: unknown) {
  if (value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'epay') return value
  return 'epay'
}

function normalizeEpayType(value: unknown) {
  if (value === 'wxpay' || value === 'qqpay' || value === 'alipay') return value
  return 'alipay'
}

function getOrderDetailRetryAfterSeconds(userId: string, orderId: string): number {
  const key = `${userId}:${orderId}`
  const now = Date.now()
  const lastRefreshAt = orderDetailRefreshBuckets.get(key) ?? 0
  const retryAfterMs = lastRefreshAt + ORDER_DETAIL_REFRESH_COOLDOWN_MS - now
  if (retryAfterMs > 0) return Math.ceil(retryAfterMs / 1000)

  orderDetailRefreshBuckets.set(key, now)
  if (orderDetailRefreshBuckets.size > 10_000) {
    const staleBefore = now - 60 * 60_000
    for (const [bucketKey, timestamp] of orderDetailRefreshBuckets) {
      if (timestamp < staleBefore) orderDetailRefreshBuckets.delete(bucketKey)
    }
  }
  return 0
}

async function canBalanceCoverPlan(userId: string, planId: string, balanceUnitCents: number): Promise<boolean> {
  const store = getBillingStore()
  const [plans, balance] = await Promise.all([
    store.listPlans(),
    store.getBalance(userId),
  ])
  const plan = plans.find((item) => item.id === planId && item.enabled)
  if (!plan) return false
  const requiredBalance = Math.ceil(plan.priceCents / Math.max(1, balanceUnitCents))
  return balance.availableCredits >= requiredBalance
}

async function createCheckoutOrderAfterPendingGuard(userId: string, planId: string, provider: ReturnType<typeof normalizeCheckoutProvider>, balanceUnitCents: number) {
  const store = getBillingStore()
  const pendingOrder = await store.getPendingOrder(userId)
  if (!pendingOrder) return store.createOrder(userId, planId, provider, { balanceUnitCents })

  if (pendingOrder.planId === planId && await canBalanceCoverPlan(userId, planId, balanceUnitCents)) {
    await store.cancelOrder(userId, pendingOrder.id)
    return store.createOrder(userId, planId, provider, { balanceUnitCents })
  }

  return {
    pendingOrder,
  }
}

type CheckoutProvider = ReturnType<typeof normalizeCheckoutProvider>
type CheckoutPaymentType = ReturnType<typeof normalizeEpayType>

async function buildCheckoutPayload(request: Request, order: Awaited<ReturnType<ReturnType<typeof getBillingStore>['getOrder']>>, provider: CheckoutProvider, paymentType: CheckoutPaymentType) {
  if (!order) return null
  if (order.status === 'paid' && order.amountCents === 0) {
    return {
      order,
      checkout: {
        status: 'balance_paid' as const,
        provider,
        message: '套餐已使用余额全额支付',
      },
    }
  }
  if (order.status !== 'pending') {
    return {
      order,
      checkout: {
        status: 'not_configured' as const,
        provider,
        message: 'This order is no longer payable',
      },
    }
  }
  if (provider === 'epay') {
    const epayConfig = await readEpayConfig(new URL(request.url).origin)
    const checkoutUrl = buildEpayCheckoutUrl(epayConfig, {
      orderId: order.id,
      amountCents: order.amountCents,
      name: `${order.planId} ${order.credits} uses`,
      paymentType,
    })
    return {
      order,
      checkout: {
        status: 'redirect' as const,
        provider,
        checkoutUrl,
      },
    }
  }
  return {
    order,
    checkout: {
      status: 'not_configured' as const,
      provider,
      message: 'Payment checkout is not configured yet',
    },
  }
}

export async function handleOrdersRequest(request: Request): Promise<Response> {
  try {
    const store = getBillingStore()
    const url = new URL(request.url)

    if (url.pathname === '/api/platform/plans' && request.method === 'GET') {
      const plans = await store.listPlans()
      return jsonResponse({ plans })
    }

    const session = await readRequiredSession(request)

    if (url.pathname === '/api/platform/orders' && request.method === 'GET') {
      const limit = getQueryNumber(request, 'limit', 20, 1, 100)
      const orders = await store.listOrders(session.userId, limit)
      return jsonResponse({ orders })
    }

    const orderDetailMatch = url.pathname.match(/^\/api\/platform\/orders\/([^/]+)$/)
    if (orderDetailMatch && request.method === 'GET') {
      const orderId = decodeURIComponent(orderDetailMatch[1])
      const retryAfter = getOrderDetailRetryAfterSeconds(session.userId, orderId)
      if (retryAfter > 0) {
        return jsonResponse({
          error: {
            message: `Please wait ${retryAfter} seconds before refreshing this order again`,
            code: 'rate_limited',
            retryAfter,
          },
        }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
      }
      const order = await store.getOrder(session.userId, orderId)
      if (!order) return errorResponse('Order not found', 404, 'not_found')
      return jsonResponse({ order })
    }

    const orderCancelMatch = url.pathname.match(/^\/api\/platform\/orders\/([^/]+)\/cancel$/)
    if (orderCancelMatch && request.method === 'POST') {
      const order = await store.cancelOrder(session.userId, decodeURIComponent(orderCancelMatch[1]))
      return jsonResponse({ order })
    }

    const orderCheckoutMatch = url.pathname.match(/^\/api\/platform\/orders\/([^/]+)\/checkout$/)
    if (orderCheckoutMatch && request.method === 'POST') {
      const body = await readJsonRequest<Pick<CreateCheckoutBody, 'paymentType'>>(request)
      const orderId = decodeURIComponent(orderCheckoutMatch[1])
      const paymentType = normalizeEpayType(body.paymentType)
      if (session.mode !== 'authenticated') return errorResponse('Checkout requires an authenticated platform user', 401, 'unauthorized')
      const order = await store.getOrder(session.userId, orderId)
      if (!order) return errorResponse('Order not found', 404, 'not_found')
      const provider = normalizeCheckoutProvider(order.provider)
      const config = await readPlatformConfig()
      if (provider === 'epay' && !config.epayPaymentTypes.includes(paymentType)) {
        return errorResponse('This payment method is not enabled', 400, 'payment_type_disabled')
      }
      const payload = await buildCheckoutPayload(request, order, provider, paymentType)
      return jsonResponse(payload, { status: payload?.checkout.status === 'not_configured' ? 202 : 200 })
    }

    if (url.pathname === '/api/platform/orders' && request.method === 'POST') {
      const body = await readJsonRequest<CreateOrderBody>(request)
      const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
      const provider = normalizeProvider(body.provider)
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      const pendingOrder = await store.getPendingOrder(session.userId)
      if (pendingOrder) {
        return jsonResponse({
          error: {
            message: 'Please complete or cancel your pending order before creating a new one',
            code: 'pending_order_exists',
            order: pendingOrder,
          },
        }, { status: 409 })
      }
      const config = await readPlatformConfig()
      const order = await store.createOrder(session.userId, planId, provider, { balanceUnitCents: config.balanceUnitCents })
      return jsonResponse({ order })
    }

    if (url.pathname === '/api/platform/checkout' && request.method === 'POST') {
      const body = await readJsonRequest<CreateCheckoutBody>(request)
      const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
      const provider = normalizeCheckoutProvider(body.provider)
      const paymentType = normalizeEpayType(body.paymentType)
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      if (session.mode !== 'authenticated') return errorResponse('Checkout requires an authenticated platform user', 401, 'unauthorized')
      const config = await readPlatformConfig()
      if (provider === 'epay') {
        if (!config.epayPaymentTypes.includes(paymentType)) {
          return errorResponse('This payment method is not enabled', 400, 'payment_type_disabled')
        }
      }
      const guardedOrder = await createCheckoutOrderAfterPendingGuard(session.userId, planId, provider, config.balanceUnitCents)
      if ('pendingOrder' in guardedOrder) {
        return jsonResponse({
          error: {
            message: 'Please complete or cancel your pending order before creating a new one',
            code: 'pending_order_exists',
            order: guardedOrder.pendingOrder,
          },
        }, { status: 409 })
      }
      const order = guardedOrder
      const payload = await buildCheckoutPayload(request, order, provider, paymentType)
      return jsonResponse(payload, { status: payload?.checkout.status === 'not_configured' ? 202 : 200 })
    }

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Unauthorized') return errorResponse(message, 401, 'unauthorized')
    if (message.startsWith('Pending order exists:')) return errorResponse('Please complete or cancel your pending order before creating a new one', 409, 'pending_order_exists')
    return errorResponse(message, 400, 'bad_request')
  }
}
