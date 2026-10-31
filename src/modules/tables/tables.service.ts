import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { tablesRepository } from './tables.repository.js';
import { parseTableMetadata, readTableRows } from './tables.parser.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { validateTableContent } from '../../gateway/file-guard.js';
import { FolderType, Role } from '@prisma/client';
import { foldersRepository } from '../folders/folders.repository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TablesService {
  async saveTable(part: MultipartFile, folderId?: string, userId?: string) {
    let ext = path.extname(part.filename).toLowerCase();
    const isCsvMime = part.mimetype === 'text/csv' || part.mimetype === 'application/csv';
    const isXlsxMime =
      part.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      part.mimetype === 'application/vnd.ms-excel';

    if (ext !== '.csv' && ext !== '.xlsx') {
      if (isCsvMime) {
        ext = '.csv';
      } else if (isXlsxMime) {
        ext = '.xlsx';
      } else {
        throw new AppError(415, `Formato no permitido. Solo se aceptan archivos .csv y .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
      }
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
      const chunk = buffer.subarray(0, bytesRead);

      await validateTableContent(chunk, ext);
    } catch (valErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw valErr;
    }

    const stats = await fs.stat(targetPath);

    let metadata;
    try {
      metadata = await parseTableMetadata(targetPath, ext);
    } catch (parseErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw parseErr;
    }

    if (!folderId && userId) {
      const defaultFolder = await foldersRepository.findOrCreateDefaultFolder(userId, FolderType.TABLE);
      folderId = defaultFolder.id;
    }

    const record = await tablesRepository.create({
      shortCode,
      tableName: part.filename || `table_${shortCode}${ext}`,
      rowCount: metadata.rowCount,
      columnsSchema: metadata.columns,
      sizeBytes: stats.size,
      storagePath: targetPath,
      folderId,
    });

    return {
      id: record.id,
      shortCode: record.shortCode,
      url: `${env.BASE_URL}/t/${record.shortCode}`,
      tableName: record.tableName,
      rowCount: record.rowCount,
      columns: record.columnsSchema,
      sizeBytes: record.sizeBytes,
      folderId: (record as any).folderId ?? null,
      createdAt: record.createdAt,
    };
  }

  async listTables(requester?: { id: string; role: Role }) {
    const records = await tablesRepository.findAll();
    const filtered = requester && requester.role !== Role.ADMIN
      ? records.filter((r: any) => !r.folder || !r.folder.isPrivate || r.folder.userId === requester.id)
      : records;

    return {
      tables: filtered.map((record: any) => ({
        id: record.id,
        shortCode: record.shortCode,
        url: `${env.BASE_URL}/t/${record.shortCode}`,
        tableName: record.tableName,
        rowCount: record.rowCount,
        columns: record.columnsSchema,
        sizeBytes: record.sizeBytes,
        folderId: record.folderId ?? null,
        createdAt: record.createdAt,
      })),
      total: filtered.length,
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
    const ext = path.extname(record.storagePath).toLowerCase();

    const { columns, rows } = await readTableRows(record.storagePath, ext, page, limit);
    const total = record.rowCount;
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      id: record.id,
      shortCode: record.shortCode,
      tableName: record.tableName,
      columns: columns.length > 0 ? columns : ((record.columnsSchema as string[]) || []),
      data: rows,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  async getTableDownloadStream(shortCode: string) {
    const record = await this.getTableByShortCode(shortCode);
    return {
      record,
      fileStream: createReadStream(record.storagePath),
    };
  }

  async deleteTable(id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la tabla debe ser un UUID válido', 'INVALID_ID');
    }

    const record = await tablesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    await tablesRepository.deleteById(id);

    try {
      await fs.unlink(record.storagePath);
    } catch {
      // Ignorar si el archivo en disco ya no existía
    }

    return { deleted: true };
  }
}

export const tablesService = new TablesService();
