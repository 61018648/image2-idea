import { getApiErrorMessage } from './imageApiShared'
import type {
  PlatformBalanceResponse,
  PlatformCreateOrderRequest,
  PlatformCreateOrderResponse,
  PlatformLedgerResponse,
  PlatformMeResponse,
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

export function createPlatformOrder(baseUrl: string, request: PlatformCreateOrderRequest): Promise<PlatformCreateOrderResponse> {
  return requestJson<PlatformCreateOrderResponse>(baseUrl, '/orders', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}
