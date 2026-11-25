import {
  eventBus,
  type FormEntryCreatedEvent,
  type FormEntryResolvedEvent,
  type FolderSharedEvent,
  type ResourceUploadedEvent,
  type StorageQuotaWarningEvent,
} from '../../shared/event-bus.js';
import { notificationsRepository, type NotificationsRepository } from './notifications.repository.js';
import { notificationsSse, type NotificationsSseManager } from './notifications.sse.js';
import { prisma } from '../../config/db.js';

export class NotificationsListener {
  private lastQuotaWarningAt = 0;

  constructor(
    private repo: NotificationsRepository = notificationsRepository,
    private sse: NotificationsSseManager = notificationsSse,
    private readonly quotaCooldownMs: number = 60 * 60 * 1000
  ) {}

  registerListeners(): void {
    eventBus.onEvent('form.entry.created', async (evt) => {
      await this.handleFormEntryCreated(evt);
    });

    eventBus.onEvent('form.entry.resolved', async (evt) => {
      await this.handleFormEntryResolved(evt);
    });

    eventBus.onEvent('folder.shared', async (evt) => {
      await this.handleFolderShared(evt);
    });

    eventBus.onEvent('resource.uploaded', async (evt) => {
      await this.handleResourceUploaded(evt);
    });

    eventBus.onEvent('storage.quota.warning', async (evt) => {
      await this.handleStorageQuotaWarning(evt);
    });
  }

  async handleFormEntryCreated(evt: FormEntryCreatedEvent): Promise<void> {
    const subscribers = await this.repo.findFormSubscribers(evt.formId, 'NEW_ENTRY');
    const subscriberUserIds = new Set(subscribers.map((s) => s.userId));

    const folder = await prisma.folder.findUnique({
      where: { id: evt.folderId },
      select: { userId: true },
    });
    if (folder?.userId) {
      subscriberUserIds.add(folder.userId);
    }

    if (subscriberUserIds.size === 0) return;

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
      subscribers.map((s) => s.userId).filter((uid) => uid !== evt.resolvedById)
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

  async handleFolderShared(evt: FolderSharedEvent): Promise<void> {
    if (!evt.targetUserId || evt.targetUserId === evt.sharedById) return;

    const activeUsers = await prisma.user.findMany({
      where: { id: { in: [evt.targetUserId] }, isActive: true },
      select: { id: true },
    });
    if (activeUsers.length === 0) return;

    const created = await this.repo.createManyNotifications(
      activeUsers.map((u) => ({
        userId: u.id,
        title: 'Carpeta compartida contigo',
        message: `Se te ha otorgado acceso ${evt.permission} en la carpeta "${evt.folderName}".`,
        type: 'FOLDER_SHARED',
        resourceId: evt.folderId,
      }))
    );

    for (const notif of created) {
      this.sse.sendToUser(notif.userId, 'notification', notif);
    }
  }

  async handleResourceUploaded(evt: ResourceUploadedEvent): Promise<void> {
    const targetIds = new Set<string>();
    if (evt.folderOwnerId && evt.folderOwnerId !== evt.uploadedById) {
      targetIds.add(evt.folderOwnerId);
    }

    const members = await prisma.folderMember
      .findMany({ where: { folderId: evt.folderId }, select: { userId: true } })
      .catch(() => []);
    for (const m of members) {
      if (m.userId !== evt.uploadedById) targetIds.add(m.userId);
    }

    if (targetIds.size === 0) return;

    const activeUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(targetIds) }, isActive: true },
      select: { id: true },
    });
    if (activeUsers.length === 0) return;

    const label = evt.folderName ? `"${evt.folderName}"` : 'compartida';
    const created = await this.repo.createManyNotifications(
      activeUsers.map((u) => ({
        userId: u.id,
        title: 'Nuevo archivo en carpeta compartida',
        message: `Se subió "${evt.resourceName}" (${evt.resourceType}) en la carpeta ${label}.`,
        type: 'RESOURCE_UPLOADED',
        resourceId: evt.resourceId,
      }))
    );

    for (const notif of created) {
      this.sse.sendToUser(notif.userId, 'notification', notif);
    }
  }

  async handleStorageQuotaWarning(evt: StorageQuotaWarningEvent): Promise<void> {
    const now = Date.now();
    if (this.quotaCooldownMs > 0 && now - this.lastQuotaWarningAt < this.quotaCooldownMs) {
      return;
    }
    this.lastQuotaWarningAt = now;

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const created = await this.repo.createManyNotifications(
      admins.map((a) => ({
        userId: a.id,
        title: 'Alerta de capacidad de almacenamiento',
        message: evt.message,
        type: 'STORAGE_QUOTA_WARNING',
        resourceId: null,
      }))
    );

    for (const notif of created) {
      this.sse.sendToUser(notif.userId, 'notification', notif);
    }
  }
}

export const notificationsListener = new NotificationsListener();
