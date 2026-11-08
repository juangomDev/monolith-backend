import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { formsService } from '../../../src/modules/forms/forms.service.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Formularios: Rutas HTTP Fastify (/api/v1/forms)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const formUuid = '33333333-3333-4333-8333-333333333333';
  const entryUuid = '44444444-4444-4444-8444-444444444444';

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

  it('POST /api/v1/public/forms/:slug/entries: ruta pública registra entrada en NEW', async () => {
    const app = await buildApp();
    mock.method(formsService, 'submitEntry', async () => ({
      id: entryUuid,
      status: 'NEW',
      createdAt: new Date(),
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/forms/consulta-ciudadana/entries',
      payload: { nombre: 'Laura', email: 'laura@test.com' },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.strictEqual(body.id, entryUuid);
    assert.strictEqual(body.status, 'NEW');
  });

  it('POST /api/v1/forms: 401 si no hay autenticación', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/forms',
      payload: { slug: 'test', title: 'Test', folderId: formUuid, entryFieldsSchema: [{ name: 'a' }] },
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('POST /api/v1/forms: 201 crea formulario con autenticación', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'createForm', async () => ({
      id: formUuid,
      slug: 'nuevo-formulario',
      title: 'Nuevo Formulario',
      folderId: formUuid,
      entryFieldsSchema: [{ name: 'a' }],
      resolutionFieldsSchema: [],
      allowedResolutionStates: ['VALID', 'INVALID'],
      autoResolveWithAi: false,
      externalTargetUrl: null,
      createdAt: new Date(),
    } as any));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/forms',
      headers: { 'x-api-key': validKey },
      payload: {
        slug: 'nuevo-formulario',
        title: 'Nuevo Formulario',
        folderId: formUuid,
        entryFieldsSchema: [{ name: 'a' }],
      },
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.json().slug, 'nuevo-formulario');
  });

  it('GET /api/v1/forms: lista formularios accesibles', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'listForms', async () => [
      { id: formUuid, slug: 'form-1', title: 'F1', folderId: formUuid, _count: { entries: 5 } } as any,
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forms',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().forms.length, 1);
  });

  it('GET /api/v1/forms/:id: obtiene detalle de formulario', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'getForm', async () => ({
      id: formUuid,
      slug: 'form-1',
      title: 'F1',
      folderId: formUuid,
      entryFieldsSchema: [{ name: 'a' }],
      resolutionFieldsSchema: [],
    } as any));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().id, formUuid);
  });

  it('PATCH /api/v1/forms/entries/:id/resolve: resuelve entrada una sola vez', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'resolveEntry', async () => ({
      id: entryUuid,
      status: 'VALID',
      entryPayload: { a: '1' },
      resolutionPayload: { res: 'OK' },
      resolvedAt: new Date(),
      createdAt: new Date(),
    } as any));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/forms/entries/${entryUuid}/resolve`,
      headers: { 'x-api-key': validKey },
      payload: { status: 'VALID', resolutionPayload: { res: 'OK' } },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().status, 'VALID');
  });

  it('PATCH /api/v1/forms/entries/:id/resolve: 409 CONFLICT ante re-resolución (Write-Once)', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'resolveEntry', async () => {
      throw new AppError(409, 'La entrada del formulario ya ha sido respondida previamente', 'ENTRY_ALREADY_RESOLVED');
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/forms/entries/${entryUuid}/resolve`,
      headers: { 'x-api-key': validKey },
      payload: { status: 'INVALID', resolutionPayload: { res: 'Rechazado' } },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.json().code, 'ENTRY_ALREADY_RESOLVED');
  });

  it('POST /api/v1/forms/entries/:id/dispatch: reenvía sin tocar disco', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'dispatchEntry', async () => ({
      dispatched: true,
      targetUrl: 'https://service.local/webhook',
      entryId: entryUuid,
      dispatchedAt: new Date(),
    }));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/forms/entries/${entryUuid}/dispatch`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().dispatched, true);
  });

  it('GET /api/v1/forms/:id/entries: lista respuestas del formulario', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'listEntries', async () => ({
      total: 1,
      entries: [{ id: entryUuid, status: 'NEW', entryPayload: {}, resolutionPayload: null, createdAt: new Date() }],
    } as any));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}/entries?month=2026-03`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().total, 1);
  });

  it('GET /api/v1/forms/:id/export: descarga exportación .xlsx o .csv', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(formsService, 'exportEntries', async () => ({
      buffer: Buffer.from('id,name\n1,Carlos\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'export.csv',
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}/export?format=csv`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.body.includes('Carlos'));
  });
});

