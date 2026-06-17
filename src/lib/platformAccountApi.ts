import { getApiErrorMessage } from './imageApiShared'
import type {
  PlatformAdminStatsResponse,
  PlatformBalanceResponse,
  PlatformCheckoutResponse,
  PlatformCreateCheckoutRequest,
  PlatformCreateOrderRequest,
  PlatformCreateOrderResponse,
  PlatformLedgerResponse,
  PlatformMeResponse,
  PlatformOrdersResponse,
  PlatformPlansResponse,
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
  if (!response.ok) throw new Error(await getApiErrorMessage(response))
  return response.json() as Promise<T>
}

export function getPlatformMe(baseUrl = ''): Promise<PlatformMeResponse> {
  return requestJson<PlatformMeResponse>(baseUrl, '/me')
}

export function getPlatformBalance(baseUrl = ''): Promise<PlatformBalanceResponse> {
  return requestJson<PlatformBalanceResponse>(baseUrl, '/balance')
}

export function getPlatformLedger(baseUrl = '', limit = 50): Promise<PlatformLedgerResponse> {
  return requestJson<PlatformLedgerResponse>(baseUrl, `/ledger?limit=${encodeURIComponent(String(limit))}`)
}

export function getPlatformPlans(baseUrl = ''): Promise<PlatformPlansResponse> {
  return requestJson<PlatformPlansResponse>(baseUrl, '/plans')
}

export function getPlatformAdminStats(baseUrl = ''): Promise<PlatformAdminStatsResponse> {
  return requestJson<PlatformAdminStatsResponse>(baseUrl, '/admin/stats')
}

export function listPlatformOrders(baseUrl = '', limit = 20): Promise<PlatformOrdersResponse> {
  return requestJson<PlatformOrdersResponse>(baseUrl, `/orders?limit=${encodeURIComponent(String(limit))}`)
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
