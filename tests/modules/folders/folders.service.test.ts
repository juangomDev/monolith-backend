import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { foldersService } from '../../../src/modules/folders/folders.service.js';
import { foldersRepository } from '../../../src/modules/folders/folders.repository.js';
import { FolderType, Role } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Carpetas: FoldersService', () => {
  afterEach(() => {
    mock.reset();
  });

  const validFolderId = '11111111-2222-4333-8444-555555555555';
  const targetFolderId = '22222222-3333-4444-8555-666666666666';
  const ownerUserId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const otherUserId = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const validFileId = '33333333-4444-4555-8666-777777777777';

  const userRequester = { id: ownerUserId, role: Role.USER };
  const otherUserRequester = { id: otherUserId, role: Role.USER };
  const adminRequester = { id: otherUserId, role: Role.ADMIN };

  // ==========================================
  // 1. Creación de Carpetas (createFolder)
  // ==========================================
  it('createFolder: debe rechazar si el nombre tiene menos de 2 caracteres (400 BAD_REQUEST)', async () => {
    await assert.rejects(
      async () => {
        await foldersService.createFolder(
          { name: 'a', type: 'IMAGE' },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'BAD_REQUEST');
        return true;
      }
    );
  });

  it('createFolder: debe rechazar si el nombre excede 60 caracteres (400 BAD_REQUEST)', async () => {
    await assert.rejects(
      async () => {
        await foldersService.createFolder(
          { name: 'x'.repeat(61), type: 'IMAGE' },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'BAD_REQUEST');
        return true;
      }
    );
  });

  it('createFolder: debe rechazar si el tipo de carpeta es inválido (400 BAD_REQUEST)', async () => {
    await assert.rejects(
      async () => {
        await foldersService.createFolder(
          { name: 'Carpeta Inválida', type: 'VIDEO' },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'BAD_REQUEST');
        return true;
      }
    );
  });

  it('createFolder: debe rechazar si el formato de color hexadecimal es inválido (400 BAD_REQUEST)', async () => {
    await assert.rejects(
      async () => {
        await foldersService.createFolder(
          { name: 'Proyectos', type: 'IMAGE', color: 'rojo-brillante' },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'BAD_REQUEST');
        return true;
      }
    );
  });

  it('createFolder: debe crear una carpeta pública correctamente', async () => {
    mock.method(foldersRepository, 'createFolder', async (data: any) => ({
      id: validFolderId,
      name: data.name,
      type: data.type,
      color: data.color ?? null,
      isPrivate: data.isPrivate,
      userId: data.userId,
      createdAt: new Date(),
    }));

    const result = await foldersService.createFolder(
      { name: 'Galería Pública', type: 'IMAGE', color: '#3b82f6', isPrivate: false },
      userRequester
    );

    assert.strictEqual(result.id, validFolderId);
    assert.strictEqual(result.name, 'Galería Pública');
    assert.strictEqual(result.type, FolderType.IMAGE);
    assert.strictEqual(result.color, '#3b82f6');
    assert.strictEqual(result.isPrivate, false);
    assert.strictEqual(result.itemCount, 0);
    assert.strictEqual(result.userId, ownerUserId);
  });

  it('createFolder: debe crear una carpeta privada correctamente', async () => {
    mock.method(foldersRepository, 'createFolder', async (data: any) => ({
      id: validFolderId,
      name: data.name,
      type: data.type,
      color: data.color ?? null,
      isPrivate: data.isPrivate,
      userId: data.userId,
      createdAt: new Date(),
    }));

    const result = await foldersService.createFolder(
      { name: 'Finanzas Privadas', type: 'TABLE', color: '#10b981', isPrivate: true },
      userRequester
    );

    assert.strictEqual(result.id, validFolderId);
    assert.strictEqual(result.isPrivate, true);
    assert.strictEqual(result.type, FolderType.TABLE);
  });

  // ==========================================
  // 2. Listado de Carpetas (listFolders)
  // ==========================================
  it('listFolders: usuario con rol USER recibe solo carpetas públicas y privadas propias', async () => {
    const mockFolders = [
      {
        id: validFolderId,
        name: 'Pública Compartida',
        type: FolderType.IMAGE,
        color: null,
        isPrivate: false,
        userId: otherUserId,
        createdAt: new Date(),
        _count: { images: 3, tables: 0 },
        user: { id: otherUserId, username: 'other' },
      },
      {
        id: targetFolderId,
        name: 'Privada Propia',
        type: FolderType.IMAGE,
        color: '#ff0000',
        isPrivate: true,
        userId: ownerUserId,
        createdAt: new Date(),
        _count: { images: 5, tables: 0 },
        user: { id: ownerUserId, username: 'owner' },
      },
    ];

    mock.method(foldersRepository, 'findFolders', async (filter: any) => {
      assert.strictEqual(filter.isAdmin, false);
      assert.strictEqual(filter.userId, ownerUserId);
      return mockFolders;
    });

    const result = await foldersService.listFolders(userRequester);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.folders[0].itemCount, 3);
    assert.strictEqual(result.folders[1].itemCount, 5);
  });

  it('listFolders: usuario con rol ADMIN solicita todas las carpetas del sistema', async () => {
    mock.method(foldersRepository, 'findFolders', async (filter: any) => {
      assert.strictEqual(filter.isAdmin, true);
      return [];
    });

    const result = await foldersService.listFolders(adminRequester);
    assert.strictEqual(result.total, 0);
  });

  it('listFolders: debe soportar filtro por tipo de carpeta', async () => {
    mock.method(foldersRepository, 'findFolders', async (filter: any) => {
      assert.strictEqual(filter.type, FolderType.TABLE);
      return [];
    });

    const result = await foldersService.listFolders(userRequester, FolderType.TABLE);
    assert.strictEqual(result.total, 0);
  });

  // ==========================================
  // 3. Detalle de Carpeta (getFolderById)
  // ==========================================
  it('getFolderById: debe lanzar 404 si el id no es un UUID válido', async () => {
    await assert.rejects(
      async () => {
        await foldersService.getFolderById('no-es-uuid', userRequester);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 404);
        assert.strictEqual(err.code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('getFolderById: debe lanzar 404 si la carpeta no existe', async () => {
    mock.method(foldersRepository, 'findFolderById', async () => null);

    await assert.rejects(
      async () => {
        await foldersService.getFolderById(validFolderId, userRequester);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 404);
        return true;
      }
    );
  });

  it('getFolderById: debe lanzar 403 si la carpeta es privada y el solicitante no es dueño ni ADMIN', async () => {
    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: validFolderId,
      name: 'Super Secreta',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: true,
      userId: ownerUserId, // Pertenece a ownerUserId
      createdAt: new Date(),
      _count: { images: 0, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    await assert.rejects(
      async () => {
        // otherUserRequester intenta ver la carpeta privada de ownerUserId
        await foldersService.getFolderById(validFolderId, otherUserRequester);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('getFolderById: debe permitir a ADMIN ver carpeta privada ajena', async () => {
    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: validFolderId,
      name: 'Super Secreta',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: true,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 2, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    const result = await foldersService.getFolderById(validFolderId, adminRequester);
    assert.strictEqual(result.id, validFolderId);
    assert.strictEqual(result.name, 'Super Secreta');
    assert.strictEqual(result.itemCount, 2);
  });

  // ==========================================
  // 4. Eliminación en Cascada (deleteFolder)
  // ==========================================
  it('deleteFolder: debe lanzar 403 si un USER intenta eliminar una carpeta ajena', async () => {
    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: validFolderId,
      name: 'Carpeta Ajena',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 0, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    await assert.rejects(
      async () => {
        await foldersService.deleteFolder(validFolderId, otherUserRequester);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('deleteFolder: debe eliminar en cascada la carpeta y borrar archivos físicos en disco', async () => {
    const fakePaths = ['storage/test-img1.webp', 'storage/test-img2.webp'];

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: validFolderId,
      name: 'Para Borrar',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 2, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    mock.method(foldersRepository, 'deleteFolderWithFiles', async () => ({
      deletedFolder: { id: validFolderId } as any,
      storagePaths: fakePaths,
    }));

    let unlinkedFiles: string[] = [];
    mock.method(fs, 'unlink', async (path: string) => {
      unlinkedFiles.push(path);
    });

    const result = await foldersService.deleteFolder(validFolderId, userRequester);

    assert.strictEqual(result.deletedCount, 2);
    assert.deepStrictEqual(unlinkedFiles, fakePaths);
  });

  // ==========================================
  // 5. Reasignación de Imágenes (moveImageToFolder)
  // ==========================================
  it('moveImageToFolder: rechaza 400 si la carpeta destino es de tipo TABLE (incompatibilidad cruzada)', async () => {
    mock.method(foldersRepository, 'findImageById', async () => ({
      id: validFileId,
      shortCode: 'abc1234567',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: 'storage/foto.jpg',
      folderId: validFolderId,
      createdAt: new Date(),
    }));

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: targetFolderId,
      name: 'Carpeta de Tablas',
      type: FolderType.TABLE, // Incompatible
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 0, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    await assert.rejects(
      async () => {
        await foldersService.moveImageToFolder(
          validFileId,
          { folderId: targetFolderId },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_FOLDER_TYPE');
        return true;
      }
    );
  });

  it('moveImageToFolder: rechaza 403 si la carpeta destino es privada y no pertenece al usuario', async () => {
    mock.method(foldersRepository, 'findImageById', async () => ({
      id: validFileId,
      shortCode: 'abc1234567',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: 'storage/foto.jpg',
      folderId: validFolderId,
      createdAt: new Date(),
    }));

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: targetFolderId,
      name: 'Carpeta Privada Ajena',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: true,
      userId: otherUserId, // Pertenece a otherUserId
      createdAt: new Date(),
      _count: { images: 0, tables: 0 },
      user: { id: otherUserId, username: 'other' },
    }));

    await assert.rejects(
      async () => {
        await foldersService.moveImageToFolder(
          validFileId,
          { folderId: targetFolderId },
          userRequester
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

  it('moveImageToFolder: reasigna imagen exitosamente a carpeta compatible', async () => {
    mock.method(foldersRepository, 'findImageById', async () => ({
      id: validFileId,
      shortCode: 'abc1234567',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: 'storage/foto.jpg',
      folderId: validFolderId,
      createdAt: new Date(),
    }));

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: targetFolderId,
      name: 'Destino Imagenes',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 1, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    mock.method(foldersRepository, 'moveImageToFolder', async (imgId: string, fId: string) => ({
      id: imgId,
      shortCode: 'abc1234567',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: 'storage/foto.jpg',
      folderId: fId,
      createdAt: new Date(),
    }));

    const result = await foldersService.moveImageToFolder(
      validFileId,
      { folderId: targetFolderId },
      userRequester
    );

    assert.strictEqual(result.id, validFileId);
    assert.strictEqual(result.folderId, targetFolderId);
  });

  // ==========================================
  // 6. Reasignación de Tablas (moveTableToFolder)
  // ==========================================
  it('moveTableToFolder: rechaza 400 si la carpeta destino es de tipo IMAGE (incompatibilidad cruzada)', async () => {
    mock.method(foldersRepository, 'findTableById', async () => ({
      id: validFileId,
      shortCode: 'tab1234567',
      tableName: 'ventas.csv',
      rowCount: 100,
      columnsSchema: null,
      sizeBytes: 2048,
      storagePath: 'storage/ventas.csv',
      folderId: validFolderId,
      createdAt: new Date(),
    }));

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: targetFolderId,
      name: 'Carpeta de Imagenes',
      type: FolderType.IMAGE, // Incompatible
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 0, tables: 0 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    await assert.rejects(
      async () => {
        await foldersService.moveTableToFolder(
          validFileId,
          { folderId: targetFolderId },
          userRequester
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_FOLDER_TYPE');
        return true;
      }
    );
  });

  it('moveTableToFolder: reasigna tabla exitosamente a carpeta compatible', async () => {
    mock.method(foldersRepository, 'findTableById', async () => ({
      id: validFileId,
      shortCode: 'tab1234567',
      tableName: 'ventas.csv',
      rowCount: 100,
      columnsSchema: null,
      sizeBytes: 2048,
      storagePath: 'storage/ventas.csv',
      folderId: validFolderId,
      createdAt: new Date(),
    }));

    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: targetFolderId,
      name: 'Destino Tablas',
      type: FolderType.TABLE,
      color: null,
      isPrivate: false,
      userId: ownerUserId,
      createdAt: new Date(),
      _count: { images: 0, tables: 1 },
      user: { id: ownerUserId, username: 'owner' },
    }));

    mock.method(foldersRepository, 'moveTableToFolder', async (tblId: string, fId: string) => ({
      id: tblId,
      shortCode: 'tab1234567',
      tableName: 'ventas.csv',
      rowCount: 100,
      columnsSchema: null,
      sizeBytes: 2048,
      storagePath: 'storage/ventas.csv',
      folderId: fId,
      createdAt: new Date(),
    }));

    const result = await foldersService.moveTableToFolder(
      validFileId,
      { folderId: targetFolderId },
      userRequester
    );

    assert.strictEqual(result.id, validFileId);
    assert.strictEqual(result.folderId, targetFolderId);
  });

  // ==========================================
  // 7. Carpeta por Defecto (getOrCreateDefaultFolder)
  // ==========================================
  it('getOrCreateDefaultFolder: obtiene o crea la carpeta General', async () => {
    mock.method(foldersRepository, 'findOrCreateDefaultFolder', async (userId: string, type: FolderType) => ({
      id: validFolderId,
      name: 'General',
      type,
      color: null,
      isPrivate: false,
      userId,
      createdAt: new Date(),
    }));

    const folder = await foldersService.getOrCreateDefaultFolder(ownerUserId, FolderType.IMAGE);

    assert.strictEqual(folder.name, 'General');
    assert.strictEqual(folder.type, FolderType.IMAGE);
    assert.strictEqual(folder.isPrivate, false);
    assert.strictEqual(folder.userId, ownerUserId);
  });
});
