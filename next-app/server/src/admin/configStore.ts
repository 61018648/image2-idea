import type mysql from 'mysql2/promise'
import { getPrismaClient } from '../db/prisma.js'
import { mysqlExecute, mysqlQuery, useMysqlCompat } from '../db/mysqlCompat.js'

export interface PlatformRuntimeConfig {
  siteName: string
  publicBaseUrl: string
  supportEmail: string
  smtpEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPasswordMasked: string
  smtpFromName: string
  smtpFromEmail: string
  emailVerificationOnRegister: boolean
  emailVerificationOnProfileUpdate: boolean
  openaiBaseUrl: string
  openaiImageModel: string
  upstreamTimeoutMs: number
  hasOpenaiApiKey: boolean
  openaiApiKeyMasked: string
  allowUserApiConfig: boolean
  epayEnabled: boolean
  epayGatewayUrl: string
  epayPid: string
  epayKeyMasked: string
  epayReturnUrl: string
  epayNotifyUrl: string
  epayPaymentTypes: EpayPaymentType[]
  creditsPerImage: number
  balanceUnitCents: number
}

export type EpayPaymentType = 'alipay' | 'wxpay' | 'qqpay'

export interface PlatformProviderConfig {
  openaiApiKey: string
  openaiBaseUrl: string
  openaiImageModel: string
  upstreamTimeoutMs: number
}

export interface PlatformConfigPatch {
  siteName?: string
  publicBaseUrl?: string
  supportEmail?: string
  smtpEnabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string
  smtpFromName?: string
  smtpFromEmail?: string
  emailVerificationOnRegister?: boolean
  emailVerificationOnProfileUpdate?: boolean
  openaiApiKey?: string
  openaiBaseUrl?: string
  openaiImageModel?: string
  upstreamTimeoutMs?: number
  allowUserApiConfig?: boolean
  epayEnabled?: boolean
  epayGatewayUrl?: string
  epayPid?: string
  epayKey?: string
  epayReturnUrl?: string
  epayNotifyUrl?: string
  epayPaymentTypes?: EpayPaymentType[]
  creditsPerImage?: number
  balanceUnitCents?: number
}

const DEFAULT_TIMEOUT_MS = 120_000
const MEMORY_SETTINGS = new Map<string, string>()
let mysqlTableReady = false

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

function normalizeTimeout(value: unknown, fallback = DEFAULT_TIMEOUT_MS): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(5_000, Math.min(600_000, Math.trunc(numeric)))
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

export function normalizeEpayPaymentTypes(value: unknown): EpayPaymentType[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const items = rawItems.filter((item): item is EpayPaymentType => item === 'alipay' || item === 'wxpay' || item === 'qqpay')
  return items.length ? Array.from(new Set(items)) : ['alipay']
}

async function ensureMysqlSettingsTable() {
  if (mysqlTableReady || !useMysqlCompat()) return
  await mysqlExecute(
    `CREATE TABLE IF NOT EXISTS platform_settings (
      setting_key varchar(191) NOT NULL,
      setting_value longtext NULL,
      updated_at datetime NOT NULL,
      PRIMARY KEY (setting_key)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8`,
  )
  mysqlTableReady = true
}

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  if (useMysqlCompat()) {
    await ensureMysqlSettingsTable()
    if (!keys.length) return {}
    const placeholders = keys.map(() => '?').join(',')
    const rows = await mysqlQuery<mysql.RowDataPacket[]>(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (${placeholders})`,
      keys,
    )
    return Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '')]))
  }

  if (process.env.DATABASE_URL?.trim()) {
    try {
      const rows = await getPrismaClient().platformSetting.findMany({
        where: { key: { in: keys } },
      })
      return Object.fromEntries(rows.map((row) => [row.key, row.value ?? '']))
    } catch {
      return {}
    }
  }

  return Object.fromEntries(keys.map((key) => [key, MEMORY_SETTINGS.get(key) ?? '']))
}

async function writeSettings(settings: Record<string, string>): Promise<void> {
  const entries = Object.entries(settings)
  if (!entries.length) return

  if (useMysqlCompat()) {
    await ensureMysqlSettingsTable()
    for (const [key, value] of entries) {
      await mysqlExecute(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=VALUES(updated_at)`,
        [key, value, nowSql()],
      )
    }
    return
  }

  if (process.env.DATABASE_URL?.trim()) {
    for (const [key, value] of entries) {
      try {
        await getPrismaClient().platformSetting.upsert({
          where: { key },
          update: { value, updatedAt: new Date() },
          create: { key, value, updatedAt: new Date() },
        })
      } catch {
        MEMORY_SETTINGS.set(key, value)
      }
    }
    return
  }

  for (const [key, value] of entries) MEMORY_SETTINGS.set(key, value)
}

const ALL_KEYS = [
  'siteName',
  'publicBaseUrl',
  'supportEmail',
  'smtpEnabled',
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUser',
  'smtpPassword',
  'smtpFromName',
  'smtpFromEmail',
  'emailVerificationOnRegister',
  'emailVerificationOnProfileUpdate',
  'openaiApiKey',
  'openaiBaseUrl',
  'openaiImageModel',
  'upstreamTimeoutMs',
  'allowUserApiConfig',
  'epayEnabled',
  'epayGatewayUrl',
  'epayPid',
  'epayKey',
  'epayReturnUrl',
  'epayNotifyUrl',
  'epayPaymentTypes',
  'creditsPerImage',
  'balanceUnitCents',
]

export async function readPlatformConfig(): Promise<PlatformRuntimeConfig> {
  const settings = await readSettings(ALL_KEYS)
  const apiKey = settings.openaiApiKey || env('PLATFORM_OPENAI_API_KEY')
  const timeout = normalizeTimeout(settings.upstreamTimeoutMs || env('PLATFORM_UPSTREAM_TIMEOUT_MS'))

  return {
    siteName: settings.siteName || env('PLATFORM_SITE_NAME') || 'Image Idea',
    publicBaseUrl: settings.publicBaseUrl || env('PLATFORM_PUBLIC_BASE_URL') || '',
    supportEmail: settings.supportEmail || env('PLATFORM_SUPPORT_EMAIL') || '',
    smtpEnabled: normalizeBoolean(settings.smtpEnabled || env('SMTP_ENABLED'), false),
    smtpHost: settings.smtpHost || env('SMTP_HOST') || '',
    smtpPort: Math.max(1, Math.min(65535, Math.trunc(Number(settings.smtpPort || env('SMTP_PORT') || 465) || 465))),
    smtpSecure: normalizeBoolean(settings.smtpSecure || env('SMTP_SECURE'), true),
    smtpUser: settings.smtpUser || env('SMTP_USER') || '',
    smtpPasswordMasked: maskSecret(settings.smtpPassword || env('SMTP_PASSWORD')),
    smtpFromName: settings.smtpFromName || env('SMTP_FROM_NAME') || settings.siteName || env('PLATFORM_SITE_NAME') || 'Image Idea',
    smtpFromEmail: settings.smtpFromEmail || env('SMTP_FROM_EMAIL') || settings.supportEmail || env('PLATFORM_SUPPORT_EMAIL') || '',
    emailVerificationOnRegister: normalizeBoolean(settings.emailVerificationOnRegister || env('EMAIL_VERIFICATION_ON_REGISTER'), false),
    emailVerificationOnProfileUpdate: normalizeBoolean(settings.emailVerificationOnProfileUpdate || env('EMAIL_VERIFICATION_ON_PROFILE_UPDATE'), false),
    openaiBaseUrl: settings.openaiBaseUrl || env('PLATFORM_OPENAI_BASE_URL') || 'https://api.openai.com/v1',
    openaiImageModel: settings.openaiImageModel || env('PLATFORM_OPENAI_IMAGE_MODEL') || 'gpt-image-2',
    upstreamTimeoutMs: timeout,
    hasOpenaiApiKey: Boolean(apiKey),
    openaiApiKeyMasked: maskSecret(apiKey),
    allowUserApiConfig: normalizeBoolean(settings.allowUserApiConfig, false),
    epayEnabled: normalizeBoolean(settings.epayEnabled, false),
    epayGatewayUrl: settings.epayGatewayUrl || env('EPAY_GATEWAY_URL') || '',
    epayPid: settings.epayPid || env('EPAY_PID') || '',
    epayKeyMasked: maskSecret(settings.epayKey || env('EPAY_KEY')),
    epayReturnUrl: settings.epayReturnUrl || env('EPAY_RETURN_URL') || '',
    epayNotifyUrl: settings.epayNotifyUrl || env('EPAY_NOTIFY_URL') || '',
    epayPaymentTypes: normalizeEpayPaymentTypes(settings.epayPaymentTypes || env('EPAY_PAYMENT_TYPES') || 'alipay'),
    creditsPerImage: Math.max(1, Math.trunc(Number(settings.creditsPerImage || env('PLATFORM_CREDITS_PER_IMAGE') || 1) || 1)),
    balanceUnitCents: Math.max(1, Math.min(100_000, Math.trunc(Number(settings.balanceUnitCents || env('PLATFORM_BALANCE_UNIT_CENTS') || 100) || 100))),
  }
}

export async function readImageProviderConfig(): Promise<PlatformProviderConfig> {
  const settings = await readSettings(['openaiApiKey', 'openaiBaseUrl', 'openaiImageModel', 'upstreamTimeoutMs'])
  return {
    openaiApiKey: settings.openaiApiKey || env('PLATFORM_OPENAI_API_KEY'),
    openaiBaseUrl: settings.openaiBaseUrl || env('PLATFORM_OPENAI_BASE_URL') || 'https://api.openai.com/v1',
    openaiImageModel: settings.openaiImageModel || env('PLATFORM_OPENAI_IMAGE_MODEL') || 'gpt-image-2',
    upstreamTimeoutMs: normalizeTimeout(settings.upstreamTimeoutMs || env('PLATFORM_UPSTREAM_TIMEOUT_MS')),
  }
}

export async function readPrivatePlatformSetting(key: string): Promise<string> {
  const settings = await readSettings([key])
  return settings[key] || env(key.toUpperCase()) || ''
}

export async function updatePlatformConfig(patch: PlatformConfigPatch): Promise<PlatformRuntimeConfig> {
  const next: Record<string, string> = {}
  const copyString = (key: keyof PlatformConfigPatch) => {
    const value = patch[key]
    if (typeof value === 'string') next[key] = value.trim()
  }

  copyString('siteName')
  copyString('publicBaseUrl')
  copyString('supportEmail')
  copyString('smtpHost')
  copyString('smtpUser')
  copyString('smtpFromName')
  copyString('smtpFromEmail')
  copyString('openaiBaseUrl')
  copyString('openaiImageModel')
  copyString('epayGatewayUrl')
  copyString('epayPid')
  copyString('epayReturnUrl')
  copyString('epayNotifyUrl')

  if (typeof patch.openaiApiKey === 'string' && patch.openaiApiKey.trim()) {
    next.openaiApiKey = patch.openaiApiKey.trim()
  }
  if (typeof patch.upstreamTimeoutMs !== 'undefined') {
    next.upstreamTimeoutMs = String(normalizeTimeout(patch.upstreamTimeoutMs))
  }
  if (typeof patch.allowUserApiConfig === 'boolean') {
    next.allowUserApiConfig = patch.allowUserApiConfig ? 'true' : 'false'
  }
  if (typeof patch.smtpEnabled === 'boolean') {
    next.smtpEnabled = patch.smtpEnabled ? 'true' : 'false'
  }
  if (typeof patch.smtpSecure === 'boolean') {
    next.smtpSecure = patch.smtpSecure ? 'true' : 'false'
  }
  if (typeof patch.emailVerificationOnRegister === 'boolean') {
    next.emailVerificationOnRegister = patch.emailVerificationOnRegister ? 'true' : 'false'
  }
  if (typeof patch.emailVerificationOnProfileUpdate === 'boolean') {
    next.emailVerificationOnProfileUpdate = patch.emailVerificationOnProfileUpdate ? 'true' : 'false'
  }
  if (typeof patch.smtpPort !== 'undefined') {
    next.smtpPort = String(Math.max(1, Math.min(65535, Math.trunc(Number(patch.smtpPort) || 465))))
  }
  if (typeof patch.smtpPassword === 'string' && patch.smtpPassword.trim()) {
    next.smtpPassword = patch.smtpPassword.trim()
  }
  if (typeof patch.epayEnabled === 'boolean') {
    next.epayEnabled = patch.epayEnabled ? 'true' : 'false'
  }
  if (typeof patch.epayPaymentTypes !== 'undefined') {
    next.epayPaymentTypes = normalizeEpayPaymentTypes(patch.epayPaymentTypes).join(',')
  }
  if (typeof patch.epayKey === 'string' && patch.epayKey.trim()) {
    next.epayKey = patch.epayKey.trim()
  }
  if (typeof patch.creditsPerImage !== 'undefined') {
    next.creditsPerImage = String(Math.max(1, Math.trunc(Number(patch.creditsPerImage) || 1)))
  }
  if (typeof patch.balanceUnitCents !== 'undefined') {
    next.balanceUnitCents = String(Math.max(1, Math.min(100_000, Math.trunc(Number(patch.balanceUnitCents) || 100))))
  }

  await writeSettings(next)
  return readPlatformConfig()
}
