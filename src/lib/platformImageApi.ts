import type { ApiProfile } from '../types'
import { type CallApiOptions, type CallApiResult, getApiErrorMessage, MIME_MAP, normalizeBase64Image } from './imageApiShared'
import type { PlatformImageGenerationRequest, PlatformImageGenerationResponse } from './platformApiContracts'

const PLATFORM_IMAGE_GENERATION_PATH = '/api/platform/images/generations'

function buildPlatformApiUrl(baseUrl: string, path: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmedBaseUrl) return path
  if (trimmedBaseUrl.endsWith('/api/platform')) {
    return `${trimmedBaseUrl}${path.replace(/^\/api\/platform/, '')}`
  }
  return `${trimmedBaseUrl}${path}`
}

function normalizePlatformImages(response: PlatformImageGenerationResponse, fallbackMime: string): CallApiResult {
  if (!Array.isArray(response.images) || response.images.length === 0) {
    throw new Error('平台接口未返回图片数据')
  }

  return {
    images: response.images.map((image) => normalizeBase64Image(image, fallbackMime)),
    actualParams: response.actualParams,
    actualParamsList: response.actualParamsList,
    revisedPrompts: response.revisedPrompts,
    rawImageUrls: response.rawImageUrls,
    failedRequests: response.failedRequests,
    platformJobId: response.platformJobId,
    creditsQuoted: response.creditsQuoted,
    creditsCharged: response.creditsCharged,
  }
}

export async function callPlatformImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const request: PlatformImageGenerationRequest = {
    prompt: opts.prompt,
    params: opts.params,
    inputImageDataUrls: opts.inputImageDataUrls,
    ...(opts.maskDataUrl ? { maskDataUrl: opts.maskDataUrl } : {}),
  }

  const response = await fetch(buildPlatformApiUrl(profile.baseUrl, PLATFORM_IMAGE_GENERATION_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'include',
    body: JSON.stringify(request),
  })

  if (!response.ok) throw new Error(await getApiErrorMessage(response))

  const payload = await response.json() as PlatformImageGenerationResponse
  const mime = MIME_MAP[opts.params.output_format] || 'image/png'
  return normalizePlatformImages(payload, mime)
}
