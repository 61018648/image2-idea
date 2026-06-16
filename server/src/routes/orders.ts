import { readRequiredSession } from '../auth/session.js'
import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'

interface CreateOrderBody {
  planId?: unknown
  provider?: unknown
}

function normalizeProvider(value: unknown) {
  return value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'dev' ? value : 'dev'
}

export async function handleOrdersRequest(request: Request): Promise<Response> {
  try {
    const session = readRequiredSession(request.headers)
    const store = getBillingStore()
    const url = new URL(request.url)

    if (url.pathname === '/api/platform/plans' && request.method === 'GET') {
      const plans = await store.listPlans()
      return jsonResponse({ plans })
    }

    if (url.pathname === '/api/platform/orders' && request.method === 'POST') {
      const body = await readJsonRequest<CreateOrderBody>(request)
      const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
      const provider = normalizeProvider(body.provider)
      if (!planId) return errorResponse('Plan ID is required', 400, 'bad_request')
      const order = await store.createOrder(session.userId, planId, provider)
      return jsonResponse({ order })
    }

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
