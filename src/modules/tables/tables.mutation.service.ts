import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { Role, FolderPermission } from '@prisma/client';
import { tablesRepository } from './tables.repository.js';
import { formatTableItem } from './tables.service.js';
import { extractRichTableData, generateInitialMetadataCard } from './tables.parser.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { validateTableContent } from '../../gateway/file-guard.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import type { RequesterContext } from '../folders/folders.service.js';
import { getChatCache } from '../chat/chat.provider.js';
import { auditService } from '../audit/audit.service.js';

const gzipAsync = promisify(zlib.gzip);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TablesMutationService {
  private async checkTableAccess(record: any, requester?: RequesterContext) {
    if (requester && requester.role !== Role.ADMIN) {
      if (record.folder && record.folder.userId !== requester.id) {
        if (record.folderId) {
          await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
        } else {
          throw new AppError(403, 'No tienes permiso para modificar este dataset', 'FORBIDDEN');
        }
      }
    }
  }

  async renameTable(id: string, tableName: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la tabla debe ser un UUID válido', 'INVALID_ID');
    const trimmed = typeof tableName === 'string' ? tableName.trim() : '';
    if (!trimmed || trimmed.length > 255) {
      throw new AppError(400, 'El nombre de la tabla debe tener entre 1 y 255 caracteres', 'INVALID_NAME');
    }

    const record = await tablesRepository.findById(id);
    if (!record) throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    await this.checkTableAccess(record, requester);

    const updated = await tablesRepository.update(id, { tableName: trimmed });

    auditService.recordLog({
      actorId: requester?.id,
      actorUsername: requester?.role || 'system',
      action: 'TABLE_RENAME',
      resourceType: 'TABLE',
      resourceId: id,
      folderId: record.folderId,
      metadata: { tableName: trimmed },
    });

    return formatTableItem(updated);
  }

  async replaceTableFile(id: string, part: MultipartFile, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la tabla debe ser un UUID válido', 'INVALID_ID');

    let ext = path.extname(part.filename).toLowerCase();
    const isCsv = part.mimetype === 'text/csv' || part.mimetype === 'application/csv';
    const isXlsx =
      part.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      part.mimetype === 'application/vnd.ms-excel';

    if (ext !== '.csv' && ext !== '.xlsx') {
      if (isCsv) ext = '.csv';
      else if (isXlsx) ext = '.xlsx';
      else throw new AppError(415, 'Formato no permitido. Solo se aceptan archivos .csv y .xlsx', 'UNSUPPORTED_MEDIA_TYPE');
    }

    const record = await tablesRepository.findById(id);
    if (!record) throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    await this.checkTableAccess(record, requester);

    const tablesDir = path.resolve(env.STORAGE_DIR, 'tables');
    await fs.mkdir(tablesDir, { recursive: true });

    const targetFileName = `${record.shortCode}${ext}`;
    const targetPath = path.join(tablesDir, targetFileName);
    const tempFileName = `temp_${record.shortCode}_${Date.now()}${ext}`;
    const tempPath = path.join(tablesDir, tempFileName);

    try {
      await pipeline(part.file, createWriteStream(tempPath));
    } catch (streamErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw streamErr;
    }

    if (part.file.truncated) {
      await fs.unlink(tempPath).catch(() => {});
      throw new AppError(413, 'El archivo de tabla supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    // Validación de contenido y magic bytes
    try {
      const handle = await fs.open(tempPath, 'r');
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      await handle.close();
      await validateTableContent(buffer.subarray(0, bytesRead), ext);
    } catch (valErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw valErr;
    }

    // Extracción de datos y métricas
    let richData;
    try {
      richData = await extractRichTableData(tempPath, ext);
    } catch (parseErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw parseErr;
    }

    // Si cambió la extensión o ruta, borrar archivo original anterior
    if (record.storagePath !== targetPath) {
      await fs.unlink(record.storagePath).catch(() => {});
    }

    // Renombrado atómico del archivo temporal al destino
    await fs.rename(tempPath, targetPath);
    const stats = await fs.stat(targetPath);

    // Fusión de metadataCard: conservar metadatos enriquecidos manuales
    const initialMeta = generateInitialMetadataCard(richData);
    const existingMeta = (record.metadataCard as any) || {};
    const mergedMetadataCard = {
      ...initialMeta,
      ...(existingMeta.title ? { title: existingMeta.title } : {}),
      ...(existingMeta.description ? { description: existingMeta.description } : {}),
      ...(Array.isArray(existingMeta.tags) ? { tags: existingMeta.tags } : {}),
    };

    // Regenerar artefacto comprimido .data.json.gz
    try {
      const precalculatedPayload = {
        id: record.id,
        shortCode: record.shortCode,
        tableName: record.tableName,
        rowCount: richData.rowCount,
        columns: richData.columns,
        headers: richData.headers,
        merges: richData.merges,
        cellStyles: richData.cellStyles,
        metadataCard: mergedMetadataCard,
        data: richData.rows,
        createdAt: record.createdAt,
        updatedAt: new Date(),
      };
      const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculatedPayload), 'utf-8'));
      await fs.writeFile(path.join(tablesDir, `${record.shortCode}.data.json.gz`), gzBuffer);
    } catch {}

    // Invalidar caché del chat
    try {
      getChatCache().clear();
    } catch {}

    const updated = await tablesRepository.update(id, {
      storagePath: targetPath,
      rowCount: richData.rowCount,
      columnsSchema: richData.columns,
      metadataCard: mergedMetadataCard as any,
      sizeBytes: stats.size,
    });

    auditService.recordLog({
      actorId: requester?.id,
      actorUsername: requester?.role || 'system',
      action: 'TABLE_HOTSWAP',
      resourceType: 'TABLE',
      resourceId: id,
      folderId: record.folderId,
      metadata: { rowCount: richData.rowCount, sizeBytes: stats.size },
    });

    return formatTableItem(updated);
  }
}

export const tablesMutationService = new TablesMutationService();

