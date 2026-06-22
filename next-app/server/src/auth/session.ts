import { readCookieSession } from './cookieSession.js'

export interface PlatformSession {
  userId: string
  mode: 'development' | 'authenticated'
  email?: string
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function getBearerToken(headers: Headers): string {
  const auth = headers.get('authorization')?.trim() ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  return auth.slice(7).trim()
}

export async function readRequiredSession(request: Request): Promise<PlatformSession> {
  const headers = request.headers
  const devMode = readEnv('PLATFORM_DEV_MODE') === 'true'
  if (devMode) {
    const userId = headers.get('x-platform-user-id')?.trim() || 'dev-user'
    return { userId, mode: 'development' }
  }

  const cookieSession = readCookieSession(headers)
  if (cookieSession) {
    return {
      userId: cookieSession.userId,
      ...(cookieSession.email ? { email: cookieSession.email } : {}),
      mode: 'authenticated',
    }
  }

  const expectedToken = readEnv('PLATFORM_API_TOKEN')
  if (!expectedToken) {
    if (readEnv('PLATFORM_SESSION_SECRET')) throw new Error('Unauthorized')
    throw new Error('Platform auth is not configured')
  }

  const bearer = getBearerToken(headers)
  if (!bearer || bearer !== expectedToken) {
    throw new Error('Unauthorized')
  }

  const userId = headers.get('x-platform-user-id')?.trim() ?? ''
  if (!userId) {
    throw new Error('Authenticated user ID is required')
  }

  return { userId, mode: 'authenticated' }
}
