import { prisma } from '../../config/db.js';
import type { Notification, FormSubscription } from '@prisma/client';

export interface ListNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export class NotificationsRepository {
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    resourceId?: string | null;
  }): Promise<Notification> {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        resourceId: data.resourceId ?? null,
      },
    });
  }

  async createManyNotifications(
    entries: Array<{
      userId: string;
      title: string;
      message: string;
      type: string;
      resourceId?: string | null;
    }>
  ): Promise<Notification[]> {
    if (entries.length === 0) return [];
    // Prisma createMany does not return records on all DBs, so we use Promise.all or transaction
    return prisma.$transaction(
      entries.map((data) =>
        prisma.notification.create({
          data: {
            userId: data.userId,
            title: data.title,
            message: data.message,
            type: data.type,
            resourceId: data.resourceId ?? null,
          },
        })
      )
    );
  }

  async findManyByUser(userId: string, options: ListNotificationsOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (options.unreadOnly) {
      where.read = false;
    }

    const [total, data] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async countUnreadByUser(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notif = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) return null;
    return prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return result.count;
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    const notif = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) return false;
    await prisma.notification.delete({ where: { id } });
    return true;
  }

  // --- Subscriptions ---
  async findSubscription(userId: string, formId: string): Promise<FormSubscription | null> {
    return prisma.formSubscription.findUnique({
      where: { userId_formId: { userId, formId } },
    });
  }

  async upsertSubscription(
    userId: string,
    formId: string,
    data: { notifyOnNewEntry?: boolean; notifyOnResolution?: boolean }
  ): Promise<FormSubscription> {
    return prisma.formSubscription.upsert({
      where: { userId_formId: { userId, formId } },
      create: {
        userId,
        formId,
        notifyOnNewEntry: data.notifyOnNewEntry ?? true,
        notifyOnResolution: data.notifyOnResolution ?? false,
      },
      update: {
        ...(data.notifyOnNewEntry !== undefined ? { notifyOnNewEntry: data.notifyOnNewEntry } : {}),
        ...(data.notifyOnResolution !== undefined ? { notifyOnResolution: data.notifyOnResolution } : {}),
      },
    });
  }

  async deleteSubscription(userId: string, formId: string): Promise<boolean> {
    const existing = await prisma.formSubscription.findUnique({
      where: { userId_formId: { userId, formId } },
    });
    if (!existing) return false;
    await prisma.formSubscription.delete({ where: { id: existing.id } });
    return true;
  }

  async findFormSubscribers(formId: string, type: 'NEW_ENTRY' | 'RESOLUTION'): Promise<FormSubscription[]> {
    return prisma.formSubscription.findMany({
      where: {
        formId,
        ...(type === 'NEW_ENTRY' ? { notifyOnNewEntry: true } : { notifyOnResolution: true }),
      },
      include: {
        user: { select: { id: true, username: true, role: true, isActive: true } },
      },
    });
  }
}

export const notificationsRepository = new NotificationsRepository();

