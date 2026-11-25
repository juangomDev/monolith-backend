import { Role, FolderType, FolderPermission } from '@prisma/client';
import { pdfsRepository } from './pdfs.repository.js';
import { pdfsStorage } from './pdfs.storage.js';
import { foldersRepository } from '../folders/folders.repository.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import type { RequesterContext } from '../folders/folders.service.js';
import { AppError } from '../../shared/errors.js';
import { getChatCache } from '../chat/chat.provider.js';
import { auditService } from '../audit/audit.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PdfBulkOperationResult {
  totalRequested: number;
  successful: string[];
  failed: Array<{ id: string; reason: string }>;
}

export class PdfsBulkService {
  async bulkDelete(ids: string[], requester?: RequesterContext): Promise<PdfBulkOperationResult> {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
      throw new AppError(400, 'Debe proporcionar entre 1 y 50 IDs de documentos PDF', 'BAD_REQUEST');
    }

    const successful: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of ids) {
      if (!UUID_REGEX.test(id)) {
        failed.push({ id, reason: 'ID de PDF inválido' });
        continue;
      }

      const record = await pdfsRepository.findById(id);
      if (!record) {
        failed.push({ id, reason: 'Documento PDF no encontrado' });
        continue;
      }

      if (requester && requester.role !== Role.ADMIN) {
        if (record.folder && record.folder.userId !== requester.id) {
          if (record.folderId) {
            try {
              await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
            } catch {
              failed.push({ id, reason: 'Sin permiso de edición en la carpeta' });
              continue;
            }
          } else {
            failed.push({ id, reason: 'Sin permiso de edición' });
            continue;
          }
        }
      }

      try {
        await pdfsRepository.delete(id);
        await pdfsStorage.deletePdfFiles(record.shortCode);
        successful.push(id);
      } catch (err: any) {
        failed.push({ id, reason: err?.message || 'Error al eliminar PDF' });
      }
    }

    if (successful.length > 0) {
      try {
        getChatCache().clear();
      } catch {}
      auditService.recordLog({
        actorId: requester?.id,
        actorUsername: requester?.role || 'system',
        action: 'PDF_BULK_DELETE',
        resourceType: 'PDF',
        metadata: { count: successful.length, successful },
      });
    }

    return { totalRequested: ids.length, successful, failed };
  }

  async bulkMove(
    ids: string[],
    targetFolderId: string,
    requester?: RequesterContext
  ): Promise<PdfBulkOperationResult> {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
      throw new AppError(400, 'Debe proporcionar entre 1 y 50 IDs de documentos PDF', 'BAD_REQUEST');
    }
    if (!UUID_REGEX.test(targetFolderId)) {
      throw new AppError(400, 'El ID de la carpeta destino debe ser un UUID válido', 'INVALID_ID');
    }

    const targetFolder = await foldersRepository.findFolderById(targetFolderId);
    if (!targetFolder) {
      throw new AppError(404, 'Carpeta destino no encontrada', 'NOT_FOUND');
    }
    if (targetFolder.type !== FolderType.PDF) {
      throw new AppError(400, 'La carpeta destino debe ser de tipo PDF', 'INVALID_FOLDER_TYPE');
    }

    if (requester && requester.role !== Role.ADMIN) {
      await foldersSharesService.assertFolderAccess(targetFolderId, requester, FolderPermission.EDIT);
    }

    const successful: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of ids) {
      if (!UUID_REGEX.test(id)) {
        failed.push({ id, reason: 'ID de PDF inválido' });
        continue;
      }

      const record = await pdfsRepository.findById(id);
      if (!record) {
        failed.push({ id, reason: 'Documento PDF no encontrado' });
        continue;
      }

      if (requester && requester.role !== Role.ADMIN) {
        if (record.folder && record.folder.userId !== requester.id) {
          if (record.folderId) {
            try {
              await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
            } catch {
              failed.push({ id, reason: 'Sin permiso de edición en la carpeta origen' });
              continue;
            }
          } else {
            failed.push({ id, reason: 'Sin permiso de edición' });
            continue;
          }
        }
      }

      try {
        await pdfsRepository.update(id, { folder: { connect: { id: targetFolderId } } });
        successful.push(id);
      } catch (err: any) {
        failed.push({ id, reason: err?.message || 'Error al mover PDF' });
      }
    }

    if (successful.length > 0) {
      auditService.recordLog({
        actorId: requester?.id,
        actorUsername: requester?.role || 'system',
        action: 'PDF_BULK_MOVE',
        resourceType: 'PDF',
        folderId: targetFolderId,
        metadata: { count: successful.length, successful },
      });
    }

    return { totalRequested: ids.length, successful, failed };
  }
}

export const pdfsBulkService = new PdfsBulkService();
