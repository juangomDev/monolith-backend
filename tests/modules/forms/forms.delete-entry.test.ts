import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { Role } from '@prisma/client';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { FormsMutationService, formsMutationService } from '../../../src/modules/forms/forms.mutation.service.js';
import { FormsTableSync } from '../../../src/modules/forms/forms.table-sync.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { auditService } from '../../../src/modules/audit/audit.service.js';
import { AppError } from '../../../src/shared/errors.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

describe('Módulo Formularios: Eliminación individual de entradas (DELETE /api/v1/forms/entries/:id)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const entryUuid = '44444444-4444-4444-8444-444444444444';
  const formUuid = '33333333-3333-4333-8333-333333333333';
  const folderUuid = '22222222-2222-4222-8222-222222222222';
  const ownerUuid = '11111111-1111-4111-8111-111111111111';
  const otherUuid = '99999999-9999-4999-8999-999999999999';

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

  it('FormsMutationService.deleteEntry: rechaza 400 INVALID_ID si no es UUID', async () => {
    const svc = new FormsMutationService({} as any, {} as any, {} as any, {} as any);
    await assert.rejects(
      () => svc.deleteEntry('no-es-uuid', { id: ownerUuid, role: Role.ADMIN }),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_ID'
    );
  });

  it('FormsMutationService.deleteEntry: rechaza 404 cuando la entrada no existe', async () => {
    const fakeRepo = { findEntryById: async () => null };
    const svc = new FormsMutationService(fakeRepo as any, {} as any, {} as any, {} as any);
    await assert.rejects(
      () => svc.deleteEntry(entryUuid, { id: ownerUuid, role: Role.ADMIN }),
      (err: any) => err instanceof AppError && err.status === 404 && err.code === 'ENTRY_NOT_FOUND'
    );
  });

  it('FormsMutationService.deleteEntry: rechaza 403 si es COLLABORATOR o MANAGER no propietario', async () => {
    const fakeRepo = {
      findEntryById: async () => ({
        id: entryUuid,
        status: 'NEW',
        form: { id: formUuid, slug: 'solicitud-ruralidad', folderId: folderUuid, folder: { userId: ownerUuid } },
      }),
    };
    const svc = new FormsMutationService(fakeRepo as any, {} as any, {} as any, {} as any);

    await assert.rejects(
      () => svc.deleteEntry(entryUuid, { id: otherUuid, role: Role.COLLABORATOR }),
      (err: any) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );

    await assert.rejects(
      () => svc.deleteEntry(entryUuid, { id: otherUuid, role: Role.MANAGER }),
      (err: any) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );
  });

  it('FormsMutationService.deleteEntry: permite al MANAGER propietario borrar entrada VALID, limpia tabla abierta y registra auditoría', async () => {
    let deletedId = '';
    let syncedEntryId = '';
    const auditMock = mock.method(auditService, 'recordLog', () => {});

    const fakeRepo = {
      findEntryById: async () => ({
        id: entryUuid,
        status: 'VALID',
        form: {
          id: formUuid,
          slug: 'solicitud-ruralidad',
          folderId: folderUuid,
          linkedTableId: '55555555-5555-4555-8555-555555555555',
          folder: { userId: ownerUuid },
        },
      }),
      deleteEntry: async (id: string) => {
        deletedId = id;
        return { id };
      },
    };
    const fakeTableSync = {
      removeEntryFromTable: async (_form: any, id: string) => {
        syncedEntryId = id;
        return 2;
      },
    };

    const svc = new FormsMutationService(fakeRepo as any, {} as any, {} as any, fakeTableSync as any);
    const result = await svc.deleteEntry(entryUuid, { id: ownerUuid, role: Role.MANAGER }, '127.0.0.1');

    assert.deepStrictEqual(result, {
      deleted: true,
      id: entryUuid,
      formId: formUuid,
      removedTableRows: 2,
    });
    assert.strictEqual(deletedId, entryUuid);
    assert.strictEqual(syncedEntryId, entryUuid);
    assert.strictEqual(auditMock.mock.calls.length, 1);
    assert.strictEqual((auditMock.mock.calls[0].arguments[0] as any).action, 'FORM_ENTRY_DELETE');
  });

  it('FormsTableSync.removeEntryFromTable: remueve todas las filas de períodos del entryId en .data.json.gz y actualiza rowCount', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruralidad-del-entry-'));
    const shortCode = 'TESTDEL123';
    const csvPath = path.join(tmpDir, `form_${shortCode}.csv`);
    const gzPath = path.join(tmpDir, `${shortCode}.data.json.gz`);

    const initialPayload = {
      id: 'tbl-1',
      shortCode,
      tableName: 'Respuestas: Ruralidad',
      rowCount: 3,
      columns: ['id', 'entryId', 'itemIndex', 'cedula', 'status'],
      headers: [['id', 'entryId', 'itemIndex', 'cedula', 'status']],
      merges: [],
      data: [
        { id: `${entryUuid}_1`, entryId: entryUuid, itemIndex: 1, cedula: 'V-11111111', status: 'NEW' },
        { id: `${entryUuid}_2`, entryId: entryUuid, itemIndex: 2, cedula: 'V-11111111', status: 'NEW' },
        { id: `${otherUuid}_1`, entryId: otherUuid, itemIndex: 1, cedula: 'V-22222222', status: 'VALID' },
      ],
    };

    await fs.writeFile(gzPath, await gzipAsync(Buffer.from(JSON.stringify(initialPayload), 'utf-8')));

    let updatedRowCount = -1;
    mock.method(tablesRepository, 'findById', async () => ({
      id: 'tbl-1',
      shortCode,
      storagePath: csvPath,
    } as any));
    mock.method(tablesRepository, 'update', async (_id: string, data: any) => {
      updatedRowCount = data.rowCount;
      return data as any;
    });

    try {
      const sync = new FormsTableSync();
      const removed = await sync.removeEntryFromTable(
        { id: formUuid, linkedTableId: 'tbl-1' } as any,
        entryUuid
      );

      assert.strictEqual(removed, 2);
      assert.strictEqual(updatedRowCount, 1);

      const rewritten = JSON.parse((await gunzipAsync(await fs.readFile(gzPath))).toString('utf-8'));
      assert.strictEqual(rewritten.rowCount, 1);
      assert.strictEqual(rewritten.data.length, 1);
      assert.strictEqual(rewritten.data[0].entryId, otherUuid);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('DELETE /api/v1/forms/entries/:id: 401 sin credenciales y 200 autenticado', async () => {
    const app = await buildApp();

    const unauth = await app.inject({
      method: 'DELETE',
      url: `/api/v1/forms/entries/${entryUuid}`,
    });
    assert.strictEqual(unauth.statusCode, 401);

    mockValidAuthClient();
    mock.method(formsMutationService, 'deleteEntry', async () => ({
      deleted: true as const,
      id: entryUuid,
      formId: formUuid,
      removedTableRows: 2,
    }));

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/v1/forms/entries/${entryUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(ok.statusCode, 200);
    assert.deepStrictEqual(ok.json(), {
      deleted: true,
      id: entryUuid,
      formId: formUuid,
      removedTableRows: 2,
    });

    await app.close();
  });
});
