import { getPrismaClient } from '../db/prisma.js'
import type { GenerationJobStore } from './types.js'
import { createMemoryGenerationJobStore } from './memoryStore.js'
import { createPrismaGenerationJobStore } from './prismaStore.js'

let cachedStore: GenerationJobStore | null = null

export function getGenerationJobStore(): GenerationJobStore {
  if (cachedStore) return cachedStore
  cachedStore = process.env.DATABASE_URL?.trim()
    ? createPrismaGenerationJobStore(getPrismaClient())
    : createMemoryGenerationJobStore()
  return cachedStore
}

export function resetMemoryGenerationJobStoreForTest(): GenerationJobStore {
  cachedStore = createMemoryGenerationJobStore()
  return cachedStore
}
