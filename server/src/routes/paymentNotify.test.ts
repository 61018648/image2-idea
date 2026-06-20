import { beforeEach, describe, expect, it } from 'vitest'
import { resetMemoryBillingStoreForTest } from '../billing/store.js'
import { resetMemoryGenerationJobStoreForTest } from '../generationJobs/store.js'
import { handleAdminRequest } from './admin.js'
import { handleOrdersRequest, resetOrderRefreshRateLimitForTest } from './orders.js'
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

function orderDetailRequest(orderId: string, userId = 'dev-user') {
  return new Request(`http://localhost/api/platform/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { 'x-platform-user-id': userId },
  })
}

function cancelOrderRequest(orderId: string, userId = 'dev-user', token?: string) {
  const headers: Record<string, string> = { 'x-platform-user-id': userId }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(`http://localhost/api/platform/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers,
  })
}

function resumeCheckoutRequest(orderId: string, token = 'platform-token', userId = 'user-a') {
  return new Request(`http://localhost/api/platform/orders/${encodeURIComponent(orderId)}/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-platform-user-id': userId,
    },
    body: JSON.stringify({ paymentType: 'alipay' }),
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

function adminPaymentEventsRequest(userId = 'dev-user') {
  return new Request('http://localhost/api/platform/admin/payment-events', {
    method: 'GET',
    headers: { 'x-platform-user-id': userId },
  })
}

function adminConfirmPaymentRequest(body: unknown, userId = 'dev-user') {
  return new Request('http://localhost/api/platform/admin/orders/confirm-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-platform-user-id': userId },
    body: JSON.stringify(body),
  })
}

describe('payment notify route', () => {
  beforeEach(() => {
    process.env.PLATFORM_DEV_MODE = 'false'
    process.env.PLATFORM_PAYMENT_NOTIFY_SECRET = 'secret'
    delete process.env.EPAY_ENABLED
    delete process.env.EPAY_GATEWAY_URL
    delete process.env.EPAY_PID
    delete process.env.EPAY_KEY
    resetMemoryBillingStoreForTest()
    resetMemoryGenerationJobStoreForTest()
    resetOrderRefreshRateLimitForTest()
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
    expect((await store.getBalance('user-a')).availableCredits).toBe(0)
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
    await store.markOrderPaid({
      orderId: first.id,
      provider: 'dev',
      providerEventId: 'evt-list-paid',
      paidAmountCents: first.amountCents,
      raw: {},
    })
    const second = await store.createOrder('dev-user', 'dev-medium', 'stripe')
    await store.createOrder('other-user', 'dev-small', 'dev')

    const response = await handleOrdersRequest(ordersRequest('dev-user', 10))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.orders).toHaveLength(2)
    expect(json.orders.map((order: { id: string }) => order.id).sort()).toEqual([first.id, second.id].sort())
    expect(json.orders.every((order: { userId: string }) => order.userId === 'dev-user')).toBe(true)
  })

  it('returns one order only for the current user', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const ownOrder = await store.createOrder('dev-user', 'dev-small', 'dev')
    const otherOrder = await store.createOrder('other-user', 'dev-small', 'dev')

    const ownResponse = await handleOrdersRequest(orderDetailRequest(ownOrder.id, 'dev-user'))
    const forbiddenResponse = await handleOrdersRequest(orderDetailRequest(otherOrder.id, 'dev-user'))
    const ownJson = await ownResponse.json()

    expect(ownResponse.status).toBe(200)
    expect(ownJson.order).toMatchObject({ id: ownOrder.id, userId: 'dev-user' })
    expect(forbiddenResponse.status).toBe(404)
  })

  it('rate limits repeated order detail refreshes', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('dev-user', 'dev-small', 'dev')

    const firstResponse = await handleOrdersRequest(orderDetailRequest(order.id, 'dev-user'))
    const secondResponse = await handleOrdersRequest(orderDetailRequest(order.id, 'dev-user'))
    const secondJson = await secondResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(429)
    expect(secondResponse.headers.get('Retry-After')).toBeTruthy()
    expect(secondJson.error).toMatchObject({ code: 'rate_limited' })
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

  it('uses balance directly when checkout is fully covered', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'
    const store = resetMemoryBillingStoreForTest()
    await store.adjustCredits({ userId: 'user-a', amount: 10, description: 'seed balance' })

    const response = await handleOrdersRequest(checkoutRequest({ planId: 'dev-small', provider: 'epay', paymentType: 'alipay' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.order).toMatchObject({
      userId: 'user-a',
      planId: 'dev-small',
      provider: 'epay',
      status: 'paid',
      amountCents: 0,
      balanceApplied: 5,
      balanceAppliedCents: 500,
    })
    expect(json.checkout).toMatchObject({ status: 'balance_paid', provider: 'epay' })
    expect(json.checkout.checkoutUrl).toBeUndefined()
  })

  it('blocks new checkout while a pending order exists', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'

    const firstResponse = await handleOrdersRequest(checkoutRequest({ planId: 'dev-small', provider: 'stripe' }))
    const secondResponse = await handleOrdersRequest(checkoutRequest({ planId: 'dev-medium', provider: 'stripe' }))
    const secondJson = await secondResponse.json()

    expect(firstResponse.status).toBe(202)
    expect(secondResponse.status).toBe(409)
    expect(secondJson.error).toMatchObject({ code: 'pending_order_exists' })
    expect(secondJson.error.order).toMatchObject({ planId: 'dev-small', status: 'pending' })
  })

  it('resumes checkout for an existing pending order without creating a new order', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'
    process.env.EPAY_ENABLED = 'true'
    process.env.EPAY_GATEWAY_URL = 'https://pay.example.test'
    process.env.EPAY_PID = 'pid-1'
    process.env.EPAY_KEY = 'key-1'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'epay')

    const response = await handleOrdersRequest(resumeCheckoutRequest(order.id))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.order).toMatchObject({ id: order.id, status: 'pending' })
    expect(json.checkout).toMatchObject({ status: 'redirect', provider: 'epay' })
    expect(json.checkout.checkoutUrl).toContain('out_trade_no=' + encodeURIComponent(order.id))
    expect(await store.listOrders('user-a')).toHaveLength(1)
  })

  it('settles an existing same-plan pending checkout with balance when fully covered', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'
    const store = resetMemoryBillingStoreForTest()
    const pendingOrder = await store.createOrder('user-a', 'dev-small', 'epay')
    await store.adjustCredits({ userId: 'user-a', amount: 10, description: 'seed balance' })

    const response = await handleOrdersRequest(checkoutRequest({ planId: 'dev-small', provider: 'epay', paymentType: 'alipay' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(await store.getOrder('user-a', pendingOrder.id)).toMatchObject({ status: 'cancelled' })
    expect(json.order).toMatchObject({
      planId: 'dev-small',
      status: 'paid',
      amountCents: 0,
      balanceApplied: 5,
    })
    expect(json.checkout).toMatchObject({ status: 'balance_paid' })
  })

  it('allows users to cancel pending orders before creating another checkout', async () => {
    process.env.PLATFORM_API_TOKEN = 'platform-token'

    const firstResponse = await handleOrdersRequest(checkoutRequest({ planId: 'dev-small', provider: 'stripe' }))
    const firstJson = await firstResponse.json()
    const cancelResponse = await handleOrdersRequest(cancelOrderRequest(firstJson.order.id, 'user-a', 'platform-token'))
    const secondResponse = await handleOrdersRequest(checkoutRequest({ planId: 'dev-medium', provider: 'stripe' }))
    const cancelJson = await cancelResponse.json()
    const secondJson = await secondResponse.json()

    expect(cancelResponse.status).toBe(200)
    expect(cancelJson.order).toMatchObject({ id: firstJson.order.id, status: 'cancelled' })
    expect(secondResponse.status).toBe(202)
    expect(secondJson.order).toMatchObject({ planId: 'dev-medium', status: 'pending' })
  })

  it('rejects cancelling a paid order', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('dev-user', 'dev-small', 'dev')
    await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-paid-cancel',
      paidAmountCents: order.amountCents,
      raw: {},
    })

    const response = await handleOrdersRequest(cancelOrderRequest(order.id, 'dev-user'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { message: 'Only pending orders can be cancelled' } })
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
    expect(json.billing).toMatchObject({ users: 1, orders: 1, paidOrders: 1, revenueCents: 500, creditsIssued: 0 })
    expect(json.jobs).toMatchObject({ total: 0 })
  })

  it('allows admins to confirm a pending order payment', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'stripe')

    const response = await handleAdminRequest(adminConfirmPaymentRequest({
      orderId: order.id,
      providerEventId: 'manual-pay-1',
      providerPaymentId: 'manual-channel-1',
      note: 'Customer paid offline',
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.order).toMatchObject({ id: order.id, status: 'paid', providerPaymentId: 'manual-channel-1' })
    expect(await store.listUserPlanPackages('user-a')).toMatchObject([{ orderId: order.id, remainingUses: 100 }])
  })

  it('lists payment events for admin diagnostics with sensitive raw fields masked', async () => {
    process.env.PLATFORM_DEV_MODE = 'true'
    const store = resetMemoryBillingStoreForTest()
    const order = await store.createOrder('user-a', 'dev-small', 'dev')
    await store.markOrderPaid({
      orderId: order.id,
      provider: 'dev',
      providerEventId: 'evt-mask',
      paidAmountCents: order.amountCents,
      raw: { sign: 'secret-sign', trade_no: 'trade-1' },
    })

    const response = await handleAdminRequest(adminPaymentEventsRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.events[0]).toMatchObject({ providerEventId: 'evt-mask', orderId: order.id })
    expect(json.events[0].raw).toMatchObject({ sign: '***', trade_no: 'trade-1' })
  })
})
