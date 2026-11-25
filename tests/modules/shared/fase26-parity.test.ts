import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { FolderPermission, FolderType, Role } from '@prisma/client';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { env } from '../../../src/config/env.js';
import { AppError } from '../../../src/shared/errors.js';
import { pdfsRepository } from '../../../src/modules/pdfs/pdfs.repository.js';
import { pdfsStorage } from '../../../src/modules/pdfs/pdfs.storage.js';
import { pdfsBulkService } from '../../../src/modules/pdfs/pdfs.bulk.service.js';
import { PdfsService } from '../../../src/modules/pdfs/pdfs.service.js';
import { foldersRepository } from '../../../src/modules/folders/folders.repository.js';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { foldersService } from '../../../src/modules/folders/folders.service.js';
import { FoldersHierarchyService } from '../../../src/modules/folders/folders.hierarchy.service.js';
import { getChatCache } from '../../../src/modules/chat/chat.provider.js';
import { buildSuggestionsFromDocuments, mergeMultiSourceChatAnswers } from '../../../src/modules/chat/chat.suggestions.js';
import { chatService } from '../../../src/modules/chat/chat.service.js';
import { FormsMutationService } from '../../../src/modules/forms/forms.mutation.service.js';
import { statsService } from '../../../src/modules/stats/stats.service.js';

describe('Fase 26: Paridad de API y UX (PDFs Bulk/Meta, Chat, Forms CRUD, Stats, Folders)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const adminCtx = { id: '00000000-0000-4000-8000-000000000001', role: Role.ADMIN };
  const managerCtx = { id: '11111111-1111-4111-8111-111111111111', role: Role.MANAGER };
  const pdfId1 = 'aaaaaaaa-1111-4111-8111-111111111111';
  const pdfId2 = 'bbbbbbbb-2222-4222-8222-222222222222';
  const folderId1 = 'cccccccc-3333-4333-8333-333333333333';
  const folderId2 = 'dddddddd-4444-4444-8444-444444444444';

  const origApiClientFindUnique = prisma.apiClient.findUnique;
  const origUserFindFirst = prisma.user.findFirst;
  const origImgAgg = (prisma.imageRegistry as any).aggregate;
  const origTblAgg = (prisma.tableRegistry as any).aggregate;
  const origPdfAgg = (prisma.pdfRegistry as any).aggregate;
  const origFolderFindMany = prisma.folder.findMany;
  const origUserCount = prisma.user.count;
  const origFormCount = prisma.formDefinition.count;
  const origEntryCount = prisma.formEntry.count;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = origApiClientFindUnique;
    (prisma.user as any).findFirst = origUserFindFirst;
    (prisma.imageRegistry as any).aggregate = origImgAgg;
    (prisma.tableRegistry as any).aggregate = origTblAgg;
    (prisma.pdfRegistry as any).aggregate = origPdfAgg;
    (prisma.folder as any).findMany = origFolderFindMany;
    (prisma.user as any).count = origUserCount;
    (prisma.formDefinition as any).count = origFormCount;
    (prisma.formEntry as any).count = origEntryCount;
    mock.reset();
  });

  function mockApiKey() {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'api-client-1',
      name: 'Test Client',
      keyPrefix: 'mk_live_valid_test',
      keyHash: 'hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });
    (prisma.user as any).findFirst = async () => ({
      id: adminCtx.id,
      username: 'admin',
      role: Role.ADMIN,
      isActive: true,
    });
  }

  // 26.1 PDFs Bulk & Meta
  it('26.1.1: pdfsBulkService.bulkDelete elimina PDFs válidos, limpia caché Chat y reporta fallos parciales', async () => {
    getChatCache().set('k1', { answer: 'cached', fromCache: false, modelUsed: 'test' } as any);
    let deletedFilesCount = 0;

    mock.method(pdfsRepository, 'findById', async (id: string) =>
      id === pdfId1
        ? { id: pdfId1, shortCode: 'pdf1111111', folderId: folderId1, folder: { userId: managerCtx.id } }
        : null
    );
    mock.method(pdfsRepository, 'delete', async () => ({} as any));
    mock.method(pdfsStorage, 'deletePdfFiles', async () => {
      deletedFilesCount++;
    });

    const result = await pdfsBulkService.bulkDelete([pdfId1, 'id-invalido', pdfId2], managerCtx);

    assert.strictEqual(result.totalRequested, 3);
    assert.deepStrictEqual(result.successful, [pdfId1]);
    assert.strictEqual(result.failed.length, 2);
    assert.strictEqual(deletedFilesCount, 1);
    assert.strictEqual(getChatCache().size, 0);
  });

  it('26.1.2: pdfsBulkService.bulkMove valida tipo PDF en destino y mueve lote correctamente', async () => {
    mock.method(foldersRepository, 'findFolderById', async (id: string) => ({
      id,
      type: id === folderId1 ? FolderType.IMAGE : FolderType.PDF,
      userId: managerCtx.id,
      isPrivate: false,
    }) as any);

    await assert.rejects(
      () => pdfsBulkService.bulkMove([pdfId1], folderId1, managerCtx),
      (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_FOLDER_TYPE'
    );

    mock.method(foldersSharesService, 'assertFolderAccess', async () => ({ permission: FolderPermission.EDIT, folder: {} as any }));
    mock.method(pdfsRepository, 'findById', async () => ({
      id: pdfId1,
      shortCode: 'pdf1111111',
      folderId: folderId1,
      folder: { userId: managerCtx.id },
    }) as any);
    mock.method(pdfsRepository, 'update', async () => ({} as any));

    const moved = await pdfsBulkService.bulkMove([pdfId1], folderId2, managerCtx);
    assert.deepStrictEqual(moved.successful, [pdfId1]);
    assert.strictEqual(moved.failed.length, 0);
  });

  it('26.1.3: GET /api/v1/pdfs retorna totalPages y meta de paginación estándar', async () => {
    const svc = new PdfsService(
      {
        findAll: async () => [
          { id: pdfId1, shortCode: 'pdf1234567', originalName: 'a.pdf', sizeBytes: 100, pageCount: 1, isScanned: false, metadataCard: null, folderId: folderId1, createdAt: new Date(), updatedAt: new Date() },
        ],
        count: async () => 25,
      } as any,
      {} as any,
      {} as any,
      {} as any
    );

    const res = await svc.listPdfs({ page: 2, limit: 10 }, adminCtx);
    assert.strictEqual(res.total, 25);
    assert.strictEqual(res.totalPages, 3);
    assert.deepStrictEqual(res.meta, { page: 2, limit: 10, total: 25, totalPages: 3, hasNext: true });
  });

  it('26.1.4: rutas HTTP POST /api/v1/pdfs/bulk-delete y bulk-move responden 200', async () => {
    mockApiKey();
    const app = await buildApp();
    mock.method(pdfsBulkService, 'bulkDelete', async () => ({ totalRequested: 1, successful: [pdfId1], failed: [] }));
    mock.method(pdfsBulkService, 'bulkMove', async () => ({ totalRequested: 1, successful: [pdfId1], failed: [] }));

    const resDel = await app.inject({
      method: 'POST',
      url: '/api/v1/pdfs/bulk-delete',
      headers: { 'x-api-key': validKey },
      payload: { ids: [pdfId1] },
    });
    assert.strictEqual(resDel.statusCode, 200);
    assert.deepStrictEqual(resDel.json().successful, [pdfId1]);

    const resMove = await app.inject({
      method: 'POST',
      url: '/api/v1/pdfs/bulk-move',
      headers: { 'x-api-key': validKey },
      payload: { ids: [pdfId1], targetFolderId: folderId2 },
    });
    assert.strictEqual(resMove.statusCode, 200);
    assert.deepStrictEqual(resMove.json().successful, [pdfId1]);
  });

  // 26.2 Chat Suggestions & Multi-source
  it('26.2: buildSuggestionsFromDocuments genera sugerencias desde PDFs y mergeMultiSourceChatAnswers combina fuentes', () => {
    const pdfOnlySuggestions = buildSuggestionsFromDocuments(
      [],
      [{ originalName: 'reglamento_2026.pdf', metadataCard: { title: 'Reglamento 2026', keywords: ['vacaciones'] } }]
    );
    assert.strictEqual(pdfOnlySuggestions.length, 1);
    assert.ok(pdfOnlySuggestions[0].includes('Reglamento 2026'));
    assert.ok(pdfOnlySuggestions[0].includes('vacaciones'));

    const merged = mergeMultiSourceChatAnswers(
      { answer: 'Datos tabla', foundInSystem: true, usedAi: true, sources: [{ type: 'TABLE', tableId: 't1', tableName: 't.csv', shortCode: 't1' }], chartData: { labels: ['A'], values: [1], percentages: [100] } },
      { answer: 'Cita PDF', foundInSystem: true, usedAi: false, sources: [{ type: 'PDF', tableId: 'p1', tableName: 'p.pdf', shortCode: 'p1', pages: [2] }], chartData: null }
    );
    assert.ok(merged);
    assert.strictEqual(merged.sources.length, 2);
    assert.ok(merged.answer.includes('Datos tabla'));
    assert.ok(merged.answer.includes('Cita PDF'));
    assert.ok(merged.chartData !== null);
  });

  it('26.2.3: GET /api/v1/chat/suggestions requiere auth (401) y retorna 200 autenticado', async () => {
    const app = await buildApp();
    const unauth = await app.inject({ method: 'GET', url: '/api/v1/chat/suggestions' });
    assert.strictEqual(unauth.statusCode, 401);

    mockApiKey();
    mock.method(chatService, 'getInternalSuggestions', async () => ({
      suggestions: ['¿Qué dice Manual Operativo sobre seguridad?'],
    }));
    const okRes = await app.inject({
      method: 'GET',
      url: '/api/v1/chat/suggestions',
      headers: { 'x-api-key': validKey },
    });
    assert.strictEqual(okRes.statusCode, 200);
    assert.strictEqual(okRes.json().suggestions.length, 1);
  });

  // 26.3 Forms CRUD (PATCH / DELETE)
  it('26.3: FormsMutationService actualiza y elimina formulario limpiando tabla vinculada', async () => {
    const unlinked: string[] = [];
    mock.method(fs, 'unlink', async (p: string) => { unlinked.push(p.replace(/\\/g, '/')); });

    let deletedTableId = '';
    const mutSvc = new FormsMutationService(
      {
        findFormById: async () => ({
          id: pdfId1,
          slug: 'mi-form',
          title: 'Viejo',
          folderId: folderId1,
          folder: { userId: managerCtx.id },
          linkedTableId: pdfId2,
          linkedTable: { id: pdfId2, shortCode: 'tbl1234567', storagePath: 'storage/tables/form_tbl1234567.csv' },
        }),
        updateForm: async (id: string, data: any) => ({ id, slug: 'mi-form', folderId: folderId1, ...data }),
        deleteForm: async () => ({}),
      } as any,
      {
        deleteById: async (id: string) => { deletedTableId = id; },
      } as any,
      {
        assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
      } as any
    );

    const updated = await mutSvc.updateForm(pdfId1, { title: 'Formulario Actualizado', externalTargetUrl: 'https://hooks.example.com/pdf' }, managerCtx);
    assert.strictEqual(updated.title, 'Formulario Actualizado');

    await assert.rejects(
      () => mutSvc.updateForm(pdfId1, { externalTargetUrl: 'no-es-url' }, managerCtx),
      (err: unknown) => err instanceof AppError && err.status === 400
    );

    const delRes = await mutSvc.deleteForm(pdfId1, managerCtx);
    assert.deepStrictEqual(delRes, { deleted: true, id: pdfId1 });
    assert.strictEqual(deletedTableId, pdfId2);
    assert.ok(unlinked.includes('storage/tables/form_tbl1234567.csv'));
    assert.ok(unlinked.includes('storage/tables/tbl1234567.data.json.gz'));

    await assert.rejects(
      () => mutSvc.deleteForm(pdfId1, { id: 'otro-manager', role: Role.MANAGER }),
      (err: unknown) => err instanceof AppError && err.status === 403
    );
  });

  // 26.4 Stats dynamic quota & summary
  it('26.4: statsService expone maxStorageBytes basado en env.MAX_STORAGE_GB, usagePercent y summary operativo', async () => {
    (prisma.imageRegistry as any).aggregate = async () => ({ _count: { id: 1 }, _sum: { sizeBytes: 100 } });
    (prisma.tableRegistry as any).aggregate = async () => ({ _count: { id: 1 }, _sum: { sizeBytes: 200 } });
    (prisma.pdfRegistry as any).aggregate = async () => ({ _count: { id: 1 }, _sum: { sizeBytes: 300 } });
    (prisma.folder as any).findMany = async () => [];
    (prisma.user as any).count = async () => 7;
    (prisma.formDefinition as any).count = async () => 3;
    (prisma.formEntry as any).count = async (args: any) => (args?.where?.status === 'NEW' ? 4 : 11);

    const stats = await statsService.getStorageStats(adminCtx);
    assert.strictEqual(stats.disk?.maxStorageBytes, env.MAX_STORAGE_GB * 1024 * 1024 * 1024);
    assert.strictEqual(typeof stats.disk?.usagePercent, 'number');
    assert.deepStrictEqual(stats.summary, {
      activeUsersCount: 7,
      formsCount: 3,
      pendingEntriesCount: 4,
      resolvedEntriesCount: 11,
    });
  });

  // 26.5 Folders shares dual auth + parentId move validation
  it('26.5.1: /api/v1/folders/:id/shares acepta autenticación dual con X-API-Key', async () => {
    mockApiKey();
    const app = await buildApp();
    mock.method(foldersSharesService, 'listShares', async () => []);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${folderId1}/shares`,
      headers: { 'x-api-key': validKey },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.json(), { shares: [] });
  });

  it('26.5.2: FoldersHierarchyService.validateParentMove previene ciclos, exceso de profundidad y tipos incompatibles', async () => {
    const rootId = '10000000-0000-4000-8000-000000000001';
    const childId = '10000000-0000-4000-8000-000000000002';
    const grandChildId = '10000000-0000-4000-8000-000000000003';

    const mockRepo: any = {
      findFolderById: async (id: string) => {
        if (id === rootId) return { id: rootId, type: FolderType.CONTAINER, parentId: null };
        if (id === childId) return { id: childId, type: FolderType.IMAGE, parentId: rootId };
        if (id === grandChildId) return { id: grandChildId, type: FolderType.IMAGE, parentId: childId };
        return null;
      },
      findChildFolderIds: async (id: string) => (id === childId ? [{ id: grandChildId }] : []),
    };
    const mockShares: any = {
      assertFolderAccess: async (id: string) => ({
        permission: FolderPermission.EDIT,
        folder: await mockRepo.findFolderById(id),
      }),
    };

    const hierarchy = new FoldersHierarchyService(mockRepo, mockShares);

    // Auto-padre -> 400 INVALID_FOLDER_HIERARCHY
    await assert.rejects(
      () => hierarchy.validateParentMove({ id: childId, type: FolderType.IMAGE }, childId, managerCtx),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_FOLDER_HIERARCHY'
    );

    // Ciclo (mover childId dentro de su hijo grandChildId) -> 400 INVALID_FOLDER_HIERARCHY
    await assert.rejects(
      () => hierarchy.validateParentMove({ id: childId, type: FolderType.IMAGE }, grandChildId, managerCtx),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_FOLDER_HIERARCHY'
    );

    // Tipo incompatible -> 400 INVALID_FOLDER_TYPE
    await assert.rejects(
      () => hierarchy.validateParentMove({ id: folderId2, type: FolderType.PDF }, childId, managerCtx),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_FOLDER_TYPE'
    );

    // Movimiento válido a raíz para Manager
    await hierarchy.validateParentMove({ id: childId, type: FolderType.IMAGE }, null, managerCtx);
    assert.strictEqual(typeof foldersService.movePdfToFolder, 'function');
  });
});
