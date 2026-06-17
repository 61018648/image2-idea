import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'platform_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export interface CookieSessionPayload {
  userId: string
  email?: string
  exp: number
}

function getSessionSecret(): string {
  return process.env.PLATFORM_SESSION_SECRET?.trim() || ''
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name) cookies[name] = decodeURIComponent(value)
  }
  return cookies
}

function cookieBase(sameSite: 'Lax' | 'None' = 'Lax'): string {
  const secure = process.env.PLATFORM_COOKIE_SECURE === 'true' || sameSite === 'None'
  return `Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`
}

export function createSessionCookie(input: { userId: string; email?: string }): string {
  const secret = getSessionSecret()
  if (!secret) throw new Error('Platform session secret is not configured')
  const payload = base64UrlJson({
    userId: input.userId,
    ...(input.email ? { email: input.email } : {}),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  })
  return `${COOKIE_NAME}=${encodeURIComponent(`${payload}.${sign(payload, secret)}`)}; ${cookieBase()}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readCookieSession(headers: Headers): CookieSessionPayload | null {
  const secret = getSessionSecret()
  if (!secret) return null
  const raw = parseCookies(headers.get('cookie') || '')[COOKIE_NAME]
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(signature)
  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<CookieSessionPayload>
    if (!parsed.userId || typeof parsed.exp !== 'number') return null
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    return {
      userId: parsed.userId,
      ...(parsed.email ? { email: parsed.email } : {}),
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}
