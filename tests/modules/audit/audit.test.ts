import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { auditService } from '../../../src/modules/audit/audit.service.js';
import { auditRepository } from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/config/db.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';

describe('Módulo Auditoría (AuditLog)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
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

  describe('auditService.recordLog', () => {
    it('ejecuta en modo fire-and-forget sin arrojar excepción si el repositorio falla', async () => {
      mock.method(auditRepository, 'create', async () => {
        throw new Error('Database connection failed');
      });

      // No debe lanzar ninguna excepción
      assert.doesNotThrow(() => {
        auditService.recordLog({
          actorId: 'user-1',
          actorUsername: 'admin',
          action: 'TEST_ACTION',
          resourceType: 'TEST',
        });
      });
    });
  });

  describe('auditService.listLogs', () => {
    it('rechaza con 403 FORBIDDEN si el invocador es COLLABORATOR', async () => {
      await assert.rejects(
        async () => {
          await auditService.listLogs(
            { id: 'collab-1', role: Role.COLLABORATOR },
            { page: 1, limit: 50 }
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

    it('permite a un ADMIN listar todos los registros con paginación', async () => {
      let capturedOptions: any = null;
      mock.method(auditRepository, 'findMany', async (opts: any) => {
        capturedOptions = opts;
        return [
          {
            id: 'log-1',
            actorId: 'admin-id',
            actorUsername: 'admin',
            action: 'USER_CREATE',
            resourceType: 'USER',
            resourceId: 'new-user-id',
            folderId: null,
            metadata: null,
            ipAddress: null,
            createdAt: new Date(),
          },
        ];
      });

      mock.method(auditRepository, 'count', async () => 1);

      const result = await auditService.listLogs(
        { id: 'admin-id', role: Role.ADMIN },
        { page: 1, limit: 10 }
      );

      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.logs.length, 1);
      assert.strictEqual(capturedOptions?.managerScope, undefined);
    });
  });

  describe('Rutas HTTP Fastify (Audit)', () => {
    it('GET /api/v1/audit-logs: retorna 401 si no hay autenticación', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('GET /api/v1/audit-logs: retorna 200 para peticiones autenticadas', async () => {
      mockValidAuthClient();
      mock.method(auditService, 'listLogs', async () => ({
        logs: [
          {
            id: '11111111-2222-3333-4444-555555555555',
            actorId: null,
            actorUsername: 'admin',
            action: 'TABLE_UPLOAD',
            resourceType: 'TABLE',
            resourceId: 'tab-123',
            folderId: null,
            metadata: null,
            ipAddress: '127.0.0.1',
            createdAt: new Date().toISOString(),
          },
        ] as any,
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false },
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs?page=1&limit=50',
        headers: { 'x-api-key': validKey },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.total, 1);
      assert.strictEqual(body.logs.length, 1);
      assert.strictEqual(body.logs[0].action, 'TABLE_UPLOAD');
    });
  });
});

