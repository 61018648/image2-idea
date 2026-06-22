import type mysql from 'mysql2/promise'
import type { ImageProviderParams } from '../providers/openaiImageProvider.js'
import { mysqlExecute, mysqlQuery } from '../db/mysqlCompat.js'
import type { GenerationJob, GenerationJobRequest, GenerationJobStatus, GenerationJobStore } from './types.js'

type Row = Record<string, any>

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function toIso(value: unknown): string {
  if (!value) return new Date(0).toISOString()
  const text = String(value)
  return text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}

function normalizeStatus(value: string): GenerationJobStatus {
  if (value === 'running' || value === 'succeeded' || value === 'failed' || value === 'cancelled') return value
  return 'queued'
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

function mapJob(row: Row): GenerationJob {
  const inputImageDataUrls = parseJson<string[]>(row.input_image_data, [])
  return {
    id: row.id,
    userId: row.user_id,
    status: normalizeStatus(row.status),
    request: {
      prompt: row.prompt,
      params: asParams(parseJson(row.request_params, {})),
      inputImageDataUrls,
      ...(row.mask_data_url ? { maskDataUrl: row.mask_data_url } : {}),
    },
    costCredits: Number(row.cost_credits) || 0,
    images: parseJson<string[]>(row.images, []),
    rawImageUrls: parseJson<string[] | undefined>(row.raw_image_urls, undefined),
    revisedPrompts: parseJson<Array<string | undefined> | undefined>(row.revised_prompts, undefined),
    actualParams: parseJson<Partial<ImageProviderParams> | undefined>(row.actual_params, undefined),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: toIso(row.created_at),
    ...(row.started_at ? { startedAt: toIso(row.started_at) } : {}),
    ...(row.finished_at ? { finishedAt: toIso(row.finished_at) } : {}),
  }
}

function genJobId(userId: string): string {
  return `job_${userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createMysqlGenerationJobStore(): GenerationJobStore {
  return {
    async createJob(input) {
      const id = input.id || genJobId(input.userId)
      await mysqlExecute(
        `INSERT INTO generation_jobs (id, user_id, status, prompt, request_params, input_image_data, mask_data_url, cost_credits, images, created_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userId,
          input.request.prompt,
          JSON.stringify(input.request.params),
          JSON.stringify(input.request.inputImageDataUrls),
          input.request.maskDataUrl ?? null,
          input.costCredits,
          JSON.stringify([]),
          nowSql(),
        ],
      )
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE id=? LIMIT 1`, [id])
      return mapJob(rows[0])
    },

    async getJob(userId, jobId) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE id=? AND user_id=? LIMIT 1`, [jobId, userId])
      return rows[0] ? mapJob(rows[0]) : undefined
    },

    async listJobs(userId, limit = 50) {
      const take = Math.max(1, Math.min(100, Math.trunc(limit || 50)))
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT ${take}`, [userId])
      return rows.map(mapJob)
    },

    async getAdminStats() {
      const [total, queued, running, succeeded, failed] = await Promise.all([
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM generation_jobs`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM generation_jobs WHERE status='queued'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM generation_jobs WHERE status='running'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM generation_jobs WHERE status='succeeded'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM generation_jobs WHERE status='failed'`),
      ])
      return {
        total: Number(total[0].count) || 0,
        queued: Number(queued[0].count) || 0,
        running: Number(running[0].count) || 0,
        succeeded: Number(succeeded[0].count) || 0,
        failed: Number(failed[0].count) || 0,
      }
    },

    async markRunning(jobId) {
      await mysqlExecute(`UPDATE generation_jobs SET status='running', started_at=? WHERE id=? AND status='queued'`, [nowSql(), jobId])
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE id=? LIMIT 1`, [jobId])
      return rows[0] ? mapJob(rows[0]) : undefined
    },

    async markSucceeded(jobId, result) {
      await mysqlExecute(
        `UPDATE generation_jobs SET status='succeeded', images=?, raw_image_urls=?, revised_prompts=?, actual_params=?, finished_at=? WHERE id=?`,
        [
          JSON.stringify(result.images),
          result.rawImageUrls ? JSON.stringify(result.rawImageUrls) : null,
          result.revisedPrompts ? JSON.stringify(result.revisedPrompts) : null,
          result.actualParams ? JSON.stringify(result.actualParams) : null,
          nowSql(),
          jobId,
        ],
      )
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE id=? LIMIT 1`, [jobId])
      return rows[0] ? mapJob(rows[0]) : undefined
    },

    async markFailed(jobId, errorMessage) {
      await mysqlExecute(`UPDATE generation_jobs SET status='failed', error_message=?, finished_at=? WHERE id=?`, [errorMessage, nowSql(), jobId])
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM generation_jobs WHERE id=? LIMIT 1`, [jobId])
      return rows[0] ? mapJob(rows[0]) : undefined
    },
  }
}
