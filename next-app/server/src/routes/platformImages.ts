import { readRequiredSession } from '../auth/session.js'
import { readPlatformConfig } from '../admin/configStore.js'
import { getAssetStorage } from '../assets/storage.js'
import { quoteImageCreditsFromConfig } from '../billing/quote.js'
import { getBillingStore } from '../billing/store.js'
import { getGenerationJobStore } from '../generationJobs/store.js'
import { errorResponse, isSameOrigin, jsonResponse, readJsonRequest } from '../http.js'
import { generateWithOpenAICompatible } from '../providers/openaiImageProvider.js'

interface PlatformImageGenerationRequest {
  prompt?: unknown
  params?: any
  inputImageDataUrls?: unknown
  maskDataUrl?: unknown
}

function genJobId(userId: string): string {
  return `img_${userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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

function normalizeRequest(payload: PlatformImageGenerationRequest) {
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

export async function handlePlatformImageGeneration(request: Request): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed')
  const config = await readPlatformConfig()
  if (!isSameOrigin(request, [config.publicBaseUrl])) {
    return errorResponse('请求来源校验失败，请检查后台站点 URL、PLATFORM_ALLOWED_ORIGINS 或反向代理 Host/X-Forwarded-Proto 配置。', 403, 'forbidden_origin')
  }

  let session
  try {
    session = await readRequiredSession(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 500, message === 'Unauthorized' ? 'unauthorized' : 'server_not_configured')
  }

  const store = getBillingStore()
  let normalized: ReturnType<typeof normalizeRequest>
  try {
    normalized = normalizeRequest(await readJsonRequest<PlatformImageGenerationRequest>(request))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, 400, 'bad_request')
  }
  const creditsQuoted = await quoteImageCreditsFromConfig(normalized.params)
  const platformJobId = genJobId(session.userId)
  const jobStore = getGenerationJobStore()

  try {
    const debit = await store.debitGeneration({
      userId: session.userId,
      creditAmount: creditsQuoted,
      packageUses: normalized.params.n,
      sourceId: platformJobId,
      description: `Image generation: ${normalized.params.n} image(s)`,
    })
    try {
      await jobStore.createJob({
        id: platformJobId,
        userId: session.userId,
        request: normalized,
        costCredits: creditsQuoted,
      })
      await jobStore.markRunning(platformJobId)
      const result = await generateWithOpenAICompatible(normalized)
      const assetUrls = await saveGeneratedImages(platformJobId, session.userId, result.images)
      await jobStore.markSucceeded(platformJobId, {
        images: assetUrls,
        rawImageUrls: [...(result.rawImageUrls ?? []), ...assetUrls],
        revisedPrompts: result.revisedPrompts,
        actualParams: result.actualParams,
      })
      return jsonResponse({
        ...result,
        platformJobId,
        creditsQuoted,
        creditsCharged: debit.chargedCredits,
      })
    } catch (error) {
      await jobStore.markFailed(platformJobId, error instanceof Error ? error.message : String(error)).catch(() => undefined)
      await store.refundGeneration({
        userId: session.userId,
        debit,
        sourceId: platformJobId,
        description: 'Image generation failed refund',
      }).catch(() => undefined)

      const message = error instanceof Error ? error.message : String(error)
      const status = message.startsWith('Missing required environment variable') ? 500 : 400
      return errorResponse('生成失败，请稍后重试或联系管理员', status, status === 500 ? 'server_not_configured' : 'generation_failed')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Insufficient credits') return errorResponse('Insufficient credits', 402, 'insufficient_credits')
    return errorResponse('操作失败，请稍后重试或联系管理员', 400, 'billing_failed')
  }
}
