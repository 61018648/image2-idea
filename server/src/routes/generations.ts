import { readRequiredSession } from '../auth/session.js'
import { quoteImageCredits } from '../billing/quote.js'
import { getBillingStore } from '../billing/store.js'
import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'
import { getAssetStorage } from '../assets/storage.js'
import { getGenerationJobStore } from '../generationJobs/store.js'
import type { GenerationJobRequest, GenerationJob } from '../generationJobs/types.js'
import { generateWithOpenAICompatible } from '../providers/openaiImageProvider.js'

interface CreateGenerationBody {
  prompt?: unknown
  params?: any
  inputImageDataUrls?: unknown
  maskDataUrl?: unknown
}

interface GenerationJobResponse {
  id: string
  status: string
  request: GenerationJobRequest
  costCredits: number
  images: string[]
  rawImageUrls?: string[]
  revisedPrompts?: Array<string | undefined>
  actualParams?: Partial<GenerationJobRequest['params']>
  errorMessage?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

function normalizeRequest(payload: CreateGenerationBody): GenerationJobRequest {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) throw new Error('Prompt is required')

  const params = payload.params && typeof payload.params === 'object' ? payload.params : {}
  const inputImageDataUrls = Array.isArray(payload.inputImageDataUrls)
    ? payload.inputImageDataUrls.filter((item): item is string => typeof item === 'string' && item.startsWith('data:'))
    : []
  const maskDataUrl = typeof payload.maskDataUrl === 'string' && payload.maskDataUrl.startsWith('data:')
    ? payload.maskDataUrl
    : undefined

  return {
    prompt,
    params: {
      size: typeof params.size === 'string' ? params.size : 'auto',
      quality: typeof params.quality === 'string' ? params.quality : 'auto',
      output_format: typeof params.output_format === 'string' ? params.output_format : 'png',
      output_compression: typeof params.output_compression === 'number' ? params.output_compression : null,
      moderation: typeof params.moderation === 'string' ? params.moderation : 'auto',
      n: Math.max(1, Math.min(16, Math.trunc(Number(params.n) || 1))),
    },
    inputImageDataUrls,
    maskDataUrl,
  }
}

function genJobId(userId: string): string {
  return `job_${userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function mapJobResponse(job: GenerationJob): GenerationJobResponse {
  return {
    id: job.id,
    status: job.status,
    request: job.request,
    costCredits: job.costCredits,
    images: job.images,
    ...(job.rawImageUrls?.length ? { rawImageUrls: job.rawImageUrls } : {}),
    ...(job.revisedPrompts?.length ? { revisedPrompts: job.revisedPrompts } : {}),
    ...(job.actualParams ? { actualParams: job.actualParams } : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    createdAt: job.createdAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
  }
}

async function saveGeneratedImages(jobId: string, userId: string, images: string[]): Promise<string[]> {
  const assetStorage = getAssetStorage()
  const savedUrls: string[] = []
  for (let index = 0; index < images.length; index += 1) {
    const asset = await assetStorage.saveImageDataUrl({
      userId,
      jobId,
      dataUrl: images[index],
      index,
    })
    savedUrls.push(asset.url)
  }
  return savedUrls
}

async function executeGenerationJob(jobId: string, userId: string) {
  const jobStore = getGenerationJobStore()
  const job = await jobStore.markRunning(jobId)
  if (!job) return

  try {
    const result = await generateWithOpenAICompatible(job.request)
    const assetUrls = await saveGeneratedImages(jobId, userId, result.images)
    const completed = await jobStore.markSucceeded(jobId, {
      images: assetUrls,
      rawImageUrls: [...(result.rawImageUrls ?? []), ...assetUrls],
      revisedPrompts: result.revisedPrompts,
      actualParams: result.actualParams,
    })
    if (!completed) return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await jobStore.markFailed(jobId, message)
    await getBillingStore().refundCredits({
      userId,
      amount: job.costCredits,
      sourceId: jobId,
      description: 'Image generation failed refund',
    }).catch(() => undefined)
  }
}

export async function handleGenerationsRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') return errorResponse('Method not allowed', 405, 'method_not_allowed')
  if (!isSameOrigin(request)) return errorResponse('Forbidden', 403, 'forbidden')

  let session
  try {
    session = await readRequiredSession(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 500, message === 'Unauthorized' ? 'unauthorized' : 'server_not_configured')
  }

  const jobStore = getGenerationJobStore()

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')?.trim() || ''
    if (jobId) {
      const job = await jobStore.getJob(session.userId, jobId)
      if (!job) return errorResponse('Not found', 404, 'not_found')
      return jsonResponse({ job: mapJobResponse(job) })
    }
    const jobs = await jobStore.listJobs(session.userId, 50)
    return jsonResponse({ jobs: jobs.map(mapJobResponse) })
  }

  try {
    const normalized = normalizeRequest(await readJsonRequest<CreateGenerationBody>(request))
    const creditsQuoted = quoteImageCredits(normalized.params)
    const jobId = genJobId(session.userId)
    const store = getBillingStore()
    await store.debitCredits({
      userId: session.userId,
      amount: -creditsQuoted,
      sourceId: jobId,
      description: `Image generation: ${normalized.params.n} image(s)`,
    })

    const job = await jobStore.createJob({
      id: jobId,
      userId: session.userId,
      request: normalized,
      costCredits: creditsQuoted,
    })

    void executeGenerationJob(job.id, session.userId)

    return jsonResponse({
      job: mapJobResponse(job),
      creditsQuoted,
      creditsCharged: creditsQuoted,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Insufficient credits') return errorResponse('Insufficient credits', 402, 'insufficient_credits')
    return errorResponse(message, 400, 'bad_request')
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') || request.headers.get('referer')
  if (!origin) return true
  try {
    const requestUrl = new URL(request.url)
    return new URL(origin).origin === requestUrl.origin
  } catch {
    return false
  }
}
