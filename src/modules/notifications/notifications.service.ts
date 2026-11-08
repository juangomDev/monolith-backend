import { notificationsRepository, type NotificationsRepository, type ListNotificationsOptions } from './notifications.repository.js';
import { notificationsSse, type NotificationsSseManager } from './notifications.sse.js';
import { foldersSharesService, type FoldersSharesService } from '../folders/folders.shares.service.js';
import { formsRepository, type FormsRepository } from '../forms/forms.repository.js';
import { AppError } from '../../shared/errors.js';
import { FolderPermission, Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface CallerContext {
  id: string;
  role: Role;
}

export class NotificationsService {
  constructor(
    private repo: NotificationsRepository = notificationsRepository,
    private sse: NotificationsSseManager = notificationsSse,
    private sharesService: FoldersSharesService = foldersSharesService,
    private formsRepo: FormsRepository = formsRepository
  ) {}

  async listNotifications(userId: string, options: ListNotificationsOptions = {}) {
    return this.repo.findManyByUser(userId, options);
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.repo.countUnreadByUser(userId);
    return { unreadCount };
  }

  async markAsRead(id: string, userId: string) {
    const updated = await this.repo.markAsRead(id, userId);
    if (!updated) {
      throw new AppError(404, 'Notificación no encontrada', 'NOTIFICATION_NOT_FOUND');
    }
    return updated;
  }

  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const updatedCount = await this.repo.markAllAsRead(userId);
    return { updatedCount };
  }

  async deleteNotification(id: string, userId: string): Promise<{ success: boolean }> {
    const deleted = await this.repo.deleteNotification(id, userId);
    if (!deleted) {
      throw new AppError(404, 'Notificación no encontrada', 'NOTIFICATION_NOT_FOUND');
    }
    return { success: true };
  }

  async subscribeToForm(
    userId: string,
    formId: string,
    data: { notifyOnNewEntry?: boolean; notifyOnResolution?: boolean },
    caller: CallerContext
  ) {
    const form = await this.formsRepo.findFormById(formId);
    if (!form) {
      throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');
    }

    // El usuario debe tener al menos permiso READ en la carpeta del formulario
    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);

    return this.repo.upsertSubscription(userId, form.id, data);
  }

  async unsubscribeFromForm(userId: string, formId: string, caller: CallerContext): Promise<{ success: boolean }> {
    const form = await this.formsRepo.findFormById(formId);
    if (!form) {
      throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');
    }

    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);
    await this.repo.deleteSubscription(userId, form.id);
    return { success: true };
  }

  async getSubscription(userId: string, formId: string, caller: CallerContext) {
    const form = await this.formsRepo.findFormById(formId);
    if (!form) {
      throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');
    }

    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);
    const subscription = await this.repo.findSubscription(userId, form.id);
    return {
      subscribed: !!subscription,
      subscription: subscription || null,
    };
  }

  handleSseConnection(userId: string, request: FastifyRequest, reply: FastifyReply): void {
    this.sse.registerClient(userId, request, reply);
  }
}

export const notificationsService = new NotificationsService();

