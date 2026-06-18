import type mysql from 'mysql2/promise'
import { mysqlExecute, mysqlQuery, mysqlTransaction } from '../db/mysqlCompat.js'

export interface MysqlUserAccount {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  adminNote: string | null
  passwordHash: string | null
  displayName: string | null
  avatarUrl: string | null
  role: string
  status: string
}

function mapUser(row: Record<string, any>): MysqlUserAccount {
  return {
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    adminNote: row.admin_note ?? null,
    passwordHash: row.password_hash ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    role: row.role || 'user',
    status: row.status || 'active',
  }
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export async function findMysqlUserByEmail(email: string): Promise<MysqlUserAccount | null> {
  await ensureMysqlUserProfileColumns()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM user_accounts WHERE email=? LIMIT 1`, [email])
  return rows[0] ? mapUser(rows[0]) : null
}

export async function findMysqlUserByUsername(username: string): Promise<MysqlUserAccount | null> {
  await ensureMysqlUserProfileColumns()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM user_accounts WHERE username=? LIMIT 1`, [username])
  return rows[0] ? mapUser(rows[0]) : null
}

export async function findMysqlUserById(id: string): Promise<MysqlUserAccount | null> {
  await ensureMysqlUserProfileColumns()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT * FROM user_accounts WHERE id=? LIMIT 1`, [id])
  return rows[0] ? mapUser(rows[0]) : null
}

let profileColumnsReady = false
let numericIdsReady = false

export async function ensureMysqlUserProfileColumns(): Promise<void> {
  if (profileColumnsReady) return
  const columns = await mysqlQuery<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM user_accounts`)
  const names = new Set(columns.map((row) => String(row.Field)))
  if (!names.has('username')) {
    await mysqlExecute(`ALTER TABLE user_accounts ADD COLUMN username varchar(191) NULL AFTER id`)
  }
  if (!names.has('avatar_url')) {
    await mysqlExecute(`ALTER TABLE user_accounts ADD COLUMN avatar_url LONGTEXT NULL AFTER display_name`)
  }
  if (!names.has('phone')) {
    await mysqlExecute(`ALTER TABLE user_accounts ADD COLUMN phone varchar(32) NULL AFTER avatar_url`)
  }
  if (!names.has('admin_note')) {
    await mysqlExecute(`ALTER TABLE user_accounts ADD COLUMN admin_note text NULL AFTER phone`)
  }
  await mysqlExecute(`UPDATE user_accounts SET username=COALESCE(NULLIF(username,''), NULLIF(SUBSTRING_INDEX(email, '@', 1), ''), id) WHERE username IS NULL OR username=''`)
  const indexes = await mysqlQuery<mysql.RowDataPacket[]>(`SHOW INDEX FROM user_accounts WHERE Key_name='user_accounts_username_key'`)
  if (!indexes[0]) {
    await mysqlExecute(`ALTER TABLE user_accounts ADD UNIQUE KEY user_accounts_username_key (username)`)
  }
  profileColumnsReady = true
}

export async function migrateMysqlUserIdsToNumeric(): Promise<void> {
  if (numericIdsReady) return
  await ensureMysqlUserProfileColumns()
  await mysqlTransaction(async (conn) => {
    const [users] = await conn.query<mysql.RowDataPacket[]>(`SELECT id FROM user_accounts ORDER BY created_at ASC, email ASC`)
    let nextId = 1001
    for (const user of users) {
      const currentId = String(user.id)
      if (/^\d+$/.test(currentId)) {
        nextId = Math.max(nextId, Number(currentId) + 1)
        continue
      }
      let newId = String(nextId++)
      while (users.some((item) => String(item.id) === newId)) newId = String(nextId++)
      await conn.execute(`UPDATE user_accounts SET id=?, updated_at=? WHERE id=?`, [newId, nowSql(), currentId])
      await conn.execute(`UPDATE balances SET user_id=? WHERE user_id=?`, [newId, currentId])
      await conn.execute(`UPDATE credit_ledger SET user_id=? WHERE user_id=?`, [newId, currentId])
      await conn.execute(`UPDATE orders SET user_id=? WHERE user_id=?`, [newId, currentId])
      await conn.execute(`UPDATE generation_jobs SET user_id=? WHERE user_id=?`, [newId, currentId])
    }
  })
  numericIdsReady = true
}

export async function nextMysqlUserId(): Promise<string> {
  await migrateMysqlUserIdsToNumeric()
  const rows = await mysqlQuery<mysql.RowDataPacket[]>(`SELECT MAX(CAST(id AS UNSIGNED)) max_id FROM user_accounts WHERE id REGEXP '^[0-9]+$'`)
  return String(Math.max(1000, Number(rows[0]?.max_id) || 1000) + 1)
}

export async function createMysqlUser(input: {
  id?: string
  username: string
  email?: string | null
  phone?: string | null
  adminNote?: string | null
  passwordHash: string
  displayName: string
  role?: string
  status?: string
  availableCredits?: number
}): Promise<MysqlUserAccount> {
  await migrateMysqlUserIdsToNumeric()
  const id = input.id || await nextMysqlUserId()
  const role = input.role === 'admin' ? 'admin' : 'user'
  const status = input.status === 'disabled' ? 'disabled' : 'active'
  await mysqlExecute(
    `INSERT INTO user_accounts (id, username, email, phone, admin_note, password_hash, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.username, input.email || null, input.phone || null, input.adminNote || null, input.passwordHash, input.displayName, role, status, nowSql(), nowSql()],
  )
  await mysqlExecute(
    `INSERT IGNORE INTO balances (user_id, available_credits, updated_at) VALUES (?, ?, ?)`,
    [id, Math.max(0, Math.trunc(input.availableCredits ?? 0)), nowSql()],
  )
  const user = await findMysqlUserById(id)
  if (!user) throw new Error('Failed to create user')
  return user
}

export async function updateMysqlUserLastLogin(id: string): Promise<void> {
  await mysqlExecute(`UPDATE user_accounts SET last_login_at=?, updated_at=? WHERE id=?`, [nowSql(), nowSql(), id])
}

export async function updateMysqlUserProfile(id: string, input: {
  username?: string | null
  email?: string | null
  phone?: string | null
  adminNote?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  passwordHash?: string | null
  status?: string | null
}): Promise<MysqlUserAccount> {
  await ensureMysqlUserProfileColumns()
  const sets: string[] = []
  const params: unknown[] = []
  if ('username' in input) {
    sets.push('username=?')
    params.push(input.username)
  }
  if ('email' in input) {
    sets.push('email=?')
    params.push(input.email)
  }
  if ('phone' in input) {
    sets.push('phone=?')
    params.push(input.phone)
  }
  if ('adminNote' in input) {
    sets.push('admin_note=?')
    params.push(input.adminNote)
  }
  if ('displayName' in input) {
    sets.push('display_name=?')
    params.push(input.displayName)
  }
  if ('avatarUrl' in input) {
    sets.push('avatar_url=?')
    params.push(input.avatarUrl)
  }
  if ('passwordHash' in input) {
    sets.push('password_hash=?')
    params.push(input.passwordHash)
  }
  if ('status' in input) {
    sets.push('status=?')
    params.push(input.status === 'disabled' ? 'disabled' : 'active')
  }
  if (sets.length) {
    sets.push('updated_at=?')
    params.push(nowSql(), id)
    await mysqlExecute(`UPDATE user_accounts SET ${sets.join(', ')} WHERE id=?`, params)
  }
  const user = await findMysqlUserById(id)
  if (!user) throw new Error('User not found')
  return user
}
