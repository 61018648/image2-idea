import type { ApiProfile } from '../types'
import { getApiErrorMessage } from './imageApiShared'
import type {
  PlatformCreateGenerationResponse,
  PlatformGetGenerationResponse,
  PlatformImageGenerationRequest,
  PlatformListGenerationsResponse,
} from './platformApiContracts'
import { toUserFacingErrorMessage } from './userFacingErrors'

const PLATFORM_GENERATIONS_PATH = '/api/platform/generations'

export function buildPlatformApiUrl(baseUrl: string, path: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmedBaseUrl) return path
  if (trimmedBaseUrl.endsWith('/api/platform')) {
    return `${trimmedBaseUrl}${path.replace(/^\/api\/platform/, '')}`
  }
  return `${trimmedBaseUrl}${path}`
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
    credentials: 'include',
  })

  if (!response.ok) throw new Error(toUserFacingErrorMessage(await getApiErrorMessage(response)))
  return response.json() as Promise<T>
}

export function createPlatformGeneration(profile: ApiProfile, request: PlatformImageGenerationRequest): Promise<PlatformCreateGenerationResponse> {
  return requestJson<PlatformCreateGenerationResponse>(buildPlatformApiUrl(profile.baseUrl, PLATFORM_GENERATIONS_PATH), {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function getPlatformGeneration(profile: ApiProfile, jobId: string): Promise<PlatformGetGenerationResponse> {
  const base = buildPlatformApiUrl(profile.baseUrl, PLATFORM_GENERATIONS_PATH)
  const separator = base.includes('?') ? '&' : '?'
  return requestJson<PlatformGetGenerationResponse>(`${base}${separator}jobId=${encodeURIComponent(jobId)}`)
}

export function listPlatformGenerations(profile: Pick<ApiProfile, 'baseUrl'>): Promise<PlatformListGenerationsResponse> {
  return requestJson<PlatformListGenerationsResponse>(buildPlatformApiUrl(profile.baseUrl, PLATFORM_GENERATIONS_PATH))
}
