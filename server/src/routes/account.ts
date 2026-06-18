import { readRequiredSession } from '../auth/session.js'
import { errorResponse, getQueryNumber, jsonResponse, readJsonRequest } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { findMysqlUserByEmail, findMysqlUserById, updateMysqlUserProfile } from '../auth/mysqlAccounts.js'
import { useMysqlCompat } from '../db/mysqlCompat.js'
import { getPrismaClient } from '../db/prisma.js'

interface UpdateProfileBody {
  email?: unknown
  phone?: unknown
  displayName?: unknown
  avatarUrl?: unknown
}

async function readUserRole(userId: string, mode: 'development' | 'authenticated'): Promise<'admin' | 'user'> {
  if (mode === 'development') return 'admin'
  if (useMysqlCompat()) {
    const account = await findMysqlUserById(userId)
    return account?.role === 'admin' ? 'admin' : 'user'
  }
  if (!process.env.DATABASE_URL?.trim()) return 'user'
  const account = await getPrismaClient().userAccount.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return account?.role === 'admin' ? 'admin' : 'user'
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function normalizeEmail(value: unknown): string | null | undefined {
  const email = normalizeOptionalText(value, 191)
  if (email == null) return email
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Valid email is required')
  return email.toLowerCase()
}

async function readProfile(userId: string, mode: 'development' | 'authenticated') {
  if (mode === 'development') {
    return { username: 'dev', email: 'dev@example.com', phone: null, displayName: 'Development User', avatarUrl: null, role: 'admin' as const }
  }
  if (useMysqlCompat()) {
    const account = await findMysqlUserById(userId)
    return {
      username: account?.username ?? null,
      email: account?.email ?? null,
      phone: account?.phone ?? null,
      displayName: account?.displayName ?? null,
      avatarUrl: account?.avatarUrl ?? null,
      role: account?.role === 'admin' ? 'admin' as const : 'user' as const,
    }
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return { username: null, email: null, phone: null, displayName: null, avatarUrl: null, role: 'user' as const }
  }
  const account = await getPrismaClient().userAccount.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true, avatarUrl: true, role: true },
  })
  return {
    username: account?.displayName ?? null,
    email: account?.email ?? null,
    phone: null,
    displayName: account?.displayName ?? null,
    avatarUrl: account?.avatarUrl ?? null,
    role: account?.role === 'admin' ? 'admin' as const : 'user' as const,
  }
}

export async function handleAccountRequest(request: Request): Promise<Response> {
  try {
    const session = await readRequiredSession(request)
    const store = getBillingStore()
    const url = new URL(request.url)

    if (url.pathname === '/api/platform/me' && request.method === 'GET') {
      const account = await store.getOrCreateAccount(session.userId)
      const profile = await readProfile(session.userId, session.mode)
      return jsonResponse({
        user: { id: session.userId, mode: session.mode, username: profile.username, email: profile.email ?? session.email, role: profile.role },
        account: { ...account, displayName: profile.displayName ?? account.displayName, avatarUrl: profile.avatarUrl, phone: profile.phone },
      })
    }

    if (url.pathname === '/api/platform/me' && request.method === 'PATCH') {
      if (session.mode !== 'authenticated') return errorResponse('Profile update requires an authenticated user', 401, 'unauthorized')
      const body = await readJsonRequest<UpdateProfileBody>(request)
      const email = normalizeEmail(body.email)
      const phone = normalizeOptionalText(body.phone, 32)
      const displayName = normalizeOptionalText(body.displayName, 191)
      const avatarUrl = normalizeOptionalText(body.avatarUrl, 256_000)

      if (useMysqlCompat()) {
        if (email) {
          const existing = await findMysqlUserByEmail(email)
          if (existing && existing.id !== session.userId) return errorResponse('Email is already registered', 409, 'email_exists')
        }
        const updated = await updateMysqlUserProfile(session.userId, { email, phone, displayName, avatarUrl })
        return jsonResponse({
          user: { id: updated.id, mode: session.mode, username: updated.username, email: updated.email, role: updated.role === 'admin' ? 'admin' : 'user' },
          account: { userId: updated.id, displayName: updated.displayName ?? undefined, avatarUrl: updated.avatarUrl ?? undefined, phone: updated.phone ?? undefined },
        })
      }

      const prisma = getPrismaClient()
      if (email) {
        const existing = await prisma.userAccount.findUnique({ where: { email }, select: { id: true } })
        if (existing && existing.id !== session.userId) return errorResponse('Email is already registered', 409, 'email_exists')
      }
      const updated = await prisma.userAccount.update({
        where: { id: session.userId },
        data: {
          ...(email !== undefined ? { email } : {}),
          ...(displayName !== undefined ? { displayName } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      })
      return jsonResponse({
        user: { id: updated.id, mode: session.mode, email: updated.email, role: updated.role === 'admin' ? 'admin' : 'user' },
        account: { userId: updated.id, displayName: updated.displayName ?? undefined, avatarUrl: updated.avatarUrl ?? undefined },
      })
    }

    if (url.pathname === '/api/platform/balance' && request.method === 'GET') {
      const balance = await store.getBalance(session.userId)
      return jsonResponse({ balance })
    }

    if (url.pathname === '/api/platform/ledger' && request.method === 'GET') {
      const limit = getQueryNumber(request, 'limit', 50, 1, 100)
      const entries = await store.listLedger(session.userId, limit)
      return jsonResponse({ entries })
    }

    if (url.pathname === '/api/platform/packages' && request.method === 'GET') {
      const packages = await store.listUserPlanPackages(session.userId)
      return jsonResponse({ packages })
    }

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
