import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { ensureInitialSystemSeed, type SeedPrismaClient } from '../../src/config/bootstrap.js';

describe('Config: Bootstrap y Siembra Automática Inicial (bootstrap.ts)', () => {
  const testConfig = {
    pepper: 'test_secret_pepper_at_least_16_chars_long',
    adminUsername: 'admin',
    adminPassword: 'StrongAdminPass2026!',
  };

  it('debe crear automáticamente el usuario ADMIN y el ApiClient cuando la base de datos está vacía', async () => {
    const createdUsers: any[] = [];
    let upsertedClient: any = null;

    const mockDb: SeedPrismaClient = {
      apiClient: {
        upsert: async (args: any) => {
          upsertedClient = args;
          return { id: 'client-1', ...args.create };
        },
      },
      user: {
        findUnique: async () => null,
        create: async (args: any) => {
          createdUsers.push(args.data);
          return { id: `user-${createdUsers.length}`, ...args.data };
        },
      },
    };

    const result = await ensureInitialSystemSeed(mockDb, testConfig);

    assert.strictEqual(result.adminCreated, true);
    assert.strictEqual(result.aiManagerCreated, true);
    assert.ok(upsertedClient);
    assert.strictEqual(createdUsers.length, 2);
    
    const adminUser = createdUsers.find((u) => u.username === 'admin');
    assert.ok(adminUser);
    assert.strictEqual(adminUser.role, Role.ADMIN);
    assert.strictEqual(adminUser.isActive, true);
    assert.ok(adminUser.passwordHash.includes(':'));

    const aiUser = createdUsers.find((u) => u.username === 'ai_manager');
    assert.ok(aiUser);
    assert.strictEqual(aiUser.role, Role.MANAGER);
    assert.strictEqual(aiUser.isActive, true);
    assert.ok(aiUser.passwordHash.includes(':'));
  });

  it('no debe duplicar el usuario ADMIN si ya existe en la base de datos (idempotencia)', async () => {
    let createCalled = false;

    const mockDb: SeedPrismaClient = {
      apiClient: {
        upsert: async () => ({ id: 'client-1' }),
      },
      user: {
        findUnique: async () => ({ id: 'existing-admin-id', username: 'admin', role: Role.ADMIN }),
        create: async () => {
          createCalled = true;
          return {};
        },
      },
    };

    const result = await ensureInitialSystemSeed(mockDb, testConfig);

    assert.strictEqual(result.adminCreated, false);
    assert.strictEqual(createCalled, false);
  });

  it('debe propagar el error si la conexión a la base de datos falla durante el bootstrap', async () => {
    const failingDb: SeedPrismaClient = {
      apiClient: {
        upsert: async () => {
          throw new Error('DB connection error');
        },
      },
      user: {
        findUnique: async () => null,
        create: async () => ({}),
      },
    };

    await assert.rejects(
      async () => {
        await ensureInitialSystemSeed(failingDb, testConfig);
      },
      /DB connection error/
    );
  });
});

