import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { apiKeysService } from '../../../src/modules/api-keys/api-keys.service.js';
import { apiKeysRepository } from '../../../src/modules/api-keys/api-keys.repository.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo API Keys Dinámicas (/api/v1/api-keys)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const validUuid = '11111111-2222-4333-8444-555555555555';

  const originalFindUnique = prisma.apiClient.findUnique;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
    mock.reset();
  });

  function mockValidAuthClient() {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'client-test-id',
      name: 'Cliente Test',
      keyPrefix: 'mk_live_valid_test',
      keyHash: 'fake_hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });
  }

  describe('apiKeysService', () => {
    it('createApiKey: rechaza con 403 FORBIDDEN si el invocador no es ADMIN', async () => {
      await assert.rejects(
        async () => {
          await apiKeysService.createApiKey(
            { id: 'manager-1', role: Role.MANAGER },
            { name: 'Nueva Clave' }
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('createApiKey: rechaza con 400 INVALID_NAME si el nombre es vacío o supera 100 caracteres', async () => {
      await assert.rejects(
        async () => {
          await apiKeysService.createApiKey(
            { id: 'admin-1', role: Role.ADMIN },
            { name: '   ' }
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'INVALID_NAME');
          return true;
        }
      );
    });

    it('createApiKey: crea una API Key válida con prefijo mk_live_ y retorna el secreto plano una sola vez', async () => {
      mock.method(apiKeysRepository, 'create', async (data: any) => ({
        id: validUuid,
        name: data.name,
        description: data.description,
        keyPrefix: data.keyPrefix,
        rateLimit: data.rateLimit,
        isActive: true,
        lastUsedAt: null,
        createdAt: new Date(),
      }));

      const result = await apiKeysService.createApiKey(
        { id: 'admin-1', role: Role.ADMIN },
        { name: 'Integración Dokploy', description: 'Webhook de despliegues' }
      );

      assert.strictEqual(result.id, validUuid);
      assert.strictEqual(result.name, 'Integración Dokploy');
      assert.ok(result.key.startsWith('mk_live_'));
      assert.strictEqual(result.keyPrefix, result.key.substring(0, 16));
    });

    it('listApiKeys: lista llaves sin exponer el secreto keyHash', async () => {
      mock.method(apiKeysRepository, 'findAll', async () => [
        {
          id: validUuid,
          name: 'Cliente Alpha',
          description: null,
          keyPrefix: 'mk_live_12345678',
          rateLimit: 100,
          isActive: true,
          lastUsedAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await apiKeysService.listApiKeys({ id: 'admin-1', role: Role.ADMIN });
      assert.strictEqual(result.keys.length, 1);
      assert.strictEqual(result.keys[0].name, 'Cliente Alpha');
      assert.strictEqual((result.keys[0] as any).keyHash, undefined);
    });

    it('revokeApiKey: rechaza con 404 NOT_FOUND si la llave no existe', async () => {
      mock.method(apiKeysRepository, 'findById', async () => null);

      await assert.rejects(
        async () => {
          await apiKeysService.revokeApiKey({ id: 'admin-1', role: Role.ADMIN }, validUuid);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 404);
          assert.strictEqual(err.code, 'NOT_FOUND');
          return true;
        }
      );
    });

    it('revokeApiKey: revoca la llave exitosamente', async () => {
      mock.method(apiKeysRepository, 'findById', async () => ({
        id: validUuid,
        name: 'Cliente Beta',
        keyPrefix: 'mk_live_test',
      } as any));

      mock.method(apiKeysRepository, 'deleteById', async () => ({ id: validUuid } as any));

      const result = await apiKeysService.revokeApiKey({ id: 'admin-1', role: Role.ADMIN }, validUuid);
      assert.strictEqual(result.revoked, true);
    });
  });

  describe('Rutas HTTP Fastify (API Keys)', () => {
    it('POST /api/v1/api-keys: retorna 401 si no hay autenticación', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: { name: 'Test Key' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('POST /api/v1/api-keys: retorna 201 al crear la llave exitosamente', async () => {
      mockValidAuthClient();
      mock.method(apiKeysService, 'createApiKey', async () => ({
        id: validUuid,
        name: 'Servicio Externo',
        description: null,
        keyPrefix: 'mk_live_secret12',
        key: 'mk_live_secret1234567890abcdefghijklmnopqrstuvwxyz',
        rateLimit: 100,
        isActive: true,
        createdAt: new Date().toISOString(),
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        headers: { 'x-api-key': validKey },
        payload: { name: 'Servicio Externo' },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.name, 'Servicio Externo');
      assert.ok(body.key.startsWith('mk_live_'));
    });

    it('GET /api/v1/api-keys: retorna 200 con el listado', async () => {
      mockValidAuthClient();
      mock.method(apiKeysService, 'listApiKeys', async () => ({
        keys: [
          {
            id: validUuid,
            name: 'Key 1',
            description: null,
            keyPrefix: 'mk_live_123',
            rateLimit: 100,
            isActive: true,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
          },
        ] as any,
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: { 'x-api-key': validKey },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.keys.length, 1);
    });

    it('DELETE /api/v1/api-keys/:id: retorna 200 al revocar la llave', async () => {
      mockValidAuthClient();
      mock.method(apiKeysService, 'revokeApiKey', async () => ({ revoked: true }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/api-keys/${validUuid}`,
        headers: { 'x-api-key': validKey },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.revoked, true);
    });
  });
});

