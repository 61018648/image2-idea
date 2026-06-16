import { readRequiredSession } from '../auth/session.js'
import { quoteImageCredits } from '../billing/quote.js'
import { getBillingStore } from '../billing/store.js'
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
  if (!isSameOrigin(request)) return errorResponse('Forbidden', 403, 'forbidden')

  const session = (() => {
    try {
      return readRequiredSession(request.headers)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return errorResponse(message, message === 'Unauthorized' ? 401 : 500, message === 'Unauthorized' ? 'unauthorized' : 'server_not_configured')
    }
  })()
  if (session instanceof Response) return session

  const store = getBillingStore()
  let normalized: ReturnType<typeof normalizeRequest>
  try {
    normalized = normalizeRequest(await readJsonRequest<PlatformImageGenerationRequest>(request))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, 400, 'bad_request')
  }
  const creditsQuoted = quoteImageCredits(normalized.params)
  const platformJobId = genJobId(session.userId)

  try {
    await store.debitCredits({
      userId: session.userId,
      amount: -creditsQuoted,
      sourceId: platformJobId,
      description: `Image generation: ${normalized.params.n} image(s)`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Insufficient credits') return errorResponse('Insufficient credits', 402, 'insufficient_credits')
    return errorResponse(message, 400, 'billing_failed')
  }

  try {
    const result = await generateWithOpenAICompatible(normalized)
    return jsonResponse({
      ...result,
      platformJobId,
      creditsQuoted,
      creditsCharged: creditsQuoted,
    })
  } catch (error) {
    await store.refundCredits({
      userId: session.userId,
      amount: creditsQuoted,
      sourceId: platformJobId,
      description: 'Image generation failed refund',
    }).catch(() => undefined)

    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('Missing required environment variable') ? 500 : 400
    return errorResponse(message, status, status === 500 ? 'server_not_configured' : 'generation_failed')
  }
}
