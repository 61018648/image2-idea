import { getApiErrorMessage } from './imageApiShared'
import type { PlatformAuthRequest, PlatformAuthResponse } from './platformApiContracts'

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

export function registerPlatformUser(baseUrl: string, request: PlatformAuthRequest): Promise<PlatformAuthResponse> {
  return requestJson<PlatformAuthResponse>(baseUrl, '/auth/register', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function loginPlatformUser(baseUrl: string, request: PlatformAuthRequest): Promise<PlatformAuthResponse> {
  return requestJson<PlatformAuthResponse>(baseUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function logoutPlatformUser(baseUrl: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(baseUrl, '/auth/logout', { method: 'POST' })
}

export function getPlatformAuthSession(baseUrl: string): Promise<PlatformAuthResponse> {
  return requestJson<PlatformAuthResponse>(baseUrl, '/auth/session')
}
