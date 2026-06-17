import type { TaskParams } from '../types'
import type { CallApiResult } from './imageApiShared'

export interface PlatformImageGenerationRequest {
  prompt: string
  params: TaskParams
  inputImageDataUrls: string[]
  maskDataUrl?: string
}

export interface PlatformImageGenerationResponse extends CallApiResult {
  platformJobId?: string
  creditsQuoted?: number
  creditsCharged?: number
}

export type PlatformGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface PlatformGenerationJobResponse {
  id: string
  status: PlatformGenerationJobStatus
  request?: PlatformImageGenerationRequest
  costCredits: number
  images: string[]
  rawImageUrls?: string[]
  revisedPrompts?: Array<string | undefined>
  actualParams?: Partial<PlatformImageGenerationRequest['params']>
  errorMessage?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface PlatformCreateGenerationResponse {
  job: PlatformGenerationJobResponse
  creditsQuoted?: number
  creditsCharged?: number
}

export interface PlatformGetGenerationResponse {
  job: PlatformGenerationJobResponse
}

export interface PlatformListGenerationsResponse {
  jobs: PlatformGenerationJobResponse[]
}

export interface PlatformApiErrorResponse {
  error?: {
    message?: string
    code?: string
  }
  message?: string
}

export interface PlatformUserInfo {
  id: string
  mode: 'development' | 'authenticated'
  email?: string | null
}

export interface PlatformAuthRequest {
  email: string
  password: string
}

export interface PlatformAuthResponse {
  user: PlatformUserInfo
}

export interface PlatformMeResponse {
  user: PlatformUserInfo
  account: {
    userId: string
    displayName?: string
    createdAt: string
  }
}

export interface PlatformBalanceResponse {
  balance: {
    userId: string
    availableCredits: number
    updatedAt: string
  }
}

export interface PlatformLedgerEntryResponse {
  id: string
  userId: string
  type: 'grant' | 'purchase' | 'debit' | 'refund' | 'adjustment'
  amount: number
  balanceAfter: number
  source: 'dev' | 'order' | 'image_generation' | 'payment_notify' | 'admin'
  sourceId?: string
  description?: string
  createdAt: string
}

export interface PlatformLedgerResponse {
  entries: PlatformLedgerEntryResponse[]
}

export interface PlatformPlanResponse {
  id: string
  name: string
  credits: number
  priceCents: number
  currency: 'USD' | 'CNY'
  enabled: boolean
}

export interface PlatformPlansResponse {
  plans: PlatformPlanResponse[]
}

export type PlatformPaymentProvider = 'dev' | 'stripe' | 'wechat' | 'alipay'

export interface PlatformCreateOrderRequest {
  planId: string
  provider?: PlatformPaymentProvider
}

export interface PlatformCreateCheckoutRequest {
  planId: string
  provider?: Exclude<PlatformPaymentProvider, 'dev'>
}

export interface PlatformOrderResponse {
  id: string
  userId: string
  planId: string
  status: 'pending' | 'paid' | 'cancelled' | 'expired'
  amountCents: number
  currency: 'USD' | 'CNY'
  credits: number
  provider: PlatformPaymentProvider
  providerOrderId?: string
  providerPaymentId?: string
  createdAt: string
  paidAt?: string
}

export interface PlatformCreateOrderResponse {
  order: PlatformOrderResponse
}

export interface PlatformCheckoutResponse {
  order: PlatformOrderResponse
  checkout: {
    status: 'not_configured' | 'redirect' | 'qr_code'
    provider: Exclude<PlatformPaymentProvider, 'dev'>
    message?: string
    checkoutUrl?: string
    qrCodeUrl?: string
  }
}


export interface PlatformOrdersResponse {
  orders: PlatformOrderResponse[]
}

export interface PlatformAdminStatsResponse {
  billing: {
    users: number
    orders: number
    paidOrders: number
    pendingOrders: number
    revenueCents: number
    creditsIssued: number
    creditsDebited: number
    availableCredits: number
  }
  jobs: {
    total: number
    queued: number
    running: number
    succeeded: number
    failed: number
  }
}
