import { beforeEach, describe, expect, it } from 'vitest'
import { resetMemoryBillingStoreForTest } from '../billing/store.js'
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

describe('payment notify route', () => {
  beforeEach(() => {
    process.env.PLATFORM_DEV_MODE = 'false'
    process.env.PLATFORM_PAYMENT_NOTIFY_SECRET = 'secret'
    resetMemoryBillingStoreForTest()
  })

  it('requires the payment notify secret outside dev mode', async () => {
    const response = await handlePaymentNotifyRequest(notifyRequest({}))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'unauthorized' })
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
})
