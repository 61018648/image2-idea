import type { GenerationJob, GenerationJobStore } from './types.js'

function now() {
  return new Date().toISOString()
}

function genJobId(userId: string): string {
  return `job_${userId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createMemoryGenerationJobStore(): GenerationJobStore {
  const jobs = new Map<string, GenerationJob>()

  return {
    async createJob(input) {
      const createdAt = now()
      const job: GenerationJob = {
        id: input.id || genJobId(input.userId),
        userId: input.userId,
        status: 'queued',
        request: input.request,
        costCredits: input.costCredits,
        images: [],
        createdAt,
      }
      jobs.set(job.id, job)
      return job
    },

    async getJob(userId, jobId) {
      const job = jobs.get(jobId)
      if (!job || job.userId !== userId) return undefined
      return job
    },

    async listJobs(userId, limit = 50) {
      const take = Math.max(1, Math.min(100, Math.trunc(limit || 50)))
      return [...jobs.values()]
        .filter((job) => job.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, take)
    },

    async getAdminStats() {
      const allJobs = [...jobs.values()]
      return {
        total: allJobs.length,
        queued: allJobs.filter((job) => job.status === 'queued').length,
        running: allJobs.filter((job) => job.status === 'running').length,
        succeeded: allJobs.filter((job) => job.status === 'succeeded').length,
        failed: allJobs.filter((job) => job.status === 'failed').length,
      }
    },

    async markRunning(jobId) {
      const job = jobs.get(jobId)
      if (!job || job.status !== 'queued') return job
      const next: GenerationJob = {
        ...job,
        status: 'running',
        startedAt: now(),
      }
      jobs.set(jobId, next)
      return next
    },

    async markSucceeded(jobId, result) {
      const job = jobs.get(jobId)
      if (!job) return undefined
      const next: GenerationJob = {
        ...job,
        status: 'succeeded',
        images: result.images,
        rawImageUrls: result.rawImageUrls,
        revisedPrompts: result.revisedPrompts,
        actualParams: result.actualParams,
        finishedAt: now(),
      }
      jobs.set(jobId, next)
      return next
    },

    async markFailed(jobId, errorMessage) {
      const job = jobs.get(jobId)
      if (!job) return undefined
      const next: GenerationJob = {
        ...job,
        status: 'failed',
        errorMessage,
        finishedAt: now(),
      }
      jobs.set(jobId, next)
      return next
    },
  }
}
