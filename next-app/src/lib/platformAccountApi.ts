import { getApiErrorMessage } from './imageApiShared'
import { toUserFacingErrorMessage } from './userFacingErrors'
import type {
  PlatformAdminStatsResponse,
  PlatformBalanceResponse,
  PlatformCheckoutResponse,
  PlatformCreateCheckoutRequest,
  PlatformCreateOrderRequest,
  PlatformCreateOrderResponse,
  PlatformLedgerResponse,
  PlatformMeResponse,
  PlatformOrderDetailResponse,
  PlatformOrdersResponse,
  PlatformPublicConfigResponse,
  PlatformUserPlanPackagesResponse,
  PlatformPlansResponse,
  PlatformUpdateProfileRequest,
} from './platformApiContracts'

const PLATFORM_API_PREFIX = '/api/platform'

function buildPlatformApiUrl(baseUrl: string, path: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmedBaseUrl) return `${PLATFORM_API_PREFIX}${path}`
  if (trimmedBaseUrl.endsWith(PLATFORM_API_PREFIX)) return `${trimmedBaseUrl}${path}`
  return `${trimmedBaseUrl}${PLATFORM_API_PREFIX}${path}`
}

async function requestJson<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(buildPlatformApiUrl(baseUrl, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) {
    let apiCode = ''
    let apiOrder: unknown
    try {
      const payload = await response.clone().json()
      apiCode = typeof payload?.error?.code === 'string' ? payload.error.code : ''
      apiOrder = payload?.error?.order
    } catch {
      /* ignore */
    }
    const error = new Error(toUserFacingErrorMessage(await getApiErrorMessage(response))) as Error & { code?: string; order?: unknown }
    if (apiCode) error.code = apiCode
    if (apiOrder) error.order = apiOrder
    throw error
  }
  return response.json() as Promise<T>
}

export function getPlatformMe(baseUrl = ''): Promise<PlatformMeResponse> {
  return requestJson<PlatformMeResponse>(baseUrl, '/me')
}

export function updatePlatformMe(baseUrl = '', request: PlatformUpdateProfileRequest): Promise<PlatformMeResponse> {
  return requestJson<PlatformMeResponse>(baseUrl, '/me', {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export function sendPlatformProfileEmailCode(baseUrl = '', email: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(baseUrl, '/me/email-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function getPlatformBalance(baseUrl = ''): Promise<PlatformBalanceResponse> {
  return requestJson<PlatformBalanceResponse>(baseUrl, '/balance')
}

export function getPlatformLedger(baseUrl = '', limit = 50): Promise<PlatformLedgerResponse> {
  return requestJson<PlatformLedgerResponse>(baseUrl, `/ledger?limit=${encodeURIComponent(String(limit))}`)
}

export function getPlatformPackages(baseUrl = ''): Promise<PlatformUserPlanPackagesResponse> {
  return requestJson<PlatformUserPlanPackagesResponse>(baseUrl, '/packages')
}

export function getPlatformPlans(baseUrl = ''): Promise<PlatformPlansResponse> {
  return requestJson<PlatformPlansResponse>(baseUrl, '/plans')
}

export function getPlatformPublicConfig(baseUrl = ''): Promise<PlatformPublicConfigResponse> {
  return requestJson<PlatformPublicConfigResponse>(baseUrl, '/config')
}

export function getPlatformAdminStats(baseUrl = ''): Promise<PlatformAdminStatsResponse> {
  return requestJson<PlatformAdminStatsResponse>(baseUrl, '/admin/stats')
}

export function listPlatformOrders(baseUrl = '', limit = 20): Promise<PlatformOrdersResponse> {
  return requestJson<PlatformOrdersResponse>(baseUrl, `/orders?limit=${encodeURIComponent(String(limit))}`)
}

export function getPlatformOrder(baseUrl = '', orderId: string): Promise<PlatformOrderDetailResponse> {
  return requestJson<PlatformOrderDetailResponse>(baseUrl, `/orders/${encodeURIComponent(orderId)}`)
}

export function cancelPlatformOrder(baseUrl = '', orderId: string): Promise<PlatformOrderDetailResponse> {
  return requestJson<PlatformOrderDetailResponse>(baseUrl, `/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  })
}

export function resumePlatformCheckout(baseUrl: string, orderId: string, request: Pick<PlatformCreateCheckoutRequest, 'paymentType'> = {}): Promise<PlatformCheckoutResponse> {
  return requestJson<PlatformCheckoutResponse>(baseUrl, `/orders/${encodeURIComponent(orderId)}/checkout`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function createPlatformOrder(baseUrl: string, request: PlatformCreateOrderRequest): Promise<PlatformCreateOrderResponse> {
  return requestJson<PlatformCreateOrderResponse>(baseUrl, '/orders', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function createPlatformCheckout(baseUrl: string, request: PlatformCreateCheckoutRequest): Promise<PlatformCheckoutResponse> {
  return requestJson<PlatformCheckoutResponse>(baseUrl, '/checkout', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function notifyDevPlatformPayment(baseUrl: string, request: {
  provider: 'dev'
  providerEventId: string
  orderId: string
  paidAmountCents: number
}): Promise<unknown> {
  return requestJson<unknown>(baseUrl, '/payments/notify', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}
