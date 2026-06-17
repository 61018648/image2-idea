import { errorResponse, jsonResponse } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { getGenerationJobStore } from '../generationJobs/store.js'
import { readRequiredSession } from '../auth/session.js'
import { getPrismaClient } from '../db/prisma.js'

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

  if (process.env.DATABASE_URL?.trim()) {
    const account = await getPrismaClient().userAccount.findUnique({
      where: { id: session.userId },
      select: { role: true, status: true },
    })
    if (account?.status === 'active' && account.role === 'admin') return session
  }

  throw new Error('Forbidden')
}

export async function handleAdminRequest(request: Request): Promise<Response> {
  try {
    await assertAdmin(request)

    const [billing, jobs] = await Promise.all([
      getBillingStore().getAdminStats(),
      getGenerationJobStore().getAdminStats(),
    ])

    return jsonResponse({
      billing,
      jobs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'Unauthorized') return errorResponse(message, 401, 'unauthorized')
    if (message === 'Forbidden') return errorResponse(message, 403, 'forbidden')
    return errorResponse(message, 400, 'bad_request')
  }
}
