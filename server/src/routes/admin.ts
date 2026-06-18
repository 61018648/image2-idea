import type mysql from 'mysql2/promise'
import { getBillingStore } from '../billing/store.js'
import { getGenerationJobStore } from '../generationJobs/store.js'
import { readImageProviderConfig, readPlatformConfig, updatePlatformConfig, type PlatformConfigPatch } from '../admin/configStore.js'
import type { Plan } from '../billing/types.js'
import { createMysqlUser, findMysqlUserById, findMysqlUserByUsername, migrateMysqlUserIdsToNumeric, updateMysqlUserProfile } from '../auth/mysqlAccounts.js'
import { hashPassword } from '../auth/password.js'
import { readRequiredSession } from '../auth/session.js'
import { getPrismaClient } from '../db/prisma.js'
import { mysqlQuery, useMysqlCompat } from '../db/mysqlCompat.js'
import { errorResponse, getQueryNumber, jsonResponse } from '../http.js'
import { normalizeOpenAICompatibleBaseUrl } from '../providers/openaiImageProvider.js'

function toIso(value: unknown): string {
  if (!value) return new Date(0).toISOString()
  const text = String(value)
  return text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
}

function getAdminUserIds(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_USER_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

async function assertAdmin(request: Request) {
  const session = await readRequiredSession(request)
  if (session.mode === 'development') return session
  if (getAdminUserIds().has(session.userId)) return session

  if (useMysqlCompat()) {
    const account = await findMysqlUserById(session.userId)
    if (account?.status === 'active' && account.role === 'admin') return session
  } else if (process.env.DATABASE_URL?.trim()) {
    const account = await getPrismaClient().userAccount.findUnique({
      where: { id: session.userId },
      select: { role: true, status: true },
    })
    if (account?.status === 'active' && account.role === 'admin') return session
  }

  throw new Error('Forbidden')
}

async function readStats() {
  const [billing, jobs] = await Promise.all([
    getBillingStore().getAdminStats(),
    getGenerationJobStore().getAdminStats(),
  ])
  return { billing, jobs }
}

async function listMysqlUsers(limit: number) {
  await migrateMysqlUserIdsToNumeric()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(
    `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.phone, u.admin_note, u.role, u.status, u.last_login_at, u.created_at, u.updated_at,
            COALESCE(b.available_credits, 0) available_credits,
            COUNT(o.id) order_count,
            COALESCE(SUM(CASE WHEN o.status='paid' THEN o.amount_cents ELSE 0 END), 0) paid_amount_cents
       FROM user_accounts u
       LEFT JOIN balances b ON b.user_id = u.id
       LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id, u.username, u.email, u.display_name, u.avatar_url, u.phone, u.admin_note, u.role, u.status, u.last_login_at, u.created_at, u.updated_at, b.available_credits
      ORDER BY u.created_at DESC
      LIMIT ${limit}`,
  )
  return rows.map((row) => ({
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    phone: row.phone ?? null,
    adminNote: row.admin_note ?? null,
    role: row.role || 'user',
    status: row.status || 'active',
    availableCredits: Number(row.available_credits) || 0,
    orderCount: Number(row.order_count) || 0,
    paidAmountCents: Number(row.paid_amount_cents) || 0,
    lastLoginAt: row.last_login_at ? toIso(row.last_login_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }))
}

async function listMysqlOrders(limit: number) {
  await migrateMysqlUserIdsToNumeric()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(
    `SELECT o.*, u.email, u.display_name
       FROM orders o
       LEFT JOIN user_accounts u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT ${limit}`,
  )
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.email ?? null,
    userDisplayName: row.display_name ?? null,
    planId: row.plan_id,
    status: row.status || 'pending',
    amountCents: Number(row.amount_cents) || 0,
    currency: row.currency || 'USD',
    credits: Number(row.credits) || 0,
    provider: row.provider || 'dev',
    providerOrderId: row.provider_order_id ?? null,
    providerPaymentId: row.provider_payment_id ?? null,
    createdAt: toIso(row.created_at),
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
  }))
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}

async function listMysqlGenerationLogs(limit: number) {
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(
    `SELECT g.*, u.email, u.display_name
       FROM generation_jobs g
       LEFT JOIN user_accounts u ON u.id = g.user_id
      ORDER BY g.created_at DESC
      LIMIT ${limit}`,
  )
  return rows.map((row) => {
    const params = parseJson<Record<string, unknown>>(row.request_params, {})
    const inputImages = parseJson<unknown[]>(row.input_image_data, [])
    const images = parseJson<unknown[]>(row.images, [])
    return {
      id: row.id,
      userId: row.user_id,
      userEmail: row.email ?? null,
      userDisplayName: row.display_name ?? null,
      status: row.status || 'queued',
      prompt: row.prompt || '',
      params,
      size: typeof params.size === 'string' ? params.size : 'auto',
      quality: typeof params.quality === 'string' ? params.quality : 'auto',
      outputFormat: typeof params.output_format === 'string' ? params.output_format : 'png',
      outputCompression: typeof params.output_compression === 'number' ? params.output_compression : null,
      moderation: typeof params.moderation === 'string' ? params.moderation : 'auto',
      n: Number(params.n) || 1,
      inputImageCount: inputImages.length,
      hasMask: Boolean(row.mask_data_url),
      costCredits: Number(row.cost_credits) || 0,
      imageCount: images.length,
      errorMessage: row.error_message ?? null,
      createdAt: toIso(row.created_at),
      startedAt: row.started_at ? toIso(row.started_at) : null,
      finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    }
  })
}

async function listPrismaGenerationLogs(limit: number) {
  const jobs = await getPrismaClient().generationJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { email: true, displayName: true } } },
  })
  return jobs.map((job) => {
    const params = job.requestParams && typeof job.requestParams === 'object' ? job.requestParams as Record<string, unknown> : {}
    const inputImages = Array.isArray(job.inputImageData) ? job.inputImageData : []
    const images = Array.isArray(job.images) ? job.images : []
    return {
      id: job.id,
      userId: job.userId,
      userEmail: job.user.email,
      userDisplayName: job.user.displayName,
      status: job.status,
      prompt: job.prompt,
      params,
      size: typeof params.size === 'string' ? params.size : 'auto',
      quality: typeof params.quality === 'string' ? params.quality : 'auto',
      outputFormat: typeof params.output_format === 'string' ? params.output_format : 'png',
      outputCompression: typeof params.output_compression === 'number' ? params.output_compression : null,
      moderation: typeof params.moderation === 'string' ? params.moderation : 'auto',
      n: Number(params.n) || 1,
      inputImageCount: inputImages.length,
      hasMask: Boolean(job.maskDataUrl),
      costCredits: job.costCredits,
      imageCount: images.length,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    }
  })
}

async function createAdminMysqlUser(body: Record<string, unknown>) {
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const adminNote = typeof body.adminNote === 'string' && body.adminNote.trim() ? body.adminNote.trim() : null
  const password = typeof body.password === 'string' ? body.password : ''
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : username
  const role = body.role === 'admin' ? 'admin' : 'user'
  const availableCredits = Number(body.availableCredits ?? 0)
  if (!username || username.length < 3) throw new Error('Username must be at least 3 characters')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Valid email is required')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  if (await findMysqlUserByUsername(username)) throw new Error('Username is already registered')
  const account = await createMysqlUser({
    username,
    email,
    phone,
    adminNote,
    passwordHash: await hashPassword(password),
    displayName,
    role,
    status: 'active',
    availableCredits: Number.isFinite(availableCredits) ? availableCredits : 0,
  })
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    phone: account.phone,
    adminNote: account.adminNote,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
  }
}

async function setUserCredits(userId: string, targetCredits: number, description?: string) {
  const balance = await getBillingStore().getBalance(userId)
  const delta = Math.trunc(targetCredits) - balance.availableCredits
  if (delta === 0) return { balance, ledgerEntry: null }
  return getBillingStore().adjustCredits({
    userId,
    amount: delta,
    description: description || `Admin set balance to ${Math.trunc(targetCredits)}`,
  })
}

async function updateAdminMysqlUser(body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!userId) throw new Error('User ID is required')
  const patch: { username?: string | null; email?: string | null; phone?: string | null; adminNote?: string | null; displayName?: string | null; passwordHash?: string | null; status?: string | null } = {}
  if (typeof body.username === 'string') {
    const username = body.username.trim()
    if (!username || username.length < 3) throw new Error('Username must be at least 3 characters')
    const existing = await findMysqlUserByUsername(username)
    if (existing && existing.id !== userId) throw new Error('Username is already registered')
    patch.username = username
  }
  if (typeof body.email === 'string') {
    const email = body.email.trim() ? body.email.trim().toLowerCase() : null
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Valid email is required')
    patch.email = email
  }
  if (typeof body.phone === 'string') {
    patch.phone = body.phone.trim() || null
  }
  if (typeof body.adminNote === 'string') {
    patch.adminNote = body.adminNote.trim() || null
  }
  if (typeof body.displayName === 'string') {
    patch.displayName = body.displayName.trim()
  }
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8) throw new Error('Password must be at least 8 characters')
    if (body.password.length > 128) throw new Error('Password is too long')
    patch.passwordHash = await hashPassword(body.password)
  }
  if (body.status === 'active' || body.status === 'disabled') {
    patch.status = body.status
  }
  const user = await updateMysqlUserProfile(userId, patch)
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      adminNote: user.adminNote,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    },
  }
}

async function listPrismaUsers(limit: number) {
  const prisma = getPrismaClient()
  const users = await prisma.userAccount.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { balance: true, orders: true },
  })
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    availableCredits: user.balance?.availableCredits ?? 0,
    orderCount: user.orders.length,
    paidAmountCents: user.orders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + order.amountCents, 0),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }))
}

async function listPrismaOrders(limit: number) {
  const orders = await getPrismaClient().order.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { email: true, displayName: true } } },
  })
  return orders.map((order) => ({
    id: order.id,
    userId: order.userId,
    userEmail: order.user.email,
    userDisplayName: order.user.displayName,
    planId: order.planId,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    credits: order.credits,
    provider: order.provider,
    providerOrderId: order.providerOrderId,
    providerPaymentId: order.providerPaymentId,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  }))
}

async function readSiteConfig() {
  const config = await readPlatformConfig()
  return {
    ...config,
    imageModel: config.openaiImageModel,
    imageBaseUrl: config.openaiBaseUrl,
    paymentProviders: {
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      wechat: Boolean(process.env.WECHAT_PAY_MCH_ID),
      alipay: Boolean(process.env.ALIPAY_APP_ID),
      dev: process.env.PLATFORM_DEV_MODE === 'true',
    },
    runtime: {
      devMode: process.env.PLATFORM_DEV_MODE === 'true',
      databaseDriver: process.env.PLATFORM_DB_DRIVER || (process.env.DATABASE_URL ? 'prisma' : 'none'),
      host: process.env.PLATFORM_HOST || '127.0.0.1',
      port: Number(process.env.PLATFORM_PORT || 8788),
    },
  }
}

function normalizePlanBody(body: Record<string, unknown>): Plan {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const credits = Number(body.credits)
  const priceCents = Number(body.priceCents)
  const currency = body.currency === 'USD' ? 'USD' : 'CNY'
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : true
  if (!id) throw new Error('Plan ID is required')
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(id)) throw new Error('Plan ID only supports letters, numbers, - and _')
  if (!name) throw new Error('Plan name is required')
  if (!Number.isFinite(credits) || credits <= 0) throw new Error('Plan credits must be greater than 0')
  if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error('Plan price must be greater than or equal to 0')
  return {
    id,
    name,
    credits: Math.trunc(credits),
    priceCents: Math.trunc(priceCents),
    currency,
    enabled,
  }
}

async function probeUpstreamModels(body: Record<string, unknown>) {
  const runtime = await readImageProviderConfig()
  const baseUrl = normalizeOpenAICompatibleBaseUrl(typeof body.baseUrl === 'string' && body.baseUrl.trim() ? body.baseUrl : runtime.openaiBaseUrl)
  const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : runtime.openaiApiKey
  if (!baseUrl) throw new Error('Upstream API Base URL is required')
  if (!apiKey) throw new Error('Upstream API Key is required before model detection')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(text || `Model detection failed: HTTP ${response.status}`)
    }
    const payload = await response.json() as any
    const models = Array.isArray(payload?.data)
      ? payload.data
        .map((item: any) => typeof item?.id === 'string' ? item.id : '')
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b))
      : []
    return { models }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('模型检测超时：超过 15 秒仍未返回')
    const cause = error && typeof error === 'object' && 'cause' in error ? String((error as { cause?: unknown }).cause ?? '') : ''
    if (error instanceof TypeError) throw new Error(`模型检测连接失败：无法连接到 ${baseUrl}/models。请检查 Base URL 是否只填写到 /v1、服务器网络/代理/证书是否可用。${cause ? ` 原始原因：${cause}` : ''}`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleAdminRequest(request: Request): Promise<Response> {
  try {
    await assertAdmin(request)
    const url = new URL(request.url)
    const limit = getQueryNumber(request, 'limit', 50, 1, 200)

    if (url.pathname === '/api/platform/admin/stats' || url.pathname === '/api/platform/admin/overview') {
      return jsonResponse(await readStats())
    }

    if (url.pathname === '/api/platform/admin/users' && request.method === 'GET') {
      return jsonResponse({ users: useMysqlCompat() ? await listMysqlUsers(limit) : await listPrismaUsers(limit) })
    }

    if (url.pathname === '/api/platform/admin/users' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>
      if (!useMysqlCompat()) throw new Error('Admin user creation currently requires MySQL mode')
      const user = await createAdminMysqlUser(body)
      return jsonResponse({ user }, { status: 201 })
    }

    if (url.pathname === '/api/platform/admin/users' && request.method === 'PATCH') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>
      if (!useMysqlCompat()) throw new Error('Admin user editing currently requires MySQL mode')
      return jsonResponse(await updateAdminMysqlUser(body))
    }

    if (url.pathname === '/api/platform/admin/orders') {
      return jsonResponse({ orders: useMysqlCompat() ? await listMysqlOrders(limit) : await listPrismaOrders(limit) })
    }

    if (url.pathname === '/api/platform/admin/plans' && request.method === 'GET') {
      return jsonResponse({ plans: await getBillingStore().listPlans() })
    }

    if (url.pathname === '/api/platform/admin/plans' && request.method === 'PATCH') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>
      const plan = await getBillingStore().upsertPlan(normalizePlanBody(body))
      return jsonResponse({ plan })
    }

    if (url.pathname === '/api/platform/admin/models' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>
      return jsonResponse(await probeUpstreamModels(body))
    }

    if (url.pathname === '/api/platform/admin/generation-logs') {
      return jsonResponse({ logs: useMysqlCompat() ? await listMysqlGenerationLogs(limit) : await listPrismaGenerationLogs(limit) })
    }

    if (url.pathname === '/api/platform/admin/config' && request.method === 'GET') {
      return jsonResponse({ config: await readSiteConfig() })
    }

    if (url.pathname === '/api/platform/admin/config' && request.method === 'PATCH') {
      const body = await request.json().catch(() => ({})) as PlatformConfigPatch
      await updatePlatformConfig(body)
      return jsonResponse({ config: await readSiteConfig() })
    }

    if (url.pathname === '/api/platform/admin/users/credits' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: unknown; amount?: unknown; description?: unknown }
      const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
      const amount = Number(body.amount)
      const description = typeof body.description === 'string' ? body.description.trim() : undefined
      if (!userId || !Number.isFinite(amount)) throw new Error('Invalid credit adjustment')
      const result = await getBillingStore().adjustCredits({
        userId,
        amount: Math.trunc(amount),
        description,
      })
      return jsonResponse(result)
    }

    if (url.pathname === '/api/platform/admin/users/balance' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: unknown; availableCredits?: unknown; description?: unknown }
      const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
      const availableCredits = Number(body.availableCredits)
      const description = typeof body.description === 'string' ? body.description.trim() : undefined
      if (!userId || !Number.isFinite(availableCredits) || availableCredits < 0) throw new Error('Invalid balance update')
      const result = await setUserCredits(userId, availableCredits, description)
      return jsonResponse(result)
    }

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Unauthorized') return errorResponse(message, 401, 'unauthorized')
    if (message === 'Forbidden') return errorResponse(message, 403, 'forbidden')
    return errorResponse(message, 400, 'bad_request')
  }
}
