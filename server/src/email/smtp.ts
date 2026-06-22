import { createConnection } from 'node:net'
import { connect as createTlsConnection } from 'node:tls'
import { randomInt } from 'node:crypto'
import type mysql from 'mysql2/promise'
import { readPlatformConfig, readPrivatePlatformSetting } from '../admin/configStore.js'
import { mysqlExecute, mysqlQuery, useMysqlCompat } from '../db/mysqlCompat.js'
import { getPrismaClient } from '../db/prisma.js'

type EmailPurpose = 'register' | 'profile_email'

interface VerificationRow {
  id: string
  email: string
  purpose: EmailPurpose
  code: string
  expires_at: string
  used_at?: string | null
  created_at: string
}

interface SendVerificationInput {
  email: string
  purpose: EmailPurpose
  siteName?: string
}

const MEMORY_CODES = new Map<string, VerificationRow>()
let mysqlEmailTableReady = false

function nowSql(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function toDate(value: string) {
  return new Date(value.replace(' ', 'T'))
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function generateCode() {
  return String(randomInt(100000, 1000000))
}

function createId() {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function purposeLabel(purpose: EmailPurpose) {
  return purpose === 'register' ? '注册账号' : '修改邮箱'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function encodeMimeWord(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function formatMailbox(name: string, email: string) {
  const safeEmail = email.trim()
  if (!name.trim()) return safeEmail
  return `${encodeMimeWord(name.trim())} <${safeEmail}>`
}

async function ensureMysqlEmailTable() {
  if (mysqlEmailTableReady || !useMysqlCompat()) return
  await mysqlExecute(
    `CREATE TABLE IF NOT EXISTS email_verification_codes (
      id varchar(64) NOT NULL,
      email varchar(191) NOT NULL,
      purpose varchar(32) NOT NULL,
      code varchar(12) NOT NULL,
      expires_at datetime NOT NULL,
      used_at datetime NULL,
      created_at datetime NOT NULL,
      PRIMARY KEY (id),
      KEY email_verification_lookup (email, purpose, code)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8`,
  )
  mysqlEmailTableReady = true
}

function readLine(socket: NodeJS.ReadWriteStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onEnd = () => {
      cleanup()
      reject(new Error('SMTP connection closed'))
    }
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/).filter(Boolean)
      const last = lines[lines.length - 1]
      if (last && /^\d{3} /.test(last)) {
        cleanup()
        resolve(buffer)
      }
    }
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('end', onEnd)
  })
}

async function expect(socket: NodeJS.ReadWriteStream, ok: number[]) {
  const response = await readLine(socket)
  const code = Number(response.slice(0, 3))
  if (!ok.includes(code)) throw new Error(`SMTP error ${code}`)
  return response
}

async function sendCommand(socket: NodeJS.ReadWriteStream, command: string, ok: number[]) {
  socket.write(`${command}\r\n`)
  return expect(socket, ok)
}

function buildMessage(input: {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  text: string
  html: string
}) {
  const boundary = `----=_Platform_${Date.now()}_${Math.random().toString(36).slice(2)}`
  return [
    `From: ${formatMailbox(input.fromName, input.fromEmail)}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeWord(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

async function sendSmtpMail(input: { to: string; subject: string; text: string; html: string }) {
  const config = await readPlatformConfig()
  const password = await readPrivatePlatformSetting('smtpPassword')
  if (!config.smtpEnabled || !config.smtpHost || !config.smtpFromEmail) throw new Error('SMTP is not configured')
  if (config.smtpUser && !password) throw new Error('SMTP password is not configured')

  const socket: NodeJS.ReadWriteStream = await new Promise((resolve, reject) => {
    const onConnect = () => resolve(socket)
    const onError = (error: Error) => reject(error)
    const socket = config.smtpSecure
      ? createTlsConnection({ host: config.smtpHost, port: config.smtpPort, servername: config.smtpHost }, onConnect)
      : createConnection({ host: config.smtpHost, port: config.smtpPort }, onConnect)
    socket.once('error', onError)
  })

  try {
    await expect(socket, [220])
    await sendCommand(socket, `EHLO ${config.publicBaseUrl ? new URL(config.publicBaseUrl).hostname : 'localhost'}`, [250])
    if (config.smtpUser) {
      await sendCommand(socket, 'AUTH LOGIN', [334])
      await sendCommand(socket, Buffer.from(config.smtpUser).toString('base64'), [334])
      await sendCommand(socket, Buffer.from(password).toString('base64'), [235])
    }
    await sendCommand(socket, `MAIL FROM:<${config.smtpFromEmail}>`, [250])
    await sendCommand(socket, `RCPT TO:<${input.to}>`, [250, 251])
    await sendCommand(socket, 'DATA', [354])
    socket.write(`${buildMessage({
      fromName: config.smtpFromName,
      fromEmail: config.smtpFromEmail,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }).replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`)
    await expect(socket, [250])
    await sendCommand(socket, 'QUIT', [221]).catch(() => undefined)
  } finally {
    socket.end()
  }
}

async function saveCode(row: VerificationRow) {
  if (useMysqlCompat()) {
    await ensureMysqlEmailTable()
    await mysqlExecute(
      `INSERT INTO email_verification_codes (id, email, purpose, code, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [row.id, row.email, row.purpose, row.code, row.expires_at, row.created_at],
    )
    return
  }
  if (process.env.DATABASE_URL?.trim()) {
    try {
      await getPrismaClient().emailVerificationCode.create({
        data: {
          id: row.id,
          email: row.email,
          purpose: row.purpose,
          code: row.code,
          expiresAt: toDate(row.expires_at),
          createdAt: toDate(row.created_at),
        },
      })
      return
    } catch {
      /* memory fallback */
    }
  }
  MEMORY_CODES.set(row.id, row)
}

async function findCode(email: string, purpose: EmailPurpose, code: string): Promise<VerificationRow | null> {
  if (useMysqlCompat()) {
    await ensureMysqlEmailTable()
    const rows = await mysqlQuery<mysql.RowDataPacket[]>(
      `SELECT * FROM email_verification_codes
       WHERE email=? AND purpose=? AND code=? AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [email, purpose, code, nowSql()],
    )
    return rows[0] ? rows[0] as VerificationRow : null
  }
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const row = await getPrismaClient().emailVerificationCode.findFirst({
        where: {
          email,
          purpose,
          code,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })
      return row ? {
        id: row.id,
        email: row.email,
        purpose: row.purpose as EmailPurpose,
        code: row.code,
        expires_at: nowSql(row.expiresAt),
        used_at: row.usedAt ? nowSql(row.usedAt) : null,
        created_at: nowSql(row.createdAt),
      } : null
    } catch {
      /* memory fallback */
    }
  }
  return Array.from(MEMORY_CODES.values()).find((row) => (
    row.email === email
    && row.purpose === purpose
    && row.code === code
    && !row.used_at
    && new Date(row.expires_at).getTime() > Date.now()
  )) ?? null
}

async function markCodeUsed(id: string) {
  if (useMysqlCompat()) {
    await mysqlExecute(`UPDATE email_verification_codes SET used_at=? WHERE id=?`, [nowSql(), id])
    return
  }
  if (process.env.DATABASE_URL?.trim()) {
    try {
      await getPrismaClient().emailVerificationCode.update({ where: { id }, data: { usedAt: new Date() } })
      return
    } catch {
      /* memory fallback */
    }
  }
  const row = MEMORY_CODES.get(id)
  if (row) MEMORY_CODES.set(id, { ...row, used_at: nowSql() })
}

export async function sendEmailVerificationCode(input: SendVerificationInput) {
  const email = normalizeEmail(input.email)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Valid email is required')
  const config = await readPlatformConfig()
  if (!config.smtpEnabled) throw new Error('SMTP is not enabled')
  const code = generateCode()
  const siteName = input.siteName || config.siteName || 'Image Idea'
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await saveCode({
    id: createId(),
    email,
    purpose: input.purpose,
    code,
    expires_at: nowSql(expiresAt),
    created_at: nowSql(),
  })
  const label = purposeLabel(input.purpose)
  await sendSmtpMail({
    to: email,
    subject: `${siteName} ${label}验证码`,
    text: `你的验证码是：${code}\n\n10 分钟内有效。如非本人操作，请忽略本邮件。`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
      <h2>${escapeHtml(siteName)} ${escapeHtml(label)}验证码</h2>
      <p>你的验证码是：</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</div>
      <p>10 分钟内有效。如非本人操作，请忽略本邮件。</p>
    </div>`,
  })
}

export async function verifyEmailCode(input: { email: string; purpose: EmailPurpose; code?: string | null; consume?: boolean }) {
  const email = normalizeEmail(input.email)
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  if (!code) return false
  const row = await findCode(email, input.purpose, code)
  if (!row) return false
  if (input.consume !== false) await markCodeUsed(row.id)
  return true
}
