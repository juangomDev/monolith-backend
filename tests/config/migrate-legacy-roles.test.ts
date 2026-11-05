import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyUserRoles, type RawSqlClient } from '../../src/scripts/migrate-legacy-roles.js';

describe('Scripts: Migración Pre-Push de Roles Legacy (migrate-legacy-roles.ts)', () => {
  it('debe ejecutar las sentencias SQL de migración USER -> MANAGER y desconectar el cliente en flujo exitoso', async () => {
    const executedQueries: string[] = [];
    let disconnected = false;

    const mockClient: RawSqlClient = {
      $executeRawUnsafe: async (query: string) => {
        executedQueries.push(query);
        return 1;
      },
      $disconnect: async () => {
        disconnected = true;
      },
    };

    await migrateLegacyUserRoles(mockClient);

    assert.strictEqual(executedQueries.length, 4);
    assert.ok(executedQueries[0].includes("ADD VALUE IF NOT EXISTS 'MANAGER'"));
    assert.ok(executedQueries[1].includes("ADD VALUE IF NOT EXISTS 'COLLABORATOR'"));
    assert.ok(executedQueries[2].includes("SET DEFAULT 'MANAGER'"));
    assert.ok(executedQueries[3].includes("SET \"role\" = 'MANAGER'::\"Role\" WHERE \"role\"::text = 'USER'"));
    assert.strictEqual(disconnected, true);
  });

  it('debe capturar errores silenciosamente si la base de datos está limpia (tabla o enum inexistente) y desconectar', async () => {
    let disconnected = false;

    const failingClient: RawSqlClient = {
      $executeRawUnsafe: async () => {
        throw new Error('type "Role" does not exist');
      },
      $disconnect: async () => {
        disconnected = true;
      },
    };

    await assert.doesNotReject(async () => {
      await migrateLegacyUserRoles(failingClient);
    });
    assert.strictEqual(disconnected, true);
  });
});

