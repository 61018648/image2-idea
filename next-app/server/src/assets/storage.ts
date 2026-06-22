import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface StoredAsset {
  id: string
  url: string
  mime: string
  bytes: number
}

export interface AssetStorage {
  saveImageDataUrl(input: {
    userId: string
    jobId: string
    dataUrl: string
    index: number
  }): Promise<StoredAsset>
  readAsset(assetId: string): Promise<{ bytes: Buffer; mime: string } | undefined>
}

const DEFAULT_ASSET_DIR = resolve(process.cwd(), '.platform-assets')
const ASSET_ID_PATTERN = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/

function getAssetDir(): string {
  return resolve(process.env.PLATFORM_ASSET_DIR?.trim() || DEFAULT_ASSET_DIR)
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s)
  if (!match) throw new Error('Unsupported image data URL')
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], 'base64'),
  }
}

function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

function mimeForAssetId(assetId: string): string {
  const ext = extname(assetId).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

function assertSafeAssetId(assetId: string): void {
  if (!ASSET_ID_PATTERN.test(assetId)) throw new Error('Invalid asset ID')
}

export function createLocalAssetStorage(): AssetStorage {
  const assetDir = getAssetDir()

  return {
    async saveImageDataUrl(input) {
      const parsed = parseDataUrl(input.dataUrl)
      const ext = extensionForMime(parsed.mime)
      const assetId = `asset_${randomUUID().replace(/-/g, '')}.${ext}`
      await mkdir(assetDir, { recursive: true })
      await writeFile(join(assetDir, assetId), parsed.bytes)
      return {
        id: assetId,
        url: `/api/platform/assets/${assetId}`,
        mime: parsed.mime,
        bytes: parsed.bytes.byteLength,
      }
    },

    async readAsset(assetId) {
      assertSafeAssetId(assetId)
      const filePath = resolve(assetDir, assetId)
      const relativePath = relative(assetDir, filePath)
      if (relativePath.startsWith('..') || relativePath === '' || resolve(assetDir, relativePath) !== filePath) {
        throw new Error('Invalid asset path')
      }
      try {
        const fileStat = await stat(filePath)
        if (!fileStat.isFile()) return undefined
        return {
          bytes: await readFile(filePath),
          mime: mimeForAssetId(assetId),
        }
      } catch {
        return undefined
      }
    },
  }
}

let cachedStorage: AssetStorage | null = null

export function getAssetStorage(): AssetStorage {
  cachedStorage ??= createLocalAssetStorage()
  return cachedStorage
}
