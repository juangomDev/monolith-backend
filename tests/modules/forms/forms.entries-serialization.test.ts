import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { formsService } from '../../../src/modules/forms/forms.service.js';

describe('Módulo Formularios: Serialización completa en GET /api/v1/forms/:id/entries', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const formUuid = '33333333-3333-4333-8333-333333333333';
  const entryUuid = '44444444-4444-4444-8444-444444444444';
  const analystUuid = '55555555-5555-4555-8555-555555555555';

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

  it('preserva campos dinámicos en entryPayload, resolutionPayload y resolvedBy', async () => {
    const app = await buildApp();
    mockValidAuthClient();

    mock.method(formsService, 'listEntries', async () => ({
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false },
      entries: [
        {
          id: entryUuid,
          status: 'VALID',
          entryPayload: {
            nombres_apellidos: 'Juan Carlos Pérez',
            cedula: 'V-12345678',
            periodos: [
              {
                anio_inicio: 2016,
                anio_culminacion: 2026,
                estado: 'Miranda',
                municipio: 'Pedro Gual',
                parroquia: 'Machurucuto',
                centro_poblado: 'Machurucuto',
                institucion_educativa: 'Escuela Básica Rural',
              },
            ],
          },
          resolutionPayload: {
            numero_oficio: '15-0000001',
            observaciones: 'Aprobado',
            periodos: [{ es_rural: true, poblacion: 850, censo: '2011' }],
          },
          resolvedBy: { id: analystUuid, username: 'Arold' },
          resolvedAt: new Date('2026-11-26T12:00:00.000Z'),
          createdAt: new Date('2026-11-26T10:00:00.000Z'),
        },
      ],
    } as any));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}/entries`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.entries.length, 1);

    const entry = body.entries[0];
    assert.strictEqual(entry.entryPayload.nombres_apellidos, 'Juan Carlos Pérez');
    assert.strictEqual(entry.entryPayload.cedula, 'V-12345678');
    assert.strictEqual(entry.entryPayload.periodos.length, 1);
    assert.strictEqual(entry.entryPayload.periodos[0].estado, 'Miranda');
    assert.strictEqual(entry.resolutionPayload.numero_oficio, '15-0000001');
    assert.strictEqual(entry.resolutionPayload.periodos[0].es_rural, true);
    assert.strictEqual(entry.resolvedBy.username, 'Arold');

    await app.close();
  });

  it('mantiene resolutionPayload en null cuando la entrada sigue en estado NEW', async () => {
    const app = await buildApp();
    mockValidAuthClient();

    mock.method(formsService, 'listEntries', async () => ({
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false },
      entries: [
        {
          id: entryUuid,
          status: 'NEW',
          entryPayload: { nombres_apellidos: 'Ana Gómez', cedula: 'V-87654321', periodos: [] },
          resolutionPayload: null,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: new Date('2026-11-26T10:00:00.000Z'),
        },
      ],
    } as any));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}/entries?status=NEW`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    const entry = res.json().entries[0];
    assert.strictEqual(entry.entryPayload.cedula, 'V-87654321');
    assert.strictEqual(entry.resolutionPayload, null);
    assert.strictEqual(entry.resolvedBy, null);

    await app.close();
  });
});
