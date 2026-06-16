import { beforeEach, describe, expect, it } from 'vitest'
import { resetMemoryBillingStoreForTest } from './store.js'

describe('billing store', () => {
  beforeEach(() => {
    resetMemoryBillingStoreForTest()
  })

  it('creates orders and grants credits once for an idempotent payment event', async () => {
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'dev')

    const first = await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-1',
      paidAmountCents: order.amountCents,
      raw: { id: 'evt-1' },
    })
    const second = await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-1',
      paidAmountCents: order.amountCents,
      raw: { id: 'evt-1' },
    })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect((await store.getBalance('user-a')).availableCredits).toBe(100)
    expect(await store.listLedger('user-a')).toHaveLength(1)
  })

  it('rejects provider and amount mismatches before granting credits', async () => {
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'stripe')

    await expect(store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-provider',
      paidAmountCents: order.amountCents,
      raw: {},
    })).rejects.toThrow('Payment provider mismatch')

    await expect(store.markOrderPaid({
      orderId: order.id,
      provider: 'stripe',
      providerEventId: 'evt-amount',
      paidAmountCents: order.amountCents - 1,
      raw: {},
    })).rejects.toThrow('Paid amount mismatch')

    expect((await store.getBalance('user-a')).availableCredits).toBe(0)
  })

  it('prevents negative balances and supports refund idempotency', async () => {
    const store = resetMemoryBillingStoreForTest()
    await expect(store.debitCredits({
      userId: 'user-a',
      amount: -1,
      sourceId: 'job-a',
    })).rejects.toThrow('Insufficient credits')

    const order = await store.createOrder('user-a', 'dev-small', 'dev')
    await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-1',
      paidAmountCents: order.amountCents,
      raw: {},
    })
    await store.debitCredits({ userId: 'user-a', amount: -3, sourceId: 'job-a' })
    const firstRefund = await store.refundCredits({ userId: 'user-a', amount: 3, sourceId: 'job-a' })
    const duplicateRefund = await store.refundCredits({ userId: 'user-a', amount: 3, sourceId: 'job-a' })

    expect(firstRefund.duplicate).toBe(false)
    expect(duplicateRefund.duplicate).toBe(true)
    expect((await store.getBalance('user-a')).availableCredits).toBe(100)
  })
})
