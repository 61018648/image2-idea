import { getApiErrorMessage } from './imageApiShared'
import type {
  PlatformAdminConfigResponse,
  PlatformAdminAdjustCreditsRequest,
  PlatformAdminAdjustCreditsResponse,
  PlatformAdminCreateUserRequest,
  PlatformAdminCreateUserResponse,
  PlatformAdminGenerationLogsResponse,
  PlatformAdminDetectModelsRequest,
  PlatformAdminDetectModelsResponse,
  PlatformAdminOrdersResponse,
  PlatformAdminPlansResponse,
  PlatformAdminSetBalanceRequest,
  PlatformAdminStatsResponse,
  PlatformAdminUpdateUserRequest,
  PlatformAdminUpdateUserResponse,
  PlatformAdminUpdateConfigRequest,
  PlatformAdminUpsertPlanRequest,
  PlatformAdminUpsertPlanResponse,
  PlatformAdminUsersResponse,
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
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
  if (!response.ok) throw new Error(await getApiErrorMessage(response))
  return response.json() as Promise<T>
}

export function getAdminOverview(baseUrl = ''): Promise<PlatformAdminStatsResponse> {
  return requestJson<PlatformAdminStatsResponse>(baseUrl, '/admin/overview')
}

export function getAdminUsers(baseUrl = '', limit = 100): Promise<PlatformAdminUsersResponse> {
  return requestJson<PlatformAdminUsersResponse>(baseUrl, `/admin/users?limit=${encodeURIComponent(String(limit))}`)
}

export function createAdminUser(baseUrl = '', payload: PlatformAdminCreateUserRequest): Promise<PlatformAdminCreateUserResponse> {
  return requestJson<PlatformAdminCreateUserResponse>(baseUrl, '/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminUser(baseUrl = '', payload: PlatformAdminUpdateUserRequest): Promise<PlatformAdminUpdateUserResponse> {
  return requestJson<PlatformAdminUpdateUserResponse>(baseUrl, '/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function getAdminOrders(baseUrl = '', limit = 100): Promise<PlatformAdminOrdersResponse> {
  return requestJson<PlatformAdminOrdersResponse>(baseUrl, `/admin/orders?limit=${encodeURIComponent(String(limit))}`)
}

export function getAdminPlans(baseUrl = ''): Promise<PlatformAdminPlansResponse> {
  return requestJson<PlatformAdminPlansResponse>(baseUrl, '/admin/plans')
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!/not found|404/i.test(message)) throw error
      return requestJson<PlatformAdminPlansResponse>(baseUrl, '/plans')
    })
}

export function upsertAdminPlan(baseUrl = '', payload: PlatformAdminUpsertPlanRequest): Promise<PlatformAdminUpsertPlanResponse> {
  return requestJson<PlatformAdminUpsertPlanResponse>(baseUrl, '/admin/plans', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function detectAdminModels(baseUrl = '', payload: PlatformAdminDetectModelsRequest): Promise<PlatformAdminDetectModelsResponse> {
  return requestJson<PlatformAdminDetectModelsResponse>(baseUrl, '/admin/models', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAdminGenerationLogs(baseUrl = '', limit = 100): Promise<PlatformAdminGenerationLogsResponse> {
  return requestJson<PlatformAdminGenerationLogsResponse>(baseUrl, `/admin/generation-logs?limit=${encodeURIComponent(String(limit))}`)
}

export function getAdminConfig(baseUrl = ''): Promise<PlatformAdminConfigResponse> {
  return requestJson<PlatformAdminConfigResponse>(baseUrl, '/admin/config')
}

export function updateAdminConfig(baseUrl = '', payload: PlatformAdminUpdateConfigRequest): Promise<PlatformAdminConfigResponse> {
  return requestJson<PlatformAdminConfigResponse>(baseUrl, '/admin/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function adjustAdminUserCredits(baseUrl = '', payload: PlatformAdminAdjustCreditsRequest): Promise<PlatformAdminAdjustCreditsResponse> {
  return requestJson<PlatformAdminAdjustCreditsResponse>(baseUrl, '/admin/users/credits', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function setAdminUserBalance(baseUrl = '', payload: PlatformAdminSetBalanceRequest): Promise<PlatformAdminAdjustCreditsResponse> {
  return requestJson<PlatformAdminAdjustCreditsResponse>(baseUrl, '/admin/users/balance', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
