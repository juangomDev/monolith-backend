import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { tablesMetadataService } from '../../../src/modules/tables/tables.metadata.service.js';
import { chatService } from '../../../src/modules/chat/chat.service.js';

describe('Módulo Chat: Rutas HTTP (/api/v1/chat y /api/v1/public/chat)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const validUuid = '11111111-2222-4333-8444-555555555555';

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

  // 1. PATCH /api/v1/tables/:id/metadata
  it('PATCH /api/v1/tables/:id/metadata: retorna 401 si no se envía autenticación', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${validUuid}/metadata`,
      payload: { title: 'Nuevo Título' },
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('PATCH /api/v1/tables/:id/metadata: retorna 400 si el UUID es inválido', async () => {
    mockValidAuthClient();
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tables/invalid-uuid/metadata',
      headers: { 'x-api-key': validKey },
      payload: { title: 'Nuevo Título' },
    });
    assert.strictEqual(res.statusCode, 400);
  });

  it('PATCH /api/v1/tables/:id/metadata: retorna 200 y actualiza ficha técnica exitosamente', async () => {
    mockValidAuthClient();
    mock.method(tablesMetadataService, 'updateMetadata', async () => ({
      id: validUuid,
      shortCode: 'short12345',
      metadataCard: {
        title: 'Censo Actualizado',
        description: 'Datos 2026',
        tags: ['censo'],
        unit: 'habitantes',
        columnsMeta: { total: 'Total' },
        hasSummaryRows: false,
      },
    }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${validUuid}/metadata`,
      headers: { 'x-api-key': validKey },
      payload: {
        title: 'Censo Actualizado',
        description: 'Datos 2026',
        tags: ['censo'],
        unit: 'habitantes',
        columnsMeta: { total: 'Total' },
        hasSummaryRows: false,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.id, validUuid);
    assert.strictEqual(body.metadataCard.title, 'Censo Actualizado');
  });

  // 2. POST /api/v1/chat/ask (Interno con RBAC)
  it('POST /api/v1/chat/ask: retorna 401 si no está autenticado', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/ask',
      payload: { question: '¿Población total?' },
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('POST /api/v1/chat/ask: retorna 400 si la pregunta tiene menos de 3 caracteres', async () => {
    mockValidAuthClient();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/ask',
      headers: { 'x-api-key': validKey },
      payload: { question: 'no' },
    });
    assert.strictEqual(res.statusCode, 400);
  });

  it('POST /api/v1/chat/ask: responde exitosamente con 200 y estructura ChatAnswer', async () => {
    mockValidAuthClient();
    mock.method(chatService, 'askInternal', async () => ({
      answer: 'En Colombia hay 50M de habitantes.',
      foundInSystem: true,
      sources: [{ tableId: validUuid, tableName: 'censo.csv', shortCode: 'col123' }],
      chartData: { labels: ['Hombres', 'Mujeres'], values: [24, 26], percentages: [48, 52] },
    }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/ask',
      headers: { 'x-api-key': validKey },
      payload: { question: '¿Cuál es la población de Colombia?' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.foundInSystem, true);
    assert.ok(body.answer.includes('Colombia'));
    assert.strictEqual(body.sources.length, 1);
  });

  // 3. POST /api/v1/public/chat/ask (Público / Widget)
  it('POST /api/v1/public/chat/ask: es público y responde 200 sin credenciales', async () => {
    mock.method(chatService, 'askPublic', async () => ({
      answer: 'La información solicitada no existe en los archivos registrados en este sistema.',
      foundInSystem: false,
      sources: [],
      chartData: null,
    }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/chat/ask',
      payload: { question: '¿Cuántos habitantes hay en Marte?' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.foundInSystem, false);
    assert.strictEqual(body.answer, 'La información solicitada no existe en los archivos registrados en este sistema.');
  });

  // 4. GET /api/v1/public/chat/suggestions
  it('GET /api/v1/public/chat/suggestions: retorna 200 con sugerencias dinámicas', async () => {
    mock.method(chatService, 'getPublicSuggestions', async () => ({
      suggestions: ['¿Cuál es la población total de Brasil?'],
    }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/chat/suggestions',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.suggestions));
    assert.strictEqual(body.suggestions.length, 1);
  });

  // 5. Hardening 14.7: Verificación de visibilidad restringida a la bóveda de ai_manager
  it('askPublic: circuito cerrado responde foundInSystem=false si no hay carpetas compartidas con ai_manager', async () => {
    // Si la BD no tiene ai_manager o no tiene tablas compartidas con él
    const realAskPublic = chatService.askPublic.bind(chatService);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/chat/ask',
      payload: { question: '¿Cuál es el censo?' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.foundInSystem, false);
    assert.ok(body.answer.includes('no existe'));
  });
});
