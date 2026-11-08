import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';

describe('Shared / Core: Filtrado por Texto (?search=)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
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

  it('GET /api/v1/images?search=logo: transmite el término de búsqueda al servicio', async () => {
    mockValidAuthClient();
    let capturedOptions: any = null;

    mock.method(imagesService, 'listImages', async (options: any) => {
      capturedOptions = options;
      return {
        images: [
          {
            id: '11111111-2222-3333-4444-555555555555',
            shortCode: 'logo123456',
            url: 'http://localhost:3000/i/logo123456',
            urlWithVersion: 'http://localhost:3000/i/logo123456?v=1',
            originalName: 'empresa_logo.png',
            mimeType: 'image/png',
            sizeBytes: 1024,
            width: 200,
            height: 200,
            folderId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false },
      };
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/images?search=logo',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(capturedOptions?.search, 'logo');
    const body = JSON.parse(res.body);
    assert.strictEqual(body.images.length, 1);
    assert.strictEqual(body.images[0].originalName, 'empresa_logo.png');
  });

  it('GET /api/v1/tables?search=ventas: transmite el término de búsqueda al servicio', async () => {
    mockValidAuthClient();
    let capturedOptions: any = null;

    mock.method(tablesService, 'listTables', async (options: any) => {
      capturedOptions = options;
      return {
        tables: [
          {
            id: '22222222-3333-4444-5555-666666666666',
            shortCode: 'tabVentas1',
            url: 'http://localhost:3000/t/tabVentas1',
            urlWithVersion: 'http://localhost:3000/t/tabVentas1?v=1',
            tableName: 'ventas_anuales.xlsx',
            rowCount: 500,
            columns: ['mes', 'ingreso'],
            sizeBytes: 2048,
            metadataCard: null,
            folderId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false },
      };
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tables?search=ventas',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(capturedOptions?.search, 'ventas');
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tables.length, 1);
    assert.strictEqual(body.tables[0].tableName, 'ventas_anuales.xlsx');
  });
});

