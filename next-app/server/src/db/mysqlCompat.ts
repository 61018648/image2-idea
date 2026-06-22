import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

function getUrl(): string {
  return process.env.MYSQL_URL?.trim() || process.env.DATABASE_URL?.trim() || ''
}

export function useMysqlCompat(): boolean {
  return process.env.PLATFORM_DB_DRIVER === 'mysql' && Boolean(getUrl())
}

export function getMysqlCompatPool(): mysql.Pool {
  if (pool) return pool
  const uri = getUrl()
  if (!uri) throw new Error('MYSQL_URL is not configured')
  pool = mysql.createPool({
    uri,
    connectionLimit: 10,
    charset: 'utf8_general_ci',
    dateStrings: true,
  })
  return pool
}

type SqlParams = any[] | Record<string, any>

export async function mysqlQuery<T extends mysql.QueryResult>(sql: string, params: SqlParams = []): Promise<T> {
  const [rows] = await getMysqlCompatPool().query<T>(sql, params)
  return rows
}

export async function mysqlExecute<T extends mysql.QueryResult>(sql: string, params: SqlParams = []): Promise<T> {
  const [result] = await getMysqlCompatPool().execute<T>(sql, params)
  return result
}

export async function mysqlTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getMysqlCompatPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}
