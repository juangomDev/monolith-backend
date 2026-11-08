import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role, FolderPermission } from '@prisma/client';
import { tablesMutationService } from '../../../src/modules/tables/tables.mutation.service.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { AppError } from '../../../src/shared/errors.js';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo Tablas: Mutación (Renombrado y Hot-Swap)', () => {
  const validUuid = '11111111-2222-4333-8444-555555555555';
  const folderUuid = '22222222-3333-4444-8555-666666666666';
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

  describe('tablesMutationService.renameTable', () => {
    it('rechaza con 400 INVALID_ID si el ID no es UUID', async () => {
      await assert.rejects(
        async () => {
          await tablesMutationService.renameTable('id-invalido', 'nuevo_nombre.csv');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'INVALID_ID');
          return true;
        }
      );
    });

    it('rechaza con 400 INVALID_NAME si el nombre es vacío o supera 255 caracteres', async () => {
      await assert.rejects(
        async () => {
          await tablesMutationService.renameTable(validUuid, '   ');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'INVALID_NAME');
          return true;
        }
      );
    });

    it('rechaza con 404 NOT_FOUND si la tabla no existe', async () => {
      mock.method(tablesRepository, 'findById', async () => null);

      await assert.rejects(
        async () => {
          await tablesMutationService.renameTable(validUuid, 'datos_2026.csv');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 404);
          assert.strictEqual(err.code, 'NOT_FOUND');
          return true;
        }
      );
    });

    it('rechaza con 403 FORBIDDEN si el colaborador carece de permiso EDIT en la carpeta', async () => {
      mock.method(tablesRepository, 'findById', async () => ({
        id: validUuid,
        shortCode: 'shortCode1',
        tableName: 'original.csv',
        folderId: folderUuid,
        folder: { id: folderUuid, userId: 'manager-owner-id', isPrivate: true },
      }));

      mock.method(foldersSharesService, 'assertFolderAccess', async () => {
        throw new AppError(403, 'Permiso insuficiente: solo tienes acceso de lectura en esta carpeta', 'FORBIDDEN');
      });

      await assert.rejects(
        async () => {
          await tablesMutationService.renameTable(
            validUuid,
            'nuevo_nombre.csv',
            { id: 'collab-1', role: Role.COLLABORATOR }
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

    it('renombra exitosamente la tabla y retorna modelo con urlWithVersion', async () => {
      mock.method(tablesRepository, 'findById', async () => ({
        id: validUuid,
        shortCode: 'tab123Code',
        tableName: 'original.csv',
        folderId: folderUuid,
        folder: { id: folderUuid, userId: 'owner-id', isPrivate: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mock.method(tablesRepository, 'update', async (_id: string, data: any) => ({
        id: validUuid,
        shortCode: 'tab123Code',
        tableName: data.tableName,
        rowCount: 50,
        columnsSchema: ['id', 'col1'],
        sizeBytes: 1024,
        folderId: folderUuid,
        metadataCard: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-02-01'),
      }));

      const result = await tablesMutationService.renameTable(
        validUuid,
        'datos_actualizados.csv',
        { id: 'owner-id', role: Role.MANAGER }
      );

      assert.strictEqual(result.tableName, 'datos_actualizados.csv');
      assert.strictEqual(result.shortCode, 'tab123Code');
      assert.ok(result.urlWithVersion.includes('?v='));
    });
  });

  describe('Rutas HTTP Fastify (Renombrado y Hot-Swap)', () => {
    it('PATCH /api/v1/tables/:id: retorna 401 si no hay autenticación', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tables/${validUuid}`,
        payload: { tableName: 'nuevo.csv' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('PATCH /api/v1/tables/:id: retorna 200 al renombrar tabla con éxito', async () => {
      mockValidAuthClient();
      mock.method(tablesMutationService, 'renameTable', async () => ({
        id: validUuid,
        shortCode: 'tab123Code',
        url: 'http://localhost:3000/t/tab123Code',
        urlWithVersion: 'http://localhost:3000/t/tab123Code?v=12345678',
        tableName: 'renombrado.csv',
        rowCount: 10,
        columns: ['col1'],
        sizeBytes: 256,
        folderId: null,
        metadataCard: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tables/${validUuid}`,
        headers: { 'x-api-key': validKey },
        payload: { tableName: 'renombrado.csv' },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.tableName, 'renombrado.csv');
    });

    it('PUT /api/v1/tables/:id: retorna 400 si se envía petición sin multipart', async () => {
      mockValidAuthClient();
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/tables/${validUuid}`,
        headers: { 'x-api-key': validKey },
      });
      assert.strictEqual(res.statusCode, 400);
    });

    it('PUT /api/v1/tables/:id: retorna 200 al reemplazar dataset en caliente (Hot-Swap)', async () => {
      mockValidAuthClient();
      mock.method(tablesMutationService, 'replaceTableFile', async () => ({
        id: validUuid,
        shortCode: 'tab123Code',
        url: 'http://localhost:3000/t/tab123Code',
        urlWithVersion: 'http://localhost:3000/t/tab123Code?v=88888888',
        tableName: 'reemplazo.csv',
        rowCount: 200,
        columns: ['id', 'precio'],
        sizeBytes: 4096,
        folderId: null,
        metadataCard: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const boundary = '----WebKitFormBoundaryTestReplaceTable';
      const payload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="reemplazo.csv"',
        'Content-Type: text/csv',
        '',
        'id,precio\r\n1,50.0\r\n2,100.0',
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/tables/${validUuid}`,
        headers: {
          'x-api-key': validKey,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.tableName, 'reemplazo.csv');
      assert.strictEqual(body.rowCount, 200);
    });
  });
});

