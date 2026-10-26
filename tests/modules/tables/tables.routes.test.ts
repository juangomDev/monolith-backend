import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { Readable } from 'node:stream';

describe('Módulo Tablas: Rutas HTTP', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const validUuid = '44444444-5555-4666-8777-888888888888';

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

  it('POST /api/v1/tables: retorna 401 si no se envía la cabecera X-API-Key', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tables',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/tables: retorna 400 si se envía petición sin multipart', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tables',
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  it('GET /t/:short_code: es público y retorna 404 si la tabla no existe', async () => {
    mock.method(tablesService, 'getTableDataPaginated', async () => {
      const { AppError } = await import('../../../src/shared/errors.js');
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/t/inexistente',
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'NOT_FOUND');
  });

  it('GET /t/:short_code: responde 200 con datos paginados y metadatos por defecto', async () => {
    mock.method(tablesService, 'getTableDataPaginated', async (_code: string, page: number, limit: number) => ({
      id: validUuid,
      shortCode: 'tabla12345',
      tableName: 'reporte.csv',
      columns: ['id', 'producto', 'monto'],
      data: [{ id: '1', producto: 'Laptop', monto: '1200' }],
      meta: {
        page,
        limit,
        total: 1,
        totalPages: 1,
        hasNext: false,
      },
    }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/t/tabla12345?page=1&limit=50',
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.shortCode, 'tabla12345');
    assert.strictEqual(body.tableName, 'reporte.csv');
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.meta.page, 1);
    assert.strictEqual(body.meta.limit, 50);
  });

  it('GET /t/:short_code?download=true: entrega el archivo con cabecera Content-Disposition', async () => {
    const fakeStream = Readable.from([Buffer.from('id,producto\n1,Teclado\n')]);

    mock.method(tablesService, 'getTableDownloadStream', async () => ({
      record: {
        id: validUuid,
        shortCode: 'tablaDescarga',
        tableName: 'catalogo.csv',
        rowCount: 1,
        columnsSchema: ['id', 'producto'],
        sizeBytes: 25,
        storagePath: '/mock/storage/tables/catalogo.csv',
        createdAt: new Date(),
      },
      fileStream: fakeStream,
    }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/t/tablaDescarga?download=true',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['content-type'], 'text/csv');
    assert.ok(response.headers['content-disposition']?.includes('attachment; filename="catalogo.csv"'));
    assert.strictEqual(response.body, 'id,producto\n1,Teclado\n');
  });

  it('DELETE /api/v1/tables/:id: retorna 401 si no se envía X-API-Key', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tables/${validUuid}`,
    });

    assert.strictEqual(response.statusCode, 401);
  });

  it('DELETE /api/v1/tables/:id: retorna 400 con UUID inválido', async () => {
    mockValidAuthClient();

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tables/uuid-invalido',
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_ID');
  });

  it('DELETE /api/v1/tables/:id: retorna 204 tras eliminación exitosa', async () => {
    mockValidAuthClient();
    mock.method(tablesService, 'deleteTable', async () => ({ deleted: true }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tables/${validUuid}`,
      headers: {
        'x-api-key': validKey,
      },
    });

    assert.strictEqual(response.statusCode, 204);
  });
});
