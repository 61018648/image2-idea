export function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

export function errorResponse(message: string, status = 400, code = 'bad_request'): Response {
  return jsonResponse({ error: { message, code } }, { status })
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.replace(/\/+$/, '')
  } catch {
    return value.trim().replace(/\/+$/, '')
  }
}

function firstHeaderValue(value: string | null): string {
  return value?.split(',')[0]?.trim() ?? ''
}

export function isSameOrigin(request: Request, extraAllowedOrigins: string[] = []): boolean {
  const origin = request.headers.get('origin') || request.headers.get('referer')
  if (!origin) return true
  try {
    const requestUrl = new URL(request.url)
    const sourceOrigin = normalizeOrigin(origin)
    if (sourceOrigin === normalizeOrigin(requestUrl.origin)) return true

    const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
    const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto')) || requestUrl.protocol.replace(':', '')
    const host = firstHeaderValue(request.headers.get('host'))

    const allowedOrigins = new Set(
      [
        process.env.PLATFORM_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173',
        process.env.PLATFORM_PUBLIC_BASE_URL || '',
        forwardedHost ? `${forwardedProto}://${forwardedHost}` : '',
        host ? `${forwardedProto}://${host}` : '',
        ...extraAllowedOrigins,
      ].join(',')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    for (const item of Array.from(allowedOrigins)) {
      allowedOrigins.delete(item)
      allowedOrigins.add(normalizeOrigin(item))
    }
    return allowedOrigins.has(sourceOrigin)
  } catch {
    return false
  }
}

export async function readJsonRequest<T = unknown>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new Error('Invalid JSON request body')
  }
}

export function getQueryNumber(request: Request, name: string, fallback: number, min: number, max: number): number {
  const value = Number(new URL(request.url).searchParams.get(name))
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
