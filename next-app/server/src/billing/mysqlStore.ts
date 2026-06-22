import type mysql from 'mysql2/promise'
import { DEFAULT_PLANS } from './plans.js'
import type { Balance, BillingStore, GenerationDebit, LedgerEntry, Order, PaymentProvider, Plan, UserAccount, UserPlanPackage } from './types.js'
import { mysqlExecute, mysqlQuery, mysqlTransaction } from '../db/mysqlCompat.js'
import { migrateMysqlUserIdsToNumeric } from '../auth/mysqlAccounts.js'

type Row = Record<string, any>

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function genOrderId() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `order_${stamp}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
}

function toIso(value: unknown): string {
  if (!value) return new Date(0).toISOString()
  const text = String(value)
  return text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
}

function toCurrency(value: string): Plan['currency'] {
  return value === 'CNY' ? 'CNY' : 'USD'
}

function toProvider(value: string): PaymentProvider {
  if (value === 'stripe' || value === 'wechat' || value === 'alipay' || value === 'epay' || value === 'dev') return value
  return 'dev'
}

function mapAccount(row: Row): UserAccount {
  return {
    userId: row.id,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    createdAt: toIso(row.created_at),
  }
}

function mapBalance(row: Row): Balance {
  return {
    userId: row.user_id,
    availableCredits: Number(row.available_credits) || 0,
    updatedAt: toIso(row.updated_at),
  }
}

function mapPlan(row: Row): Plan {
  return {
    id: row.id,
    name: row.name,
    credits: Number(row.credits) || 0,
    priceCents: Number(row.price_cents) || 0,
    currency: toCurrency(row.currency),
    enabled: Boolean(row.enabled),
    recommended: Boolean(row.recommended),
    ...(row.description ? { description: String(row.description) } : {}),
  }
}

function mapOrder(row: Row): Order {
  const amountCents = Number(row.amount_cents) || 0
  const balanceAppliedCents = Number(row.balance_applied_cents) || 0
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status === 'paid' || row.status === 'cancelled' || row.status === 'expired' ? row.status : 'pending',
    originalAmountCents: Number(row.original_amount_cents) || amountCents + balanceAppliedCents,
    amountCents,
    balanceApplied: Number(row.balance_applied) || 0,
    balanceAppliedCents,
    currency: toCurrency(row.currency),
    credits: Number(row.credits) || 0,
    provider: toProvider(row.provider),
    ...(row.provider_order_id ? { providerOrderId: row.provider_order_id } : {}),
    ...(row.provider_payment_id ? { providerPaymentId: row.provider_payment_id } : {}),
    createdAt: toIso(row.created_at),
    ...(row.paid_at ? { paidAt: toIso(row.paid_at) } : {}),
  }
}

function mapPackage(row: Row): UserPlanPackage {
  const remainingUses = Number(row.remaining_uses) || 0
  const explicitStatus = row.status === 'depleted' || row.status === 'expired' ? row.status : 'active'
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    orderId: row.order_id,
    totalUses: Number(row.total_uses) || 0,
    remainingUses,
    status: remainingUses <= 0 ? 'depleted' : explicitStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.expires_at ? { expiresAt: toIso(row.expires_at) } : {}),
  }
}

function mapLedger(row: Row): LedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type === 'grant' || row.type === 'purchase' || row.type === 'refund' || row.type === 'adjustment' ? row.type : 'debit',
    amount: Number(row.amount) || 0,
    balanceAfter: Number(row.balance_after) || 0,
    source: row.source === 'dev' || row.source === 'order' || row.source === 'payment_notify' || row.source === 'admin' ? row.source : 'image_generation',
    ...(row.source_id ? { sourceId: row.source_id } : {}),
    ...(row.description ? { description: row.description } : {}),
    createdAt: toIso(row.created_at),
  }
}

async function ensureDefaultPlans(conn?: mysql.PoolConnection) {
  const exec = conn ? conn.execute.bind(conn) : mysqlExecute
  for (const plan of DEFAULT_PLANS) {
    await exec(
      `INSERT INTO plans (id, name, credits, price_cents, currency, enabled, recommended, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [plan.id, plan.name, plan.credits, plan.priceCents, plan.currency, plan.enabled ? 1 : 0, plan.recommended ? 1 : 0, plan.description ?? null, nowSql(), nowSql()],
    )
  }
}

async function ensurePlanMarketingColumns() {
  const columns = await mysqlQuery<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM plans`)
  const names = new Set(columns.map((row) => String(row.Field)))
  if (!names.has('recommended')) {
    await mysqlExecute(`ALTER TABLE plans ADD COLUMN recommended tinyint(1) NOT NULL DEFAULT 0 AFTER enabled`)
  }
  if (!names.has('description')) {
    await mysqlExecute(`ALTER TABLE plans ADD COLUMN description text NULL AFTER recommended`)
  }
}

async function normalizeCurrencyToCny() {
  await mysqlExecute(`UPDATE plans SET currency='CNY' WHERE currency<>'CNY'`)
  await mysqlExecute(`UPDATE orders SET currency='CNY' WHERE currency<>'CNY'`)
}

async function ensureUserPlanPackagesTable() {
  await mysqlExecute(
    `CREATE TABLE IF NOT EXISTS user_plan_packages (
      id varchar(128) NOT NULL,
      user_id varchar(128) NOT NULL,
      plan_id varchar(128) NOT NULL,
      order_id varchar(128) NOT NULL,
      total_uses int NOT NULL,
      remaining_uses int NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'active',
      expires_at datetime NULL,
      created_at datetime NOT NULL,
      updated_at datetime NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_order_id (order_id),
      KEY idx_user_status (user_id, status, created_at)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8`,
  )
}

async function ensureOrderBalanceColumns() {
  const columns = await mysqlQuery<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM orders`)
  const names = new Set(columns.map((row) => String(row.Field)))
  if (!names.has('original_amount_cents')) {
    await mysqlExecute(`ALTER TABLE orders ADD COLUMN original_amount_cents int NOT NULL DEFAULT 0 AFTER status`)
    await mysqlExecute(`UPDATE orders SET original_amount_cents=amount_cents WHERE original_amount_cents=0`)
  }
  if (!names.has('balance_applied')) {
    await mysqlExecute(`ALTER TABLE orders ADD COLUMN balance_applied int NOT NULL DEFAULT 0 AFTER amount_cents`)
  }
  if (!names.has('balance_applied_cents')) {
    await mysqlExecute(`ALTER TABLE orders ADD COLUMN balance_applied_cents int NOT NULL DEFAULT 0 AFTER balance_applied`)
  }
}

async function ensureAccount(conn: mysql.PoolConnection, userId: string): Promise<UserAccount> {
  await conn.execute(
    `INSERT IGNORE INTO user_accounts (id, role, status, created_at, updated_at) VALUES (?, 'user', 'active', ?, ?)`,
    [userId, nowSql(), nowSql()],
  )
  await conn.execute(
    `INSERT IGNORE INTO balances (user_id, available_credits, updated_at) VALUES (?, 0, ?)`,
    [userId, nowSql()],
  )
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM user_accounts WHERE id=? LIMIT 1`, [userId])
  return mapAccount(rows[0])
}

async function getBalanceInTx(conn: mysql.PoolConnection, userId: string): Promise<Balance> {
  await ensureAccount(conn, userId)
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM balances WHERE user_id=? LIMIT 1`, [userId])
  return mapBalance(rows[0])
}

async function addLedgerEntry(conn: mysql.PoolConnection, input: {
  userId: string
  type: LedgerEntry['type']
  amount: number
  source: LedgerEntry['source']
  sourceId?: string
  description?: string
}): Promise<LedgerEntry> {
  const balance = await getBalanceInTx(conn, input.userId)
  const nextBalance = balance.availableCredits + input.amount
  const id = genId('led')
  await conn.execute(
    `INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, source, source_id, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.type, input.amount, nextBalance, input.source, input.sourceId ?? null, input.description ?? null, nowSql()],
  )
  await conn.execute(`UPDATE balances SET available_credits=?, updated_at=? WHERE user_id=?`, [nextBalance, nowSql(), input.userId])
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM credit_ledger WHERE id=?`, [id])
  return mapLedger(rows[0])
}

function clampBalanceUnitCents(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 100
  return Math.max(1, Math.min(100_000, Math.trunc(numeric)))
}

async function grantPackageForOrder(conn: mysql.PoolConnection, order: Order) {
  const packageId = genId('pkg')
  await conn.execute(
    `INSERT IGNORE INTO user_plan_packages (id, user_id, plan_id, order_id, total_uses, remaining_uses, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [packageId, order.userId, order.planId, order.id, order.credits, order.credits, nowSql(), nowSql()],
  )
}

export async function createMysqlBillingStore(): Promise<BillingStore> {
  await ensurePlanMarketingColumns()
  await ensureDefaultPlans()
  await ensureUserPlanPackagesTable()
  await ensureOrderBalanceColumns()
  await normalizeCurrencyToCny()
  await migrateMysqlUserIdsToNumeric()

  return {
    async getOrCreateAccount(userId) {
      return mysqlTransaction((conn) => ensureAccount(conn, userId))
    },
    async getBalance(userId) {
      return mysqlTransaction((conn) => getBalanceInTx(conn, userId))
    },
    async listLedger(userId, limit = 50) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit || 50)))}`, [userId])
      return rows.map(mapLedger)
    },
    async listPlans() {
      await ensureDefaultPlans()
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM plans ORDER BY created_at ASC`)
      return rows.map(mapPlan)
    },
    async upsertPlan(plan) {
      const normalized: Plan = {
        id: plan.id.trim(),
        name: plan.name.trim(),
        credits: Math.max(1, Math.trunc(plan.credits)),
        priceCents: Math.max(0, Math.trunc(plan.priceCents)),
        currency: plan.currency === 'USD' ? 'USD' : 'CNY',
        enabled: Boolean(plan.enabled),
        recommended: Boolean(plan.recommended),
        ...(plan.description ? { description: plan.description.trim() } : {}),
      }
      if (!normalized.id) throw new Error('Plan ID is required')
      if (!normalized.name) throw new Error('Plan name is required')
      await mysqlExecute(
        `INSERT INTO plans (id, name, credits, price_cents, currency, enabled, recommended, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), credits=VALUES(credits), price_cents=VALUES(price_cents), currency=VALUES(currency), enabled=VALUES(enabled), recommended=VALUES(recommended), description=VALUES(description), updated_at=VALUES(updated_at)`,
        [normalized.id, normalized.name, normalized.credits, normalized.priceCents, normalized.currency, normalized.enabled ? 1 : 0, normalized.recommended ? 1 : 0, normalized.description ?? null, nowSql(), nowSql()],
      )
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM plans WHERE id=? LIMIT 1`, [normalized.id])
      return mapPlan(rows[0])
    },
    async listUserPlanPackages(userId) {
      await ensureUserPlanPackagesTable()
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(
        `SELECT * FROM user_plan_packages WHERE user_id=? ORDER BY status ASC, created_at ASC`,
        [userId],
      )
      return rows.map(mapPackage)
    },
    async listOrders(userId, limit = 20) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit || 20)))}`, [userId])
      return rows.map(mapOrder)
    },
    async getOrder(userId, orderId) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=? AND user_id=? LIMIT 1`, [orderId, userId])
      return rows[0] ? mapOrder(rows[0]) : null
    },
    async getOrderById(orderId) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=? LIMIT 1`, [orderId])
      return rows[0] ? mapOrder(rows[0]) : null
    },
    async getPendingOrder(userId) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`, [userId])
      return rows[0] ? mapOrder(rows[0]) : null
    },
    async listPaymentEvents(limit = 50) {
      const rows = await mysqlQuery<mysql.RowDataPacket[]>(
        `SELECT * FROM payment_events ORDER BY processed_at DESC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit || 50)))}`,
      )
      return rows.map((row) => ({
        id: row.id,
        provider: toProvider(row.provider),
        providerEventId: row.provider_event_id,
        orderId: row.order_id ?? undefined,
        processedAt: toIso(row.processed_at),
        raw: row.raw ? JSON.parse(String(row.raw)) : null,
      }))
    },
    async getAdminStats() {
      const [users, orders, paidOrders, pendingOrders, revenue, issued, debited, balances] = await Promise.all([
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM user_accounts`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM orders`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM orders WHERE status='paid'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COUNT(*) count FROM orders WHERE status='pending'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN original_amount_cents > 0 THEN original_amount_cents ELSE amount_cents + COALESCE(balance_applied_cents,0) END),0) total FROM orders WHERE status='paid'`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) total FROM credit_ledger WHERE amount > 0`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) total FROM credit_ledger WHERE amount < 0`),
        mysqlQuery<mysql.RowDataPacket[]>(`SELECT COALESCE(SUM(available_credits),0) total FROM balances`),
      ])
      return {
        users: Number(users[0].count) || 0,
        orders: Number(orders[0].count) || 0,
        paidOrders: Number(paidOrders[0].count) || 0,
        pendingOrders: Number(pendingOrders[0].count) || 0,
        revenueCents: Number(revenue[0].total) || 0,
        creditsIssued: Number(issued[0].total) || 0,
        creditsDebited: Math.abs(Number(debited[0].total) || 0),
        availableCredits: Number(balances[0].total) || 0,
      }
    },
    async createOrder(userId, planId, provider = 'dev', options = {}) {
      return mysqlTransaction(async (conn) => {
        await ensureAccount(conn, userId)
        const [pendingOrders] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`, [userId])
        if (pendingOrders[0]) throw new Error(`Pending order exists: ${pendingOrders[0].id}`)
        const [plans] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM plans WHERE id=? AND enabled=1 LIMIT 1`, [planId])
        if (!plans[0]) throw new Error('Plan not found')
        const plan = mapPlan(plans[0])
        const balance = await getBalanceInTx(conn, userId)
        const balanceUnitCents = clampBalanceUnitCents(options.balanceUnitCents)
        const maxBalanceUnitsByAmount = Math.floor(plan.priceCents / balanceUnitCents)
        const balanceApplied = options.useBalance === false ? 0 : Math.max(0, Math.min(balance.availableCredits, maxBalanceUnitsByAmount))
        const balanceAppliedCents = balanceApplied * balanceUnitCents
        const amountCents = Math.max(0, plan.priceCents - balanceAppliedCents)
        const paidByBalance = amountCents === 0 && options.autoPayCovered !== false
        const id = genOrderId()
        await conn.execute(
          `INSERT INTO orders (id, user_id, plan_id, status, original_amount_cents, amount_cents, balance_applied, balance_applied_cents, currency, credits, provider, created_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, planId, paidByBalance ? 'paid' : 'pending', plan.priceCents, amountCents, balanceApplied, balanceAppliedCents, plan.currency, plan.credits, provider, nowSql(), paidByBalance ? nowSql() : null],
        )
        if (balanceApplied > 0) {
          await addLedgerEntry(conn, {
            userId,
            type: 'debit',
            amount: -balanceApplied,
            source: 'order',
            sourceId: `order-balance:${id}`,
            description: `余额抵扣套餐订单 ${id}`,
          })
        }
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=?`, [id])
        const order = mapOrder(rows[0])
        if (paidByBalance) await grantPackageForOrder(conn, order)
        return order
      })
    },
    async cancelOrder(userId, orderId) {
      return mysqlTransaction(async (conn) => {
        const [orders] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=? AND user_id=? LIMIT 1`, [orderId, userId])
        if (!orders[0]) throw new Error('Order not found')
        const order = mapOrder(orders[0])
        if (order.status !== 'pending') throw new Error('Only pending orders can be cancelled')
        await conn.execute(`UPDATE orders SET status='cancelled' WHERE id=?`, [order.id])
        if (order.balanceApplied > 0) {
          const [existing] = await conn.query<mysql.RowDataPacket[]>(`SELECT id FROM credit_ledger WHERE source_id=? LIMIT 1`, [`refund:order-balance:${order.id}`])
          if (!existing[0]) {
            await addLedgerEntry(conn, {
              userId: order.userId,
              type: 'refund',
              amount: order.balanceApplied,
              source: 'order',
              sourceId: `refund:order-balance:${order.id}`,
              description: `取消订单退回余额 ${order.id}`,
            })
          }
        }
        const [updated] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=? LIMIT 1`, [order.id])
        return mapOrder(updated[0])
      })
    },
    async markOrderPaid(input) {
      return mysqlTransaction(async (conn) => {
        const [orders] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=? LIMIT 1`, [input.orderId])
        if (!orders[0]) throw new Error('Order not found')
        const order = mapOrder(orders[0])
        if (order.status === 'paid') return { order, duplicate: true as const }
        const [existing] = await conn.query<mysql.RowDataPacket[]>(`SELECT id FROM payment_events WHERE provider=? AND provider_event_id=? LIMIT 1`, [input.provider, input.providerEventId])
        if (existing[0]) return { order, duplicate: true as const }
        if (input.provider !== order.provider) throw new Error('Payment provider mismatch')
        if (input.paidAmountCents !== order.amountCents) throw new Error('Paid amount mismatch')
        await conn.execute(
          `UPDATE orders SET status='paid', provider_payment_id=?, paid_at=? WHERE id=?`,
          [input.providerPaymentId ?? null, nowSql(), order.id],
        )
        await conn.execute(
          `INSERT INTO payment_events (id, provider, provider_event_id, order_id, processed_at, raw) VALUES (?, ?, ?, ?, ?, ?)`,
          [genId('evt'), input.provider, input.providerEventId, order.id, nowSql(), JSON.stringify(input.raw ?? {})],
        )
        await grantPackageForOrder(conn, order)
        const [updated] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM orders WHERE id=?`, [order.id])
        return { order: mapOrder(updated[0]), duplicate: false as const }
      })
    },
    async debitCredits(input) {
      return mysqlTransaction(async (conn) => {
        const [existing] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM credit_ledger WHERE source_id=? LIMIT 1`, [input.sourceId])
        const balance = await getBalanceInTx(conn, input.userId)
        if (existing[0]) return { balance, ledgerEntry: mapLedger(existing[0]) }
        if (balance.availableCredits - Math.abs(input.amount) < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(conn, {
          userId: input.userId,
          type: 'debit',
          amount: -Math.abs(input.amount),
          source: 'image_generation',
          sourceId: input.sourceId,
          description: input.description,
        })
        return { balance: await getBalanceInTx(conn, input.userId), ledgerEntry }
      })
    },
    async refundCredits(input) {
      return mysqlTransaction(async (conn) => {
        const sourceId = `refund:${input.sourceId}`
        const [existing] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM credit_ledger WHERE source_id=? LIMIT 1`, [sourceId])
        const balance = await getBalanceInTx(conn, input.userId)
        if (existing[0]) return { balance, ledgerEntry: mapLedger(existing[0]), duplicate: true as const }
        const ledgerEntry = await addLedgerEntry(conn, {
          userId: input.userId,
          type: 'refund',
          amount: Math.abs(input.amount),
          source: 'image_generation',
          sourceId,
          description: input.description,
        })
        return { balance: await getBalanceInTx(conn, input.userId), ledgerEntry, duplicate: false as const }
      })
    },
    async debitGeneration(input) {
      return mysqlTransaction(async (conn) => {
        await ensureAccount(conn, input.userId)
        const [existingLedger] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM credit_ledger WHERE source_id=? LIMIT 1`, [input.sourceId])
        if (existingLedger[0]) {
          const balance = await getBalanceInTx(conn, input.userId)
          return { mode: 'credits', chargedCredits: Math.abs(Number(existingLedger[0].amount) || 0), chargedPackageUses: 0, balance, ledgerEntry: mapLedger(existingLedger[0]) } satisfies GenerationDebit
        }

        const [packages] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT * FROM user_plan_packages
            WHERE user_id=? AND status='active' AND remaining_uses >= ?
            ORDER BY created_at ASC
            LIMIT 1`,
          [input.userId, Math.max(1, Math.trunc(input.packageUses || 1))],
        )
        if (packages[0]) {
          const pkg = mapPackage(packages[0])
          const uses = Math.max(1, Math.trunc(input.packageUses || 1))
          const nextRemaining = pkg.remainingUses - uses
          await conn.execute(
            `UPDATE user_plan_packages SET remaining_uses=?, status=?, updated_at=? WHERE id=?`,
            [nextRemaining, nextRemaining <= 0 ? 'depleted' : 'active', nowSql(), pkg.id],
          )
          const [updated] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM user_plan_packages WHERE id=?`, [pkg.id])
          return { mode: 'package', chargedCredits: 0, chargedPackageUses: uses, package: mapPackage(updated[0]) } satisfies GenerationDebit
        }

        const balance = await getBalanceInTx(conn, input.userId)
        const amount = Math.max(1, Math.trunc(input.creditAmount || 1))
        if (balance.availableCredits - amount < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(conn, {
          userId: input.userId,
          type: 'debit',
          amount: -amount,
          source: 'image_generation',
          sourceId: input.sourceId,
          description: input.description,
        })
        return { mode: 'credits', chargedCredits: amount, chargedPackageUses: 0, balance: await getBalanceInTx(conn, input.userId), ledgerEntry } satisfies GenerationDebit
      })
    },
    async refundGeneration(input) {
      await mysqlTransaction(async (conn) => {
        if (input.debit.mode === 'package' && input.debit.package) {
          const uses = Math.max(1, Math.trunc(input.debit.chargedPackageUses || 1))
          const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT * FROM user_plan_packages WHERE id=? LIMIT 1`, [input.debit.package.id])
          if (!rows[0]) return
          const pkg = mapPackage(rows[0])
          const nextRemaining = Math.min(pkg.totalUses, pkg.remainingUses + uses)
          await conn.execute(
            `UPDATE user_plan_packages SET remaining_uses=?, status=?, updated_at=? WHERE id=?`,
            [nextRemaining, nextRemaining > 0 ? 'active' : 'depleted', nowSql(), pkg.id],
          )
          return
        }
        if (input.debit.mode === 'credits' && input.debit.chargedCredits > 0) {
          await addLedgerEntry(conn, {
            userId: input.userId,
            type: 'refund',
            amount: input.debit.chargedCredits,
            source: 'image_generation',
            sourceId: `refund:${input.sourceId}`,
            description: input.description,
          }).catch(() => undefined)
        }
      })
    },
    async adjustCredits(input) {
      return mysqlTransaction(async (conn) => {
        const amount = Math.trunc(input.amount)
        if (!amount) throw new Error('Adjustment amount is required')
        const balance = await getBalanceInTx(conn, input.userId)
        if (balance.availableCredits + amount < 0) throw new Error('Insufficient credits')
        const ledgerEntry = await addLedgerEntry(conn, {
          userId: input.userId,
          type: amount > 0 ? 'grant' : 'adjustment',
          amount,
          source: 'admin',
          sourceId: genId('admin'),
          description: input.description || 'Admin credit adjustment',
        })
        return { balance: await getBalanceInTx(conn, input.userId), ledgerEntry }
      })
    },
  }
}
