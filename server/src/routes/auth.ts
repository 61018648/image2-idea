import { randomUUID } from 'node:crypto'
import { createSessionCookie, clearSessionCookie, readCookieSession } from '../auth/cookieSession.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { getBillingStore } from '../billing/store.js'
import { getPrismaClient } from '../db/prisma.js'
import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'

interface AuthBody {
  email?: unknown
  password?: unknown
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function validateAuthInput(email: string, password: string): string | null {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return 'Valid email is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 128) return 'Password is too long'
  return null
}

function requireDatabase(): Response | null {
  if (process.env.DATABASE_URL?.trim()) return null
  return errorResponse('Database is required for platform auth. Use PLATFORM_DEV_MODE=true for no-database development.', 500, 'database_required')
}

function authResponse(payload: unknown, cookie?: string): Response {
  return jsonResponse(payload, {
    headers: cookie ? { 'Set-Cookie': cookie } : undefined,
  })
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const dbError = requireDatabase()
  if (dbError) return dbError

  const prisma = getPrismaClient()
  const url = new URL(request.url)
  const pathname = url.pathname

  if (pathname === '/api/platform/auth/session' && request.method === 'GET') {
    const session = readCookieSession(request.headers)
    if (!session) return errorResponse('Unauthorized', 401, 'unauthorized')
    const account = await prisma.userAccount.findUnique({ where: { id: session.userId } })
    if (!account || account.status !== 'active') return errorResponse('Unauthorized', 401, 'unauthorized')
    return jsonResponse({ user: { id: account.id, email: account.email, mode: 'authenticated' } })
  }

  if (pathname === '/api/platform/auth/logout' && request.method === 'POST') {
    return authResponse({ ok: true }, clearSessionCookie())
  }

  if ((pathname === '/api/platform/auth/register' || pathname === '/api/platform/auth/login') && request.method === 'POST') {
    const body = await readJsonRequest<AuthBody>(request)
    const email = normalizeEmail(body.email)
    const password = normalizePassword(body.password)
    const validationError = validateAuthInput(email, password)
    if (validationError) return errorResponse(validationError, 400, 'bad_request')

    if (pathname === '/api/platform/auth/register') {
      const existing = await prisma.userAccount.findUnique({ where: { email } })
      if (existing) return errorResponse('Email is already registered', 409, 'email_exists')
      const passwordHash = await hashPassword(password)
      const account = await prisma.userAccount.create({
        data: {
          id: `usr_${randomUUID().replace(/-/g, '')}`,
          email,
          passwordHash,
          displayName: email.split('@')[0],
          role: 'user',
          status: 'active',
          lastLoginAt: new Date(),
          balance: { create: { availableCredits: 0 } },
        },
      })
      await getBillingStore().getOrCreateAccount(account.id).catch(() => undefined)
      return authResponse({ user: { id: account.id, email: account.email, mode: 'authenticated' } }, createSessionCookie({ userId: account.id, email }))
    }

    const account = await prisma.userAccount.findUnique({ where: { email } })
    if (!account || !account.passwordHash || account.status !== 'active') return errorResponse('Invalid email or password', 401, 'invalid_credentials')
    const passwordOk = await verifyPassword(password, account.passwordHash)
    if (!passwordOk) return errorResponse('Invalid email or password', 401, 'invalid_credentials')
    await prisma.userAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } })
    return authResponse({ user: { id: account.id, email: account.email, mode: 'authenticated' } }, createSessionCookie({ userId: account.id, email }))
  }

  return errorResponse('Not found', 404, 'not_found')
}
