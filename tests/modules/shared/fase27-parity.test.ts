import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Role, FolderPermission } from '@prisma/client';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { AppError } from '../../../src/shared/errors.js';
import { eventBus } from '../../../src/shared/event-bus.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { imagesRepository } from '../../../src/modules/images/images.repository.js';
import { imagesMetadataService } from '../../../src/modules/images/images.metadata.service.js';
import { auditService } from '../../../src/modules/audit/audit.service.js';
import { auditRepository } from '../../../src/modules/audit/audit.repository.js';
import { sanitizeSpreadsheetCell } from '../../../src/modules/audit/audit.export.service.js';
import { apiKeysService } from '../../../src/modules/api-keys/api-keys.service.js';
import { apiKeysRepository } from '../../../src/modules/api-keys/api-keys.repository.js';
import { UsersService, hashPassword } from '../../../src/modules/users/users.service.js';
import { usersService } from '../../../src/modules/users/users.service.js';
import { notificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { NotificationsListener } from '../../../src/modules/notifications/notifications.listener.js';
import { FoldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';

describe('Fase 27: Paridad Avanzada (Images, Audit, API Keys, Users, Notifications)', () => {
  const validKey = 'mk_live_fase27_test_key_12345';
  const uuid1 = '11111111-1111-4111-8111-111111111111';
  const uuid2 = '22222222-2222-4222-8222-222222222222';
  const uuid3 = '33333333-3333-4333-8333-333333333333';

  const origApiFind = prisma.apiClient.findUnique;
  const origUserFind = prisma.user.findUnique;
  const origUserFindMany = prisma.user.findMany;
  const origFolderMemberFindMany = prisma.folderMember.findMany;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = origApiFind;
    (prisma.user as any).findUnique = origUserFind;
    (prisma.user as any).findMany = origUserFindMany;
    (prisma.folderMember as any).findMany = origFolderMemberFindMany;
    mock.reset();
  });

  function mockApiKeyAuth() {
    (prisma.apiClient as any).findUnique = async () => ({
      id: uuid1,
      name: 'Admin Client',
      keyPrefix: 'mk_live_fase27',
      keyHash: 'hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });
  }

  describe('27.1 Images (?download=true y PATCH /api/v1/images/:id/metadata)', () => {
    it('GET /i/:short_code?download=true incluye cabecera Content-Disposition: attachment', async () => {
      mock.method(imagesService, 'getImageFileByShortCode', async () => ({
        record: { originalName: 'foto producto.png', mimeType: 'image/png' },
        fileStream: Readable.from(Buffer.from('PNGDATA')),
        mimeType: 'image/png',
        isThumbnail: false,
      }));

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/i/abc1234567?download=true' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-disposition'], 'attachment; filename="foto%20producto.png"');
      assert.ok(String(res.headers['cache-control']).includes('immutable'));

      const inlineRes = await app.inject({ method: 'GET', url: '/i/abc1234567' });
      assert.strictEqual(inlineRes.statusCode, 200);
      assert.strictEqual(inlineRes.headers['content-disposition'], undefined);
    });

    it('imagesMetadataService.updateMetadata valida UUID, esquema Zod, 404 y fusiona metadataCard + auditoría', async () => {
      await assert.rejects(
        () => imagesMetadataService.updateMetadata('bad-id', { alt: 'hola' }),
        (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_ID'
      );

      await assert.rejects(
        () => imagesMetadataService.updateMetadata(uuid1, { tags: [123 as any] }),
        (err: any) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR'
      );

      mock.method(imagesRepository, 'findById', async () => null);
      await assert.rejects(
        () => imagesMetadataService.updateMetadata(uuid1, { alt: 'ok' }, { id: uuid2, role: Role.ADMIN }),
        (err: any) => err instanceof AppError && err.status === 404
      );

      let auditAction = '';
      mock.method(auditService, 'recordLog', (entry: any) => { auditAction = entry.action; });
      mock.method(imagesRepository, 'findById', async () => ({
        id: uuid1,
        shortCode: 'img1234567',
        originalName: 'banner.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        folderId: uuid2,
        metadataCard: { title: 'Prev', custom: { camera: 'Sony' } },
        folder: { id: uuid2, userId: uuid3, isPrivate: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any));
      mock.method(imagesRepository, 'update', async (_id: string, data: any) => ({
        id: uuid1,
        shortCode: 'img1234567',
        originalName: 'banner.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        folderId: uuid2,
        metadataCard: data.metadataCard,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any));

      const updated = await imagesMetadataService.updateMetadata(
        uuid1,
        { alt: 'Banner promocional', tags: ['hero', '2026'], custom: { lens: '35mm' } },
        { id: uuid3, role: Role.MANAGER }
      );
      assert.strictEqual(updated.metadataCard.title, 'Prev');
      assert.strictEqual(updated.metadataCard.alt, 'Banner promocional');
      assert.deepStrictEqual(updated.metadataCard.tags, ['hero', '2026']);
      assert.deepStrictEqual(updated.metadataCard.custom, { camera: 'Sony', lens: '35mm' });
      assert.strictEqual(auditAction, 'IMAGE_METADATA_UPDATE');
    });

    it('PATCH /api/v1/images/:id/metadata: 401 sin credenciales y 200 autenticado', async () => {
      const app = await buildApp();
      const unauth = await app.inject({ method: 'PATCH', url: `/api/v1/images/${uuid1}/metadata`, payload: { alt: 'x' } });
      assert.strictEqual(unauth.statusCode, 401);

      mockApiKeyAuth();
      mock.method(imagesMetadataService, 'updateMetadata', async () => ({
        id: uuid1,
        shortCode: 'img1234567',
        originalName: 'banner.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        metadataCard: { alt: 'Logo oficial', tags: ['brand'] },
        url: 'http://localhost:3000/i/img1234567',
        urlWithVersion: 'http://localhost:3000/i/img1234567?v=1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/images/${uuid1}/metadata`,
        headers: { 'x-api-key': validKey },
        payload: { alt: 'Logo oficial', tags: ['brand'] },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().metadataCard.alt, 'Logo oficial');
    });
  });

  describe('27.2.1 Audit (filtros from/to/actorId/search y exportación CSV/XLSX)', () => {
    it('sanitizeSpreadsheetCell neutraliza inyección de fórmulas (=, +, -, @)', () => {
      assert.strictEqual(sanitizeSpreadsheetCell('=CMD|calc'), "'=CMD|calc");
      assert.strictEqual(sanitizeSpreadsheetCell('+1+1'), "'+1+1");
      assert.strictEqual(sanitizeSpreadsheetCell('-2+3'), "'-2+3");
      assert.strictEqual(sanitizeSpreadsheetCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
      assert.strictEqual(sanitizeSpreadsheetCell('normal_value'), 'normal_value');
    });

    it('auditService.listLogs valida fechas y pasa filtros from/to/actorId/search al repositorio', async () => {
      await assert.rejects(
        () => auditService.listLogs({ id: uuid1, role: Role.ADMIN }, { from: 'fecha-mala' }),
        (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_DATE'
      );

      let captured: any = null;
      mock.method(auditRepository, 'findMany', async (opts: any) => { captured = opts; return []; });
      mock.method(auditRepository, 'count', async () => 0);

      await auditService.listLogs(
        { id: uuid1, role: Role.ADMIN },
        { from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z', actorId: uuid2, search: ' PDF_UPLOAD ' }
      );
      assert.ok(captured.from instanceof Date);
      assert.ok(captured.to instanceof Date);
      assert.strictEqual(captured.actorId, uuid2);
      assert.strictEqual(captured.search, 'PDF_UPLOAD');
    });

    it('GET /api/v1/audit-logs/export: 401 sin auth, 403 COLLABORATOR, 200 CSV sanitizado y 200 XLSX', async () => {
      const app = await buildApp();
      const unauth = await app.inject({ method: 'GET', url: '/api/v1/audit-logs/export?format=csv' });
      assert.strictEqual(unauth.statusCode, 401);

      const collabToken = app.jwt.sign({ id: uuid3, username: 'colab', role: Role.COLLABORATOR });
      (prisma.user as any).findUnique = async () => ({ id: uuid3, username: 'colab', role: Role.COLLABORATOR, isActive: true });
      const forbidden = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs/export?format=csv',
        headers: { authorization: `Bearer ${collabToken}` },
      });
      assert.strictEqual(forbidden.statusCode, 403);

      mockApiKeyAuth();
      mock.method(auditRepository, 'findMany', async () => [
        {
          id: uuid1,
          actorId: uuid2,
          actorUsername: '=HYPERLINK("http://evil")',
          action: 'IMAGE_UPLOAD',
          resourceType: 'IMAGE',
          resourceId: uuid3,
          folderId: null,
          metadata: { note: '+danger' },
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-06-01T12:00:00Z'),
        } as any,
      ]);

      const csvRes = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs/export?format=csv&search=IMAGE',
        headers: { 'x-api-key': validKey },
      });
      assert.strictEqual(csvRes.statusCode, 200);
      assert.ok(String(csvRes.headers['content-type']).includes('text/csv'));
      assert.ok(String(csvRes.headers['content-disposition']).includes('attachment;'));
      assert.ok(csvRes.body.includes("'=HYPERLINK"));

      const xlsxRes = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs/export?format=xlsx',
        headers: { 'x-api-key': validKey },
      });
      assert.strictEqual(xlsxRes.statusCode, 200);
      assert.ok(String(xlsxRes.headers['content-type']).includes('spreadsheetml'));
      assert.strictEqual(xlsxRes.rawPayload.subarray(0, 2).toString('utf8'), 'PK');
    });
  });

  describe('27.2.2 API Keys (PATCH /api/v1/api-keys/:id y paginación)', () => {
    it('updateApiKey valida RBAC, campos y registra API_KEY_UPDATE', async () => {
      await assert.rejects(
        () => apiKeysService.updateApiKey({ id: uuid1, role: Role.MANAGER }, uuid2, { isActive: false }),
        (err: any) => err instanceof AppError && err.status === 403
      );
      await assert.rejects(
        () => apiKeysService.updateApiKey({ id: uuid1, role: Role.ADMIN }, 'bad-id', { isActive: false }),
        (err: any) => err instanceof AppError && err.status === 400
      );
      await assert.rejects(
        () => apiKeysService.updateApiKey({ id: uuid1, role: Role.ADMIN }, uuid2, {}),
        (err: any) => err instanceof AppError && err.status === 400
      );
      await assert.rejects(
        () => apiKeysService.updateApiKey({ id: uuid1, role: Role.ADMIN }, uuid2, { rateLimit: 0 }),
        (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_RATE_LIMIT'
      );

      let auditAction = '';
      mock.method(auditService, 'recordLog', (entry: any) => { auditAction = entry.action; });
      mock.method(apiKeysRepository, 'findById', async () => ({ id: uuid2, name: 'Old', keyPrefix: 'mk_live_old' } as any));
      mock.method(apiKeysRepository, 'update', async (_id: string, data: any) => ({
        id: uuid2,
        name: data.name ?? 'Old',
        description: null,
        keyPrefix: 'mk_live_old',
        rateLimit: data.rateLimit ?? 100,
        isActive: data.isActive ?? true,
        lastUsedAt: null,
        createdAt: new Date(),
      }));

      const updated = await apiKeysService.updateApiKey(
        { id: uuid1, role: Role.ADMIN },
        uuid2,
        { name: 'Paused Key', isActive: false, rateLimit: 250 }
      );
      assert.strictEqual(updated.isActive, false);
      assert.strictEqual(updated.rateLimit, 250);
      assert.strictEqual(auditAction, 'API_KEY_UPDATE');
    });

    it('PATCH /api/v1/api-keys/:id y GET /api/v1/api-keys?page=1&limit=1', async () => {
      mockApiKeyAuth();
      const app = await buildApp();

      mock.method(apiKeysRepository, 'findAll', async () => [
        { id: uuid2, name: 'K1', description: null, keyPrefix: 'mk_live_1', rateLimit: 100, isActive: true, lastUsedAt: null, createdAt: new Date() },
      ]);
      mock.method(apiKeysRepository, 'count', async () => 3);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys?page=1&limit=1',
        headers: { 'x-api-key': validKey },
      });
      assert.strictEqual(listRes.statusCode, 200);
      const listBody = listRes.json();
      assert.strictEqual(listBody.total, 3);
      assert.strictEqual(listBody.totalPages, 3);
      assert.strictEqual(listBody.meta.hasNext, true);

      mock.method(apiKeysService, 'updateApiKey', async () => ({
        id: uuid2, name: 'Updated', description: null, keyPrefix: 'mk_live_1', rateLimit: 500, isActive: false, lastUsedAt: null, createdAt: new Date(),
      }));
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/api-keys/${uuid2}`,
        headers: { 'x-api-key': validKey },
        payload: { isActive: false, rateLimit: 500 },
      });
      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.json().isActive, false);
    });
  });

  describe('27.2.3 Users (filtros, paginación y auditoría de contraseñas)', () => {
    it('GET /api/v1/users soporta search, role, isActive, page, limit y meta', async () => {
      const app = await buildApp();
      const adminToken = app.jwt.sign({ id: uuid1, username: 'admin', role: Role.ADMIN });
      (prisma.user as any).findUnique = async () => ({ id: uuid1, username: 'admin', role: Role.ADMIN, isActive: true });

      let capturedOpts: any = null;
      mock.method(usersService, 'listUsers', async (_caller: any, opts: any) => {
        capturedOpts = opts;
        return [{ id: uuid2, username: 'ana_colab', role: Role.COLLABORATOR, isActive: true, createdById: uuid1, createdAt: new Date() }] as any;
      });
      mock.method(usersService, 'countUsers', async () => 12);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users?search=ana&role=COLLABORATOR&isActive=true&page=2&limit=5',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(capturedOpts, { search: 'ana', role: Role.COLLABORATOR, isActive: true, page: 2, limit: 5 });
      const body = res.json();
      assert.strictEqual(body.total, 12);
      assert.strictEqual(body.page, 2);
      assert.strictEqual(body.limit, 5);
      assert.strictEqual(body.totalPages, 3);
      assert.strictEqual(body.meta.hasNext, true);
    });

    it('changePassword y resetUserPassword registran USER_PASSWORD_CHANGE y USER_PASSWORD_RESET', async () => {
      const recordedActions: string[] = [];
      mock.method(auditService, 'recordLog', (entry: any) => { recordedActions.push(entry.action); });

      const currentHash = await hashPassword('oldSecret123');
      const mockRepo: any = {
        findById: async (id: string) => ({ id, username: 'operador', role: Role.COLLABORATOR, createdById: uuid1, passwordHash: currentHash }),
        update: async () => ({}),
        incrementTokenVersion: async () => ({}),
      };
      const svc = new UsersService(mockRepo);
      await svc.changePassword(uuid2, 'oldSecret123', 'newSecret456');
      await svc.resetUserPassword({ id: uuid1, role: Role.ADMIN }, uuid2, 'resetSecret789');

      assert.deepStrictEqual(recordedActions, ['USER_PASSWORD_CHANGE', 'USER_PASSWORD_RESET']);
    });
  });

  describe('27.2.4 Notifications (DELETE /notifications/read y nuevos eventos AppEventBus)', () => {
    it('DELETE /api/v1/notifications/read limpia notificaciones leídas y exige autenticación', async () => {
      const app = await buildApp();
      const unauth = await app.inject({ method: 'DELETE', url: '/api/v1/notifications/read' });
      assert.strictEqual(unauth.statusCode, 401);

      mockApiKeyAuth();
      mock.method(notificationsService, 'clearReadNotifications', async () => ({ deletedCount: 7 }));
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/notifications/read',
        headers: { 'x-api-key': validKey },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().deletedCount, 7);
    });

    it('NotificationsListener maneja folder.shared, resource.uploaded y storage.quota.warning con SSE', async () => {
      const created: any[] = [];
      const ssePushes: any[] = [];
      const mockRepo: any = {
        createManyNotifications: async (entries: any[]) => {
          const batch = entries.map((e, idx) => ({ ...e, id: `n-${idx}`, read: false, createdAt: new Date() }));
          created.push(...batch);
          return batch;
        },
      };
      const mockSse: any = {
        sendToUser: (userId: string, event: string, data: any) => { ssePushes.push({ userId, event, data }); return true; },
      };

      const listener = new NotificationsListener(mockRepo, mockSse, 60_000);

      // 1. folder.shared
      (prisma.user as any).findMany = async () => [{ id: uuid2 }];
      await listener.handleFolderShared({
        folderId: uuid3, folderName: 'Proyectos 2026', targetUserId: uuid2, permission: 'EDIT', sharedById: uuid1, sharedByRole: 'MANAGER',
      });
      assert.strictEqual(created.length, 1);
      assert.strictEqual(created[0].type, 'FOLDER_SHARED');
      assert.strictEqual(ssePushes[0].userId, uuid2);

      // 2. resource.uploaded (excluye al uploader, notifica al dueño y otro miembro)
      (prisma.folderMember as any).findMany = async () => [{ userId: uuid2 }, { userId: uuid3 }];
      (prisma.user as any).findMany = async (args: any) => args.where.id.in.map((id: string) => ({ id }));
      await listener.handleResourceUploaded({
        resourceType: 'PDF', resourceId: 'pdf-1', resourceName: 'Manual.pdf', folderId: 'f-1', folderName: 'Docs', folderOwnerId: uuid1, uploadedById: uuid2,
      });
      const uploadNotifs = created.filter((n) => n.type === 'RESOURCE_UPLOADED');
      assert.strictEqual(uploadNotifs.length, 2);
      assert.ok(uploadNotifs.every((n) => n.userId !== uuid2));

      // 3. storage.quota.warning (notifica ADMIN y respeta cooldown)
      (prisma.user as any).findMany = async () => [{ id: uuid1 }];
      await listener.handleStorageQuotaWarning({
        totalBytes: 90, maxStorageBytes: 100, usagePercent: 90, message: 'Cuota 90%',
      });
      await listener.handleStorageQuotaWarning({
        totalBytes: 91, maxStorageBytes: 100, usagePercent: 91, message: 'Cuota 91%',
      });
      const quotaNotifs = created.filter((n) => n.type === 'STORAGE_QUOTA_WARNING');
      assert.strictEqual(quotaNotifs.length, 1);
    });

    it('foldersSharesService.shareFolder emite evento folder.shared en AppEventBus', async () => {
      let emitted: any = null;
      const onShared = (payload: any) => { emitted = payload; };
      eventBus.once('folder.shared', onShared);

      const svc = new FoldersSharesService(
        { addOrUpdateMember: async () => ({ id: 'm1', folderId: uuid1, userId: uuid2, permission: FolderPermission.EDIT }) } as any,
        { findFolderById: async () => ({ id: uuid1, name: 'Compartida', userId: uuid3 }) } as any,
        { findById: async () => ({ id: uuid2, username: 'colab' }) } as any
      );
      await svc.shareFolder(uuid1, { id: uuid3, role: Role.MANAGER }, uuid2, FolderPermission.EDIT);
      eventBus.off('folder.shared', onShared);

      assert.ok(emitted);
      assert.strictEqual(emitted.folderId, uuid1);
      assert.strictEqual(emitted.targetUserId, uuid2);
      assert.strictEqual(emitted.permission, FolderPermission.EDIT);
    });
  });
});
