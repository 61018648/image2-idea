import { createSessionCookie, clearSessionCookie, readCookieSession } from '../auth/cookieSession.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { createMysqlUser, findMysqlUserByLogin, findMysqlUserByUsername, findMysqlUserById, updateMysqlUserLastLogin } from '../auth/mysqlAccounts.js'
import { readPlatformConfig } from '../admin/configStore.js'
import { getBillingStore } from '../billing/store.js'
import { useMysqlCompat } from '../db/mysqlCompat.js'
import { getPrismaClient } from '../db/prisma.js'
import { sendEmailVerificationCode, verifyEmailCode } from '../email/smtp.js'
import { errorResponse, jsonResponse, readJsonRequest } from '../http.js'

interface AuthBody {
  username?: unknown
  email?: unknown
  password?: unknown
  verificationCode?: unknown
}

interface VerificationBody {
  email?: unknown
  purpose?: unknown
}

function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function validateAuthInput(username: string, password: string): string | null {
  if (!username || username.length < 3) return 'Username must be at least 3 characters'
  if (username.length > 64) return 'Username is too long'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 128) return 'Password is too long'
  return null
}

function requireDatabase(): Response | null {
  if (useMysqlCompat()) return null
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

  const url = new URL(request.url)
  const pathname = url.pathname

  if (pathname === '/api/platform/auth/session' && request.method === 'GET') {
    const session = readCookieSession(request.headers)
    if (!session) return errorResponse('Unauthorized', 401, 'unauthorized')
    if (useMysqlCompat()) {
      const account = await findMysqlUserById(session.userId)
      if (!account || account.status !== 'active') return errorResponse('Unauthorized', 401, 'unauthorized')
      return jsonResponse({ user: { id: account.id, username: account.username, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } })
    }
    const prisma = getPrismaClient()
    const account = await prisma.userAccount.findUnique({ where: { id: session.userId } })
    if (!account || account.status !== 'active') return errorResponse('Unauthorized', 401, 'unauthorized')
    return jsonResponse({ user: { id: account.id, username: account.username ?? account.displayName, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } })
  }

  if (pathname === '/api/platform/auth/logout' && request.method === 'POST') {
    return authResponse({ ok: true }, clearSessionCookie())
  }

  if (pathname === '/api/platform/auth/email-code' && request.method === 'POST') {
    const body = await readJsonRequest<VerificationBody>(request)
    const email = normalizeEmail(body.email)
    const purpose = body.purpose === 'profile_email' ? 'profile_email' : 'register'
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return errorResponse('Valid email is required', 400, 'bad_request')
    await sendEmailVerificationCode({ email, purpose })
    return jsonResponse({ ok: true })
  }

  if ((pathname === '/api/platform/auth/register' || pathname === '/api/platform/auth/login') && request.method === 'POST') {
    const body = await readJsonRequest<AuthBody>(request)
    const username = normalizeUsername(body.username ?? body.email)
    const password = normalizePassword(body.password)
    const validationError = validateAuthInput(username, password)
    if (validationError) return errorResponse(validationError, 400, 'bad_request')

    if (pathname === '/api/platform/auth/register') {
      const email = normalizeEmail(body.email)
      const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode.trim() : ''
      const config = await readPlatformConfig()
      if (config.emailVerificationOnRegister) {
        if (!email) return errorResponse('Email is required', 400, 'email_required')
        const verified = await verifyEmailCode({ email, purpose: 'register', code: verificationCode })
        if (!verified) return errorResponse('Invalid email verification code', 400, 'invalid_email_code')
      }
      if (useMysqlCompat()) {
        const existing = await findMysqlUserByUsername(username)
        if (existing) return errorResponse('Username is already registered', 409, 'username_exists')
        const passwordHash = await hashPassword(password)
        const account = await createMysqlUser({
          username,
          email: email || null,
          passwordHash,
          displayName: username,
        })
        await getBillingStore().getOrCreateAccount(account.id).catch(() => undefined)
        return authResponse({ user: { id: account.id, username: account.username, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } }, createSessionCookie({ userId: account.id }))
      }

      const prisma = getPrismaClient()
      const existing = await prisma.userAccount.findFirst({ where: { username } })
      if (existing) return errorResponse('Username is already registered', 409, 'username_exists')
      const passwordHash = await hashPassword(password)
      const account = await prisma.userAccount.create({
        data: {
          id: String(Date.now()),
          username,
          email: email || null,
          passwordHash,
          displayName: username,
          role: 'user',
          status: 'active',
          lastLoginAt: new Date(),
          balance: { create: { availableCredits: 0 } },
        },
      })
      await getBillingStore().getOrCreateAccount(account.id).catch(() => undefined)
      return authResponse({ user: { id: account.id, username: account.username, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } }, createSessionCookie({ userId: account.id }))
    }

    if (useMysqlCompat()) {
      const account = await findMysqlUserByLogin(username)
      if (!account || !account.passwordHash || account.status !== 'active') return errorResponse('Invalid username or password', 401, 'invalid_credentials')
      const passwordOk = await verifyPassword(password, account.passwordHash)
      if (!passwordOk) return errorResponse('Invalid username or password', 401, 'invalid_credentials')
      await updateMysqlUserLastLogin(account.id)
      return authResponse({ user: { id: account.id, username: account.username, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } }, createSessionCookie({ userId: account.id }))
    }

    const prisma = getPrismaClient()
    const account = await prisma.userAccount.findFirst({
      where: { OR: [{ username }, { email: username }, { displayName: username }] },
    })
    if (!account || !account.passwordHash || account.status !== 'active') return errorResponse('Invalid username or password', 401, 'invalid_credentials')
    const passwordOk = await verifyPassword(password, account.passwordHash)
    if (!passwordOk) return errorResponse('Invalid username or password', 401, 'invalid_credentials')
    await prisma.userAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } })
    return authResponse({ user: { id: account.id, username: account.username ?? account.displayName, email: account.email, role: account.role === 'admin' ? 'admin' : 'user', mode: 'authenticated' } }, createSessionCookie({ userId: account.id }))
  }

  return errorResponse('Not found', 404, 'not_found')
}
