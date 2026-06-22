import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { verifyEpayNotify } from '../payments/epay.js'

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
    const provider = body.provider === 'dev' || body.provider === 'stripe' || body.provider === 'wechat' || body.provider === 'alipay' || body.provider === 'epay'
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

export async function handleEpayNotifyRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const rawParams: Record<string, string> = {}

    if (request.method === 'POST') {
      const text = await request.text()
      for (const [key, value] of new URLSearchParams(text).entries()) rawParams[key] = value
    } else {
      for (const [key, value] of url.searchParams.entries()) rawParams[key] = value
    }

    const verified = await verifyEpayNotify(rawParams, url.origin)
    if (!verified) return errorResponse('Invalid epay signature', 401, 'invalid_signature')
    if (rawParams.trade_status && rawParams.trade_status !== 'TRADE_SUCCESS') {
      return errorResponse('Epay trade is not successful', 400, 'bad_request')
    }

    const orderId = rawParams.out_trade_no || ''
    const providerEventId = rawParams.trade_no || rawParams.api_trade_no || `epay:${orderId}`
    const paidAmountCents = Math.round(Number(rawParams.money || 0) * 100)
    if (!orderId || !Number.isFinite(paidAmountCents)) return errorResponse('Missing epay notify fields', 400, 'bad_request')

    const result = await getBillingStore().markOrderPaid({
      orderId,
      provider: 'epay',
      providerEventId,
      providerPaymentId: providerEventId,
      paidAmountCents,
      raw: rawParams,
    })

    return new Response(request.method === 'GET' ? JSON.stringify({ ok: true, duplicate: result.duplicate }) : 'success', {
      status: 200,
      headers: { 'Content-Type': request.method === 'GET' ? 'application/json' : 'text/plain' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, 400, 'bad_request')
  }
}
