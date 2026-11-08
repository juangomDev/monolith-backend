import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { notificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Notificaciones: Rutas HTTP Fastify (/api/v1/notifications & forms subscription)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const notifUuid = '11111111-1111-4111-8111-111111111111';
  const formUuid = '22222222-2222-4222-8222-222222222222';

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

  it('GET /api/v1/notifications: rechaza 401 si no hay credenciales', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('GET /api/v1/notifications: retorna 200 con listado paginado', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'listNotifications', async () => ({
      data: [{ id: notifUuid, title: 'Alerta', message: 'Mensaje', type: 'FORM_ENTRY_NEW', read: false, createdAt: new Date() }],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=1&limit=20',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].id, notifUuid);
  });

  it('GET /api/v1/notifications/unread-count: retorna conteo de no leídas', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'getUnreadCount', async () => ({ unreadCount: 3 }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().unreadCount, 3);
  });

  it('PATCH /api/v1/notifications/:id/read: marca individual como leída', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'markAsRead', async () => ({
      id: notifUuid,
      userId: 'client-test-id',
      title: 'Alerta',
      message: 'Mensaje',
      type: 'FORM_ENTRY_NEW',
      read: true,
      createdAt: new Date(),
    }));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${notifUuid}/read`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().read, true);
  });

  it('PATCH /api/v1/notifications/read-all: marca todas como leídas', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'markAllAsRead', async () => ({ updatedCount: 4 }));

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/read-all',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().updatedCount, 4);
  });

  it('DELETE /api/v1/notifications/:id: elimina notificación', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'deleteNotification', async () => ({ success: true }));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/notifications/${notifUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().success, true);
  });

  it('POST /api/v1/forms/:id/subscribe: registra suscripción a alertas de formulario', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'subscribeToForm', async () => ({
      id: 'sub-uuid',
      userId: 'client-test-id',
      formId: formUuid,
      notifyOnNewEntry: true,
      notifyOnResolution: false,
      createdAt: new Date(),
    }));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/forms/${formUuid}/subscribe`,
      headers: { 'x-api-key': validKey },
      payload: { notifyOnNewEntry: true, notifyOnResolution: false },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().notifyOnNewEntry, true);
  });

  it('DELETE /api/v1/forms/:id/subscribe: cancela suscripción', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'unsubscribeFromForm', async () => ({ success: true }));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/forms/${formUuid}/subscribe`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().success, true);
  });

  it('GET /api/v1/forms/:id/subscription: consulta estado de suscripción', async () => {
    mockValidAuthClient();
    const app = await buildApp();

    mock.method(notificationsService, 'getSubscription', async () => ({
      subscribed: true,
      subscription: { id: 'sub-uuid', notifyOnNewEntry: true, notifyOnResolution: false },
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formUuid}/subscription`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().subscribed, true);
  });
});

