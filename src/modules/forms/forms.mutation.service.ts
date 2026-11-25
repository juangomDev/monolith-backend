import fs from 'node:fs/promises';
import path from 'node:path';
import { FolderPermission, Role, type FormDefinition } from '@prisma/client';
import { formsRepository, type FormsRepository } from './forms.repository.js';
import { tablesRepository, type TablesRepository } from '../tables/tables.repository.js';
import { foldersSharesService, type FoldersSharesService } from '../folders/folders.shares.service.js';
import { auditService } from '../audit/audit.service.js';
import { getChatCache } from '../chat/chat.provider.js';
import { AppError } from '../../shared/errors.js';
import type { CallerContext } from './forms.service.js';

export interface UpdateFormDto {
  title?: string;
  allowedResolutionStates?: string[];
  autoResolveWithAi?: boolean;
  externalTargetUrl?: string | null;
}

export class FormsMutationService {
  constructor(
    private readonly repo: FormsRepository = formsRepository,
    private readonly tablesRepo: TablesRepository = tablesRepository,
    private readonly sharesService: FoldersSharesService = foldersSharesService
  ) {}

  async updateForm(id: string, dto: UpdateFormDto, caller: CallerContext): Promise<FormDefinition> {
    const form = await this.repo.findFormById(id);
    if (!form) {
      throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');
    }

    await this.sharesService.assertFolderAccess(form.folderId, caller, FolderPermission.EDIT);

    const updateData: Record<string, any> = {};

    if (dto.title !== undefined) {
      const cleanTitle = typeof dto.title === 'string' ? dto.title.trim() : '';
      if (cleanTitle.length < 2 || cleanTitle.length > 120) {
        throw new AppError(400, 'El título del formulario debe tener entre 2 y 120 caracteres', 'BAD_REQUEST');
      }
      updateData.title = cleanTitle;
    }

    if (dto.allowedResolutionStates !== undefined) {
      if (!Array.isArray(dto.allowedResolutionStates) || dto.allowedResolutionStates.length === 0) {
        throw new AppError(400, 'allowedResolutionStates debe ser una lista no vacía de estados', 'BAD_REQUEST');
      }
      updateData.allowedResolutionStates = dto.allowedResolutionStates.map((s) => String(s).trim()).filter(Boolean);
      if (updateData.allowedResolutionStates.length === 0) {
        throw new AppError(400, 'allowedResolutionStates debe contener al menos un estado válido', 'BAD_REQUEST');
      }
    }

    if (dto.autoResolveWithAi !== undefined) {
      updateData.autoResolveWithAi = Boolean(dto.autoResolveWithAi);
    }

    if (dto.externalTargetUrl !== undefined) {
      if (dto.externalTargetUrl === null || dto.externalTargetUrl === '') {
        updateData.externalTargetUrl = null;
      } else {
        const trimmedUrl = String(dto.externalTargetUrl).trim();
        try {
          new URL(trimmedUrl);
        } catch {
          throw new AppError(400, 'externalTargetUrl debe ser una URL válida', 'BAD_REQUEST');
        }
        updateData.externalTargetUrl = trimmedUrl;
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, 'Debe especificar al menos un campo para actualizar el formulario', 'BAD_REQUEST');
    }

    const updated = await this.repo.updateForm(form.id, updateData);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FORM_UPDATE',
      resourceType: 'FORM',
      resourceId: updated.id,
      folderId: updated.folderId,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return updated;
  }

  async deleteForm(id: string, caller: CallerContext): Promise<{ deleted: boolean; id: string }> {
    const form = await this.repo.findFormById(id);
    if (!form) {
      throw new AppError(404, 'Formulario no encontrado', 'FORM_NOT_FOUND');
    }

    if (caller.role !== Role.ADMIN && form.folder?.userId !== caller.id) {
      throw new AppError(403, 'Solo el propietario de la carpeta o un ADMIN pueden eliminar este formulario', 'FORBIDDEN');
    }

    const linkedTableId = form.linkedTableId;
    const linkedTable = form.linkedTable;

    await this.repo.deleteForm(form.id);

    if (linkedTableId) {
      const tableRecord = linkedTable || (await this.tablesRepo.findById(linkedTableId).catch(() => null));
      await this.tablesRepo.deleteById(linkedTableId).catch(() => {});
      if (tableRecord?.storagePath) {
        const gzPath = path.join(path.dirname(tableRecord.storagePath), `${tableRecord.shortCode}.data.json.gz`);
        await Promise.allSettled([fs.unlink(tableRecord.storagePath), fs.unlink(gzPath)]);
      }
      try {
        getChatCache().clear();
      } catch {}
    }

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'FORM_DELETE',
      resourceType: 'FORM',
      resourceId: form.id,
      folderId: form.folderId,
      metadata: { slug: form.slug, linkedTableId },
    });

    return { deleted: true, id: form.id };
  }
}

export const formsMutationService = new FormsMutationService();
