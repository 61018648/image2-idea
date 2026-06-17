import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getPrismaClient } from '../db/prisma.js'
import { DEFAULT_PLANS } from './plans.js'
import { createPrismaBillingStore } from './prismaStore.js'
import type { Balance, BillingStore, LedgerEntry, Order, PaymentEvent, PaymentProvider, Plan, UserAccount } from './types.js'

interface BillingState {
  accounts: Record<string, UserAccount>
  balances: Record<string, Balance>
  ledger: LedgerEntry[]
  plans: Plan[]
  orders: Record<string, Order>
  paymentEvents: Record<string, PaymentEvent>
}

const EMPTY_STATE: BillingState = {
  accounts: {},
  balances: {},
  ledger: [],
  plans: DEFAULT_PLANS,
  orders: {},
  paymentEvents: {},
}

const DEFAULT_FILE = process.env.PLATFORM_DATA_FILE?.trim() || ''

function now() {
  return new Date().toISOString()
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function cloneState(state: BillingState): BillingState {
  return {
    accounts: { ...state.accounts },
    balances: { ...state.balances },
    ledger: [...state.ledger],
    plans: [...state.plans],
    orders: { ...state.orders },
    paymentEvents: { ...state.paymentEvents },
  }
}

function getPlan(state: BillingState, planId: string): Plan | undefined {
  return state.plans.find((plan) => plan.id === planId && plan.enabled)
}

function ensureAccount(state: BillingState, userId: string): UserAccount {
  const existing = state.accounts[userId]
  if (existing) return existing
  const account: UserAccount = { userId, createdAt: now() }
  state.accounts[userId] = account
  if (!state.balances[userId]) {
    state.balances[userId] = { userId, availableCredits: 0, updatedAt: account.createdAt }
  }
  return account
}

function ensureBalance(state: BillingState, userId: string): Balance {
  const existing = state.balances[userId]
  if (existing) return existing
  const createdAt = now()
  const balance: Balance = { userId, availableCredits: 0, updatedAt: createdAt }
  state.balances[userId] = balance
  state.accounts[userId] ||= { userId, createdAt }
  return balance
}

function addLedgerEntry(state: BillingState, entry: Omit<LedgerEntry, 'id' | 'createdAt' | 'balanceAfter'> & { balanceAfter?: number }): LedgerEntry {
  const balance = ensureBalance(state, entry.userId)
  const nextBalance = typeof entry.balanceAfter === 'number' ? entry.balanceAfter : balance.availableCredits + entry.amount
  const ledgerEntry: LedgerEntry = {
    id: genId('led'),
    createdAt: now(),
    balanceAfter: nextBalance,
    ...entry,
  }
  balance.availableCredits = nextBalance
  balance.updatedAt = ledgerEntry.createdAt
  state.ledger.unshift(ledgerEntry)
  return ledgerEntry
}

function readLedgerSourceIdExists(state: BillingState, sourceId: string): boolean {
  return state.ledger.some((entry) => entry.sourceId === sourceId)
}

async function loadState(file: string): Promise<BillingState> {
  if (!file) return cloneState(EMPTY_STATE)
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<BillingState>
    return {
      accounts: parsed.accounts ?? {},
      balances: parsed.balances ?? {},
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
      plans: Array.isArray(parsed.plans) && parsed.plans.length ? parsed.plans : DEFAULT_PLANS,
      orders: parsed.orders ?? {},
      paymentEvents: parsed.paymentEvents ?? {},
    }
  } catch {
    return cloneState(EMPTY_STATE)
  }
}

async function saveState(file: string, state: BillingState): Promise<void> {
  if (!file) return
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2), 'utf8')
}

function createStore(initial: BillingState): BillingStore {
  let state = initial
  let writeQueue = Promise.resolve()

  const persist = () => {
    if (!DEFAULT_FILE) return Promise.resolve()
    writeQueue = writeQueue.then(() => saveState(DEFAULT_FILE, state))
    return writeQueue
  }

  const mutate = async <T>(fn: (draft: BillingState) => T | Promise<T>): Promise<T> => {
    const result = await fn(state)
    await persist()
    return result
  }

  return {
    async getOrCreateAccount(userId) {
      return mutate((draft) => ensureAccount(draft, userId))
    },
    async getBalance(userId) {
      return mutate((draft) => ensureBalance(draft, userId))
    },
    async listLedger(userId, limit = 50) {
      return mutate((draft) => draft.ledger.filter((entry) => entry.userId === userId).slice(0, Math.max(1, Math.min(100, Math.trunc(limit || 50)))))
    },
    async listPlans() {
      return mutate((draft) => [...draft.plans])
    },
    async listOrders(userId, limit = 20) {
      return mutate((draft) => Object.values(draft.orders)
        .filter((order) => order.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.max(1, Math.min(100, Math.trunc(limit || 20)))))
    },
    async getAdminStats() {
      return mutate((draft) => {
        const orders = Object.values(draft.orders)
        const paidOrders = orders.filter((order) => order.status === 'paid')
        const ledger = draft.ledger
        return {
          users: Object.keys(draft.accounts).length,
          orders: orders.length,
          paidOrders: paidOrders.length,
          pendingOrders: orders.filter((order) => order.status === 'pending').length,
          revenueCents: paidOrders.reduce((sum, order) => sum + order.amountCents, 0),
          creditsIssued: ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
          creditsDebited: Math.abs(ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)),
          availableCredits: Object.values(draft.balances).reduce((sum, balance) => sum + balance.availableCredits, 0),
        }
      })
    },
    async createOrder(userId, planId, provider = 'dev') {
      return mutate((draft) => {
        ensureAccount(draft, userId)
        const plan = getPlan(draft, planId)
        if (!plan) throw new Error('Plan not found')
        const order: Order = {
          id: genId('ord'),
          userId,
          planId,
          status: 'pending',
          amountCents: plan.priceCents,
          currency: plan.currency,
          credits: plan.credits,
          provider,
          createdAt: now(),
        }
        draft.orders[order.id] = order
        return order
      })
    },
    async markOrderPaid(input) {
      return mutate((draft) => {
        const order = draft.orders[input.orderId]
        if (!order) throw new Error('Order not found')
        if (order.status === 'paid') {
          return { order, duplicate: true as const }
        }
        const eventKey = `${input.provider}:${input.providerEventId}`
        if (draft.paymentEvents[eventKey]) {
          return { order, duplicate: true as const }
        }
        const plan = getPlan(draft, order.planId)
        if (!plan) throw new Error('Plan not found')
        if (input.provider !== order.provider) throw new Error('Payment provider mismatch')
        if (input.paidAmountCents !== order.amountCents) throw new Error('Paid amount mismatch')

        const paidAt = now()
        const updatedOrder: Order = {
          ...order,
          status: 'paid',
          providerPaymentId: input.providerPaymentId ?? order.providerPaymentId,
          paidAt,
        }
        draft.orders[order.id] = updatedOrder
        draft.paymentEvents[eventKey] = {
          id: genId('evt'),
          provider: input.provider,
          providerEventId: input.providerEventId,
          orderId: order.id,
          processedAt: paidAt,
          raw: input.raw,
        }

        const account = ensureAccount(draft, order.userId)
        void account
        const currentBalance = ensureBalance(draft, order.userId)
        const entry = addLedgerEntry(draft, {
          userId: order.userId,
          type: 'purchase',
          amount: plan.credits,
          source: 'payment_notify',
          sourceId: order.id,
          description: `Purchase ${plan.id}`,
        })
        return { order: updatedOrder, ledgerEntry: entry, duplicate: false as const }
      })
    },
    async debitCredits(input) {
      return mutate((draft) => {
        ensureAccount(draft, input.userId)
        const balance = ensureBalance(draft, input.userId)
        if (readLedgerSourceIdExists(draft, input.sourceId)) {
          const existing = draft.ledger.find((entry) => entry.sourceId === input.sourceId)
          if (!existing) throw new Error('Duplicate ledger source not found')
          return { balance, ledgerEntry: existing }
        }
        const debitAmount = -Math.abs(input.amount)
        if (balance.availableCredits + debitAmount < 0) {
          throw new Error('Insufficient credits')
        }
        const entry = addLedgerEntry(draft, {
          userId: input.userId,
          type: 'debit',
          amount: debitAmount,
          source: 'image_generation',
          sourceId: input.sourceId,
          description: input.description,
        })
        return { balance: draft.balances[input.userId], ledgerEntry: entry }
      })
    },
    async refundCredits(input) {
      return mutate((draft) => {
        ensureAccount(draft, input.userId)
        const balance = ensureBalance(draft, input.userId)
        const refundSourceId = `refund:${input.sourceId}`
        const existing = draft.ledger.find((entry) => entry.sourceId === refundSourceId)
        if (existing) {
          return { balance, ledgerEntry: existing, duplicate: true as const }
        }
        const entry = addLedgerEntry(draft, {
          userId: input.userId,
          type: 'refund',
          amount: Math.abs(input.amount),
          source: 'image_generation',
          sourceId: refundSourceId,
          description: input.description,
        })
        return { balance: draft.balances[input.userId], ledgerEntry: entry, duplicate: false as const }
      })
    },
  }
}

let storePromise: Promise<BillingStore> | null = null
let cachedStore: BillingStore | null = null

export async function createBillingStore(): Promise<BillingStore> {
  if (process.env.DATABASE_URL?.trim()) {
    return createPrismaBillingStore(getPrismaClient())
  }

  const initial = await loadState(DEFAULT_FILE)
  return createStore(initial)
}

export function getBillingStore(): BillingStore {
  if (cachedStore) return cachedStore
  if (!storePromise) {
    storePromise = createBillingStore()
  }
  throw new Error('Billing store is not initialized yet')
}

export async function initBillingStore(): Promise<BillingStore> {
  storePromise ??= createBillingStore()
  cachedStore = await storePromise
  return cachedStore
}

export function getOrCreateMemoryBillingStore(): BillingStore {
  if (cachedStore) return cachedStore
  cachedStore = createStore(cloneState(EMPTY_STATE))
  storePromise = Promise.resolve(cachedStore)
  return cachedStore
}

export function resetMemoryBillingStoreForTest(): BillingStore {
  cachedStore = createStore(cloneState(EMPTY_STATE))
  storePromise = Promise.resolve(cachedStore)
  return cachedStore
}
