import { createHash } from 'node:crypto'
import { readPlatformConfig, readPrivatePlatformSetting } from '../admin/configStore.js'

export interface EpayCheckoutInput {
  orderId: string
  amountCents: number
  name: string
  paymentType?: string
  clientIp?: string
}

export interface EpayConfig {
  enabled: boolean
  gatewayUrl: string
  pid: string
  key: string
  returnUrl: string
  notifyUrl: string
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}

function signParams(params: Record<string, string>, key: string): string {
  const payload = Object.keys(params)
    .filter((item) => item !== 'sign' && item !== 'sign_type' && params[item] !== '')
    .sort()
    .map((item) => `${item}=${params[item]}`)
    .join('&')
  return md5(`${payload}${key}`)
}

export async function readEpayConfig(origin: string): Promise<EpayConfig> {
  const config = await readPlatformConfig()
  const returnUrl = config.epayReturnUrl || env('EPAY_RETURN_URL') || origin
  const notifyUrl = config.epayNotifyUrl || env('EPAY_NOTIFY_URL') || `${origin.replace(/\/+$/, '')}/api/platform/payments/epay/notify`
  return {
    enabled: config.epayEnabled || env('EPAY_ENABLED') === 'true',
    gatewayUrl: config.epayGatewayUrl || env('EPAY_GATEWAY_URL'),
    pid: config.epayPid || env('EPAY_PID'),
    key: await readPrivatePlatformSetting('epayKey') || env('EPAY_KEY'),
    returnUrl,
    notifyUrl,
  }
}

export function buildEpayCheckoutUrl(config: EpayConfig, input: EpayCheckoutInput): string {
  if (!config.enabled || !config.gatewayUrl || !config.pid || !config.key) {
    throw new Error('Epay checkout is not configured')
  }
  const params: Record<string, string> = {
    pid: config.pid,
    type: input.paymentType === 'wxpay' || input.paymentType === 'qqpay' || input.paymentType === 'alipay' ? input.paymentType : 'alipay',
    out_trade_no: input.orderId,
    notify_url: config.notifyUrl,
    return_url: config.returnUrl,
    name: input.name,
    money: (input.amountCents / 100).toFixed(2),
    sitename: 'Image Idea',
  }
  params.sign = signParams(params, config.key)
  params.sign_type = 'MD5'
  const url = new URL(config.gatewayUrl.replace(/\/+$/, '') + '/submit.php')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

export async function verifyEpayNotify(params: Record<string, string>, origin: string): Promise<boolean> {
  const config = await readEpayConfig(origin)
  if (!config.key) return false
  const sign = params.sign || ''
  return Boolean(sign) && sign.toLowerCase() === signParams(params, config.key).toLowerCase()
}
