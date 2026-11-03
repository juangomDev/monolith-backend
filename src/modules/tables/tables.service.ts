import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { tablesRepository, type FindTablesOptions } from './tables.repository.js';
import { readTableRows, extractRichTableData, generateInitialMetadataCard } from './tables.parser.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { validateTableContent } from '../../gateway/file-guard.js';
import { FolderType, Role, FolderPermission } from '@prisma/client';
import { foldersRepository } from '../folders/folders.repository.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import type { RequesterContext } from '../folders/folders.service.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListTablesQueryOptions {
  page?: number; limit?: number; folderId?: string; requester?: { id: string; role: Role };
}

function formatTableItem(record: any) {
  const updatedAt = record.updatedAt ?? record.createdAt;
  return {
    id: record.id, shortCode: record.shortCode,
    url: `${env.BASE_URL}/t/${record.shortCode}`,
    urlWithVersion: `${env.BASE_URL}/t/${record.shortCode}?v=${new Date(updatedAt).getTime()}`,
    tableName: record.tableName, rowCount: record.rowCount,
    columns: record.columnsSchema, sizeBytes: record.sizeBytes,
    metadataCard: record.metadataCard ?? null,
    folderId: record.folderId ?? null,
    createdAt: record.createdAt, updatedAt,
  };
}

export class TablesService {
  async saveTable(part: MultipartFile, folderId?: string, user?: RequesterContext | string) {
    const requesterCtx = typeof user === 'string' ? { id: user, role: Role.ADMIN } : user;
    if (requesterCtx?.role === Role.COLLABORATOR) {
      if (!folderId) {
        throw new AppError(403, 'Los colaboradores solo pueden subir archivos a carpetas compartidas con permiso de edición', 'FORBIDDEN');
      }
      await foldersSharesService.assertFolderAccess(folderId, requesterCtx, FolderPermission.EDIT);
    } else if (folderId && requesterCtx) {
      await foldersSharesService.assertFolderAccess(folderId, requesterCtx, FolderPermission.EDIT);
    }

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

    const shortCode = generateShortCode();
    const tablesDir = path.resolve(env.STORAGE_DIR, 'tables');
    await fs.mkdir(tablesDir, { recursive: true });

    const fileName = `${shortCode}${ext}`;
    const targetPath = path.join(tablesDir, fileName);

    try {
      await pipeline(part.file, createWriteStream(targetPath));
    } catch (streamErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw streamErr;
    }

    if (part.file.truncated) {
      await fs.unlink(targetPath).catch(() => {});
      throw new AppError(413, 'El archivo de tabla supera el tamaño máximo permitido', 'PAYLOAD_TOO_LARGE');
    }

    // Validación estricta de estructura y contenido de tabla
    try {
      const handle = await fs.open(targetPath, 'r');
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      await handle.close();
      await validateTableContent(buffer.subarray(0, bytesRead), ext);
    } catch (valErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw valErr;
    }

    const stats = await fs.stat(targetPath);

    let richData;
    try {
      richData = await extractRichTableData(targetPath, ext);
    } catch (parseErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw parseErr;
    }

    const userId = requesterCtx?.id;
    if (!folderId && userId) {
      const defaultFolder = await foldersRepository.findOrCreateDefaultFolder(userId, FolderType.TABLE);
      folderId = defaultFolder.id;
    }

    const metadataCard = generateInitialMetadataCard(richData);

    const record = await tablesRepository.create({
      shortCode,
      tableName: part.filename || `table_${shortCode}${ext}`,
      rowCount: richData.rowCount,
      columnsSchema: richData.columns,
      metadataCard: metadataCard as any,
      sizeBytes: stats.size,
      storagePath: targetPath,
      folderId,
    });

    // Generar y comprimir artefacto pre-calculado .data.json.gz (Doble Artefacto)
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
        metadataCard,
        data: richData.rows,
        createdAt: record.createdAt,
        updatedAt: (record as any).updatedAt ?? record.createdAt,
      };
      const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculatedPayload), 'utf-8'));
      await fs.writeFile(path.join(tablesDir, `${shortCode}.data.json.gz`), gzBuffer);
    } catch {}

    return formatTableItem(record);
  }

  async listTables(
    optionsOrRequester?: ListTablesQueryOptions | { id: string; role: Role },
    legacyRequester?: { id: string; role: Role }
  ) {
    let options: ListTablesQueryOptions = {};
    let requester: { id: string; role: Role } | undefined;
    if (optionsOrRequester && 'role' in optionsOrRequester && typeof (optionsOrRequester as any).role === 'string') {
      requester = optionsOrRequester as { id: string; role: Role };
    } else if (optionsOrRequester) {
      options = optionsOrRequester as ListTablesQueryOptions;
      requester = options.requester ?? legacyRequester;
    } else {
      requester = legacyRequester;
    }

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : (options.page ? 50 : undefined);

    const findOptions: FindTablesOptions = {
      page,
      limit,
      folderId: options.folderId,
      userId: requester?.id,
      isAdmin: requester?.role === Role.ADMIN,
    };

    const records = await tablesRepository.findAll(findOptions);
    let total = records.length;
    if (options.page !== undefined || options.limit !== undefined) {
      try {
        total = await tablesRepository.count(findOptions);
      } catch {
        total = records.length;
      }
    }

    const effectiveLimit = limit || (total > 0 ? total : 50);
    const totalPages = Math.ceil(total / effectiveLimit) || 1;

    return {
      tables: records.map(formatTableItem),
      total,
      page,
      limit: effectiveLimit,
      totalPages,
      meta: {
        page,
        limit: effectiveLimit,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  async getTableByShortCode(shortCode: string) {
    const record = await tablesRepository.findByShortCode(shortCode);
    if (!record) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    try {
      await fs.access(record.storagePath, fs.constants.R_OK);
    } catch {
      throw new AppError(404, 'El archivo físico de la tabla no existe en almacenamiento', 'FILE_NOT_FOUND');
    }

    return record;
  }

  async getTableDataPaginated(shortCode: string, page = 1, limit = 100) {
    const record = await this.getTableByShortCode(shortCode);
    const gzPath = path.join(path.dirname(record.storagePath), `${record.shortCode}.data.json.gz`);

    let columns: string[] = (record.columnsSchema as string[]) || [];
    let rows: Record<string, any>[] = [];
    let headers: string[][] | undefined;
    let merges: string[] | undefined;
    let cellStyles: any;
    let total = record.rowCount;

    try {
      const gzBuffer = await fs.readFile(gzPath);
      const cached = JSON.parse((await gunzipAsync(gzBuffer)).toString('utf-8'));
      total = cached.rowCount ?? cached.data?.length ?? record.rowCount;
      columns = cached.columns || columns;
      headers = cached.headers;
      merges = cached.merges;
      cellStyles = cached.cellStyles;
      const startIndex = (page - 1) * limit;
      rows = (cached.data || []).slice(startIndex, startIndex + limit);
    } catch {
      const ext = path.extname(record.storagePath).toLowerCase();
      const parsed = await readTableRows(record.storagePath, ext, page, limit);
      columns = parsed.columns.length > 0 ? parsed.columns : columns;
      rows = parsed.rows;
    }

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      id: record.id,
      shortCode: record.shortCode,
      tableName: record.tableName,
      columns,
      headers,
      merges,
      cellStyles,
      data: rows,
      meta: { page, limit, total, totalPages, hasNext: page < totalPages },
    };
  }

  async getPrecalculatedGzipStream(shortCode: string) {
    const record = await this.getTableByShortCode(shortCode);
    const gzPath = path.join(path.dirname(record.storagePath), `${record.shortCode}.data.json.gz`);
    try {
      await fs.access(gzPath, fs.constants.R_OK);
      return { record, stream: createReadStream(gzPath) };
    } catch {
      return null;
    }
  }

  async getTableDownloadStream(shortCode: string) {
    const record = await this.getTableByShortCode(shortCode);
    return { record, fileStream: createReadStream(record.storagePath) };
  }

  async deleteTable(id: string, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) throw new AppError(400, 'El ID de la tabla debe ser un UUID válido', 'INVALID_ID');
    const record = await tablesRepository.findById(id);
    if (!record) throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');

    if (requester && requester.role !== Role.ADMIN) {
      if (record.folder && record.folder.userId !== requester.id) {
        if (record.folderId) {
          await foldersSharesService.assertFolderAccess(record.folderId, requester, FolderPermission.EDIT);
        } else {
          throw new AppError(403, 'No tienes permiso para eliminar este dataset', 'FORBIDDEN');
        }
      }
    }

    await tablesRepository.deleteById(id);
    const gzPath = path.join(path.dirname(record.storagePath), `${record.shortCode}.data.json.gz`);
    await Promise.allSettled([fs.unlink(gzPath), fs.unlink(record.storagePath)]);
    return { deleted: true };
  }
}

export const tablesService = new TablesService();
