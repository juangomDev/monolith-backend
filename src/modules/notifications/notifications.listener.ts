import { eventBus, type FormEntryCreatedEvent, type FormEntryResolvedEvent } from '../../shared/event-bus.js';
import { notificationsRepository, type NotificationsRepository } from './notifications.repository.js';
import { notificationsSse, type NotificationsSseManager } from './notifications.sse.js';
import { prisma } from '../../config/db.js';

export class NotificationsListener {
  constructor(
    private repo: NotificationsRepository = notificationsRepository,
    private sse: NotificationsSseManager = notificationsSse
  ) {}

  registerListeners(): void {
    eventBus.onEvent('form.entry.created', async (evt) => {
      await this.handleFormEntryCreated(evt);
    });

    eventBus.onEvent('form.entry.resolved', async (evt) => {
      await this.handleFormEntryResolved(evt);
    });
  }

  async handleFormEntryCreated(evt: FormEntryCreatedEvent): Promise<void> {
    const subscribers = await this.repo.findFormSubscribers(evt.formId, 'NEW_ENTRY');
    const subscriberUserIds = new Set(subscribers.map((s) => s.userId));

    // Incluimos al dueño de la carpeta si no está ya presente
    const folder = await prisma.folder.findUnique({
      where: { id: evt.folderId },
      select: { userId: true },
    });
    if (folder?.userId) {
      subscriberUserIds.add(folder.userId);
    }

    if (subscriberUserIds.size === 0) return;

    // Verificamos que los usuarios estén activos
    const activeUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(subscriberUserIds) }, isActive: true },
      select: { id: true },
    });

    const entriesToCreate = activeUsers.map((u) => ({
      userId: u.id,
      title: 'Nueva respuesta recibida',
      message: `Se ha registrado una nueva respuesta en el formulario "${evt.formTitle}".`,
      type: 'FORM_ENTRY_NEW',
      resourceId: evt.entryId,
    }));

    const createdNotifications = await this.repo.createManyNotifications(entriesToCreate);

    for (const notif of createdNotifications) {
      this.sse.sendToUser(notif.userId, 'notification', notif);
    }
  }

  async handleFormEntryResolved(evt: FormEntryResolvedEvent): Promise<void> {
    const subscribers = await this.repo.findFormSubscribers(evt.formId, 'RESOLUTION');
    const targetUserIds = new Set(
      subscribers
        .map((s) => s.userId)
        .filter((uid) => uid !== evt.resolvedById) // No notificar al propio operador que acaba de resolver
    );

    if (targetUserIds.size === 0) return;

    const activeUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(targetUserIds) }, isActive: true },
      select: { id: true },
    });

    const entriesToCreate = activeUsers.map((u) => ({
      userId: u.id,
      title: 'Respuesta de formulario resuelta',
      message: `La entrada del formulario "${evt.formTitle}" fue resuelta como "${evt.status}".`,
      type: 'FORM_ENTRY_RESOLVED',
      resourceId: evt.entryId,
    }));

    const createdNotifications = await this.repo.createManyNotifications(entriesToCreate);

    for (const notif of createdNotifications) {
      this.sse.sendToUser(notif.userId, 'notification', notif);
    }
  }
}

export const notificationsListener = new NotificationsListener();

