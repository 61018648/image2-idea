import { readRequiredSession } from '../auth/session.js'
import { errorResponse, getQueryNumber, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { buildEpayCheckoutUrl, readEpayConfig } from '../payments/epay.js'

interface CreateOrderBody {
  planId?: unknown
  provider?: unknown
}

interface CreateCheckoutBody {
  planId?: unknown
  provider?: unknown
  paymentType?: unknown
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

    if (url.pathname === '/api/platform/orders' && request.method === 'POST') {
      const body = await readJsonRequest<CreateOrderBody>(request)
      const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
      const provider = normalizeProvider(body.provider)
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      const order = await store.createOrder(session.userId, planId, provider)
      return jsonResponse({ order })
    }

    if (url.pathname === '/api/platform/checkout' && request.method === 'POST') {
      const body = await readJsonRequest<CreateCheckoutBody>(request)
      const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
      const provider = normalizeCheckoutProvider(body.provider)
      const paymentType = normalizeEpayType(body.paymentType)
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      if (session.mode !== 'authenticated') return errorResponse('Checkout requires an authenticated platform user', 401, 'unauthorized')
      const order = await store.createOrder(session.userId, planId, provider)
      if (provider === 'epay') {
        const epayConfig = await readEpayConfig(new URL(request.url).origin)
        const checkoutUrl = buildEpayCheckoutUrl(epayConfig, {
          orderId: order.id,
          amountCents: order.amountCents,
          name: `${order.planId} ${order.credits} uses`,
          paymentType,
        })
        return jsonResponse({
          order,
          checkout: {
            status: 'redirect',
            provider,
            checkoutUrl,
          },
        })
      }
      return jsonResponse({
        order,
        checkout: {
          status: 'not_configured',
          provider,
          message: 'Payment checkout is not configured yet',
        },
      }, { status: 202 })
    }

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
