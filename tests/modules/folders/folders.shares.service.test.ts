import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Role, FolderType, FolderPermission } from '@prisma/client';
import { FoldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Carpetas: FoldersSharesService y RBAC', () => {
  const folderId = '11111111-1111-4111-8111-111111111111';
  const ownerUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const collaboratorUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const strangerUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const mockFolder = {
    id: folderId,
    name: 'Proyectos',
    type: FolderType.IMAGE,
    color: '#3b82f6',
    isPrivate: false,
    userId: ownerUserId,
    createdAt: new Date(),
  };

  it('assertFolderAccess: ADMIN obtiene acceso EDIT en cualquier carpeta', async () => {
    const service = new FoldersSharesService(
      {} as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    const result = await service.assertFolderAccess(folderId, { id: 'admin-1', role: Role.ADMIN }, FolderPermission.EDIT);
    assert.strictEqual(result.permission, 'ADMIN');
  });

  it('assertFolderAccess: el dueño de la carpeta obtiene permiso EDIT', async () => {
    const service = new FoldersSharesService(
      {} as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    const result = await service.assertFolderAccess(folderId, { id: ownerUserId, role: Role.MANAGER }, FolderPermission.EDIT);
    assert.strictEqual(result.permission, FolderPermission.EDIT);
  });

  it('assertFolderAccess: colaborador con permiso READ puede leer pero rechaza EDIT con 403', async () => {
    const service = new FoldersSharesService(
      {
        findMember: async () => ({
          id: 'mem-1',
          folderId,
          userId: collaboratorUserId,
          permission: FolderPermission.READ,
          createdAt: new Date(),
        }),
      } as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    const readResult = await service.assertFolderAccess(
      folderId,
      { id: collaboratorUserId, role: Role.COLLABORATOR },
      FolderPermission.READ
    );
    assert.strictEqual(readResult.permission, FolderPermission.READ);

    await assert.rejects(
      async () => {
        await service.assertFolderAccess(
          folderId,
          { id: collaboratorUserId, role: Role.COLLABORATOR },
          FolderPermission.EDIT
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        return true;
      }
    );
  });

  it('assertFolderAccess: rechaza a COLLABORATOR no invitado con 403', async () => {
    const service = new FoldersSharesService(
      { findMember: async () => null } as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    await assert.rejects(
      async () => {
        await service.assertFolderAccess(
          folderId,
          { id: strangerUserId, role: Role.COLLABORATOR },
          FolderPermission.READ
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        return true;
      }
    );
  });

  it('shareFolder: permite al dueño asignar permiso a un colaborador', async () => {
    let upserted: any = null;
    const service = new FoldersSharesService(
      {
        addOrUpdateMember: async (fId: string, uId: string, perm: FolderPermission) => {
          upserted = { folderId: fId, userId: uId, permission: perm };
          return upserted;
        },
      } as any,
      { findFolderById: async () => mockFolder } as any,
      { findById: async () => ({ id: collaboratorUserId, username: 'colab' }) } as any
    );

    const share = await service.shareFolder(
      folderId,
      { id: ownerUserId, role: Role.MANAGER },
      collaboratorUserId,
      FolderPermission.EDIT
    );

    assert.strictEqual(share.permission, FolderPermission.EDIT);
    assert.strictEqual(upserted.userId, collaboratorUserId);
  });

  it('shareFolder: rechaza si un usuario no propietario intenta compartir la carpeta', async () => {
    const service = new FoldersSharesService(
      {} as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    await assert.rejects(
      async () => {
        await service.shareFolder(
          folderId,
          { id: strangerUserId, role: Role.MANAGER },
          collaboratorUserId,
          FolderPermission.READ
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        return true;
      }
    );
  });

  it('revokeShare: expulsa exitosamente al colaborador de la carpeta', async () => {
    let removed = false;
    const service = new FoldersSharesService(
      {
        findMember: async () => ({ id: 'mem-1' }),
        removeMember: async () => {
          removed = true;
          return {} as any;
        },
      } as any,
      { findFolderById: async () => mockFolder } as any,
      {} as any
    );

    const result = await service.revokeShare(folderId, { id: ownerUserId, role: Role.MANAGER }, collaboratorUserId);
    assert.strictEqual(result.revoked, true);
    assert.strictEqual(removed, true);
  });
});
