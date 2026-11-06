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
    let createdUser: any = null;
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
          createdUser = args.data;
          return { id: 'admin-1', ...args.data };
        },
      },
    };

    const result = await ensureInitialSystemSeed(mockDb, testConfig);

    assert.strictEqual(result.adminCreated, true);
    assert.ok(upsertedClient);
    assert.ok(createdUser);
    assert.strictEqual(createdUser.username, 'admin');
    assert.strictEqual(createdUser.role, Role.ADMIN);
    assert.strictEqual(createdUser.isActive, true);
    assert.ok(createdUser.passwordHash.includes(':'));
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

