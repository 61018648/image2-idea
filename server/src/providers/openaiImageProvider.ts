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

function getEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function normalizeBaseUrl(value: string): string {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function getMime(outputFormat: string): string {
  if (outputFormat === 'jpeg') return 'image/jpeg'
  if (outputFormat === 'webp') return 'image/webp'
  return 'image/png'
}

function normalizeBase64Image(value: string, mime: string): string {
  return value.startsWith('data:') ? value : `data:${mime};base64,${value}`
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as any
    return payload?.error?.message || payload?.message || payload?.detail || `HTTP ${response.status}`
  } catch {
    return await response.text().catch(() => `HTTP ${response.status}`)
  }
}

export async function generateWithOpenAICompatible(input: ImageProviderInput): Promise<ImageProviderResult> {
  if (input.inputImageDataUrls.length > 0 || input.maskDataUrl) {
    throw new Error('MVP platform server currently supports text-to-image only. Image editing will be added in a later phase.')
  }

  const apiKey = getRequiredEnv('PLATFORM_OPENAI_API_KEY')
  const baseUrl = normalizeBaseUrl(getEnv('PLATFORM_OPENAI_BASE_URL'))
  const model = getEnv('PLATFORM_OPENAI_IMAGE_MODEL') || 'gpt-image-2'
  const mime = getMime(input.params.output_format)
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    size: input.params.size,
    quality: input.params.quality,
    output_format: input.params.output_format,
    moderation: input.params.moderation,
    n: input.params.n,
    response_format: 'b64_json',
  }

  if (input.params.output_format !== 'png' && input.params.output_compression != null) {
    body.output_compression = input.params.output_compression
  }

  const timeoutMs = Number(getEnv('PLATFORM_UPSTREAM_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Upstream image API request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) throw new Error(await readErrorMessage(response))

  const payload = await response.json() as any
  const data = Array.isArray(payload?.data) ? payload.data : []
  const images = data
    .map((item: any) => item?.b64_json || item?.url)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    .map((value: string) => normalizeBase64Image(value, mime))

  if (images.length === 0) throw new Error('Upstream image API returned no recognizable images')

  return {
    images,
    actualParams: {
      size: typeof payload.size === 'string' ? payload.size : undefined,
      quality: payload.quality,
      output_format: payload.output_format,
      n: images.length,
    },
    revisedPrompts: data.map((item: any) => typeof item?.revised_prompt === 'string' ? item.revised_prompt : undefined),
  }
}
