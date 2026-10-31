import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { Readable } from 'node:stream';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Imágenes: Rutas HTTP', () => {
  afterEach(() => {
    mock.reset();
  });

  const validKey = 'mk_live_valid_test_api_key_12345';
  const validUuid = '22222222-3333-4444-8555-666666666666';

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

  it('POST /api/v1/images: retorna 401 si no se envía la cabecera X-API-Key', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/images',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/images: retorna 400 si se envía petición sin archivo adjunto', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/images',
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  it('GET /i/:short_code: es público y retorna 404 si el recurso no existe', async () => {
    mock.method(imagesService, 'getImageFileByShortCode', async () => {
      const { AppError } = await import('../../../src/shared/errors.js');
      throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/i/inexistente',
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'NOT_FOUND');
  });

  it('GET /i/:short_code: sirve binario con cabeceras Content-Type y Cache-Control inmutable', async () => {
    const fakeStream = Readable.from([Buffer.from('imagen-mock-en-binario')]);

    mock.method(imagesService, 'getImageFileByShortCode', async () => ({
      record: {
        id: validUuid,
        shortCode: 'abc1234XYZ',
        originalName: 'foto.png',
        mimeType: 'image/png',
        sizeBytes: 22,
        storagePath: '/fake/path/foto.png',
        createdAt: new Date(),
      },
      fileStream: fakeStream,
    }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/i/abc1234XYZ',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['content-type'], 'image/png');
    assert.strictEqual(response.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.strictEqual(response.body, 'imagen-mock-en-binario');
  });

  it('DELETE /api/v1/images/:id: retorna 401 sin API Key', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/images/${validUuid}`,
    });

    assert.strictEqual(response.statusCode, 401);
  });

  it('DELETE /api/v1/images/:id: retorna 400 con UUID inválido', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/images/no-es-un-uuid',
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_ID');
  });

  it('DELETE /api/v1/images/:id: retorna 204 tras eliminación exitosa', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'deleteImage', async () => ({ deleted: true }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/images/${validUuid}`,
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 204);
  });

  it('GET /api/v1/images: retorna 401 si no se envía cabecera de autenticación', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/images',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('GET /api/v1/images: retorna 200 y lista de imágenes cuando la autenticación es válida', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'listImages', async () => ({
      images: [
        {
          id: validUuid,
          shortCode: 'abc1234XYZ',
          url: 'http://localhost:3000/i/abc1234XYZ',
          originalName: 'foto.png',
          mimeType: 'image/png',
          sizeBytes: 22,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/images',
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.total, 1);
    assert.strictEqual(body.images.length, 1);
    assert.strictEqual(body.images[0].shortCode, 'abc1234XYZ');
  });

  it('GET /i/:short_code?variant=thumb: sirve miniatura con Content-Type image/webp', async () => {
    const fakeStream = Readable.from([Buffer.from('fake-thumb-webp-binary')]);

    mock.method(imagesService, 'getImageFileByShortCode', async (_code: string, variant?: string) => {
      assert.strictEqual(variant, 'thumb');
      return {
        fileStream: fakeStream,
        mimeType: 'image/webp',
        isThumb: true,
      };
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/i/abc1234XYZ?variant=thumb',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['content-type'], 'image/webp');
    assert.strictEqual(response.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.strictEqual(response.body, 'fake-thumb-webp-binary');
  });

  it('PATCH /api/v1/images/:id: retorna 401 si no se envía cabecera de autenticación', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validUuid}`,
      payload: { originalName: 'nuevo-nombre.png' },
    });

    assert.strictEqual(response.statusCode, 401);
  });

  it('PATCH /api/v1/images/:id: retorna 400 si originalName es inválido o vacío', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validUuid}`,
      headers: { 'x-api-key': validKey },
      payload: { originalName: '' },
    });

    assert.strictEqual(response.statusCode, 400);
  });

  it('PATCH /api/v1/images/:id: retorna 403 si el usuario carece de permisos (anti-IDOR)', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'renameImage', async () => {
      throw new AppError(403, 'No tienes permisos para modificar imágenes en esta carpeta', 'FORBIDDEN');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validUuid}`,
      headers: { 'x-api-key': validKey },
      payload: { originalName: 'hack.png' },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
  });

  it('PATCH /api/v1/images/:id: retorna 200 y el registro actualizado', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'renameImage', async (_id: string, name: string) => ({
      id: validUuid,
      shortCode: 'abc1234XYZ',
      url: 'http://localhost:3000/i/abc1234XYZ',
      urlWithVersion: 'http://localhost:3000/i/abc1234XYZ?v=123456',
      originalName: name,
      mimeType: 'image/png',
      sizeBytes: 2048,
      width: 400,
      height: 300,
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/images/${validUuid}`,
      headers: { 'x-api-key': validKey },
      payload: { originalName: 'logo-actualizado.png' },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.originalName, 'logo-actualizado.png');
    assert.strictEqual(body.id, validUuid);
  });

  it('PUT /api/v1/images/:id: retorna 401 si no se envía autenticación', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/images/${validUuid}`,
    });

    assert.strictEqual(response.statusCode, 401);
  });

  it('PUT /api/v1/images/:id: retorna 400 si no se adjunta archivo', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/images/${validUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(response.statusCode, 400);
  });

  it('PUT /api/v1/images/:id: retorna 200 al reemplazar archivo binario con éxito', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'replaceImageFile', async () => ({
      id: validUuid,
      shortCode: 'abc1234XYZ',
      url: 'http://localhost:3000/i/abc1234XYZ',
      urlWithVersion: 'http://localhost:3000/i/abc1234XYZ?v=999999',
      originalName: 'nuevo-logo.png',
      mimeType: 'image/png',
      sizeBytes: 4096,
      width: 500,
      height: 500,
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const boundary = '----WebKitFormBoundaryTestReplace';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="nuevo-logo.png"',
      'Content-Type: image/png',
      '',
      'fake-png-binary-content-replacement',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const app = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/images/${validUuid}`,
      headers: {
        'x-api-key': validKey,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    assert.strictEqual(response.statusCode, 200);
    const resBody = JSON.parse(response.body);
    assert.strictEqual(resBody.originalName, 'nuevo-logo.png');
    assert.strictEqual(resBody.shortCode, 'abc1234XYZ');
    assert.strictEqual(resBody.sizeBytes, 4096);
  });

  it('DELETE /api/v1/images/:id: retorna 403 si el usuario carece de permisos (anti-IDOR)', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'deleteImage', async () => {
      throw new AppError(403, 'No tienes permisos para eliminar imágenes en esta carpeta', 'FORBIDDEN');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/images/${validUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
  });

  it('GET /api/v1/images: soporta filtros de paginación y folderId', async () => {
    mockValidAuthClient();
    mock.method(imagesService, 'listImages', async (opts: any) => {
      assert.strictEqual(opts.page, 3);
      assert.strictEqual(opts.limit, 15);
      assert.strictEqual(opts.folderId, 'folder-xyz');
      return {
        images: [],
        total: 0,
        page: 3,
        limit: 15,
        totalPages: 1,
        meta: { page: 3, limit: 15, total: 0, totalPages: 1, hasNext: false },
      };
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/images?page=3&limit=15&folderId=folder-xyz',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.meta.page, 3);
    assert.strictEqual(body.meta.limit, 15);
  });
});
