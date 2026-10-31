import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { foldersService } from '../../../src/modules/folders/folders.service.js';
import { FolderType, Role } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Carpetas: Rutas HTTP (/api/v1/folders, /api/v1/images/:id/folder, /api/v1/tables/:id/folder)', () => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUserFindFirst = prisma.user.findFirst;
  const originalApiClientFindUnique = prisma.apiClient.findUnique;

  afterEach(() => {
    (prisma.user as any).findUnique = originalUserFindUnique;
    (prisma.user as any).findFirst = originalUserFindFirst;
    (prisma.apiClient as any).findUnique = originalApiClientFindUnique;
    mock.reset();
  });

  const validFolderId = '11111111-2222-4333-8444-555555555555';
  const targetFolderId = '22222222-3333-4444-8555-666666666666';
  const testUserId = '33333333-4444-4555-8666-777777777777';
  const validFileId = '44444444-5555-4666-8777-888888888888';
  const validApiKey = 'mk_live_valid_test_api_key_folders';

  function mockDbUser(user: { id: string; username: string; role: Role; isActive?: boolean; tokenVersion?: number }) {
    (prisma.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === user.id || where?.username === user.username) {
        return {
          id: user.id,
          username: user.username,
          role: user.role,
          isActive: user.isActive ?? true,
          tokenVersion: user.tokenVersion ?? 0,
        };
      }
      return null;
    };
  }

  function mockDbApiKeyClient() {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'api-client-folder-id',
      name: 'Cliente Integrado Carpetas',
      keyPrefix: 'mk_live_valid_test',
      keyHash: 'fake_hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });

    (prisma.user as any).findFirst = async () => ({
      id: 'admin-uuid-1',
      username: 'admin',
      role: Role.ADMIN,
      isActive: true,
    });
  }

  // ==========================================
  // 1. Autenticación y Autorización
  // ==========================================
  it('GET /api/v1/folders: retorna 401 si no se envía cabecera de autenticación', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  // ==========================================
  // 2. GET /api/v1/folders (Listado)
  // ==========================================
  it('GET /api/v1/folders: retorna 200 con listado de carpetas para usuario autenticado', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'listFolders', async () => ({
      folders: [
        {
          id: validFolderId,
          name: 'Mis Fotos',
          type: FolderType.IMAGE,
          color: '#3b82f6',
          isPrivate: false,
          itemCount: 4,
          userId: testUserId,
          createdAt: new Date(),
        },
      ],
      total: 1,
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.total, 1);
    assert.strictEqual(body.folders[0].name, 'Mis Fotos');
  });

  it('GET /api/v1/folders: admite autenticación dual mediante X-API-Key', async () => {
    const app = await buildApp();
    mockDbApiKeyClient();

    mock.method(foldersService, 'listFolders', async () => ({
      folders: [],
      total: 0,
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/folders?type=IMAGE',
      headers: {
        'x-api-key': validApiKey,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.total, 0);
  });

  // ==========================================
  // 3. POST /api/v1/folders (Crear)
  // ==========================================
  it('POST /api/v1/folders: retorna 201 y crea una nueva carpeta', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'createFolder', async () => ({
      id: validFolderId,
      name: 'Nueva Carpeta',
      type: FolderType.IMAGE,
      color: '#10b981',
      isPrivate: false,
      itemCount: 0,
      userId: testUserId,
      createdAt: new Date(),
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        name: 'Nueva Carpeta',
        type: 'IMAGE',
        color: '#10b981',
      },
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.folder.id, validFolderId);
    assert.strictEqual(body.folder.name, 'Nueva Carpeta');
  });

  it('POST /api/v1/folders: propaga 400 si los datos son inválidos según el esquema', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'createFolder', async () => {
      throw new AppError(400, 'El nombre debe tener al menos 2 caracteres', 'BAD_REQUEST');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        name: 'x',
        type: 'IMAGE',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  // ==========================================
  // 4. GET /api/v1/folders/:id (Detalle)
  // ==========================================
  it('GET /api/v1/folders/:id: retorna 200 con el detalle de la carpeta', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'getFolderById', async () => ({
      id: validFolderId,
      name: 'Carpeta Detallada',
      type: FolderType.TABLE,
      color: null,
      isPrivate: false,
      itemCount: 10,
      userId: testUserId,
      createdAt: new Date(),
    }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${validFolderId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.folder.id, validFolderId);
    assert.strictEqual(body.folder.itemCount, 10);
  });

  it('GET /api/v1/folders/:id: retorna 403 si la carpeta es privada y no pertenece al usuario', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'getFolderById', async () => {
      throw new AppError(403, 'Acceso denegado a esta carpeta privada', 'FORBIDDEN');
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${validFolderId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
  });

  it('GET /api/v1/folders/:id: retorna 404 si la carpeta no existe', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'getFolderById', async () => {
      throw new AppError(404, 'Carpeta no encontrada', 'NOT_FOUND');
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${validFolderId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'NOT_FOUND');
  });

  // ==========================================
  // 5. DELETE /api/v1/folders/:id (Eliminar)
  // ==========================================
  it('DELETE /api/v1/folders/:id: retorna 200 si la carpeta es eliminada exitosamente', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'deleteFolder', async () => ({
      message: 'Carpeta y archivos asociados eliminados exitosamente',
      deletedCount: 3,
    }));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${validFolderId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.deletedCount, 3);
  });

  it('DELETE /api/v1/folders/:id: retorna 403 si el usuario intenta eliminar una carpeta ajena', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'deleteFolder', async () => {
      throw new AppError(403, 'No tienes permiso para eliminar esta carpeta', 'FORBIDDEN');
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${validFolderId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
  });

  // ==========================================
  // 6. PATCH /api/v1/images/:id/folder (Mover Imagen)
  // ==========================================
  it('PATCH /api/v1/images/:id/folder: retorna 200 tras mover la imagen a otra carpeta', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'moveImageToFolder', async () => ({
      id: validFileId,
      shortCode: 'img1234567',
      folderId: targetFolderId,
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    }));

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validFileId}/folder`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        folderId: targetFolderId,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.image.folderId, targetFolderId);
  });

  it('PATCH /api/v1/images/:id/folder: retorna 400 si se intenta mover a una carpeta incompatible de tablas', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'moveImageToFolder', async () => {
      throw new AppError(
        400,
        "Incompatibilidad de tipos: Las imágenes solo pueden moverse a carpetas de tipo 'IMAGE'",
        'INVALID_FOLDER_TYPE'
      );
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validFileId}/folder`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        folderId: targetFolderId,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_FOLDER_TYPE');
  });

  // ==========================================
  // 7. PATCH /api/v1/tables/:id/folder (Mover Tabla)
  // ==========================================
  it('PATCH /api/v1/tables/:id/folder: retorna 200 tras mover la tabla a otra carpeta', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'moveTableToFolder', async () => ({
      id: validFileId,
      shortCode: 'tab1234567',
      folderId: targetFolderId,
      tableName: 'reporte.csv',
      rowCount: 50,
      sizeBytes: 1024,
    }));

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${validFileId}/folder`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        folderId: targetFolderId,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.table.folderId, targetFolderId);
  });

  it('PATCH /api/v1/tables/:id/folder: retorna 400 si se intenta mover a una carpeta incompatible de imágenes', async () => {
    const app = await buildApp();
    mockDbUser({ id: testUserId, username: 'juan', role: Role.USER });

    const token = app.jwt.sign({
      id: testUserId,
      username: 'juan',
      role: Role.USER,
      tokenVersion: 0,
    });

    mock.method(foldersService, 'moveTableToFolder', async () => {
      throw new AppError(
        400,
        "Incompatibilidad de tipos: Las tablas solo pueden moverse a carpetas de tipo 'TABLE'",
        'INVALID_FOLDER_TYPE'
      );
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${validFileId}/folder`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        folderId: targetFolderId,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_FOLDER_TYPE');
  });
});
