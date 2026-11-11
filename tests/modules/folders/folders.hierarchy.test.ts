import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Role, FolderType, FolderPermission } from '@prisma/client';
import { FoldersHierarchyService } from '../../../src/modules/folders/folders.hierarchy.service.js';
import { FoldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { FoldersService } from '../../../src/modules/folders/folders.service.js';

describe('Módulo Carpetas: Jerarquía en 3 Niveles y Bóveda Compartida', () => {
  const mockManager = { id: 'a1111111-1111-4111-8111-111111111111', role: Role.MANAGER };
  const mockCollab = { id: 'b2222222-2222-4222-8222-222222222222', role: Role.COLLABORATOR };
  const mockAdmin = { id: '00000000-0000-4000-8000-000000000000', role: Role.ADMIN };

  const rootManagerFolder: any = {
    id: 'c1111111-1111-4111-8111-111111111111',
    name: 'juan',
    type: FolderType.CONTAINER,
    userId: mockManager.id,
    parentId: null,
    isSystem: false,
    isPrivate: false,
  };

  const level2Folder: any = {
    id: 'd2222222-2222-4222-8222-222222222222',
    name: 'fotos-productos',
    type: FolderType.IMAGE,
    userId: mockManager.id,
    parentId: rootManagerFolder.id,
    isSystem: false,
    isPrivate: false,
  };

  const level3Folder: any = {
    id: 'e3333333-3333-4333-8333-333333333333',
    name: 'calzados-2026',
    type: FolderType.IMAGE,
    userId: mockManager.id,
    parentId: level2Folder.id,
    isSystem: false,
    isPrivate: false,
  };

  const sharedVaultFolder: any = {
    id: 'f4444444-4444-4444-8444-444444444444',
    name: 'shared',
    type: FolderType.CONTAINER,
    userId: mockAdmin.id,
    parentId: null,
    isSystem: true,
    isPrivate: false,
  };

  test('validar rechazo si un colaborador intenta crear carpeta raíz (sin parentId)', async () => {
    const hierarchy = new FoldersHierarchyService({} as any, {} as any);
    await assert.rejects(
      async () => hierarchy.validateAndResolveHierarchy(undefined, FolderType.IMAGE, mockCollab),
      (err: any) => {
        assert.equal(err.status, 403);
        assert.equal(err.code, 'FORBIDDEN');
        assert.match(err.message, /Los colaboradores no tienen permiso para crear carpetas/);
        return true;
      }
    );
  });

  test('validar creación exitosa de subcarpeta nivel 2 dentro de contenedor de manager', async () => {
    const mockShares: any = {
      assertFolderAccess: async () => ({ hasAccess: true, permission: FolderPermission.EDIT, folder: rootManagerFolder }),
    };
    const mockRepo: any = {
      findFolderById: async (id: string) => (id === rootManagerFolder.id ? rootManagerFolder : null),
    };

    const hierarchy = new FoldersHierarchyService(mockRepo, mockShares);
    const result = await hierarchy.validateAndResolveHierarchy(
      rootManagerFolder.id,
      FolderType.IMAGE,
      mockManager
    );

    assert.equal(result.targetUserId, mockManager.id);
  });

  test('validar rechazo si se intenta exceder la profundidad máxima de 3 niveles', async () => {
    const mockShares: any = {
      assertFolderAccess: async () => ({ hasAccess: true, permission: FolderPermission.EDIT, folder: level3Folder }),
    };
    const mockRepo: any = {
      findFolderById: async (id: string) => {
        if (id === level3Folder.id) return level3Folder;
        if (id === level2Folder.id) return level2Folder;
        if (id === rootManagerFolder.id) return rootManagerFolder;
        return null;
      },
    };

    const hierarchy = new FoldersHierarchyService(mockRepo, mockShares);
    await assert.rejects(
      async () =>
        hierarchy.validateAndResolveHierarchy(
          level3Folder.id,
          FolderType.IMAGE,
          mockManager
        ),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'MAX_FOLDER_DEPTH_EXCEEDED');
        return true;
      }
    );
  });

  test('validar rechazo por incoherencia de tipo entre carpeta padre y subcarpeta', async () => {
    const mockShares: any = {
      assertFolderAccess: async () => ({ hasAccess: true, permission: FolderPermission.EDIT, folder: level2Folder }),
    };
    const mockRepo: any = {
      findFolderById: async (id: string) => {
        if (id === level2Folder.id) return level2Folder;
        if (id === rootManagerFolder.id) return rootManagerFolder;
        return null;
      },
    };

    const hierarchy = new FoldersHierarchyService(mockRepo, mockShares);
    await assert.rejects(
      async () =>
        hierarchy.validateAndResolveHierarchy(
          level2Folder.id,
          FolderType.TABLE,
          mockManager
        ),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_FOLDER_TYPE');
        return true;
      }
    );
  });

  test('control supremo del Manager sobre subcarpeta creada por colaborador en su árbol', async () => {
    const mockFoldersRepo: any = {
      findFolderById: async (id: string) => {
        if (id === level2Folder.id) return level2Folder;
        if (id === rootManagerFolder.id) return rootManagerFolder;
        return null;
      },
    };
    const mockSharesRepo: any = {
      findShare: async () => null,
    };
    const mockUsersRepo: any = {
      findUserById: async () => null,
    };

    const sharesService = new FoldersSharesService(mockSharesRepo, mockFoldersRepo, mockUsersRepo);
    const access = await sharesService.assertFolderAccess(level2Folder.id, mockManager, FolderPermission.EDIT);
    assert.ok(access.folder);
    assert.equal(access.permission, FolderPermission.EDIT);
  });

  test('acceso universal de lectura a la bóveda del sistema "shared" para cualquier usuario', async () => {
    const mockFoldersRepo: any = {
      findFolderById: async (id: string) => (id === sharedVaultFolder.id ? sharedVaultFolder : null),
    };
    const mockSharesRepo: any = {
      findShare: async () => null,
    };
    const mockUsersRepo: any = {
      findUserById: async () => null,
    };

    const sharesService = new FoldersSharesService(mockSharesRepo, mockFoldersRepo, mockUsersRepo);
    const access = await sharesService.assertFolderAccess(sharedVaultFolder.id, mockCollab, FolderPermission.READ);
    assert.ok(access.folder);
    assert.equal(access.permission, FolderPermission.READ);
  });

  test('rechazar modificación o eliminación de carpeta de sistema con 400 CANNOT_MODIFY_SYSTEM_FOLDER', async () => {
    const mockRepo: any = {
      findFolderById: async (id: string) => (id === sharedVaultFolder.id ? sharedVaultFolder : null),
    };
    const service = new FoldersService(mockRepo as any, {} as any, {} as any, {} as any);

    await assert.rejects(
      async () => service.updateFolder(sharedVaultFolder.id, { name: 'otro-nombre' }, mockAdmin),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'CANNOT_MODIFY_SYSTEM_FOLDER');
        return true;
      }
    );

    await assert.rejects(
      async () => service.deleteFolder(sharedVaultFolder.id, mockAdmin),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'CANNOT_MODIFY_SYSTEM_FOLDER');
        return true;
      }
    );
  });

  test('buildTree: ensambla estructura jerárquica correctamente', () => {
    const hierarchy = new FoldersHierarchyService({} as any, {} as any);
    const folders = [
      { id: '1', name: 'juan', parentId: null, type: FolderType.CONTAINER },
      { id: '2', name: 'imagenes', parentId: '1', type: FolderType.IMAGE },
      { id: '3', name: 'fotos', parentId: '2', type: FolderType.IMAGE },
      { id: '4', name: 'shared', parentId: null, type: FolderType.CONTAINER },
    ];

    const tree = hierarchy.buildTree(folders);
    assert.equal(tree.length, 2);
    const juanNode = tree.find((n) => n.id === '1');
    assert.ok(juanNode);
    assert.equal(juanNode.children.length, 1);
    assert.equal(juanNode.children[0].id, '2');
    assert.equal(juanNode.children[0].children.length, 1);
    assert.equal(juanNode.children[0].children[0].id, '3');
  });

  test('rechazar subida de archivos directos a carpeta contenedora CONTAINER', async () => {
    // 1. PdfsService
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
    );
    const mockPdfsRepo: any = {
      findFolderById: async () => rootManagerFolder,
    };
    const { PdfsService } = await import('../../../src/modules/pdfs/pdfs.service.js');
    const pdfsService = new PdfsService({} as any, {} as any, mockPdfsRepo, {} as any);
    await assert.rejects(
      async () => pdfsService.uploadPdf(validPdfBuffer, 'test.pdf', rootManagerFolder.id, mockManager),
      (err: any) => {
        assert.equal(err.code, 'CANNOT_UPLOAD_TO_CONTAINER_FOLDER');
        assert.equal(err.status, 400);
        return true;
      }
    );

    // 2. FormsService
    const { FormsService } = await import('../../../src/modules/forms/forms.service.js');
    const mockFormShares: any = {
      assertFolderAccess: async () => ({ folder: rootManagerFolder, permission: FolderPermission.EDIT }),
    };
    const formsService = new FormsService({} as any, {} as any, mockFormShares);
    await assert.rejects(
      async () =>
        formsService.createForm(
          { title: 'F', slug: 'form-1', folderId: rootManagerFolder.id, entryFieldsSchema: [] },
          mockManager
        ),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'CANNOT_UPLOAD_TO_CONTAINER_FOLDER');
        return true;
      }
    );
  });
});
