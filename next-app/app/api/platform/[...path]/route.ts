import { initBillingStore } from '../../../../server/src/billing/store'
import { routePlatformRequest } from '../../../../server/src/index'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let initPromise: Promise<unknown> | null = null

async function ensureReady() {
  initPromise ??= initBillingStore()
  await initPromise
}

async function handle(request: Request) {
  const pathname = new URL(request.url).pathname
  if (pathname === '/api/platform/health' || pathname === '/api/platform/config') {
    return routePlatformRequest(request)
  }
  await ensureReady()
  return routePlatformRequest(request)
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const PUT = handle
export const DELETE = handle
