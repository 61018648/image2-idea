import { readRequiredSession } from '../auth/session.js'
import { errorResponse, getQueryNumber, jsonResponse } from '../http.js'
import { getBillingStore } from '../billing/store.js'

export async function handleAccountRequest(request: Request): Promise<Response> {
  try {
    const session = readRequiredSession(request.headers)
    const store = getBillingStore()
    const url = new URL(request.url)

    if (url.pathname === '/api/platform/me' && request.method === 'GET') {
      const account = await store.getOrCreateAccount(session.userId)
      return jsonResponse({ user: { id: session.userId, mode: session.mode }, account })
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

    return errorResponse('Not found', 404, 'not_found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
