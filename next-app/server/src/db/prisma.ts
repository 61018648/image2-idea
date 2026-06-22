import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | null = null

export function getPrismaClient(): PrismaClient {
  prisma ??= new PrismaClient()
  return prisma
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prisma) return
  await prisma.$disconnect()
  prisma = null
}
