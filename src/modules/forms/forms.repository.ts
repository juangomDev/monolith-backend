import { prisma } from '../../config/db.js';
import type { Prisma, FormDefinition, FormEntry } from '@prisma/client';

export interface ListFormsOptions {
  page?: number;
  limit?: number;
  folderId?: string;
  userId?: string;
  isAdmin?: boolean;
  search?: string;
}

export interface ListEntriesOptions {
  formId: string;
  month?: string; // Formato YYYY-MM
  status?: string;
  page?: number;
  limit?: number;
}

function parseMonthRange(month: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (m < 1 || m > 12) return null;
  return {
    start: new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, m, 1, 0, 0, 0, 0)),
  };
}

export class FormsRepository {
  async createForm(data: Prisma.FormDefinitionUncheckedCreateInput): Promise<FormDefinition> {
    return prisma.formDefinition.create({ data });
  }

  async findFormById(id: string): Promise<(FormDefinition & { linkedTable?: any; folder?: any }) | null> {
    return prisma.formDefinition.findUnique({
      where: { id },
      include: {
        linkedTable: true,
        folder: { select: { id: true, name: true, userId: true, isPrivate: true } },
      },
    });
  }

  async findFormBySlug(slug: string): Promise<(FormDefinition & { linkedTable?: any; folder?: any }) | null> {
    return prisma.formDefinition.findUnique({
      where: { slug },
      include: {
        linkedTable: true,
        folder: { select: { id: true, name: true, userId: true, isPrivate: true } },
      },
    });
  }

  async listForms(options?: ListFormsOptions): Promise<FormDefinition[]> {
    const where: Prisma.FormDefinitionWhereInput = {};
    const conditions: Prisma.FormDefinitionWhereInput[] = [];

    if (options?.folderId) conditions.push({ folderId: options.folderId });

    if (options && !options.isAdmin && options.userId) {
      conditions.push({
        OR: [
          { folder: { isPrivate: false } },
          { folder: { userId: options.userId } },
          { folder: { members: { some: { userId: options.userId } } } },
        ],
      });
    }

    if (options?.search) {
      conditions.push({
        OR: [
          { title: { contains: options.search, mode: 'insensitive' } },
          { slug: { contains: options.search, mode: 'insensitive' } },
        ],
      });
    }

    if (conditions.length === 1) Object.assign(where, conditions[0]);
    else if (conditions.length > 1) where.AND = conditions;

    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : (options ? 50 : undefined);
    const skip = limit ? (page - 1) * limit : undefined;

    return prisma.formDefinition.findMany({
      where,
      include: {
        linkedTable: { select: { id: true, shortCode: true, tableName: true, rowCount: true } },
        folder: { select: { id: true, name: true } },
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async countForms(options?: ListFormsOptions): Promise<number> {
    const where: Prisma.FormDefinitionWhereInput = {};
    if (options?.folderId) where.folderId = options.folderId;
    return prisma.formDefinition.count({ where });
  }

  async updateForm(id: string, data: Prisma.FormDefinitionUpdateInput): Promise<FormDefinition> {
    return prisma.formDefinition.update({ where: { id }, data });
  }

  async deleteForm(id: string): Promise<FormDefinition> {
    return prisma.formDefinition.delete({ where: { id } });
  }

  async createEntry(data: Prisma.FormEntryUncheckedCreateInput): Promise<FormEntry> {
    return prisma.formEntry.create({ data });
  }

  async findEntryById(id: string): Promise<(FormEntry & { form?: any; resolvedBy?: any }) | null> {
    return prisma.formEntry.findUnique({
      where: { id },
      include: {
        form: { include: { folder: true, linkedTable: true } },
        resolvedBy: { select: { id: true, username: true, role: true } },
      },
    });
  }

  async listEntries(options: ListEntriesOptions): Promise<FormEntry[]> {
    const where: Prisma.FormEntryWhereInput = { formId: options.formId };

    if (options.status) where.status = options.status;

    if (options.month) {
      const range = parseMonthRange(options.month);
      if (range) where.createdAt = { gte: range.start, lt: range.end };
    }

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const skip = (page - 1) * limit;

    return prisma.formEntry.findMany({
      where,
      include: { resolvedBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async countEntries(options: ListEntriesOptions): Promise<number> {
    const where: Prisma.FormEntryWhereInput = { formId: options.formId };
    if (options.status) where.status = options.status;
    if (options.month) {
      const range = parseMonthRange(options.month);
      if (range) where.createdAt = { gte: range.start, lt: range.end };
    }
    return prisma.formEntry.count({ where });
  }

  async updateEntry(id: string, data: Prisma.FormEntryUpdateInput): Promise<FormEntry> {
    return prisma.formEntry.update({ where: { id }, data });
  }
}

export const formsRepository = new FormsRepository();

