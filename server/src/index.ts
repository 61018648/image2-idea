import { createServer, type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import { initBillingStore } from './billing/store.js'
import { handleAccountRequest } from './routes/account.js'
import { handleAssetRequest, isAssetRequest } from './routes/assets.js'
import { handleAuthRequest } from './routes/auth.js'
import { handleOrdersRequest } from './routes/orders.js'
import { handleAdminRequest } from './routes/admin.js'
import { handleGenerationsRequest } from './routes/generations.js'
import { handlePaymentNotifyRequest } from './routes/paymentNotify.js'
import { handlePlatformImageGeneration } from './routes/platformImages.js'

const HOST = process.env.PLATFORM_HOST || '127.0.0.1'
const PORT = Number(process.env.PLATFORM_PORT || 8788)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

function hasRequestBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD'
}

function readIncomingBody(incoming: IncomingMessage): Promise<string | undefined> {
  const method = incoming.method || 'GET'
  if (!hasRequestBody(method)) return Promise.resolve(undefined)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    incoming.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    incoming.on('error', reject)
  })
}

function getExternalOrigin(incoming: IncomingMessage): string {
  const protoHeader = incoming.headers['x-forwarded-proto']
  const hostHeader = incoming.headers['x-forwarded-host'] ?? incoming.headers.host
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'http'
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || `${HOST}:${PORT}`
  return `${proto}://${host}`
}

async function createWebRequest(incoming: IncomingMessage): Promise<Request> {
  const method = incoming.method || 'GET'
  return new Request(new URL(incoming.url || '/', getExternalOrigin(incoming)), {
    method,
    headers: toHeaders(incoming.headers),
    body: await readIncomingBody(incoming),
  })
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/api/platform/health') {
    return jsonResponse({ ok: true, service: 'gpt-image-playground-platform-server' })
  }

  if (isAssetRequest(url.pathname)) {
    return handleAssetRequest(request)
  }

  if (url.pathname.startsWith('/api/platform/auth/')) {
    return handleAuthRequest(request)
  }

  if (url.pathname === '/api/platform/me' || url.pathname === '/api/platform/balance' || url.pathname === '/api/platform/ledger') {
    return handleAccountRequest(request)
  }

  if (url.pathname === '/api/platform/plans' || url.pathname === '/api/platform/orders' || url.pathname === '/api/platform/checkout') {
    return handleOrdersRequest(request)
  }

  if (url.pathname === '/api/platform/payments/notify') {
    return handlePaymentNotifyRequest(request)
  }

  if (url.pathname === '/api/platform/admin/stats') {
    return handleAdminRequest(request)
  }

  if (url.pathname === '/api/platform/generations') {
    return handleGenerationsRequest(request)
  }

  if (url.pathname === '/api/platform/images/generations') {
    return handlePlatformImageGeneration(request)
  }

  return jsonResponse({ error: { message: 'Not found', code: 'not_found' } }, 404)
}

async function main() {
  await initBillingStore()

  createServer(async (incoming, outgoing) => {
    try {
      const request = await createWebRequest(incoming)
      const response = await route(request)
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()))
      if (response.body) {
        const reader = response.body.getReader()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          outgoing.write(value)
        }
      }
      outgoing.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outgoing.writeHead(500, { 'Content-Type': 'application/json' })
      outgoing.end(JSON.stringify({ error: { message, code: 'internal_error' } }))
    }
  }).listen(PORT, HOST, () => {
    console.log(`Platform server listening on http://${HOST}:${PORT}`)
  })
}

void main()
