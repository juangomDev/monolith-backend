import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { Readable } from 'node:stream';

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
});
