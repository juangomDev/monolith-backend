import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Role } from '@prisma/client';
import { statsService } from '../../../src/modules/stats/stats.service.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { env } from '../../../src/config/env.js';

describe('Módulo Estadísticas y Monitor de Almacenamiento (/api/v1/stats/storage)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const originalFindUnique = prisma.apiClient.findUnique;
  const originalImgAggregate = (prisma.imageRegistry as any).aggregate;
  const originalTblAggregate = (prisma.tableRegistry as any).aggregate;
  const originalPdfAggregate = (prisma.pdfRegistry as any).aggregate;
  const originalFolderFindMany = prisma.folder.findMany;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
    (prisma.imageRegistry as any).aggregate = originalImgAggregate;
    (prisma.tableRegistry as any).aggregate = originalTblAggregate;
    (prisma.pdfRegistry as any).aggregate = originalPdfAggregate;
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

      (prisma.pdfRegistry as any).aggregate = async () => ({
        _count: { id: 0 },
        _sum: { sizeBytes: 0 },
      });

      (prisma.folder as any).findMany = async () => [
        {
          id: 'folder-1',
          name: 'Ventas 2026',
          type: 'TABLE',
          images: [],
          tables: [{ sizeBytes: 5120 }],
          pdfs: [],
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

      (prisma.pdfRegistry as any).aggregate = async () => ({
        _count: { id: 0 },
        _sum: { sizeBytes: 0 },
      });

      (prisma.folder as any).findMany = async () => [];

      const result = await statsService.getStorageStats({ id: 'manager-1', role: Role.MANAGER });

      assert.strictEqual(result.isAdmin, false);
      assert.strictEqual(result.database.totalCount, 3);
      assert.strictEqual(result.disk, null);
    });

    it('ADMIN: incluye PDFs en database.pdfs, disk.pdfsBytes/pdfsFilesCount, totales y topFolders', async () => {
      const pdfsDir = path.join(path.resolve(env.STORAGE_DIR), 'pdfs');
      const tempPdfFile = path.join(pdfsDir, '__test_stats_pdf_check__.pdf');
      const tempPayload = Buffer.alloc(256, 0x25);

      await fs.mkdir(pdfsDir, { recursive: true });
      await fs.writeFile(tempPdfFile, tempPayload);

      try {
        (prisma.imageRegistry as any).aggregate = async () => ({
          _count: { id: 10 },
          _sum: { sizeBytes: 10240 },
        });

        (prisma.tableRegistry as any).aggregate = async () => ({
          _count: { id: 5 },
          _sum: { sizeBytes: 5120 },
        });

        let capturedPdfArgs: any;
        (prisma.pdfRegistry as any).aggregate = async (args: any) => {
          capturedPdfArgs = args;
          return {
            _count: { id: 4 },
            _sum: { sizeBytes: 8192 },
          };
        };

        let capturedFolderArgs: any;
        (prisma.folder as any).findMany = async (args: any) => {
          capturedFolderArgs = args;
          return [
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: 'Galería',
              type: 'IMAGE',
              images: [{ sizeBytes: 2048 }],
              tables: [],
              pdfs: [],
            },
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Ventas 2026',
              type: 'TABLE',
              images: [],
              tables: [{ sizeBytes: 5120 }],
              pdfs: [],
            },
            {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Contratos PDF',
              type: 'PDF',
              images: [],
              tables: [],
              pdfs: [{ sizeBytes: 4096 }, { sizeBytes: 4096 }],
            },
          ];
        };

        const result = await statsService.getStorageStats({ id: 'admin-1', role: Role.ADMIN });

        assert.deepStrictEqual(capturedPdfArgs.where, {});
        assert.deepStrictEqual(capturedFolderArgs.include.pdfs, { select: { sizeBytes: true } });

        assert.deepStrictEqual(result.database.pdfs, { count: 4, sizeBytes: 8192 });
        assert.strictEqual(result.database.totalCount, 19);
        assert.strictEqual(result.database.totalSizeBytes, 23552);

        assert.ok(result.disk !== null);
        assert.ok(result.disk.pdfsBytes >= 256);
        assert.ok(result.disk.pdfsFilesCount >= 1);
        assert.strictEqual(
          result.disk.totalBytes,
          result.disk.imagesBytes + result.disk.tablesBytes + result.disk.pdfsBytes
        );
        assert.strictEqual(
          result.disk.totalFilesCount,
          result.disk.imagesFilesCount + result.disk.tablesFilesCount + result.disk.pdfsFilesCount
        );

        assert.strictEqual(result.topFolders.length, 3);
        assert.strictEqual(result.topFolders[0].name, 'Contratos PDF');
        assert.strictEqual(result.topFolders[0].type, 'PDF');
        assert.strictEqual(result.topFolders[0].totalBytes, 8192);
        assert.strictEqual(result.topFolders[0].itemsCount, 2);
        assert.strictEqual(result.topFolders[1].name, 'Ventas 2026');
        assert.strictEqual(result.topFolders[2].name, 'Galería');
      } finally {
        await fs.unlink(tempPdfFile).catch(() => {});
      }
    });

    it('MANAGER: filtra PDFs por propietario, incluye carpetas PDF en topFolders y mantiene disk null', async () => {
      (prisma.imageRegistry as any).aggregate = async () => ({
        _count: { id: 1 },
        _sum: { sizeBytes: 1000 },
      });

      (prisma.tableRegistry as any).aggregate = async () => ({
        _count: { id: 1 },
        _sum: { sizeBytes: 2000 },
      });

      let capturedPdfWhere: any;
      (prisma.pdfRegistry as any).aggregate = async (args: any) => {
        capturedPdfWhere = args.where;
        return {
          _count: { id: 2 },
          _sum: { sizeBytes: 4096 },
        };
      };

      let capturedFolderWhere: any;
      (prisma.folder as any).findMany = async (args: any) => {
        capturedFolderWhere = args.where;
        return [
          {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Manuales del Manager',
            type: 'PDF',
            images: [],
            tables: [],
            pdfs: [{ sizeBytes: 2048 }, { sizeBytes: 2048 }],
          },
        ];
      };

      const result = await statsService.getStorageStats({ id: 'manager-1', role: Role.MANAGER });

      assert.deepStrictEqual(capturedPdfWhere, { folder: { userId: 'manager-1' } });
      assert.deepStrictEqual(capturedFolderWhere, { userId: 'manager-1' });
      assert.strictEqual(result.isAdmin, false);
      assert.deepStrictEqual(result.database.pdfs, { count: 2, sizeBytes: 4096 });
      assert.strictEqual(result.database.totalCount, 4);
      assert.strictEqual(result.database.totalSizeBytes, 7096);
      assert.strictEqual(result.disk, null);
      assert.strictEqual(result.topFolders.length, 1);
      assert.strictEqual(result.topFolders[0].type, 'PDF');
      assert.strictEqual(result.topFolders[0].itemsCount, 2);
      assert.strictEqual(result.topFolders[0].totalBytes, 4096);
    });

    it('normaliza _sum.sizeBytes null a 0 cuando no existen registros', async () => {
      (prisma.imageRegistry as any).aggregate = async () => ({
        _count: { id: 0 },
        _sum: { sizeBytes: null },
      });
      (prisma.tableRegistry as any).aggregate = async () => ({
        _count: { id: 0 },
        _sum: { sizeBytes: null },
      });
      (prisma.pdfRegistry as any).aggregate = async () => ({
        _count: { id: 0 },
        _sum: { sizeBytes: null },
      });
      (prisma.folder as any).findMany = async () => [];

      const result = await statsService.getStorageStats({ id: 'manager-empty', role: Role.MANAGER });

      assert.deepStrictEqual(result.database.pdfs, { count: 0, sizeBytes: 0 });
      assert.strictEqual(result.database.totalCount, 0);
      assert.strictEqual(result.database.totalSizeBytes, 0);
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
          pdfs: { count: 0, sizeBytes: 0 },
          totalCount: 2,
          totalSizeBytes: 300,
        },
        disk: {
          imagesBytes: 100,
          imagesFilesCount: 1,
          tablesBytes: 200,
          tablesFilesCount: 1,
          pdfsBytes: 0,
          pdfsFilesCount: 0,
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

    it('GET /api/v1/stats/storage: serializa database.pdfs, disk.pdfsBytes, disk.pdfsFilesCount y topFolders con carpeta PDF', async () => {
      mockValidAuthClient();

      (prisma.imageRegistry as any).aggregate = async () => ({
        _count: { id: 1 },
        _sum: { sizeBytes: 500 },
      });
      (prisma.tableRegistry as any).aggregate = async () => ({
        _count: { id: 1 },
        _sum: { sizeBytes: 1500 },
      });
      (prisma.pdfRegistry as any).aggregate = async () => ({
        _count: { id: 3 },
        _sum: { sizeBytes: 9000 },
      });
      (prisma.folder as any).findMany = async () => [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Documentos Oficiales',
          type: 'PDF',
          images: [],
          tables: [],
          pdfs: [{ sizeBytes: 3000 }, { sizeBytes: 3000 }, { sizeBytes: 3000 }],
        },
      ];

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/storage',
        headers: { 'x-api-key': validKey },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.deepStrictEqual(body.database.pdfs, { count: 3, sizeBytes: 9000 });
      assert.strictEqual(body.database.totalCount, 5);
      assert.strictEqual(body.database.totalSizeBytes, 11000);
      assert.ok(body.disk !== null);
      assert.strictEqual(typeof body.disk.pdfsBytes, 'number');
      assert.strictEqual(typeof body.disk.pdfsFilesCount, 'number');
      assert.strictEqual(
        body.disk.totalBytes,
        body.disk.imagesBytes + body.disk.tablesBytes + body.disk.pdfsBytes
      );
      assert.strictEqual(
        body.disk.totalFilesCount,
        body.disk.imagesFilesCount + body.disk.tablesFilesCount + body.disk.pdfsFilesCount
      );
      assert.strictEqual(body.topFolders.length, 1);
      assert.strictEqual(body.topFolders[0].type, 'PDF');
      assert.strictEqual(body.topFolders[0].itemsCount, 3);
      assert.strictEqual(body.topFolders[0].totalBytes, 9000);
    });
  });
});
