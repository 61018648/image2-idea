import { getPrismaClient } from '../db/prisma.js'
import { useMysqlCompat } from '../db/mysqlCompat.js'
import type { GenerationJobStore } from './types.js'
import { createMemoryGenerationJobStore } from './memoryStore.js'
import { createMysqlGenerationJobStore } from './mysqlStore.js'
import { createPrismaGenerationJobStore } from './prismaStore.js'

let cachedStore: GenerationJobStore | null = null

export function getGenerationJobStore(): GenerationJobStore {
  if (cachedStore) return cachedStore
  cachedStore = useMysqlCompat()
    ? createMysqlGenerationJobStore()
    : process.env.DATABASE_URL?.trim()
    ? createPrismaGenerationJobStore(getPrismaClient())
    : createMemoryGenerationJobStore()
  return cachedStore
}

export function resetMemoryGenerationJobStoreForTest(): GenerationJobStore {
  cachedStore = createMemoryGenerationJobStore()
  return cachedStore
}
