import type { ApiProfile } from '../types'
import { type CallApiOptions, type CallApiResult, fetchImageUrlAsDataUrl, getApiErrorMessage, MIME_MAP, normalizeBase64Image } from './imageApiShared'
import { getPlatformPublicConfig } from './platformAccountApi'
import { buildPlatformApiUrl, createPlatformGeneration, getPlatformGeneration } from './platformGenerationApi'
import type { PlatformGenerationJobResponse, PlatformImageGenerationRequest, PlatformImageGenerationResponse } from './platformApiContracts'
import { toUserFacingGenerationError } from './userFacingErrors'

const PLATFORM_IMAGE_GENERATION_PATH = '/api/platform/images/generations'
const PLATFORM_GENERATION_POLL_INTERVAL_MS = 1500
const DEFAULT_PLATFORM_GENERATION_POLL_TIMEOUT_MS = 240000
const MAX_PLATFORM_GENERATION_POLL_TIMEOUT_MS = 15 * 60 * 1000

export class PlatformGenerationPendingError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly creditsQuoted?: number,
    public readonly creditsCharged?: number,
  ) {
    super('生成任务仍在进行中，系统会继续查询结果，完成后自动显示图片。')
    this.name = 'PlatformGenerationPendingError'
  }
}

function normalizePlatformImages(response: PlatformImageGenerationResponse, fallbackMime: string): CallApiResult {
  if (!Array.isArray(response.images) || response.images.length === 0) {
    throw new Error('生成失败，请稍后重试或联系管理员')
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

export async function normalizePlatformGenerationJob(profile: ApiProfile, job: PlatformGenerationJobResponse, fallbackMime: string, creditsQuoted?: number, creditsCharged?: number): Promise<CallApiResult> {
  if (!Array.isArray(job.images) || job.images.length === 0) {
    throw new Error('生成失败，请稍后重试或联系管理员')
  }

  const images: string[] = []
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

async function getPlatformGenerationPollTimeoutMs(profile: ApiProfile): Promise<number> {
  try {
    const { config } = await getPlatformPublicConfig(profile.baseUrl)
    const upstreamTimeoutMs = Number(config.upstreamTimeoutMs)
    if (!Number.isFinite(upstreamTimeoutMs) || upstreamTimeoutMs <= 0) return DEFAULT_PLATFORM_GENERATION_POLL_TIMEOUT_MS
    return Math.min(MAX_PLATFORM_GENERATION_POLL_TIMEOUT_MS, Math.max(DEFAULT_PLATFORM_GENERATION_POLL_TIMEOUT_MS, upstreamTimeoutMs + 60_000))
  } catch {
    return DEFAULT_PLATFORM_GENERATION_POLL_TIMEOUT_MS
  }
}

async function pollPlatformGeneration(profile: ApiProfile, jobId: string, timeoutMs: number): Promise<PlatformGenerationJobResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await wait(PLATFORM_GENERATION_POLL_INTERVAL_MS)
    const { job } = await getPlatformGeneration(profile, jobId)
    if (job.status === 'succeeded') return job
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.status === 'cancelled' ? '任务已取消' : toUserFacingGenerationError(job.errorMessage))
    }
  }

  throw new PlatformGenerationPendingError(jobId)
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
  if (!jobId) throw new Error('生成任务创建失败，请稍后重试或联系管理员')
  if (created.job.status === 'succeeded') {
    return await normalizePlatformGenerationJob(profile, created.job, mime, created.creditsQuoted, created.creditsCharged)
  }
  if (created.job.status === 'failed' || created.job.status === 'cancelled') {
    throw new Error(created.job.status === 'cancelled' ? '任务已取消' : toUserFacingGenerationError(created.job.errorMessage))
  }

  const timeoutMs = await getPlatformGenerationPollTimeoutMs(profile)
  try {
    const completedJob = await pollPlatformGeneration(profile, jobId, timeoutMs)
    return await normalizePlatformGenerationJob(profile, completedJob, mime, created.creditsQuoted, created.creditsCharged)
  } catch (error) {
    if (error instanceof PlatformGenerationPendingError) {
      throw new PlatformGenerationPendingError(jobId, created.creditsQuoted, created.creditsCharged)
    }
    throw error
  }
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

  if (!response.ok) throw new Error(toUserFacingGenerationError(await getApiErrorMessage(response)))

  const payload = await response.json() as PlatformImageGenerationResponse
  const mime = MIME_MAP[opts.params.output_format] || 'image/png'
  return normalizePlatformImages(payload, mime)
}
