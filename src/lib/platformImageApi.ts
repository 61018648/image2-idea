import type { ApiProfile } from '../types'
import { type CallApiOptions, type CallApiResult, fetchImageUrlAsDataUrl, getApiErrorMessage, MIME_MAP, normalizeBase64Image } from './imageApiShared'
import { buildPlatformApiUrl, createPlatformGeneration, getPlatformGeneration } from './platformGenerationApi'
import type { PlatformGenerationJobResponse, PlatformImageGenerationRequest, PlatformImageGenerationResponse } from './platformApiContracts'

const PLATFORM_IMAGE_GENERATION_PATH = '/api/platform/images/generations'
const PLATFORM_GENERATION_POLL_INTERVAL_MS = 1500
const PLATFORM_GENERATION_POLL_TIMEOUT_MS = 180000

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

function isAssetUrl(value: string): boolean {
  return value.startsWith('/api/platform/assets/') || /^https?:\/\//i.test(value)
}

function resolvePlatformAssetUrl(profile: ApiProfile, value: string): string {
  if (!value.startsWith('/api/platform/assets/')) return value
  return buildPlatformApiUrl(profile.baseUrl, value)
}

async function normalizePlatformJob(profile: ApiProfile, job: PlatformGenerationJobResponse, fallbackMime: string, creditsQuoted?: number, creditsCharged?: number): Promise<CallApiResult> {
  if (!Array.isArray(job.images) || job.images.length === 0) {
    throw new Error('平台任务未返回图片数据')
  }

  const images = [] as string[]
  for (const image of job.images) {
    images.push(isAssetUrl(image) ? await fetchImageUrlAsDataUrl(resolvePlatformAssetUrl(profile, image), fallbackMime) : normalizeBase64Image(image, fallbackMime))
  }

  return {
    images,
    rawImageUrls: job.rawImageUrls?.map((url) => resolvePlatformAssetUrl(profile, url)),
    actualParams: job.actualParams,
    revisedPrompts: job.revisedPrompts,
    platformJobId: job.id,
    creditsQuoted: creditsQuoted ?? job.costCredits,
    creditsCharged: creditsCharged ?? job.costCredits,
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollPlatformGeneration(profile: ApiProfile, jobId: string): Promise<PlatformGenerationJobResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < PLATFORM_GENERATION_POLL_TIMEOUT_MS) {
    await wait(PLATFORM_GENERATION_POLL_INTERVAL_MS)
    const { job } = await getPlatformGeneration(profile, jobId)
    if (job.status === 'succeeded') return job
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.errorMessage || `平台任务${job.status === 'cancelled' ? '已取消' : '失败'}`)
    }
  }

  throw new Error('平台任务等待超时，请稍后在云端历史中查看结果')
}

export async function callPlatformImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const request: PlatformImageGenerationRequest = {
    prompt: opts.prompt,
    params: opts.params,
    inputImageDataUrls: opts.inputImageDataUrls,
    ...(opts.maskDataUrl ? { maskDataUrl: opts.maskDataUrl } : {}),
  }
  const mime = MIME_MAP[opts.params.output_format] || 'image/png'

  const created = await createPlatformGeneration(profile, request)
  const jobId = created.job?.id
  if (!jobId) throw new Error('平台任务创建失败：未返回任务 ID')
  if (created.job.status === 'succeeded') {
    return await normalizePlatformJob(profile, created.job, mime, created.creditsQuoted, created.creditsCharged)
  }
  if (created.job.status === 'failed' || created.job.status === 'cancelled') {
    throw new Error(created.job.errorMessage || '平台任务创建后立即失败')
  }

  const completedJob = await pollPlatformGeneration(profile, jobId)
  return await normalizePlatformJob(profile, completedJob, mime, created.creditsQuoted, created.creditsCharged)
}

export async function callPlatformImageApiCompat(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
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
