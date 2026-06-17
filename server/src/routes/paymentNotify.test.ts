import { beforeEach, describe, expect, it } from 'vitest'
import { resetMemoryBillingStoreForTest } from '../billing/store.js'
import { resetMemoryGenerationJobStoreForTest } from '../generationJobs/store.js'
import { handleAdminRequest } from './admin.js'
import { handleOrdersRequest } from './orders.js'
import { handlePaymentNotifyRequest } from './paymentNotify.js'

function notifyRequest(body: unknown, secret?: string) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (secret) headers.set('x-platform-payment-secret', secret)
  return new Request('http://localhost/api/payment/notify', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function ordersRequest(userId = 'dev-user', limit?: number) {
  const url = new URL('http://localhost/api/platform/orders')
  if (limit) url.searchParams.set('limit', String(limit))
  return new Request(url, {
    method: 'GET',
    headers: { 'x-platform-user-id': userId },
  })
}

function checkoutRequest(body: unknown, token = 'platform-token', userId = 'user-a') {
  return new Request('http://localhost/api/platform/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-platform-user-id': userId,
    },
    body: JSON.stringify(body),
  })
}

function adminStatsRequest(userId = 'dev-user') {
  return new Request('http://localhost/api/platform/admin/stats', {
    method: 'GET',
    headers: { 'x-platform-user-id': userId },
  })
}

describe('payment notify route', () => {
  beforeEach(() => {
    process.env.PLATFORM_DEV_MODE = 'false'
    process.env.PLATFORM_PAYMENT_NOTIFY_SECRET = 'secret'
    resetMemoryBillingStoreForTest()
    resetMemoryGenerationJobStoreForTest()
  })

  it('requires the payment notify secret outside dev mode', async () => {
    const response = await handlePaymentNotifyRequest(notifyRequest({}))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } })
  })

  it('marks an order paid and returns duplicate on repeated notify', async () => {
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'stripe')
    const body = {
      provider: 'stripe',
      providerEventId: 'evt-1',
      orderId: order.id,
      paidAmountCents: order.amountCents,
      providerPaymentId: 'pay-1',
    }

    const firstResponse = await handlePaymentNotifyRequest(notifyRequest(body, 'secret'))
    const duplicateResponse = await handlePaymentNotifyRequest(notifyRequest(body, 'secret'))
    const firstJson = await firstResponse.json()
    const duplicateJson = await duplicateResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstJson).toMatchObject({ ok: true, duplicate: false })
    expect(duplicateResponse.status).toBe(200)
    expect(duplicateJson).toMatchObject({ ok: true, duplicate: true })
    expect((await store.getBalance('user-a')).availableCredits).toBe(100)
  })

  it('allows dev mode callbacks without the shared secret', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    process.env.PLATFORM_PAYMENT_NOTIFY_SECRET = ''
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('dev-user', 'dev-small', 'dev')

    const response = await handlePaymentNotifyRequest(notifyRequest({
      provider: 'dev',
      providerEventId: 'evt-dev',
      orderId: order.id,
      paidAmountCents: order.amountCents,
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, duplicate: false })
  })

  it('lists recent orders for the current user', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const first = await store.createOrder('dev-user', 'dev-small', 'dev')
    const second = await store.createOrder('dev-user', 'dev-medium', 'stripe')
    await store.createOrder('other-user', 'dev-small', 'dev')

    const response = await handleOrdersRequest(ordersRequest('dev-user', 10))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.orders).toHaveLength(2)
    expect(json.orders.map((order: { id: string }) => order.id).sort()).toEqual([first.id, second.id].sort())
    expect(json.orders.every((order: { userId: string }) => order.userId === 'dev-user')).toBe(true)
  })

  it('rejects checkout for development sessions', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'

    const response = await handleOrdersRequest(new Request('http://localhost/api/platform/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'dev-small', provider: 'stripe' }),
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } })
  })

  it('creates a pending checkout placeholder for authenticated sessions', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'

    const response = await handleOrdersRequest(checkoutRequest({ planId: 'dev-small', provider: 'stripe' }))
    const json = await response.json()

    expect(response.status).toBe(202)
    expect(json.order).toMatchObject({ userId: 'user-a', planId: 'dev-small', provider: 'stripe', status: 'pending' })
    expect(json.checkout).toMatchObject({ status: 'not_configured', provider: 'stripe' })
  })

  it('returns platform admin stats in dev mode', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('dev-user', 'dev-small', 'dev')
    await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-admin-stats',
      paidAmountCents: order.amountCents,
      raw: {},
    })

    const response = await handleAdminRequest(adminStatsRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.billing).toMatchObject({ users: 1, orders: 1, paidOrders: 1, revenueCents: 500, creditsIssued: 100 })
    expect(json.jobs).toMatchObject({ total: 0 })
  })
})
