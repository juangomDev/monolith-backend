import crypto from 'node:crypto';
import { Role } from '@prisma/client';
import { prisma } from './db.js';
import { env } from './env.js';
import { hashPassword } from '../modules/users/users.service.js';

export interface SeedPrismaClient {
  apiClient: {
    upsert: (args: any) => Promise<any>;
  };
  user: {
    findUnique: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
}

/**
 * Garantiza de forma idempotente que la cuenta ADMIN inicial y el cliente API base
 * existan en PostgreSQL al arrancar el servidor (especialmente tras crear o reiniciar la BD en Dokploy).
 */
export async function ensureInitialSystemSeed(
  dbClient: SeedPrismaClient = prisma,
  config = {
    pepper: env.API_KEY_PEPPER,
    adminUsername: env.ADMIN_USERNAME,
    adminPassword: env.ADMIN_PASSWORD,
  }
): Promise<{ adminCreated: boolean }> {
  const rawKey = 'mk_live_dev_test_api_key_12345';
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHmac('sha256', config.pepper).update(rawKey).digest('hex');

  await dbClient.apiClient.upsert({
    where: { keyHash },
    update: { isActive: true },
    create: {
      name: 'Cliente de Desarrollo / Pruebas',
      keyPrefix,
      keyHash,
      rateLimit: 100,
      isActive: true,
    },
  });

  const existingAdmin = await dbClient.user.findUnique({
    where: { username: config.adminUsername },
  });

  if (!existingAdmin) {
    const passwordHash = await hashPassword(config.adminPassword);
    await dbClient.user.create({
      data: {
        username: config.adminUsername,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });
    return { adminCreated: true };
  }

  return { adminCreated: false };
}

