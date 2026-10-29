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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TablesService {
  async saveTable(part: MultipartFile) {
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

    const stats = await fs.stat(targetPath);

    let metadata;
    try {
      metadata = await parseTableMetadata(targetPath, ext);
    } catch (parseErr) {
      await fs.unlink(targetPath).catch(() => {});
      throw parseErr;
    }

    const record = await tablesRepository.create({
      shortCode,
      tableName: part.filename || `table_${shortCode}${ext}`,
      rowCount: metadata.rowCount,
      columnsSchema: metadata.columns,
      sizeBytes: stats.size,
      storagePath: targetPath,
    });

    return {
      id: record.id,
      shortCode: record.shortCode,
      url: `${env.BASE_URL}/t/${record.shortCode}`,
      tableName: record.tableName,
      rowCount: record.rowCount,
      columns: record.columnsSchema,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt,
    };
  }

  async listTables() {
    const records = await tablesRepository.findAll();
    return {
      tables: records.map((record) => ({
        id: record.id,
        shortCode: record.shortCode,
        url: `${env.BASE_URL}/t/${record.shortCode}`,
        tableName: record.tableName,
        rowCount: record.rowCount,
        columns: record.columnsSchema,
        sizeBytes: record.sizeBytes,
        createdAt: record.createdAt,
      })),
      total: records.length,
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
