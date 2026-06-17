import { getAssetStorage } from '../assets/storage.js'
import { errorResponse } from '../http.js'

const ASSET_PATH_PREFIX = '/api/platform/assets/'

export async function handleAssetRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return errorResponse('Method not allowed', 405, 'method_not_allowed')

  const url = new URL(request.url)
  const assetId = decodeURIComponent(url.pathname.slice(ASSET_PATH_PREFIX.length))
  if (!assetId) return errorResponse('Not found', 404, 'not_found')

  try {
    const asset = await getAssetStorage().readAsset(assetId)
    if (!asset) return errorResponse('Not found', 404, 'not_found')

    return new Response(request.method === 'HEAD' ? undefined : asset.bytes, {
      status: 200,
      headers: {
        'Content-Type': asset.mime,
        'Content-Length': String(asset.bytes.byteLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, 400, 'bad_request')
  }
}

export function isAssetRequest(pathname: string): boolean {
  return pathname.startsWith(ASSET_PATH_PREFIX)
}
