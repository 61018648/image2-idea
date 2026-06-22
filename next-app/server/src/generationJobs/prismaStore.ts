import { Prisma, type PrismaClient } from '@prisma/client'
import type { ImageProviderParams } from '../providers/openaiImageProvider.js'
import type { GenerationJob, GenerationJobRequest, GenerationJobStatus, GenerationJobStore } from './types.js'

function now() {
  return new Date()
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asRevisedPrompts(value: unknown): Array<string | undefined> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => typeof item === 'string' ? item : undefined)
}

function asParams(value: unknown): ImageProviderParams {
  const params = value && typeof value === 'object' ? value as Partial<ImageProviderParams> : {}
  return {
    size: typeof params.size === 'string' ? params.size : 'auto',
    quality: typeof params.quality === 'string' ? params.quality : 'auto',
    output_format: typeof params.output_format === 'string' ? params.output_format : 'png',
    output_compression: typeof params.output_compression === 'number' ? params.output_compression : null,
    moderation: typeof params.moderation === 'string' ? params.moderation : 'auto',
    n: Math.max(1, Math.min(16, Math.trunc(Number(params.n) || 1))),
  }
}

function asPartialParams(value: unknown): Partial<ImageProviderParams> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return value as Partial<ImageProviderParams>
}

function normalizeStatus(value: string): GenerationJobStatus {
  if (value === 'running' || value === 'succeeded' || value === 'failed' || value === 'cancelled') return value
  return 'queued'
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function mapJob(row: {
  id: string
  userId: string
  status: string
  prompt: string
  requestParams: unknown
  inputImageData: unknown
  maskDataUrl: string | null
  costCredits: number
  images: unknown
  rawImageUrls: unknown | null
  revisedPrompts: unknown | null
  actualParams: unknown | null
  errorMessage: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}): GenerationJob {
  return {
    id: row.id,
    userId: row.userId,
    status: normalizeStatus(row.status),
    request: {
      prompt: row.prompt,
      params: asParams(row.requestParams),
      inputImageDataUrls: asStringArray(row.inputImageData),
      ...(row.maskDataUrl ? { maskDataUrl: row.maskDataUrl } : {}),
    },
    costCredits: row.costCredits,
    images: asStringArray(row.images),
    rawImageUrls: row.rawImageUrls ? asStringArray(row.rawImageUrls) : undefined,
    revisedPrompts: asRevisedPrompts(row.revisedPrompts),
    actualParams: asPartialParams(row.actualParams),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    createdAt: toIso(row.createdAt),
    ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: toIso(row.finishedAt) } : {}),
  }
}

export function createPrismaGenerationJobStore(prisma: PrismaClient): GenerationJobStore {
  return {
    async createJob(input) {
      const row = await prisma.generationJob.create({
        data: {
          id: input.id || `job_${input.userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          userId: input.userId,
          status: 'queued',
          prompt: input.request.prompt,
          requestParams: toJson(input.request.params),
          inputImageData: toJson(input.request.inputImageDataUrls),
          maskDataUrl: input.request.maskDataUrl,
          costCredits: input.costCredits,
          images: [],
        },
      })
      return mapJob(row)
    },

    async getJob(userId, jobId) {
      const row = await prisma.generationJob.findFirst({ where: { id: jobId, userId } })
      return row ? mapJob(row) : undefined
    },

    async listJobs(userId, limit = 50) {
      const take = Math.max(1, Math.min(100, Math.trunc(limit || 50)))
      const rows = await prisma.generationJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      })
      return rows.map(mapJob)
    },

    async getAdminStats() {
      const [total, queued, running, succeeded, failed] = await Promise.all([
        prisma.generationJob.count(),
        prisma.generationJob.count({ where: { status: 'queued' } }),
        prisma.generationJob.count({ where: { status: 'running' } }),
        prisma.generationJob.count({ where: { status: 'succeeded' } }),
        prisma.generationJob.count({ where: { status: 'failed' } }),
      ])
      return { total, queued, running, succeeded, failed }
    },

    async markRunning(jobId) {
      const row = await prisma.generationJob.findUnique({ where: { id: jobId } })
      if (!row || row.status !== 'queued') return row ? mapJob(row) : undefined
      const next = await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'running', startedAt: now() },
      })
      return mapJob(next)
    },

    async markSucceeded(jobId, result) {
      const row = await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          images: toJson(result.images),
          rawImageUrls: result.rawImageUrls ? toJson(result.rawImageUrls) : undefined,
          revisedPrompts: result.revisedPrompts ? toJson(result.revisedPrompts) : undefined,
          actualParams: result.actualParams ? toJson(result.actualParams) : undefined,
          finishedAt: now(),
        },
      }).catch(() => undefined)
      return row ? mapJob(row) : undefined
    },

    async markFailed(jobId, errorMessage) {
      const row = await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage,
          finishedAt: now(),
        },
      }).catch(() => undefined)
      return row ? mapJob(row) : undefined
    },
  }
}
