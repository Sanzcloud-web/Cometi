import { PrismaClient } from '@prisma/client';

// A singleton Prisma client for the embeddings database
let prisma: PrismaClient | undefined;

export function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

