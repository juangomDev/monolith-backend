import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role, FolderType, FolderPermission } from '@prisma/client';
import { imagesBulkService } from '../../../src/modules/images/images.bulk.service.js';
import { tablesBulkService } from '../../../src/modules/tables/tables.bulk.service.js';
import { imagesRepository } from '../../../src/modules/images/images.repository.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { foldersRepository } from '../../../src/modules/folders/folders.repository.js';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';

describe('Shared / Core: Operaciones en Lote (Bulk Delete y Bulk Move)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const imgId1 = '11111111-1111-4111-8111-111111111111';
  const imgId2 = '22222222-2222-4222-8222-222222222222';
  const tabId1 = '33333333-3333-4333-8333-333333333333';
  const tabId2 = '44444444-4444-4444-8444-444444444444';
  const targetImageFolderId = '55555555-5555-4555-8555-555555555555';
  const targetTableFolderId = '66666666-6666-4666-8666-666666666666';

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

  describe('imagesBulkService', () => {
    it('bulkDelete: elimina múltiples imágenes y reporta éxitos y fallos resilientes', async () => {
      mock.method(imagesRepository, 'findById', async (id: string) => {
        if (id === imgId1) {
          return {
            id: imgId1,
            shortCode: 'img1Code',
            storagePath: './storage/images/img1.jpg',
            folderId: null,
            folder: null,
          };
        }
        return null;
      });

      mock.method(imagesRepository, 'deleteById', async () => ({ id: imgId1 }));

      const result = await imagesBulkService.bulkDelete([imgId1, 'no-existe-id'], {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      assert.strictEqual(result.totalRequested, 2);
      assert.deepStrictEqual(result.successful, [imgId1]);
      assert.strictEqual(result.failed.length, 1);
      assert.strictEqual(result.failed[0].id, 'no-existe-id');
    });

    it('bulkMove: rechaza 400 si la carpeta destino no es de tipo IMAGE', async () => {
      mock.method(foldersRepository, 'findFolderById', async () => ({
        id: targetImageFolderId,
        type: FolderType.TABLE, // Tipo equivocado
        userId: 'admin-1',
      } as any));

      await assert.rejects(
        async () => {
          await imagesBulkService.bulkMove([imgId1], targetImageFolderId, {
            id: 'admin-1',
            role: Role.ADMIN,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'INVALID_FOLDER_TYPE');
          return true;
        }
      );
    });

    it('bulkMove: mueve imágenes exitosamente si la carpeta destino es válida', async () => {
      mock.method(foldersRepository, 'findFolderById', async () => ({
        id: targetImageFolderId,
        type: FolderType.IMAGE,
        userId: 'admin-1',
      } as any));

      mock.method(imagesRepository, 'findById', async (id: string) => ({
        id,
        folderId: 'old-folder',
        folder: { userId: 'admin-1' },
      }));

      let updatedWithFolder: any = null;
      mock.method(imagesRepository, 'update', async (_id: string, data: any) => {
        updatedWithFolder = data;
        return { id: _id };
      });

      const result = await imagesBulkService.bulkMove([imgId1], targetImageFolderId, {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      assert.strictEqual(result.totalRequested, 1);
      assert.deepStrictEqual(result.successful, [imgId1]);
      assert.deepStrictEqual(updatedWithFolder, { folder: { connect: { id: targetImageFolderId } } });
    });
  });

  describe('tablesBulkService', () => {
    it('bulkDelete: elimina múltiples tablas y reporta balance', async () => {
      mock.method(tablesRepository, 'findById', async (id: string) => {
        if (id === tabId1) {
          return {
            id: tabId1,
            shortCode: 'tab1Code',
            storagePath: './storage/tables/tab1.csv',
            folderId: null,
            folder: null,
          };
        }
        return null;
      });

      mock.method(tablesRepository, 'deleteById', async () => ({ id: tabId1 }));

      const result = await tablesBulkService.bulkDelete([tabId1, tabId2], {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      assert.strictEqual(result.totalRequested, 2);
      assert.deepStrictEqual(result.successful, [tabId1]);
      assert.strictEqual(result.failed.length, 1);
      assert.strictEqual(result.failed[0].id, tabId2);
    });

    it('bulkMove: rechaza 400 si la carpeta destino no es de tipo TABLE', async () => {
      mock.method(foldersRepository, 'findFolderById', async () => ({
        id: targetTableFolderId,
        type: FolderType.IMAGE, // Tipo inválido
        userId: 'admin-1',
      } as any));

      await assert.rejects(
        async () => {
          await tablesBulkService.bulkMove([tabId1], targetTableFolderId, {
            id: 'admin-1',
            role: Role.ADMIN,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'INVALID_FOLDER_TYPE');
          return true;
        }
      );
    });

    it('bulkMove: mueve tablas exitosamente', async () => {
      mock.method(foldersRepository, 'findFolderById', async () => ({
        id: targetTableFolderId,
        type: FolderType.TABLE,
        userId: 'admin-1',
      } as any));

      mock.method(tablesRepository, 'findById', async (id: string) => ({
        id,
        folderId: 'old-folder',
        folder: { userId: 'admin-1' },
      }));

      mock.method(tablesRepository, 'update', async () => ({ id: tabId1 }));

      const result = await tablesBulkService.bulkMove([tabId1], targetTableFolderId, {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      assert.strictEqual(result.totalRequested, 1);
      assert.deepStrictEqual(result.successful, [tabId1]);
    });
  });

  describe('Rutas HTTP Bulk Fastify', () => {
    it('POST /api/v1/images/bulk-delete: responde 200 con reporte', async () => {
      mockValidAuthClient();
      mock.method(imagesBulkService, 'bulkDelete', async () => ({
        totalRequested: 2,
        successful: [imgId1, imgId2],
        failed: [],
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/images/bulk-delete',
        headers: { 'x-api-key': validKey },
        payload: { ids: [imgId1, imgId2] },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.totalRequested, 2);
      assert.deepStrictEqual(body.successful, [imgId1, imgId2]);
    });

    it('POST /api/v1/tables/bulk-delete: responde 200 con reporte', async () => {
      mockValidAuthClient();
      mock.method(tablesBulkService, 'bulkDelete', async () => ({
        totalRequested: 1,
        successful: [tabId1],
        failed: [],
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tables/bulk-delete',
        headers: { 'x-api-key': validKey },
        payload: { ids: [tabId1] },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.totalRequested, 1);
      assert.deepStrictEqual(body.successful, [tabId1]);
    });

    it('POST /api/v1/images/bulk-move: responde 200 con reporte', async () => {
      mockValidAuthClient();
      mock.method(imagesBulkService, 'bulkMove', async () => ({
        totalRequested: 1,
        successful: [imgId1],
        failed: [],
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/images/bulk-move',
        headers: { 'x-api-key': validKey },
        payload: { ids: [imgId1], targetFolderId: targetImageFolderId },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.deepStrictEqual(body.successful, [imgId1]);
    });

    it('POST /api/v1/tables/bulk-move: responde 200 con reporte', async () => {
      mockValidAuthClient();
      mock.method(tablesBulkService, 'bulkMove', async () => ({
        totalRequested: 1,
        successful: [tabId1],
        failed: [],
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tables/bulk-move',
        headers: { 'x-api-key': validKey },
        payload: { ids: [tabId1], targetFolderId: targetTableFolderId },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.deepStrictEqual(body.successful, [tabId1]);
    });
  });
});

