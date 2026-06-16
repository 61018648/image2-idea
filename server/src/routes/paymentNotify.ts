import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'

interface PaymentNotifyBody {
  provider?: unknown
  providerEventId?: unknown
  orderId?: unknown
  paidAmountCents?: unknown
  providerPaymentId?: unknown
}

function isDevMode() {
  return process.env.PLATFORM_DEV_MODE === 'true'
}

function getNotifySecret() {
  return process.env.PLATFORM_PAYMENT_NOTIFY_SECRET?.trim() ?? ''
}

export async function handlePaymentNotifyRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed')

  const secret = getNotifySecret()
  if (!isDevMode()) {
    const headerSecret = request.headers.get('x-platform-payment-secret')?.trim() ?? ''
    if (!secret || headerSecret !== secret) {
      return errorResponse('Unauthorized', 401, 'unauthorized')
    }
  }

  try {
    const body = await readJsonRequest<PaymentNotifyBody>(request)
    const provider = body.provider === 'dev' || body.provider === 'stripe' || body.provider === 'wechat' || body.provider === 'alipay'
      ? body.provider
      : ''
    const providerEventId = typeof body.providerEventId === 'string' ? body.providerEventId.trim() : ''
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const providerPaymentId = typeof body.providerPaymentId === 'string' ? body.providerPaymentId.trim() : undefined
    const paidAmountCents = Number(body.paidAmountCents)
    if (!provider || !providerEventId || !orderId || !Number.isFinite(paidAmountCents)) {
      return errorResponse('Missing payment notify fields', 400, 'bad_request')
    }

    const store = getBillingStore()
    const result = await store.markOrderPaid({
      orderId,
      provider,
      providerEventId,
      providerPaymentId,
      paidAmountCents,
      raw: body,
    })

    return jsonResponse({
      ok: true,
      duplicate: result.duplicate,
      order: result.order,
      ledgerEntry: result.ledgerEntry,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
