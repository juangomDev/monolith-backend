import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { statsService } from '../../../src/modules/stats/stats.service.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo Estadísticas y Monitor de Almacenamiento (/api/v1/stats/storage)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const originalFindUnique = prisma.apiClient.findUnique;
  const originalImgAggregate = (prisma.imageRegistry as any).aggregate;
  const originalTblAggregate = (prisma.tableRegistry as any).aggregate;
  const originalFolderFindMany = prisma.folder.findMany;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
    (prisma.imageRegistry as any).aggregate = originalImgAggregate;
    (prisma.tableRegistry as any).aggregate = originalTblAggregate;
    (prisma.folder as any).findMany = originalFolderFindMany;
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

  describe('statsService.getStorageStats', () => {
    it('rechaza con 403 FORBIDDEN si el invocador es COLLABORATOR', async () => {
      await assert.rejects(
        async () => {
          await statsService.getStorageStats({ id: 'collab-1', role: Role.COLLABORATOR });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('retorna estadísticas globales y salud de disco para ADMIN', async () => {
      (prisma.imageRegistry as any).aggregate = async () => ({
        _count: { id: 10 },
        _sum: { sizeBytes: 10240 },
      });

      (prisma.tableRegistry as any).aggregate = async () => ({
        _count: { id: 5 },
        _sum: { sizeBytes: 5120 },
      });

      (prisma.folder as any).findMany = async () => [
        {
          id: 'folder-1',
          name: 'Ventas 2026',
          type: 'TABLE',
          images: [],
          tables: [{ sizeBytes: 5120 }],
        },
      ];

      const result = await statsService.getStorageStats({ id: 'admin-1', role: Role.ADMIN });

      assert.strictEqual(result.isAdmin, true);
      assert.strictEqual(result.database.totalCount, 15);
      assert.strictEqual(result.database.totalSizeBytes, 15360);
      assert.ok(result.disk !== null);
      assert.strictEqual(result.topFolders.length, 1);
      assert.strictEqual(result.topFolders[0].name, 'Ventas 2026');
    });

    it('retorna estadísticas restringidas para MANAGER con disk null', async () => {
      (prisma.imageRegistry as any).aggregate = async () => ({
        _count: { id: 2 },
        _sum: { sizeBytes: 2048 },
      });

      (prisma.tableRegistry as any).aggregate = async () => ({
        _count: { id: 1 },
        _sum: { sizeBytes: 1024 },
      });

      (prisma.folder as any).findMany = async () => [];

      const result = await statsService.getStorageStats({ id: 'manager-1', role: Role.MANAGER });

      assert.strictEqual(result.isAdmin, false);
      assert.strictEqual(result.database.totalCount, 3);
      assert.strictEqual(result.disk, null);
    });
  });

  describe('Rutas HTTP Fastify (Stats)', () => {
    it('GET /api/v1/stats/storage: retorna 401 si no hay autenticación', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/storage',
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('GET /api/v1/stats/storage: retorna 200 para ADMIN autenticado', async () => {
      mockValidAuthClient();
      mock.method(statsService, 'getStorageStats', async () => ({
        isAdmin: true,
        database: {
          images: { count: 1, sizeBytes: 100 },
          tables: { count: 1, sizeBytes: 200 },
          totalCount: 2,
          totalSizeBytes: 300,
        },
        disk: {
          imagesBytes: 100,
          imagesFilesCount: 1,
          tablesBytes: 200,
          tablesFilesCount: 1,
          totalBytes: 300,
          totalFilesCount: 2,
        },
        topFolders: [],
        warning: false,
        warningMessage: null,
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/storage',
        headers: { 'x-api-key': validKey },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.isAdmin, true);
      assert.strictEqual(body.database.totalCount, 2);
    });
  });
});
