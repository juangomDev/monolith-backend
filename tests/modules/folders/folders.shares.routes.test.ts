import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../../../src/app.js';
import { Role, FolderPermission } from '@prisma/client';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo Carpetas: Rutas HTTP de Compartición (/api/v1/folders/:id/shares)', () => {
  const folderId = '11111111-2222-4333-8444-555555555551';
  const targetUserId = '11111111-2222-4333-8444-555555555552';
  const ownerId = '11111111-2222-4333-8444-555555555553';

  it('POST /api/v1/folders/:id/shares: retorna 201 y comparte la carpeta con permiso EDIT', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ id: ownerId, username: 'owner_manager', role: Role.MANAGER });

    (prisma.user as any).findUnique = async () => ({
      id: ownerId,
      username: 'owner_manager',
      role: Role.MANAGER,
      isActive: true,
    });

    mock.method(foldersSharesService, 'shareFolder', async () => ({
      id: 'share-1',
      folderId,
      userId: targetUserId,
      permission: FolderPermission.EDIT,
      createdAt: new Date(),
    }));

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/folders/${folderId}/shares`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        userId: targetUserId,
        permission: 'EDIT',
      },
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.share.permission, 'EDIT');
  });

  it('GET /api/v1/folders/:id/shares: retorna 200 con listado de colaboradores', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ id: ownerId, username: 'owner_manager', role: Role.MANAGER });

    (prisma.user as any).findUnique = async () => ({
      id: ownerId,
      username: 'owner_manager',
      role: Role.MANAGER,
      isActive: true,
    });

    mock.method(foldersSharesService, 'listShares', async () => [
      {
        id: 'share-1',
        folderId,
        userId: targetUserId,
        permission: FolderPermission.READ,
        createdAt: new Date(),
        user: { id: targetUserId, username: 'colaborador_1', role: 'COLLABORATOR' },
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${folderId}/shares`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.shares.length, 1);
    assert.strictEqual(body.shares[0].permission, 'READ');
  });

  it('PATCH /api/v1/folders/:id/shares/:userId: retorna 200 al actualizar permiso', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ id: ownerId, username: 'owner_manager', role: Role.MANAGER });

    (prisma.user as any).findUnique = async () => ({
      id: ownerId,
      username: 'owner_manager',
      role: Role.MANAGER,
      isActive: true,
    });

    mock.method(foldersSharesService, 'updateSharePermission', async () => ({
      id: 'share-1',
      folderId,
      userId: targetUserId,
      permission: FolderPermission.EDIT,
    }));

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${folderId}/shares/${targetUserId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { permission: 'EDIT' },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.share.permission, 'EDIT');
  });

  it('DELETE /api/v1/folders/:id/shares/:userId: retorna 200 tras revocar colaborador', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ id: ownerId, username: 'owner_manager', role: Role.MANAGER });

    (prisma.user as any).findUnique = async () => ({
      id: ownerId,
      username: 'owner_manager',
      role: Role.MANAGER,
      isActive: true,
    });

    mock.method(foldersSharesService, 'revokeShare', async () => ({ revoked: true }));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${folderId}/shares/${targetUserId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.revoked, true);
  });
});
