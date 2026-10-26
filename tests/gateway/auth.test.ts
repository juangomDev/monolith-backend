import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hashApiKey, authenticateApiKey } from '../../src/gateway/auth.js';
import { prisma } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import { AppError } from '../../src/shared/errors.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Gateway: Autenticación con API Key', () => {
  const testPepper = env.API_KEY_PEPPER;
  const testKey = 'mk_live_sample_key_for_testing_12345';

  it('hashApiKey: debe generar hash HMAC-SHA256 determinista', () => {
    const hash1 = hashApiKey(testKey, testPepper);
    const hash2 = hashApiKey(testKey, testPepper);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64); // SHA-256 en hex tiene 64 caracteres
  });

  it('hashApiKey: claves distintas deben producir hashes distintos', () => {
    const hashA = hashApiKey('key_alpha_1234567890', testPepper);
    const hashB = hashApiKey('key_beta_1234567890', testPepper);

    assert.notStrictEqual(hashA, hashB);
  });

  it('authenticateApiKey: debe lanzar 401 si no se envía la cabecera X-API-Key', async () => {
    const fakeRequest = {
      headers: {},
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    await assert.rejects(
      async () => {
        await authenticateApiKey(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 401);
        assert.strictEqual((err as AppError).code, 'UNAUTHORIZED');
        assert.strictEqual((err as AppError).message, 'Cabecera X-API-Key requerida');
        return true;
      }
    );
  });

  const originalFindUnique = prisma.apiClient.findUnique;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
  });

  it('authenticateApiKey: debe lanzar 401 si la API Key no existe en la base de datos', async () => {
    (prisma.apiClient as any).findUnique = async () => null;

    const fakeRequest = {
      headers: { 'x-api-key': 'non_existent_key_12345' },
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    await assert.rejects(
      async () => {
        await authenticateApiKey(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 401);
        assert.strictEqual((err as AppError).code, 'UNAUTHORIZED');
        assert.strictEqual((err as AppError).message, 'API Key inválida o inactiva');
        return true;
      }
    );
  });

  it('authenticateApiKey: debe lanzar 401 si el cliente está inactivo (isActive = false)', async () => {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'mock-client-id',
      name: 'Cliente Inactivo',
      keyPrefix: 'mk_live_inactive',
      keyHash: 'fake_hash',
      rateLimit: 100,
      isActive: false,
      createdAt: new Date(),
    });

    const fakeRequest = {
      headers: { 'x-api-key': 'mk_live_inactive_key_12345' },
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    await assert.rejects(
      async () => {
        await authenticateApiKey(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 401);
        assert.strictEqual((err as AppError).code, 'UNAUTHORIZED');
        assert.strictEqual((err as AppError).message, 'API Key inválida o inactiva');
        return true;
      }
    );
  });

  it('authenticateApiKey: debe validar con éxito y asignar apiClient a la petición', async () => {
    const mockClient = {
      id: 'mock-client-id-123',
      name: 'Cliente Activo Test',
      keyPrefix: testKey.slice(0, 16),
      keyHash: hashApiKey(testKey, testPepper),
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    };

    (prisma.apiClient as any).findUnique = async () => mockClient;

    const fakeRequest = {
      headers: { 'x-api-key': testKey },
    } as unknown as FastifyRequest & { apiClient?: typeof mockClient };
    const fakeReply = {} as FastifyReply;

    await authenticateApiKey(fakeRequest, fakeReply);

    assert.strictEqual(fakeRequest.apiClient?.id, mockClient.id);
    assert.strictEqual(fakeRequest.apiClient?.name, mockClient.name);
  });
});
