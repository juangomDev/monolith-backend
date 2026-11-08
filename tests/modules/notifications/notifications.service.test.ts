import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { Role, FolderPermission } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Notificaciones: NotificationsService (Casos de Uso)', () => {
  const caller = { id: 'user-uuid-1', role: Role.MANAGER };

  const fakeNotification = {
    id: 'notif-1',
    userId: 'user-uuid-1',
    title: 'Nueva respuesta recibida',
    message: 'Se ha registrado una nueva respuesta',
    type: 'FORM_ENTRY_NEW',
    resourceId: 'entry-1',
    read: false,
    createdAt: new Date(),
  };

  const fakeForm = {
    id: 'form-1',
    folderId: 'folder-1',
    slug: 'contacto',
    title: 'Contacto',
  };

  it('listNotifications: retorna lista paginada y metadatos', async () => {
    const mockRepo: any = {
      findManyByUser: async (_userId: string, opts: any) => ({
        data: [fakeNotification],
        meta: { total: 1, page: opts.page || 1, limit: 20, totalPages: 1 },
      }),
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    const result = await service.listNotifications(caller.id, { page: 1 });

    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].id, 'notif-1');
  });

  it('getUnreadCount: retorna el conteo de no leídas', async () => {
    const mockRepo: any = {
      countUnreadByUser: async () => 4,
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    const result = await service.getUnreadCount(caller.id);

    assert.equal(result.unreadCount, 4);
  });

  it('markAsRead: marca notificación exitosamente si existe', async () => {
    const mockRepo: any = {
      markAsRead: async (id: string, userId: string) => ({
        ...fakeNotification,
        id,
        userId,
        read: true,
      }),
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    const result = await service.markAsRead('notif-1', caller.id);

    assert.equal(result.read, true);
  });

  it('markAsRead: lanza 404 NOTIFICATION_NOT_FOUND si no existe la notificación', async () => {
    const mockRepo: any = {
      markAsRead: async () => null,
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    await assert.rejects(
      () => service.markAsRead('notif-inexistente', caller.id),
      (err: any) => err instanceof AppError && err.status === 404 && err.code === 'NOTIFICATION_NOT_FOUND'
    );
  });

  it('markAllAsRead: actualiza todas y devuelve updatedCount', async () => {
    const mockRepo: any = {
      markAllAsRead: async () => 5,
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    const result = await service.markAllAsRead(caller.id);

    assert.equal(result.updatedCount, 5);
  });

  it('deleteNotification: elimina si existe o lanza 404', async () => {
    const mockRepo: any = {
      deleteNotification: async (_id: string) => true,
    };

    const service = new NotificationsService(mockRepo, {} as any, {} as any, {} as any);
    const result = await service.deleteNotification('notif-1', caller.id);
    assert.equal(result.success, true);

    mockRepo.deleteNotification = async () => false;
    await assert.rejects(
      () => service.deleteNotification('notif-1', caller.id),
      (err: any) => err instanceof AppError && err.status === 404
    );
  });

  it('subscribeToForm: valida acceso a carpeta y registra suscripción', async () => {
    const mockFormsRepo: any = {
      findFormById: async () => fakeForm,
    };
    let checkedPermission = false;
    const mockShares: any = {
      assertFolderAccess: async () => {
        checkedPermission = true;
        return { permission: FolderPermission.READ };
      },
    };
    const mockRepo: any = {
      upsertSubscription: async (userId: string, formId: string, data: any) => ({
        id: 'sub-1',
        userId,
        formId,
        notifyOnNewEntry: data.notifyOnNewEntry ?? true,
        notifyOnResolution: data.notifyOnResolution ?? false,
      }),
    };

    const service = new NotificationsService(mockRepo, {} as any, mockShares, mockFormsRepo);
    const result = await service.subscribeToForm(caller.id, 'form-1', { notifyOnNewEntry: true }, caller);

    assert.equal(checkedPermission, true);
    assert.equal(result.notifyOnNewEntry, true);
  });

  it('unsubscribeFromForm: cancela suscripción existente', async () => {
    const mockFormsRepo: any = { findFormById: async () => fakeForm };
    const mockShares: any = { assertFolderAccess: async () => ({ permission: FolderPermission.READ }) };
    const mockRepo: any = { deleteSubscription: async () => true };

    const service = new NotificationsService(mockRepo, {} as any, mockShares, mockFormsRepo);
    const result = await service.unsubscribeFromForm(caller.id, 'form-1', caller);

    assert.equal(result.success, true);
  });

  it('getSubscription: retorna estado suscrito o no suscrito', async () => {
    const mockFormsRepo: any = { findFormById: async () => fakeForm };
    const mockShares: any = { assertFolderAccess: async () => ({ permission: FolderPermission.READ }) };
    const mockRepo: any = { findSubscription: async () => null };

    const service = new NotificationsService(mockRepo, {} as any, mockShares, mockFormsRepo);
    const result = await service.getSubscription(caller.id, 'form-1', caller);

    assert.equal(result.subscribed, false);
    assert.equal(result.subscription, null);
  });
});

