import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../../server/src/auth/password'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ENV_PATH = resolve(process.cwd(), 'server/.env')

const schemaSql = `
CREATE TABLE IF NOT EXISTS "user_accounts" (
  "id" varchar(128) PRIMARY KEY,
  "username" varchar(191) UNIQUE,
  "email" varchar(191) UNIQUE,
  "password_hash" varchar(255),
  "display_name" varchar(191),
  "avatar_url" text,
  "phone" varchar(32),
  "admin_note" text,
  "role" varchar(32) NOT NULL DEFAULT 'user',
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "last_login_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "balances" (
  "user_id" varchar(128) PRIMARY KEY REFERENCES "user_accounts"("id") ON DELETE CASCADE,
  "available_credits" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "plans" (
  "id" varchar(128) PRIMARY KEY,
  "name" varchar(191) NOT NULL,
  "credits" integer NOT NULL,
  "price_cents" integer NOT NULL,
  "currency" varchar(8) NOT NULL DEFAULT 'CNY',
  "enabled" boolean NOT NULL DEFAULT true,
  "recommended" boolean NOT NULL DEFAULT false,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "orders" (
  "id" varchar(128) PRIMARY KEY,
  "user_id" varchar(128) NOT NULL REFERENCES "user_accounts"("id") ON DELETE CASCADE,
  "plan_id" varchar(128) NOT NULL REFERENCES "plans"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "original_amount_cents" integer NOT NULL DEFAULT 0,
  "amount_cents" integer NOT NULL,
  "balance_applied" integer NOT NULL DEFAULT 0,
  "balance_applied_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(8) NOT NULL DEFAULT 'CNY',
  "credits" integer NOT NULL,
  "provider" varchar(32) NOT NULL,
  "provider_order_id" varchar(191),
  "provider_payment_id" varchar(191),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" timestamp
);
CREATE INDEX IF NOT EXISTS "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");
CREATE TABLE IF NOT EXISTS "user_plan_packages" (
  "id" varchar(128) PRIMARY KEY,
  "user_id" varchar(128) NOT NULL REFERENCES "user_accounts"("id") ON DELETE CASCADE,
  "plan_id" varchar(128) NOT NULL REFERENCES "plans"("id"),
  "order_id" varchar(128) NOT NULL UNIQUE,
  "total_uses" integer NOT NULL,
  "remaining_uses" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "user_plan_packages_user_id_status_created_at_idx" ON "user_plan_packages"("user_id", "status", "created_at");
CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" varchar(128) PRIMARY KEY,
  "user_id" varchar(128) NOT NULL REFERENCES "user_accounts"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "source" varchar(32) NOT NULL,
  "source_id" varchar(191) UNIQUE,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "credit_ledger_user_id_created_at_idx" ON "credit_ledger"("user_id", "created_at");
CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" varchar(128) PRIMARY KEY,
  "provider" varchar(32) NOT NULL,
  "provider_event_id" varchar(128) NOT NULL,
  "order_id" varchar(128),
  "processed_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw" jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");
CREATE TABLE IF NOT EXISTS "generation_jobs" (
  "id" varchar(128) PRIMARY KEY,
  "user_id" varchar(128) NOT NULL REFERENCES "user_accounts"("id") ON DELETE CASCADE,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "prompt" text NOT NULL,
  "request_params" jsonb NOT NULL,
  "input_image_data" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mask_data_url" text,
  "cost_credits" integer NOT NULL,
  "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "raw_image_urls" jsonb,
  "revised_prompts" jsonb,
  "actual_params" jsonb,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" timestamp,
  "finished_at" timestamp
);
CREATE INDEX IF NOT EXISTS "generation_jobs_user_id_created_at_idx" ON "generation_jobs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "generation_jobs_status_created_at_idx" ON "generation_jobs"("status", "created_at");
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "setting_key" varchar(191) PRIMARY KEY,
  "setting_value" text,
  "updated_at" timestamp NOT NULL
);
CREATE TABLE IF NOT EXISTS "email_verification_codes" (
  "id" varchar(64) PRIMARY KEY,
  "email" varchar(191) NOT NULL,
  "purpose" varchar(32) NOT NULL,
  "code" varchar(12) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_verification_lookup" ON "email_verification_codes"("email", "purpose", "code");
`

const defaultPlans = [
  ['dev-small', '基础套餐', 100, 500, false, '适合轻量体验的 100 次生成套餐。'],
  ['dev-medium', '标准套餐', 500, 2000, true, '适合日常使用的 500 次生成套餐。'],
  ['dev-free', '体验套餐', 20, 100, false, '用于测试支付和生图流程的体验套餐。'],
] as const

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status })
}

function normalizeString(value: unknown, max = 256) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function requirePassword(value: unknown) {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 8) throw new Error('管理员密码至少 8 位')
  if (password.length > 128) throw new Error('管理员密码不能超过 128 位')
  return password
}

function buildEnv(input: {
  databaseUrl: string
  siteName: string
  publicBaseUrl: string
  sessionSecret: string
}) {
  return `# Generated by Image Idea installer.
PLATFORM_DB_DRIVER="postgresql"
DATABASE_URL="${input.databaseUrl}"

PLATFORM_HOST="127.0.0.1"
PLATFORM_PORT="8788"
PLATFORM_ALLOWED_ORIGINS="${input.publicBaseUrl || 'http://127.0.0.1:3000,http://localhost:3000'}"

PLATFORM_SESSION_SECRET="${input.sessionSecret}"
PLATFORM_DEV_MODE="false"
PLATFORM_COOKIE_SECURE="${input.publicBaseUrl.startsWith('https://') ? 'true' : 'false'}"
PLATFORM_SITE_NAME="${input.siteName || 'Image Idea'}"

PLATFORM_OPENAI_API_KEY=""
PLATFORM_OPENAI_BASE_URL="https://api.openai.com/v1"
PLATFORM_OPENAI_IMAGE_MODEL="gpt-image-2"
PLATFORM_PAYMENT_NOTIFY_SECRET="${randomBytes(24).toString('base64url')}"
`
}

function getDatabaseUrl(databaseUrl?: string) {
  const connectionString = databaseUrl || process.env.DATABASE_URL || readEnvDatabaseUrl()
  if (!connectionString) throw new Error('未配置数据库连接')
  return connectionString
}

function createPrismaClient(databaseUrl?: string) {
  const connectionString = getDatabaseUrl(databaseUrl)
  return new PrismaClient({
    datasources: {
      db: { url: connectionString },
    },
  })
}

function readEnvDatabaseUrl() {
  if (!existsSync(ENV_PATH)) return ''
  const content = readFileSync(ENV_PATH, 'utf8')
  const line = content.split(/\r?\n/).find((item) => item.trim().startsWith('DATABASE_URL='))
  const raw = line?.split('=').slice(1).join('=').trim() || ''
  return raw.replace(/^["']|["']$/g, '')
}

async function isInstalled(databaseUrl?: string) {
  const prisma = createPrismaClient(databaseUrl)
  try {
    const result = await prisma.$queryRaw<Array<{ count: number | bigint }>>`SELECT COUNT(*)::int AS count FROM user_accounts WHERE role='admin'`
    return { installed: Number(result[0]?.count || 0) > 0 }
  } catch {
    return { installed: false }
  } finally {
    await prisma.$disconnect()
  }
}

async function ensureSchema(prisma: PrismaClient) {
  const statements = schemaSql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement)
  }
}

export async function GET() {
  const envExists = existsSync(ENV_PATH)
  const status = await isInstalled()
  return json({ ...status, envExists })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const databaseUrl = normalizeString(body.databaseUrl, 512)
    const siteName = normalizeString(body.siteName, 80) || 'Image Idea'
    const publicBaseUrl = normalizeString(body.publicBaseUrl, 256)
    const adminUsername = normalizeString(body.adminUsername, 64)
    const adminEmail = normalizeString(body.adminEmail, 191).toLowerCase()
    const adminPassword = requirePassword(body.adminPassword)
    const overwrite = body.overwrite === true
    if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) throw new Error('请填写 PostgreSQL DATABASE_URL')
    if (!adminUsername || adminUsername.length < 3) throw new Error('管理员用户名至少 3 位')
    if (adminEmail && !/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error('管理员邮箱格式不正确')

    const existing = await isInstalled(databaseUrl)
    if (existing.installed && !overwrite) {
      return json({ error: { message: '系统已经安装，如需重置请勾选覆盖安装。', code: 'already_installed' } }, 409)
    }

    const prisma = createPrismaClient(databaseUrl)
    try {
      await prisma.$transaction(async (tx) => {
        await ensureSchema(tx as PrismaClient)
        if (overwrite) {
          await tx.userAccount.deleteMany({ where: { role: 'admin' } })
        }
        await tx.userAccount.upsert({
          where: { username: adminUsername },
          create: {
            id: '1001',
            username: adminUsername,
            email: adminEmail || null,
            passwordHash: await hashPassword(adminPassword),
            displayName: adminUsername,
            role: 'admin',
            status: 'active',
          },
          update: {
            email: adminEmail || null,
            passwordHash: await hashPassword(adminPassword),
            displayName: adminUsername,
            role: 'admin',
            status: 'active',
          },
        })
        await tx.balance.upsert({
          where: { userId: '1001' },
          create: { userId: '1001', availableCredits: 0 },
          update: {},
        })
        for (const [id, name, credits, priceCents, recommended, description] of defaultPlans) {
          await tx.plan.upsert({
            where: { id },
            create: { id, name, credits, priceCents, currency: 'CNY', enabled: true, recommended, description },
            update: { name, credits, priceCents, currency: 'CNY', enabled: true, recommended, description },
          })
        }
        const settings = [
          ['siteName', siteName],
          ['publicBaseUrl', publicBaseUrl],
          ['allowUserApiConfig', 'false'],
          ['creditsPerImage', '1'],
          ['balanceUnitCents', '100'],
          ['epayEnabled', 'false'],
          ['epayPaymentTypes', 'alipay'],
        ]
        for (const [key, value] of settings) {
          await tx.platformSetting.upsert({
            where: { key },
            create: { key, value, updatedAt: new Date() },
            update: { value, updatedAt: new Date() },
          })
        }
      })
    } finally {
      await prisma.$disconnect()
    }

    mkdirSync(dirname(ENV_PATH), { recursive: true })
    writeFileSync(ENV_PATH, buildEnv({
      databaseUrl,
      siteName,
      publicBaseUrl,
      sessionSecret: randomBytes(32).toString('base64url'),
    }), 'utf8')

    return json({ ok: true, message: '安装完成，请重启 Next 服务后登录管理员后台。' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: { message, code: 'install_failed' } }, 400)
  }
}
