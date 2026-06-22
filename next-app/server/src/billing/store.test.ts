import { beforeEach, describe, expect, it } from 'vitest'
import { resetMemoryBillingStoreForTest } from './store.js'

describe('billing store', () => {
  beforeEach(() => {
    resetMemoryBillingStoreForTest()
  })

  it('creates orders and grants plan packages once for an idempotent payment event', async () => {
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
    expect((await store.getBalance('user-a')).availableCredits).toBe(0)
    expect(await store.listLedger('user-a')).toHaveLength(0)
    expect(await store.listUserPlanPackages('user-a')).toMatchObject([
      {
        userId: 'user-a',
        planId: 'dev-small',
        orderId: order.id,
        totalUses: 100,
        remainingUses: 100,
        status: 'active',
      },
    ])
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

  it('prevents negative credits and spends plan packages before credit balance', async () => {
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
    const debit = await store.debitGeneration({ userId: 'user-a', creditAmount: 3, packageUses: 3, sourceId: 'job-a' })

    expect(debit.mode).toBe('package')
    expect(debit.chargedPackageUses).toBe(3)
    expect((await store.getBalance('user-a')).availableCredits).toBe(0)
    expect(await store.listUserPlanPackages('user-a')).toMatchObject([
      {
        totalUses: 100,
        remainingUses: 97,
        status: 'active',
      },
    ])
  })

  it('applies balance to plan orders and refunds it when a pending order is cancelled', async () => {
    const store = resetMemoryBillingStoreForTest()
    await store.adjustCredits({ userId: 'user-a', amount: 3, description: 'seed balance' })

    const order = await store.createOrder('user-a', 'dev-small', 'epay', { balanceUnitCents: 100 })

    expect(order).toMatchObject({
      status: 'pending',
      originalAmountCents: 500,
      amountCents: 200,
      balanceApplied: 3,
      balanceAppliedCents: 300,
    })
    expect((await store.getBalance('user-a')).availableCredits).toBe(0)

    const cancelled = await store.cancelOrder('user-a', order.id)

    expect(cancelled.status).toBe('cancelled')
    expect((await store.getBalance('user-a')).availableCredits).toBe(3)
    expect((await store.listLedger('user-a')).map((entry) => entry.amount)).toEqual([3, -3, 3])
  })

  it('marks fully balance-covered plan orders paid and grants the package immediately', async () => {
    const store = resetMemoryBillingStoreForTest()
    await store.adjustCredits({ userId: 'user-a', amount: 10, description: 'seed balance' })

    const order = await store.createOrder('user-a', 'dev-small', 'epay', { balanceUnitCents: 100 })

    expect(order).toMatchObject({
      status: 'paid',
      originalAmountCents: 500,
      amountCents: 0,
      balanceApplied: 5,
      balanceAppliedCents: 500,
    })
    expect(order.paidAt).toBeTruthy()
    expect((await store.getBalance('user-a')).availableCredits).toBe(5)
    expect(await store.listUserPlanPackages('user-a')).toMatchObject([
      {
        userId: 'user-a',
        planId: 'dev-small',
        orderId: order.id,
        totalUses: 100,
        remainingUses: 100,
        status: 'active',
      },
    ])
  })
})
