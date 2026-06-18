import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function loadEnvFile(file = resolve(process.cwd(), '.env')): void {
  if (!existsSync(file)) return

  const content = readFileSync(file, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue

    const key = line.slice(0, index).trim()
    if (!key || process.env[key] != null) continue
    process.env[key] = unquote(line.slice(index + 1))
  }
}
