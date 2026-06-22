import type { ImageProviderParams } from '../providers/openaiImageProvider.js'

export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface GenerationJobRequest {
  prompt: string
  params: ImageProviderParams
  inputImageDataUrls: string[]
  maskDataUrl?: string
}

export interface GenerationJob {
  id: string
  userId: string
  status: GenerationJobStatus
  request: GenerationJobRequest
  costCredits: number
  images: string[]
  rawImageUrls?: string[]
  revisedPrompts?: Array<string | undefined>
  actualParams?: Partial<ImageProviderParams>
  errorMessage?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface GenerationJobAdminStats {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
}

export interface GenerationJobStore {
  createJob(input: {
    id?: string
    userId: string
    request: GenerationJobRequest
    costCredits: number
  }): Promise<GenerationJob>
  getJob(userId: string, jobId: string): Promise<GenerationJob | undefined>
  listJobs(userId: string, limit?: number): Promise<GenerationJob[]>
  getAdminStats(): Promise<GenerationJobAdminStats>
  markRunning(jobId: string): Promise<GenerationJob | undefined>
  markSucceeded(jobId: string, result: {
    images: string[]
    rawImageUrls?: string[]
    revisedPrompts?: Array<string | undefined>
    actualParams?: Partial<ImageProviderParams>
  }): Promise<GenerationJob | undefined>
  markFailed(jobId: string, errorMessage: string): Promise<GenerationJob | undefined>
}
