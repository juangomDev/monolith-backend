import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function connectDB(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
}
