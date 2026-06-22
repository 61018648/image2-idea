import { readImageProviderConfig } from '../admin/configStore.js'

export interface ImageProviderParams {
  size: string
  quality: string
  output_format: string
  output_compression: number | null
  moderation: string
  n: number
}

export interface ImageProviderInput {
  prompt: string
  params: ImageProviderParams
  inputImageDataUrls: string[]
  maskDataUrl?: string
}

export interface ImageProviderResult {
  images: string[]
  actualParams?: Partial<ImageProviderParams>
  actualParamsList?: Array<Partial<ImageProviderParams> | undefined>
  revisedPrompts?: Array<string | undefined>
  rawImageUrls?: string[]
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_PARALLEL_REQUESTS = 4
const IMAGE_ENDPOINT_RE = /\/images\/(?:generations|edits)$/i

function getEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function normalizeOpenAICompatibleBaseUrl(value: string): string {
  let baseUrl = (value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  baseUrl = baseUrl.replace(IMAGE_ENDPOINT_RE, '')
  baseUrl = baseUrl.replace(/\/models$/i, '')
  return baseUrl || DEFAULT_BASE_URL
}

function buildEndpoint(baseUrl: string, path: 'images/generations' | 'images/edits' | 'models'): string {
  return `${normalizeOpenAICompatibleBaseUrl(baseUrl)}/${path}`
}

function getMime(outputFormat: string): string {
  if (outputFormat === 'jpeg') return 'image/jpeg'
  if (outputFormat === 'webp') return 'image/webp'
  return 'image/png'
}

function normalizeBase64Image(value: string, mime: string): string {
  return value.startsWith('data:') ? value : `data:${mime};base64,${value}`
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function safeEndpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.origin}${url.pathname}`
  } catch {
    return endpoint
  }
}

function getErrorCause(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const anyError = error as { cause?: unknown; code?: unknown; message?: unknown }
  const cause = anyError.cause
  if (cause && typeof cause === 'object') {
    const typedCause = cause as { code?: unknown; message?: unknown; syscall?: unknown; hostname?: unknown }
    const parts = [typedCause.code, typedCause.syscall, typedCause.hostname, typedCause.message]
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean)
    if (parts.length) return parts.join(' / ')
  }
  if (typeof anyError.code === 'string') return anyError.code
  if (typeof anyError.message === 'string') return anyError.message
  return ''
}

function createNetworkError(error: unknown, endpoint: string): Error {
  const cause = getErrorCause(error)
  const suffix = cause ? ` 原始原因：${cause}` : ''
  if (/UND_ERR_SOCKET|other side closed|socket|ECONNRESET/i.test(cause)) {
    return new Error(
      `上游 API 在生成完成前主动断开连接：${safeEndpointLabel(endpoint)}。这通常是上游网关/CDN 在约 120 秒左右关闭了长请求，不是浏览器或本站主动停止。建议在后台降低图片尺寸/质量，或联系上游提高 images 接口超时。${suffix}`,
    )
  }
  return new Error(
    `上游 API 连接失败：无法连接到 ${safeEndpointLabel(endpoint)}。请检查后台 Base URL 是否只填写到 /v1、服务器是否能访问该地址、是否需要代理或证书配置。${suffix}`,
  )
}

function createTimeoutError(timeoutMs: number, endpoint: string): Error {
  return new Error(`上游 API 请求超时：超过 ${Math.ceil(timeoutMs / 1000)} 秒仍未完成。接口：${safeEndpointLabel(endpoint)}。请提高后台超时时间，或降低图片尺寸/质量后重试。`)
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as any
    const error = payload?.error
    if (error && typeof error === 'object') {
      const parts = [
        typeof error.message === 'string' ? error.message : '',
        typeof error.code === 'string' ? `code=${error.code}` : '',
        typeof error.type === 'string' ? `type=${error.type}` : '',
        typeof error.param === 'string' ? `param=${error.param}` : '',
      ].filter(Boolean)
      if (parts.length) return parts.join('；')
    }
    const directMessage = typeof payload?.error === 'string' ? payload.error : payload?.message || payload?.detail
    if (directMessage) {
      const raw = JSON.stringify(payload)
      return raw && raw !== JSON.stringify(directMessage) ? `${directMessage}；原始响应：${raw.slice(0, 500)}` : String(directMessage)
    }
    return `HTTP ${response.status}；原始响应：${JSON.stringify(payload).slice(0, 500)}`
  } catch {
    const text = await response.text().catch(() => '')
    return text || `HTTP ${response.status}`
  }
}

function shouldRetryWithoutResponseFormat(status: number, message: string): boolean {
  return status >= 400
    && status < 500
    && /response_format|b64_json|unknown parameter|unsupported parameter|invalid parameter|not supported/i.test(message)
}

function shouldRetryWithoutStream(status: number, message: string): boolean {
  return status >= 400
    && status < 500
    && /stream|partial_images|openai_error|unknown parameter|unsupported parameter|invalid parameter|not supported/i.test(message)
}

function shouldRetryWithoutOptionalParams(status: number, message: string): boolean {
  return status >= 400
    && status < 500
    && /quality|moderation|output_compression|unknown parameter|unsupported parameter|invalid parameter|not supported/i.test(message)
}

function isChineseTextSensitive(prompt: string): boolean {
  if (!/[\u3400-\u9fff]/.test(prompt)) return false
  const textScene = /(文字|汉字|中文|字体|标题|海报|招牌|标语|书法|手写|排版|logo|LOGO|字|词|句|文案|印刷|品牌|店名|姓名|署名|水印|封面|广告|横幅|牌匾|对联)/i.test(prompt)
  const quotedChineseText = /["'“‘《「『【（(][^"'”’》」』】）)]*[\u3400-\u9fff][^"'”’》」』】）)]*["'”’》」』】）)]/.test(prompt)
  const longChineseText = (prompt.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 4
  return textScene || quotedChineseText || longChineseText
}

function enhancePromptForChineseText(prompt: string): string {
  if (!isChineseTextSensitive(prompt)) return prompt
  return [
    '中文文字保真要求：请严格保留所有中文文字的字形、笔画、偏旁部首、结构、顺序和含义，不要改写、增删、翻译、替换或创造任何汉字。',
    '复杂汉字防错乱要求：遇到笔画很多、结构复杂的汉字时，优先使用清晰的常规印刷体或黑体字形；每个笔画必须独立、连续、位置正确，偏旁部首比例准确，不能粘连、断裂、镜像、缺笔、多笔或变成相似字。',
    '可读性优先级高于装饰效果：文字区域需要足够大、足够留白、边缘清晰、对比度明确；不要让纹理、光效、阴影、透视、手写风格、书法飞白、浮雕、金属反光或背景图案穿过笔画。',
    '如果提示词中有引号、冒号后面的指定文字、标题、招牌、海报文案、logo 文案或排版文字，必须逐字一致。若复杂装饰会影响汉字准确性，请降低装饰和艺术变形，优先保证文字像矢量排版一样清楚可读。',
    prompt,
  ].join('\n')
}

interface RequestFeatureMode {
  stream: boolean
  responseFormat: boolean
  optionalParams: boolean
}

function appendCommonJsonBody(body: Record<string, unknown>, params: ImageProviderParams, includeOptionalParams: boolean) {
  body.size = params.size
  body.output_format = params.output_format
  if (includeOptionalParams) body.moderation = params.moderation
  if (includeOptionalParams && params.quality) body.quality = params.quality
  if (includeOptionalParams && params.output_format !== 'png' && params.output_compression != null) {
    body.output_compression = params.output_compression
  }
}

function appendCommonFormData(formData: FormData, params: ImageProviderParams, includeOptionalParams: boolean) {
  formData.append('size', params.size)
  formData.append('output_format', params.output_format)
  if (includeOptionalParams) formData.append('moderation', params.moderation)
  if (includeOptionalParams && params.quality) formData.append('quality', params.quality)
  if (includeOptionalParams && params.output_format !== 'png' && params.output_compression != null) {
    formData.append('output_compression', String(params.output_compression))
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/i.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  const mime = match[1] || 'image/png'
  const buffer = Buffer.from(match[2], 'base64')
  return new Blob([buffer], { type: mime })
}

async function fetchImageUrlAsDataUrl(url: string, fallbackMime: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`上游图片下载失败：${safeEndpointLabel(url)} HTTP ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || fallbackMime
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  return `data:${contentType};base64,${base64}`
}

async function parseImagePayload(payload: any, mime: string, signal?: AbortSignal): Promise<ImageProviderResult> {
  const data = Array.isArray(payload?.data) ? payload.data : []
  const rawValues = data
    .map((item: any) => item?.b64_json || item?.url)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)

  const images: string[] = []
  const rawImageUrls: string[] = []
  for (const value of rawValues) {
    if (isHttpUrl(value)) {
      rawImageUrls.push(value)
      images.push(await fetchImageUrlAsDataUrl(value, mime, signal))
    } else {
      images.push(normalizeBase64Image(value, mime))
    }
  }

  if (images.length === 0) throw new Error('上游 API 没有返回可识别的图片数据')

  return {
    images,
    actualParams: {
      size: typeof payload.size === 'string' ? payload.size : undefined,
      quality: payload.quality,
      output_format: payload.output_format,
      n: images.length,
    },
    revisedPrompts: data.map((item: any) => typeof item?.revised_prompt === 'string' ? item.revised_prompt : undefined),
    ...(rawImageUrls.length ? { rawImageUrls } : {}),
  }
}

async function parseImageResponse(response: Response, mime: string, signal: AbortSignal): Promise<ImageProviderResult> {
  return parseImagePayload(await response.json(), mime, signal)
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ?? false
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getNumberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

async function readJsonServerSentEvents(response: Response, onEvent: (event: Record<string, unknown>) => void | Promise<void>): Promise<void> {
  if (!response.body) throw new Error('上游流式接口没有返回响应体')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushEvent = async (chunk: string) => {
    const dataLines = chunk
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]')
    if (!dataLines.length) return

    const data = dataLines.join('\n')
    try {
      const event = JSON.parse(data) as unknown
      if (event && typeof event === 'object' && !Array.isArray(event)) {
        await onEvent(event as Record<string, unknown>)
      }
    } catch {
      // Ignore comments or non-JSON keepalive frames from compatible gateways.
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let splitIndex = buffer.search(/\r?\n\r?\n/)
    while (splitIndex >= 0) {
      const chunk = buffer.slice(0, splitIndex)
      buffer = buffer.slice(buffer[splitIndex] === '\r' ? splitIndex + 4 : splitIndex + 2)
      await flushEvent(chunk)
      splitIndex = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) await flushEvent(buffer)
}

function streamEventToPayload(event: Record<string, unknown>): any {
  if (Array.isArray(event.data)) return { data: event.data }
  return {
    data: [{
      b64_json: getStringValue(event, 'b64_json'),
      url: getStringValue(event, 'url'),
      revised_prompt: getStringValue(event, 'revised_prompt'),
    }],
    size: getStringValue(event, 'size'),
    quality: getStringValue(event, 'quality'),
    output_format: getStringValue(event, 'output_format'),
  }
}

async function parseImageStreamResponse(response: Response, mime: string, signal: AbortSignal): Promise<ImageProviderResult> {
  const completedPayloads: any[] = []
  let resultPayload: any = null

  await readJsonServerSentEvents(response, (event) => {
    const type = getStringValue(event, 'type')
    const object = getStringValue(event, 'object')
    if (type === 'image_generation.partial_image' || type === 'image_edit.partial_image') return
    if (object === 'image.generation.result' || object === 'image.edit.result') {
      resultPayload = streamEventToPayload(event)
      return
    }
    if (type === 'image_generation.completed' || type === 'image_edit.completed') {
      completedPayloads.push(streamEventToPayload(event))
    }
  })

  if (resultPayload) return parseImagePayload(resultPayload, mime, signal)
  if (completedPayloads.length) {
    const merged = {
      data: completedPayloads.flatMap((payload) => Array.isArray(payload.data) ? payload.data : []),
      size: completedPayloads[0]?.size,
      quality: completedPayloads[0]?.quality,
      output_format: completedPayloads[0]?.output_format,
    }
    return parseImagePayload(merged, mime, signal)
  }

  throw new Error('上游流式接口没有返回最终图片数据')
}

async function sendWithTimeout(endpoint: string, init: RequestInit, timeoutMs: number): Promise<{ response: Response; signal: AbortSignal }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(endpoint, {
      ...init,
      signal: controller.signal,
    })
    return { response, signal: controller.signal }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw createTimeoutError(timeoutMs, endpoint)
    throw createNetworkError(error, endpoint)
  } finally {
    clearTimeout(timeout)
  }
}

async function callTextGeneration(input: ImageProviderInput, context: ProviderCallContext, mode: RequestFeatureMode): Promise<ImageProviderResult> {
  const body: Record<string, unknown> = {
    model: context.model,
    prompt: context.prompt,
  }
  appendCommonJsonBody(body, input.params, mode.optionalParams)
  if (input.params.n > 1) body.n = input.params.n
  if (mode.stream) {
    body.stream = true
    body.partial_images = 2
  }
  if (mode.responseFormat) body.response_format = 'b64_json'

  const { response, signal } = await sendWithTimeout(context.generationEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, context.timeoutMs)

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new UpstreamHttpError(response.status, `${safeEndpointLabel(context.generationEndpoint)} 返回错误：${message}`)
  }

  return isEventStreamResponse(response)
    ? parseImageStreamResponse(response, context.mime, signal)
    : parseImageResponse(response, context.mime, signal)
}

async function callImageEdit(input: ImageProviderInput, context: ProviderCallContext, mode: RequestFeatureMode): Promise<ImageProviderResult> {
  const formData = new FormData()
  formData.append('model', context.model)
  formData.append('prompt', context.prompt)
  appendCommonFormData(formData, input.params, mode.optionalParams)
  if (input.params.n > 1) formData.append('n', String(input.params.n))
  if (mode.stream) {
    formData.append('stream', 'true')
    formData.append('partial_images', '2')
  }
  if (mode.responseFormat) formData.append('response_format', 'b64_json')

  for (let i = 0; i < input.inputImageDataUrls.length; i += 1) {
    const blob = dataUrlToBlob(input.inputImageDataUrls[i])
    const ext = blob.type.split('/')[1] || 'png'
    formData.append(input.inputImageDataUrls.length === 1 ? 'image' : 'image[]', blob, `input-${i + 1}.${ext}`)
  }

  if (input.maskDataUrl) {
    const maskBlob = dataUrlToBlob(input.maskDataUrl)
    formData.append('mask', maskBlob, 'mask.png')
  }

  const { response, signal } = await sendWithTimeout(context.editEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
    },
    body: formData,
  }, context.timeoutMs)

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new UpstreamHttpError(response.status, `${safeEndpointLabel(context.editEndpoint)} 返回错误：${message}`)
  }

  return isEventStreamResponse(response)
    ? parseImageStreamResponse(response, context.mime, signal)
    : parseImageResponse(response, context.mime, signal)
}

class UpstreamHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

interface ProviderCallContext {
  apiKey: string
  model: string
  prompt: string
  timeoutMs: number
  mime: string
  generationEndpoint: string
  editEndpoint: string
}

async function callSingleImage(input: ImageProviderInput, context: ProviderCallContext): Promise<ImageProviderResult> {
  const singleInput: ImageProviderInput = {
    ...input,
    params: {
      ...input.params,
      n: 1,
    },
  }
  const isEdit = singleInput.inputImageDataUrls.length > 0 || Boolean(singleInput.maskDataUrl)
  const caller = isEdit ? callImageEdit : callTextGeneration
  const attempts: RequestFeatureMode[] = [
    { stream: true, responseFormat: false, optionalParams: true },
    { stream: false, responseFormat: false, optionalParams: true },
    { stream: false, responseFormat: false, optionalParams: false },
    { stream: false, responseFormat: true, optionalParams: false },
  ]

  let lastError: unknown
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      return await caller(singleInput, context, attempts[index])
    } catch (error) {
      lastError = error
      if (!(error instanceof UpstreamHttpError)) break
      if (index === 0 && shouldRetryWithoutStream(error.status, error.message)) continue
      if (shouldRetryWithoutResponseFormat(error.status, error.message)) continue
      if (index <= 2 && shouldRetryWithoutOptionalParams(error.status, error.message)) continue
      break
    }
  }
  throw lastError
}

async function runLimited<T>(count: number, limit: number, worker: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, count) }, async () => {
    while (nextIndex < count) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(index)
    }
  })
  await Promise.all(workers)
  return results
}

function mergeResults(results: ImageProviderResult[], params: ImageProviderParams): ImageProviderResult {
  const images = results.flatMap((result) => result.images)
  const rawImageUrls = results.flatMap((result) => result.rawImageUrls ?? [])
  const revisedPrompts = results.flatMap((result) =>
    result.revisedPrompts?.length ? result.revisedPrompts : result.images.map(() => undefined),
  )
  const actualParamsList = results.flatMap((result) =>
    result.actualParamsList?.length ? result.actualParamsList : result.images.map(() => result.actualParams),
  )

  return {
    images,
    actualParams: {
      size: results[0]?.actualParams?.size || params.size,
      quality: results[0]?.actualParams?.quality || params.quality,
      output_format: results[0]?.actualParams?.output_format || params.output_format,
      n: images.length,
    },
    actualParamsList,
    revisedPrompts,
    ...(rawImageUrls.length ? { rawImageUrls } : {}),
  }
}

export async function generateWithOpenAICompatible(input: ImageProviderInput): Promise<ImageProviderResult> {
  const runtimeConfig = await readImageProviderConfig()
  const apiKey = runtimeConfig.openaiApiKey || getRequiredEnv('PLATFORM_OPENAI_API_KEY')
  const baseUrl = normalizeOpenAICompatibleBaseUrl(runtimeConfig.openaiBaseUrl)
  const context: ProviderCallContext = {
    apiKey,
    model: runtimeConfig.openaiImageModel || 'gpt-image-2',
    prompt: enhancePromptForChineseText(input.prompt),
    timeoutMs: runtimeConfig.upstreamTimeoutMs || Number(getEnv('PLATFORM_UPSTREAM_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS,
    mime: getMime(input.params.output_format),
    generationEndpoint: buildEndpoint(baseUrl, 'images/generations'),
    editEndpoint: buildEndpoint(baseUrl, 'images/edits'),
  }

  const count = Math.max(1, Math.trunc(input.params.n || 1))
  const results = await runLimited(count, MAX_PARALLEL_REQUESTS, () => callSingleImage(input, context))
  return mergeResults(results, input.params)
}
