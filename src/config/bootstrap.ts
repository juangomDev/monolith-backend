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
  customConfig?: {
    pepper?: string;
    adminUsername?: string;
    adminPassword?: string;
    aiManagerUsername?: string;
    aiManagerPassword?: string;
  }
): Promise<{ adminCreated: boolean; aiManagerCreated: boolean }> {
  const config = {
    pepper: customConfig?.pepper ?? env.API_KEY_PEPPER,
    adminUsername: customConfig?.adminUsername ?? env.ADMIN_USERNAME,
    adminPassword: customConfig?.adminPassword ?? env.ADMIN_PASSWORD,
    aiManagerUsername: customConfig?.aiManagerUsername ?? env.AI_MANAGER_USERNAME,
    aiManagerPassword: customConfig?.aiManagerPassword ?? env.AI_MANAGER_PASSWORD,
  };
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

  let adminCreated = false;
  let aiManagerCreated = false;

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
    adminCreated = true;
  }

  const existingAiManager = await dbClient.user.findUnique({
    where: { username: config.aiManagerUsername },
  });

  if (!existingAiManager) {
    const aiPasswordHash = await hashPassword(config.aiManagerPassword);
    await dbClient.user.create({
      data: {
        username: config.aiManagerUsername,
        passwordHash: aiPasswordHash,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    aiManagerCreated = true;
  }

  // Garantizar existencia de la bóveda compartida corporativa 'shared'
  if ((dbClient as any).folder) {
    const adminUser = existingAdmin || (await dbClient.user.findUnique({ where: { username: config.adminUsername } }));
    if (adminUser) {
      const existingShared = await (dbClient as any).folder.findFirst({
        where: { isSystem: true, name: 'shared' },
      });
      if (!existingShared) {
        await (dbClient as any).folder.create({
          data: {
            name: 'shared',
            type: 'CONTAINER',
            isPrivate: false,
            isSystem: true,
            userId: adminUser.id,
            parentId: null,
          },
        });
      }
    }
  }

  return { adminCreated, aiManagerCreated };
}

