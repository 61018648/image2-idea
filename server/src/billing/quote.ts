export interface QuoteInput {
  n?: number
  size?: string
  quality?: string
}

function getSizeMultiplier(size: string | undefined): number {
  if (!size || size === 'auto') return 1
  const match = size.match(/^(\d+)x(\d+)$/)
  if (!match) return 1
  const pixels = Number(match[1]) * Number(match[2])
  if (!Number.isFinite(pixels)) return 1
  if (pixels >= 4096 * 4096) return 4
  if (pixels >= 2048 * 2048) return 2
  return 1
}

function getQualityMultiplier(quality: string | undefined): number {
  if (quality === 'high') return 2
  return 1
}

export function quoteImageCredits(input: QuoteInput): number {
  const count = Math.max(1, Math.min(16, Math.trunc(Number(input.n) || 1)))
  return count * getSizeMultiplier(input.size) * getQualityMultiplier(input.quality)
}
