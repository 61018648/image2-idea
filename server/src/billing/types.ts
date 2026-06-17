export type LedgerType = 'grant' | 'purchase' | 'debit' | 'refund' | 'adjustment'
export type LedgerSource = 'dev' | 'order' | 'image_generation' | 'payment_notify' | 'admin'
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired'
export type PaymentProvider = 'dev' | 'stripe' | 'wechat' | 'alipay'

export interface UserAccount {
  userId: string
  displayName?: string
  createdAt: string
}

export interface Balance {
  userId: string
  availableCredits: number
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  userId: string
  type: LedgerType
  amount: number
  balanceAfter: number
  source: LedgerSource
  sourceId?: string
  description?: string
  createdAt: string
}

export interface Plan {
  id: string
  name: string
  credits: number
  priceCents: number
  currency: 'USD' | 'CNY'
  enabled: boolean
}

export interface Order {
  id: string
  userId: string
  planId: string
  status: OrderStatus
  amountCents: number
  currency: Plan['currency']
  credits: number
  provider: PaymentProvider
  providerOrderId?: string
  providerPaymentId?: string
  createdAt: string
  paidAt?: string
}

export interface PaymentEvent {
  id: string
  provider: PaymentProvider
  providerEventId: string
  orderId?: string
  processedAt: string
  raw: unknown
}

export interface BillingAdminStats {
  users: number
  orders: number
  paidOrders: number
  pendingOrders: number
  revenueCents: number
  creditsIssued: number
  creditsDebited: number
  availableCredits: number
}

export interface BillingStore {
  getOrCreateAccount(userId: string): Promise<UserAccount>
  getBalance(userId: string): Promise<Balance>
  listLedger(userId: string, limit?: number): Promise<LedgerEntry[]>
  listPlans(): Promise<Plan[]>
  listOrders(userId: string, limit?: number): Promise<Order[]>
  getAdminStats(): Promise<BillingAdminStats>
  createOrder(userId: string, planId: string, provider?: PaymentProvider): Promise<Order>
  markOrderPaid(input: {
    orderId: string
    provider: PaymentProvider
    providerEventId: string
    providerPaymentId?: string
    paidAmountCents: number
    raw: unknown
  }): Promise<{ order: Order; ledgerEntry?: LedgerEntry; duplicate: boolean }>
  debitCredits(input: {
    userId: string
    amount: number
    sourceId: string
    description?: string
  }): Promise<{ balance: Balance; ledgerEntry: LedgerEntry }>
  refundCredits(input: {
    userId: string
    amount: number
    sourceId: string
    description?: string
  }): Promise<{ balance: Balance; ledgerEntry: LedgerEntry; duplicate: boolean }>
}
