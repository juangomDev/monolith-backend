import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationsListener } from '../../../src/modules/notifications/notifications.listener.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo Notificaciones: NotificationsListener (Desacoplamiento de Eventos)', () => {
  it('handleFormEntryCreated: genera notificaciones y difunde por SSE a suscriptores', async () => {
    const sentSse: any[] = [];
    let createdBatch: any[] = [];

    const mockRepo: any = {
      findFormSubscribers: async () => [{ userId: 'user-sub-1' }],
      createManyNotifications: async (entries: any[]) => {
        createdBatch = entries.map((e, idx) => ({ ...e, id: `notif-${idx}`, read: false, createdAt: new Date() }));
        return createdBatch;
      },
    };

    const mockSse: any = {
      sendToUser: (userId: string, event: string, data: any) => {
        sentSse.push({ userId, event, data });
        return true;
      },
    };

    // Mock folder lookup
    const origFolderFind = prisma.folder.findUnique;
    const origUserFindMany = prisma.user.findMany;

    (prisma.folder as any).findUnique = async () => ({ userId: 'owner-uuid' });
    (prisma.user as any).findMany = async () => [{ id: 'user-sub-1' }, { id: 'owner-uuid' }];

    try {
      const listener = new NotificationsListener(mockRepo, mockSse);
      await listener.handleFormEntryCreated({
        formId: 'form-1',
        formSlug: 'contacto',
        formTitle: 'Contacto Web',
        folderId: 'folder-1',
        entryId: 'entry-123',
        entryPayload: { name: 'Juan' },
        createdAt: new Date(),
      });

      assert.equal(createdBatch.length, 2);
      assert.equal(createdBatch[0].type, 'FORM_ENTRY_NEW');
      assert.equal(sentSse.length, 2);
    } finally {
      prisma.folder.findUnique = origFolderFind;
      prisma.user.findMany = origUserFindMany;
    }
  });

  it('handleFormEntryResolved: genera notificaciones excluyendo al propio operador que resolvió', async () => {
    let createdBatch: any[] = [];
    const mockRepo: any = {
      findFormSubscribers: async () => [
        { userId: 'user-sub-1' },
        { userId: 'operator-who-resolved' },
      ],
      createManyNotifications: async (entries: any[]) => {
        createdBatch = entries.map((e, idx) => ({ ...e, id: `notif-${idx}`, read: false, createdAt: new Date() }));
        return createdBatch;
      },
    };

    const mockSse: any = {
      sendToUser: () => true,
    };

    const origUserFindMany = prisma.user.findMany;
    (prisma.user as any).findMany = async () => [{ id: 'user-sub-1' }];

    try {
      const listener = new NotificationsListener(mockRepo, mockSse);
      await listener.handleFormEntryResolved({
        formId: 'form-1',
        formSlug: 'contacto',
        formTitle: 'Contacto Web',
        folderId: 'folder-1',
        entryId: 'entry-123',
        status: 'VALID',
        resolvedById: 'operator-who-resolved',
        resolvedAt: new Date(),
      });

      assert.equal(createdBatch.length, 1);
      assert.equal(createdBatch[0].userId, 'user-sub-1');
      assert.equal(createdBatch[0].type, 'FORM_ENTRY_RESOLVED');
    } finally {
      prisma.user.findMany = origUserFindMany;
    }
  });
});

