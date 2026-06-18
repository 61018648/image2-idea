import type { Prisma, PrismaClient } from '@prisma/client'
import { DEFAULT_PLANS } from './plans.js'
import type { Balance, BillingStore, GenerationDebit, LedgerEntry, Order, PaymentProvider, Plan, UserAccount, UserPlanPackage } from './types.js'

type Tx = Prisma.TransactionClient

function now() {
  return new Date()
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function genOrderId() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `order_${stamp}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function toCurrency(value: string): Plan['currency'] {
  return value === 'CNY' ? 'CNY' : 'USD'
}

function toProvider(value: string): PaymentProvider {
  if (value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'epay' || value === 'dev') return value
  return 'dev'
}

function mapAccount(account: { id: string; displayName: string | null; createdAt: Date }): UserAccount {
  return {
    userId: account.id,
    ...(account.displayName ? { displayName: account.displayName } : {}),
    createdAt: toIso(account.createdAt),
  }
}

function mapBalance(balance: { userId: string; availableCredits: number; updatedAt: Date }): Balance {
  return {
    userId: balance.userId,
    availableCredits: balance.availableCredits,
    updatedAt: toIso(balance.updatedAt),
  }
}

function mapPlan(plan: { id: string; name: string; credits: number; priceCents: number; currency: string; enabled: boolean }): Plan {
  return {
    id: plan.id,
    name: plan.name,
    credits: plan.credits,
    priceCents: plan.priceCents,
    currency: toCurrency(plan.currency),
    enabled: plan.enabled,
  }
}

function mapOrder(order: { id: string; userId: string; planId: string; status: string; amountCents: number; currency: string; credits: number; provider: string; providerOrderId: string | null; providerPaymentId: string | null; createdAt: Date; paidAt: Date | null }): Order {
  return {
    id: order.id,
    userId: order.userId,
    planId: order.planId,
    status: order.status === 'paid' || order.status === 'cancelled' || order.status === 'expired' ? order.status : 'pending',
    amountCents: order.amountCents,
    currency: toCurrency(order.currency),
    credits: order.credits,
    provider: toProvider(order.provider),
    ...(order.providerOrderId ? { providerOrderId: order.providerOrderId } : {}),
    ...(order.providerPaymentId ? { providerPaymentId: order.providerPaymentId } : {}),
    createdAt: toIso(order.createdAt),
    ...(order.paidAt ? { paidAt: toIso(order.paidAt) } : {}),
  }
}

function mapPackage(pkg: { id: string; userId: string; planId: string; orderId: string; totalUses: number; remainingUses: number; status: string; createdAt: Date; updatedAt: Date; expiresAt: Date | null }): UserPlanPackage {
  const remainingUses = pkg.remainingUses
  const status = remainingUses <= 0 ? 'depleted' : pkg.status === 'expired' ? 'expired' : pkg.status === 'depleted' ? 'depleted' : 'active'
  return {
    id: pkg.id,
    userId: pkg.userId,
    planId: pkg.planId,
    orderId: pkg.orderId,
    totalUses: pkg.totalUses,
    remainingUses,
    status,
    createdAt: toIso(pkg.createdAt),
    updatedAt: toIso(pkg.updatedAt),
    ...(pkg.expiresAt ? { expiresAt: toIso(pkg.expiresAt) } : {}),
  }
}

function mapLedger(entry: { id: string; userId: string; type: string; amount: number; balanceAfter: number; source: string; sourceId: string | null; description: string | null; createdAt: Date }): LedgerEntry {
  return {
    id: entry.id,
    userId: entry.userId,
    type: entry.type === 'grant' || entry.type === 'purchase' || entry.type === 'refund' || entry.type === 'adjustment' ? entry.type : 'debit',
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    source: entry.source === 'dev' || entry.source === 'order' || entry.source === 'payment_notify' || entry.source === 'admin' ? entry.source : 'image_generation',
    ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    createdAt: toIso(entry.createdAt),
  }
}

async function ensureDefaultPlans(tx: Tx) {
  for (const plan of DEFAULT_PLANS) {
    await tx.plan.upsert({
      where: { id: plan.id },
      update: {
        name: plan.name,
        credits: plan.credits,
        priceCents: plan.priceCents,
        currency: plan.currency,
        enabled: plan.enabled,
      },
      create: {
        id: plan.id,
        name: plan.name,
        credits: plan.credits,
        priceCents: plan.priceCents,
        currency: plan.currency,
        enabled: plan.enabled,
      },
    })
  }
}

async function ensureAccount(tx: Tx, userId: string) {
  const account = await tx.userAccount.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  })
  await tx.balance.upsert({
    where: { userId },
    update: {},
    create: { userId, availableCredits: 0 },
  })
  return account
}

async function addLedgerEntry(tx: Tx, input: {
  userId: string
  type: LedgerEntry['type']
  amount: number
  source: LedgerEntry['source']
  sourceId?: string
  description?: string
}) {
  const balance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
  const nextBalance = balance.availableCredits + input.amount
  const createdAt = now()
  const entry = await tx.creditLedger.create({
    data: {
      id: genId('led'),
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      balanceAfter: nextBalance,
      source: input.source,
      sourceId: input.sourceId,
      description: input.description,
      createdAt,
    },
  })
  await tx.balance.update({
    where: { userId: input.userId },
    data: { availableCredits: nextBalance, updatedAt: createdAt },
  })
  return entry
}

export async function createPrismaBillingStore(prisma: PrismaClient): Promise<BillingStore> {
  await prisma.$transaction(async (tx) => {
    await ensureDefaultPlans(tx)
  })

  return {
    async getOrCreateAccount(userId) {
      return prisma.$transaction(async (tx) => mapAccount(await ensureAccount(tx, userId)))
    },

    async getBalance(userId) {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, userId)
        return mapBalance(await tx.balance.findUniqueOrThrow({ where: { userId } }))
      })
    },

    async listLedger(userId, limit = 50) {
      const take = Math.max(1, Math.min(100, Math.trunc(limit || 50)))
      const entries = await prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      })
      return entries.map(mapLedger)
    },

    async listPlans() {
      await prisma.$transaction(async (tx) => {
        await ensureDefaultPlans(tx)
      })
      const plans = await prisma.plan.findMany({ orderBy: { createdAt: 'asc' } })
      return plans.map(mapPlan)
    },
    async upsertPlan(plan) {
      const normalized: Plan = {
        id: plan.id.trim(),
        name: plan.name.trim(),
        credits: Math.max(1, Math.trunc(plan.credits)),
        priceCents: Math.max(0, Math.trunc(plan.priceCents)),
        currency: plan.currency === 'USD' ? 'USD' : 'CNY',
        enabled: Boolean(plan.enabled),
      }
      if (!normalized.id) throw new Error('Plan ID is required')
      if (!normalized.name) throw new Error('Plan name is required')
      const saved = await prisma.plan.upsert({
        where: { id: normalized.id },
        update: {
          name: normalized.name,
          credits: normalized.credits,
          priceCents: normalized.priceCents,
          currency: normalized.currency,
          enabled: normalized.enabled,
        },
        create: normalized,
      })
      return mapPlan(saved)
    },

    async listUserPlanPackages(userId) {
      const packages = await prisma.userPlanPackage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      })
      return packages.map(mapPackage)
    },

    async listOrders(userId, limit = 20) {
      const take = Math.max(1, Math.min(100, Math.trunc(limit || 20)))
      const orders = await prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      })
      return orders.map(mapOrder)
    },

    async getAdminStats() {
      const [users, orders, paidOrders, pendingOrders, paidAmount, issued, debited, balances] = await Promise.all([
        prisma.userAccount.count(),
        prisma.order.count(),
        prisma.order.count({ where: { status: 'paid' } }),
        prisma.order.count({ where: { status: 'pending' } }),
        prisma.order.aggregate({ where: { status: 'paid' }, _sum: { amountCents: true } }),
        prisma.creditLedger.aggregate({ where: { amount: { gt: 0 } }, _sum: { amount: true } }),
        prisma.creditLedger.aggregate({ where: { amount: { lt: 0 } }, _sum: { amount: true } }),
        prisma.balance.aggregate({ _sum: { availableCredits: true } }),
      ])
      return {
        users,
        orders,
        paidOrders,
        pendingOrders,
        revenueCents: paidAmount._sum.amountCents ?? 0,
        creditsIssued: issued._sum.amount ?? 0,
        creditsDebited: Math.abs(debited._sum.amount ?? 0),
        availableCredits: balances._sum.availableCredits ?? 0,
      }
    },

    async createOrder(userId, planId, provider = 'dev') {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, userId)
        const plan = await tx.plan.findFirst({ where: { id: planId, enabled: true } })
        if (!plan) throw new Error('Plan not found')
        const order = await tx.order.create({
          data: {
            id: genOrderId(),
            userId,
            planId,
            status: 'pending',
            amountCents: plan.priceCents,
            currency: plan.currency,
            credits: plan.credits,
            provider,
          },
        })
        return mapOrder(order)
      })
    },

    async markOrderPaid(input) {
      return prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: input.orderId } })
        if (!order) throw new Error('Order not found')
        if (order.status === 'paid') {
          return { order: mapOrder(order), duplicate: true as const }
        }

        const existingEvent = await tx.paymentEvent.findUnique({
          where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
        })
        if (existingEvent) {
          return { order: mapOrder(order), duplicate: true as const }
        }

        const plan = await tx.plan.findFirst({ where: { id: order.planId, enabled: true } })
        if (!plan) throw new Error('Plan not found')
        if (input.provider !== order.provider) throw new Error('Payment provider mismatch')
        if (input.paidAmountCents !== order.amountCents) throw new Error('Paid amount mismatch')

        await ensureAccount(tx, order.userId)
        const paidAt = now()
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            providerPaymentId: input.providerPaymentId ?? order.providerPaymentId,
            paidAt,
          },
        })
        await tx.paymentEvent.create({
          data: {
            id: genId('evt'),
            provider: input.provider,
            providerEventId: input.providerEventId,
            orderId: order.id,
            processedAt: paidAt,
            raw: input.raw as Prisma.InputJsonValue,
          },
        })
        await tx.userPlanPackage.upsert({
          where: { orderId: order.id },
          update: {},
          create: {
            id: genId('pkg'),
            userId: order.userId,
            planId: order.planId,
            orderId: order.id,
            totalUses: plan.credits,
            remainingUses: plan.credits,
            status: 'active',
          },
        })

        return { order: mapOrder(updatedOrder), duplicate: false as const }
      })
    },

    async debitCredits(input) {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, input.userId)
        const existing = await tx.creditLedger.findUnique({ where: { sourceId: input.sourceId } })
        const balance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        if (existing) return { balance: mapBalance(balance), ledgerEntry: mapLedger(existing) }

        const debitAmount = -Math.abs(input.amount)
        if (balance.availableCredits + debitAmount < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(tx, {
          userId: input.userId,
          type: 'debit',
          amount: debitAmount,
          source: 'image_generation',
          sourceId: input.sourceId,
          description: input.description,
        })
        const updatedBalance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        return { balance: mapBalance(updatedBalance), ledgerEntry: mapLedger(ledgerEntry) }
      })
    },

    async refundCredits(input) {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, input.userId)
        const refundSourceId = `refund:${input.sourceId}`
        const existing = await tx.creditLedger.findUnique({ where: { sourceId: refundSourceId } })
        const balance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        if (existing) return { balance: mapBalance(balance), ledgerEntry: mapLedger(existing), duplicate: true as const }

        const ledgerEntry = await addLedgerEntry(tx, {
          userId: input.userId,
          type: 'refund',
          amount: Math.abs(input.amount),
          source: 'image_generation',
          sourceId: refundSourceId,
          description: input.description,
        })
        const updatedBalance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        return { balance: mapBalance(updatedBalance), ledgerEntry: mapLedger(ledgerEntry), duplicate: false as const }
      })
    },
    async debitGeneration(input) {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, input.userId)
        const existing = await tx.creditLedger.findUnique({ where: { sourceId: input.sourceId } })
        const balance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        if (existing) return { mode: 'credits', chargedCredits: Math.abs(existing.amount), chargedPackageUses: 0, balance: mapBalance(balance), ledgerEntry: mapLedger(existing) } satisfies GenerationDebit

        const uses = Math.max(1, Math.trunc(input.packageUses || 1))
        const pkg = await tx.userPlanPackage.findFirst({
          where: { userId: input.userId, status: 'active', remainingUses: { gte: uses } },
          orderBy: { createdAt: 'asc' },
        })
        if (pkg) {
          const nextRemaining = pkg.remainingUses - uses
          const updated = await tx.userPlanPackage.update({
            where: { id: pkg.id },
            data: {
              remainingUses: nextRemaining,
              status: nextRemaining <= 0 ? 'depleted' : 'active',
            },
          })
          return { mode: 'package', chargedCredits: 0, chargedPackageUses: uses, package: mapPackage(updated) } satisfies GenerationDebit
        }

        const amount = Math.max(1, Math.trunc(input.creditAmount || 1))
        if (balance.availableCredits - amount < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(tx, {
          userId: input.userId,
          type: 'debit',
          amount: -amount,
          source: 'image_generation',
          sourceId: input.sourceId,
          description: input.description,
        })
        const updatedBalance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        return { mode: 'credits', chargedCredits: amount, chargedPackageUses: 0, balance: mapBalance(updatedBalance), ledgerEntry: mapLedger(ledgerEntry) } satisfies GenerationDebit
      })
    },
    async refundGeneration(input) {
      await prisma.$transaction(async (tx) => {
        if (input.debit.mode === 'package' && input.debit.package) {
          const pkg = await tx.userPlanPackage.findUnique({ where: { id: input.debit.package.id } })
          if (!pkg) return
          const nextRemaining = Math.min(pkg.totalUses, pkg.remainingUses + Math.max(1, input.debit.chargedPackageUses))
          await tx.userPlanPackage.update({
            where: { id: pkg.id },
            data: { remainingUses: nextRemaining, status: nextRemaining > 0 ? 'active' : 'depleted' },
          })
          return
        }
        if (input.debit.mode === 'credits' && input.debit.chargedCredits > 0) {
          const existing = await tx.creditLedger.findUnique({ where: { sourceId: `refund:${input.sourceId}` } })
          if (existing) return
          await addLedgerEntry(tx, {
            userId: input.userId,
            type: 'refund',
            amount: input.debit.chargedCredits,
            source: 'image_generation',
            sourceId: `refund:${input.sourceId}`,
            description: input.description,
          })
        }
      })
    },
    async adjustCredits(input) {
      return prisma.$transaction(async (tx) => {
        await ensureAccount(tx, input.userId)
        const amount = Math.trunc(input.amount)
        if (!amount) throw new Error('Adjustment amount is required')
        const balance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        if (balance.availableCredits + amount < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(tx, {
          userId: input.userId,
          type: amount > 0 ? 'grant' : 'adjustment',
          amount,
          source: 'admin',
          sourceId: genId('admin'),
          description: input.description || 'Admin credit adjustment',
        })
        const updatedBalance = await tx.balance.findUniqueOrThrow({ where: { userId: input.userId } })
        return { balance: mapBalance(updatedBalance), ledgerEntry: mapLedger(ledgerEntry) }
      })
    },
  }
}
