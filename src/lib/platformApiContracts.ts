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

export interface PlatformCreateOrderRequest {
  planId: string
  provider?: 'dev' | 'stripe' | 'wechat' | 'alipay'
}

export interface PlatformOrderResponse {
  id: string
  userId: string
  planId: string
  status: 'pending' | 'paid' | 'cancelled' | 'expired'
  amountCents: number
  currency: 'USD' | 'CNY'
  credits: number
  provider: 'dev' | 'stripe' | 'wechat' | 'alipay'
  providerOrderId?: string
  providerPaymentId?: string
  createdAt: string
  paidAt?: string
}

export interface PlatformCreateOrderResponse {
  order: PlatformOrderResponse
}
