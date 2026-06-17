import { readRequiredSession } from '../auth/session.js'
import { errorResponse, getQueryNumber, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'

interface CreateOrderBody {
  planId?: unknown
  provider?: unknown
}

interface CreateCheckoutBody {
  planId?: unknown
  provider?: unknown
}

function normalizeProvider(value: unknown) {
  return value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'dev' ? value : 'dev'
}

function normalizeCheckoutProvider(value: unknown) {
  if (value === 'stripe' || value === 'wechat' || value === 'alipay') return value
  return 'stripe'
}

export async function handleOrdersRequest(request: Request): Promise<Response> {
  try {
    const session = await readRequiredSession(request)
    const store = getBillingStore()
    const url = new URL(request.url)

    if (url.pathname === '/api/platform/plans' && request.method === 'GET') {
      const plans = await store.listPlans()
      return jsonResponse({ plans })
    }

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
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      if (session.mode !== 'authenticated') return errorResponse('Checkout requires an authenticated platform user', 401, 'unauthorized')
      const order = await store.createOrder(session.userId, planId, provider)
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
