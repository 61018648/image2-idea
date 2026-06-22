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
  username?: string | null
  email?: string | null
  role?: 'user' | 'admin'
}

export interface PlatformAuthRequest {
  username: string
  password: string
  email?: string
  verificationCode?: string
}

export interface PlatformAuthResponse {
  user: PlatformUserInfo
}

export interface PlatformMeResponse {
  user: PlatformUserInfo
  account: {
    userId: string
    phone?: string | null
    displayName?: string
    avatarUrl?: string | null
    createdAt: string
  }
}

export interface PlatformUpdateProfileRequest {
  email?: string | null
  emailVerificationCode?: string | null
  phone?: string | null
  displayName?: string | null
  avatarUrl?: string | null
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
  /** Included generation uses. Kept as credits for API compatibility. */
  credits: number
  priceCents: number
  currency: 'USD' | 'CNY'
  enabled: boolean
  recommended: boolean
  description?: string
}

export interface PlatformUserPlanPackageResponse {
  id: string
  userId: string
  planId: string
  orderId: string
  totalUses: number
  remainingUses: number
  status: 'active' | 'depleted' | 'expired'
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export interface PlatformUserPlanPackagesResponse {
  packages: PlatformUserPlanPackageResponse[]
}

export interface PlatformPlansResponse {
  plans: PlatformPlanResponse[]
}

export type PlatformPaymentProvider = 'dev' | 'stripe' | 'wechat' | 'alipay' | 'epay'

export interface PlatformCreateOrderRequest {
  planId: string
  provider?: PlatformPaymentProvider
}

export interface PlatformCreateCheckoutRequest {
  planId: string
  provider?: Exclude<PlatformPaymentProvider, 'dev'>
  paymentType?: 'alipay' | 'wxpay' | 'qqpay'
}

export type PlatformEpayPaymentType = 'alipay' | 'wxpay' | 'qqpay'

export interface PlatformPublicConfigResponse {
  config: {
    siteName: string
    supportEmail: string
    emailVerificationOnRegister: boolean
    emailVerificationOnProfileUpdate: boolean
    epayEnabled: boolean
    epayPaymentTypes: PlatformEpayPaymentType[]
    balanceUnitCents: number
    upstreamTimeoutMs?: number
  }
}

export interface PlatformOrderResponse {
  id: string
  userId: string
  planId: string
  status: 'pending' | 'paid' | 'cancelled' | 'expired'
  originalAmountCents: number
  amountCents: number
  balanceApplied: number
  balanceAppliedCents: number
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
    status: 'not_configured' | 'redirect' | 'qr_code' | 'balance_paid'
    provider: Exclude<PlatformPaymentProvider, 'dev'>
    message?: string
    checkoutUrl?: string
    qrCodeUrl?: string
  }
}


export interface PlatformOrdersResponse {
  orders: PlatformOrderResponse[]
}

export interface PlatformOrderDetailResponse {
  order: PlatformOrderResponse
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

export interface PlatformAdminGenerationLogResponse {
  id: string
  userId: string
  userEmail?: string | null
  userDisplayName?: string | null
  status: string
  prompt: string
  params: Record<string, unknown>
  size: string
  quality: string
  outputFormat: string
  outputCompression?: number | null
  moderation: string
  n: number
  inputImageCount: number
  hasMask: boolean
  costCredits: number
  imageCount: number
  errorMessage?: string | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface PlatformAdminGenerationLogsResponse {
  logs: PlatformAdminGenerationLogResponse[]
}

export interface PlatformAdminUserResponse {
  id: string
  username?: string | null
  email?: string | null
  phone?: string | null
  adminNote?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  role: string
  status: string
  availableCredits: number
  orderCount: number
  paidAmountCents: number
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformAdminUsersResponse {
  users: PlatformAdminUserResponse[]
}

export interface PlatformAdminOrderResponse extends PlatformOrderResponse {
  userEmail?: string | null
  userDisplayName?: string | null
}

export interface PlatformAdminOrdersResponse {
  orders: PlatformAdminOrderResponse[]
}

export interface PlatformAdminPaymentEventResponse {
  id: string
  provider: PlatformPaymentProvider
  providerEventId: string
  orderId?: string | null
  processedAt: string
  raw: unknown
}

export interface PlatformAdminPaymentEventsResponse {
  events: PlatformAdminPaymentEventResponse[]
}

export interface PlatformAdminConfirmPaymentRequest {
  orderId: string
  providerEventId?: string
  providerPaymentId?: string
  paidAmountCents?: number
  note?: string
}

export interface PlatformAdminConfirmPaymentResponse {
  order: PlatformOrderResponse
  duplicate: boolean
}

export interface PlatformAdminPlansResponse {
  plans: PlatformPlanResponse[]
}

export interface PlatformAdminUpsertPlanRequest {
  id: string
  name: string
  credits: number
  priceCents: number
  currency: 'USD' | 'CNY'
  enabled: boolean
  recommended?: boolean
  description?: string
}

export interface PlatformAdminUpsertPlanResponse {
  plan: PlatformPlanResponse
}

export interface PlatformAdminDetectModelsRequest {
  baseUrl: string
  apiKey?: string
}

export interface PlatformAdminDetectModelsResponse {
  models: string[]
}

export interface PlatformAdminConfigResponse {
  config: {
    siteName: string
    publicBaseUrl: string
    supportEmail: string
    smtpEnabled: boolean
    smtpHost: string
    smtpPort: number
    smtpSecure: boolean
    smtpUser: string
    smtpPasswordMasked: string
    smtpFromName: string
    smtpFromEmail: string
    emailVerificationOnRegister: boolean
    emailVerificationOnProfileUpdate: boolean
    openaiBaseUrl: string
    openaiImageModel: string
    upstreamTimeoutMs: number
    hasOpenaiApiKey: boolean
    openaiApiKeyMasked: string
    allowUserApiConfig: boolean
    epayEnabled: boolean
    epayGatewayUrl: string
    epayPid: string
    epayKeyMasked: string
    epayReturnUrl: string
    epayNotifyUrl: string
    epayPaymentTypes: PlatformEpayPaymentType[]
    creditsPerImage: number
    balanceUnitCents: number
    imageModel: string
    imageBaseUrl: string
    paymentProviders: Record<string, boolean>
    runtime: {
      devMode: boolean
      databaseDriver: string
      host: string
      port: number
    }
  }
}

export interface PlatformAdminUpdateConfigRequest {
  siteName?: string
  publicBaseUrl?: string
  supportEmail?: string
  smtpEnabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string
  smtpFromName?: string
  smtpFromEmail?: string
  emailVerificationOnRegister?: boolean
  emailVerificationOnProfileUpdate?: boolean
  openaiApiKey?: string
  openaiBaseUrl?: string
  openaiImageModel?: string
  upstreamTimeoutMs?: number
  allowUserApiConfig?: boolean
  epayEnabled?: boolean
  epayGatewayUrl?: string
  epayPid?: string
  epayKey?: string
  epayReturnUrl?: string
  epayNotifyUrl?: string
  epayPaymentTypes?: PlatformEpayPaymentType[]
  creditsPerImage?: number
  balanceUnitCents?: number
}

export interface PlatformAdminCreateUserRequest {
  username: string
  email?: string | null
  phone?: string | null
  adminNote?: string | null
  password: string
  displayName?: string
  role?: 'user' | 'admin'
  availableCredits?: number
}

export interface PlatformAdminCreateUserResponse {
  user: PlatformAdminUserResponse
}

export interface PlatformAdminUpdateUserRequest {
  userId: string
  username?: string
  email?: string
  phone?: string
  adminNote?: string
  displayName?: string
  password?: string
  status?: 'active' | 'disabled'
}

export interface PlatformAdminUpdateUserResponse {
  user: {
    id: string
    username?: string | null
    email?: string | null
    phone?: string | null
    adminNote?: string | null
    displayName?: string | null
    role: string
    status: string
  }
}

export interface PlatformAdminAdjustCreditsRequest {
  userId: string
  amount: number
  description?: string
}

export interface PlatformAdminSetBalanceRequest {
  userId: string
  availableCredits: number
  description?: string
}

export interface PlatformAdminAdjustCreditsResponse {
  balance: {
    userId: string
    availableCredits: number
    updatedAt: string
  }
  ledgerEntry: PlatformLedgerEntryResponse
}
