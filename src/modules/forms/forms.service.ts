import { Role, FolderPermission, type FormDefinition, type FormEntry } from '@prisma/client';
import { formsRepository, type FormsRepository, type ListFormsOptions, type ListEntriesOptions } from './forms.repository.js';
import { formsTableSync, type FormsTableSync } from './forms.table-sync.js';
import { foldersSharesService, type FoldersSharesService } from '../folders/folders.shares.service.js';
import { auditService } from '../audit/audit.service.js';
import { eventBus } from '../../shared/event-bus.js';
import { AppError } from '../../shared/errors.js';
import {
  validatePayloadAgainstSchema,
  assertCanResolveEntry,
  normalizeFieldsSchema,
} from './forms.validator.js';

export interface CreateFormDto {
  slug: string;
  title: string;
  folderId: string;
  entryFieldsSchema: any;
  resolutionFieldsSchema: any;
  allowedResolutionStates?: string[];
  autoResolveWithAi?: boolean;
  externalTargetUrl?: string;
}

export interface CallerContext {
  id: string;
  role: Role;
}

async function dispatchToExternalTarget(targetUrl: string, payload: any): Promise<boolean> {
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export class FormsService {
  constructor(
    private readonly repo: FormsRepository = formsRepository,
    private readonly tableSync: FormsTableSync = formsTableSync,
    private readonly sharesService: FoldersSharesService = foldersSharesService
  ) {}

  async createForm(dto: CreateFormDto, caller: CallerContext): Promise<FormDefinition> {
    await this.sharesService.assertFolderAccess(dto.folderId, caller, FolderPermission.EDIT);

    const cleanSlug = dto.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanSlug) throw new AppError(400, 'El slug del formulario no es válido', 'INVALID_SLUG');

    const existing = await this.repo.findFormBySlug(cleanSlug);
    if (existing) throw new AppError(409, `Ya existe un formulario con el slug '${cleanSlug}'`, 'SLUG_ALREADY_EXISTS');

    const entryCols = normalizeFieldsSchema(dto.entryFieldsSchema);
    const resCols = normalizeFieldsSchema(dto.resolutionFieldsSchema);

    if (entryCols.length === 0) {
      throw new AppError(400, 'El formulario debe contener al menos un campo en entryFieldsSchema', 'INVALID_SCHEMA');
    }

    const form = await this.repo.createForm({
      slug: cleanSlug,
      title: dto.title.trim(),
      folderId: dto.folderId,
      entryFieldsSchema: dto.entryFieldsSchema as any,
      resolutionFieldsSchema: (dto.resolutionFieldsSchema || []) as any,
      allowedResolutionStates: dto.allowedResolutionStates && dto.allowedResolutionStates.length > 0 ? dto.allowedResolutionStates : ['VALID', 'INVALID'],
      autoResolveWithAi: Boolean(dto.autoResolveWithAi),
      externalTargetUrl: dto.externalTargetUrl ? dto.externalTargetUrl.trim() : null,
    });

    try {
      await this.tableSync.initializeLinkedTable(form);
    } catch (err: any) {
      // Si falla la inicialización de la tabla abierta, se reporta
      console.error('[FormsService] Error inicializando tabla abierta:', err);
    }

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FORM_CREATE',
      resourceType: 'FORM',
      resourceId: form.id,
      folderId: form.folderId,
    });

    return (await this.repo.findFormById(form.id)) || form;
  }

  async listForms(options: ListFormsOptions, caller: CallerContext) {
    const isGlobal = caller.role === Role.ADMIN;
    return this.repo.listForms({
      ...options,
      userId: caller.id,
      isAdmin: isGlobal,
    });
  }

  async getForm(idOrSlug: string, caller?: CallerContext) {
    let form = await this.repo.findFormBySlug(idOrSlug);
    if (!form) form = await this.repo.findFormById(idOrSlug);
    if (!form) throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');

    if (caller) {
      await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);
    }

    return form;
  }

  async submitEntry(slug: string, entryPayload: any, ipAddress?: string): Promise<{ id: string; status: string; createdAt: Date }> {
    const form = await this.repo.findFormBySlug(slug);
    if (!form) throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');

    const sanitizedPayload = validatePayloadAgainstSchema(entryPayload, form.entryFieldsSchema, 'entryPayload');

    const entry = await this.repo.createEntry({
      formId: form.id,
      entryPayload: sanitizedPayload as any,
      status: 'NEW',
    });

    // Sincronización asíncrona de tabla abierta (.data.json.gz)
    await this.tableSync.syncEntryToTable(form, entry, false).catch((err) => {
      console.error('[FormsService] Error sincronizando entrada a tabla abierta:', err);
    });

    auditService.recordLog({
      actorId: null,
      actorUsername: 'public_user',
      action: 'FORM_ENTRY_SUBMIT',
      resourceType: 'FORM_ENTRY',
      resourceId: entry.id,
      folderId: form.folderId,
      ipAddress,
    });

    eventBus.emitEvent('form.entry.created', {
      formId: form.id,
      formSlug: form.slug,
      formTitle: form.title,
      folderId: form.folderId,
      entryId: entry.id,
      entryPayload: entry.entryPayload as Record<string, any>,
      createdAt: entry.createdAt,
    });

    return { id: entry.id, status: entry.status, createdAt: entry.createdAt };
  }

  async resolveEntry(id: string, payload: { status: string; resolutionPayload: any }, caller: CallerContext, ipAddress?: string): Promise<FormEntry> {
    const entry = await this.repo.findEntryById(id);
    if (!entry || !entry.form) throw new AppError(404, 'Entrada de formulario no encontrada', 'ENTRY_NOT_FOUND');

    await this.sharesService.assertFolderAccess(entry.form.folderId, caller, FolderPermission.EDIT);

    const sanitizedRes = assertCanResolveEntry(
      entry,
      payload.status,
      entry.form.allowedResolutionStates,
      payload.resolutionPayload,
      entry.form.resolutionFieldsSchema
    );

    const updated = await this.repo.updateEntry(entry.id, {
      status: payload.status,
      resolutionPayload: sanitizedRes as any,
      resolvedBy: { connect: { id: caller.id } },
      resolvedAt: new Date(),
    });

    await this.tableSync.syncEntryToTable(entry.form, updated, true).catch((err) => {
      console.error('[FormsService] Error sincronizando resolución a tabla abierta:', err);
    });

    if (entry.form.externalTargetUrl) {
      dispatchToExternalTarget(entry.form.externalTargetUrl, {
        entryId: updated.id,
        formSlug: entry.form.slug,
        status: updated.status,
        entryPayload: updated.entryPayload,
        resolutionPayload: updated.resolutionPayload,
        createdAt: updated.createdAt,
        resolvedAt: updated.resolvedAt,
      });
    }

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FORM_ENTRY_RESOLVE',
      resourceType: 'FORM_ENTRY',
      resourceId: updated.id,
      folderId: entry.form.folderId,
      ipAddress,
    });

    eventBus.emitEvent('form.entry.resolved', {
      formId: entry.form.id,
      formSlug: entry.form.slug,
      formTitle: entry.form.title,
      folderId: entry.form.folderId,
      entryId: updated.id,
      status: updated.status,
      resolutionPayload: (updated.resolutionPayload as Record<string, any>) || undefined,
      resolvedById: caller.id,
      resolvedAt: updated.resolvedAt!,
    });

    return updated;
  }

  async dispatchEntry(id: string, caller: CallerContext) {
    const entry = await this.repo.findEntryById(id);
    if (!entry || !entry.form) throw new AppError(404, 'Entrada de formulario no encontrada', 'ENTRY_NOT_FOUND');

    await this.sharesService.assertFolderAccess(entry.form.folderId, caller, FolderPermission.READ);

    if (!entry.form.externalTargetUrl) {
      throw new AppError(400, 'El formulario no tiene configurada una URL externa de destino (externalTargetUrl)', 'TARGET_URL_NOT_CONFIGURED');
    }

    const payload = {
      entryId: entry.id,
      formSlug: entry.form.slug,
      status: entry.status,
      entryPayload: entry.entryPayload,
      resolutionPayload: entry.resolutionPayload,
      createdAt: entry.createdAt,
      resolvedAt: entry.resolvedAt,
    };

    const dispatched = await dispatchToExternalTarget(entry.form.externalTargetUrl, payload);

    return {
      dispatched,
      targetUrl: entry.form.externalTargetUrl,
      entryId: entry.id,
      dispatchedAt: new Date(),
    };
  }

  async listEntries(formId: string, options: Omit<ListEntriesOptions, 'formId'>, caller: CallerContext) {
    const form = await this.repo.findFormById(formId);
    if (!form) throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');

    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);

    const [entries, total] = await Promise.all([
      this.repo.listEntries({ ...options, formId }),
      this.repo.countEntries({ ...options, formId }),
    ]);

    return { entries, total };
  }

  async exportEntries(formId: string, options: { month?: string; status?: string; format?: 'xlsx' | 'csv' }, caller: CallerContext) {
    const form = await this.repo.findFormById(formId);
    if (!form) throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');

    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.READ);

    const entries = await this.repo.listEntries({
      formId,
      month: options.month,
      status: options.status,
      page: 1,
      limit: 10000,
    });

    const format = options.format === 'csv' ? 'csv' : 'xlsx';
    return this.tableSync.exportEntries(entries, form, format);
  }
}

export const formsService = new FormsService();
