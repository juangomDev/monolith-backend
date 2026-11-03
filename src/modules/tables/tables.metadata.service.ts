import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { Role, FolderPermission } from '@prisma/client';
import { tablesRepository } from './tables.repository.js';
import { foldersSharesService } from '../folders/folders.shares.service.js';
import { AppError } from '../../shared/errors.js';
import type { RequesterContext } from '../folders/folders.service.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUMMARY_REGEX = /\b(total|totales|sum|suma|promedio|average|resumen|subtotal|general)\b/i;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}/;

export interface TableMetadataCard {
  title?: string;
  description?: string;
  tags?: string[];
  unit?: string;
  entities: string[];
  columnsMeta: Record<string, string>;
  hasSummaryRows: boolean;
}

export const updateTableMetadataZodSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).optional(),
  unit: z.string().trim().max(100).optional(),
  columnsMeta: z.record(z.string(), z.string()).optional(),
  hasSummaryRows: z.boolean().optional(),
});

export function generateInitialMetadataCard(richData: {
  columns: string[];
  rows: Record<string, any>[];
  headers?: string[][];
  merges?: string[];
}): TableMetadataCard {
  const columnsMeta: Record<string, string> = {};
  for (const col of richData.columns) {
    columnsMeta[col] = col;
  }

  if (richData.headers && richData.headers.length > 0) {
    const primaryHeader = richData.headers[0];
    richData.columns.forEach((col, idx) => {
      if (primaryHeader && primaryHeader[idx]) {
        columnsMeta[col] = String(primaryHeader[idx]).trim();
      }
    });
  }

  let hasSummaryRows = false;
  const entitySet = new Set<string>();
  const totalRows = richData.rows.length;

  for (let i = 0; i < totalRows; i++) {
    const row = richData.rows[i];
    const isNearEnd = i >= totalRows - 3;

    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val === null || val === undefined) continue;

      const strVal = String(val).trim();
      if (!strVal || strVal.length < 2 || strVal.length > 60) continue;

      if (isNearEnd && SUMMARY_REGEX.test(strVal)) {
        hasSummaryRows = true;
      }

      if (isNaN(Number(strVal)) && !DATE_ISO_REGEX.test(strVal) && !UUID_REGEX.test(strVal)) {
        if (!SUMMARY_REGEX.test(strVal) && entitySet.size < 200) {
          entitySet.add(strVal);
        }
      }
    }
  }

  return {
    entities: Array.from(entitySet),
    columnsMeta,
    hasSummaryRows,
  };
}

export class TablesMetadataService {
  async updateMetadata(id: string, rawInput: unknown, requester?: RequesterContext) {
    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la tabla debe ser un UUID válido', 'INVALID_ID');
    }

    const parseResult = updateTableMetadataZodSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const invalidParams = Object.entries(parseResult.error.flatten().fieldErrors).map(([name, errs]) => ({
        name,
        reason: (errs as string[])?.join(', ') || 'Valor inválido',
      }));
      throw new AppError(400, 'Datos de metadatos inválidos', 'VALIDATION_ERROR', invalidParams);
    }
    const input = parseResult.data;

    const table = await tablesRepository.findById(id);
    if (!table) {
      throw new AppError(404, 'Tabla no encontrada', 'NOT_FOUND');
    }

    if (requester && requester.role !== Role.ADMIN) {
      if (table.folder && table.folder.userId !== requester.id) {
        if (table.folderId) {
          await foldersSharesService.assertFolderAccess(table.folderId, requester, FolderPermission.EDIT);
        } else {
          throw new AppError(403, 'No tienes permiso para modificar los metadatos de esta tabla', 'FORBIDDEN');
        }
      }
    }

    const currentCard: TableMetadataCard = (table.metadataCard as any) || {
      entities: [],
      columnsMeta: {},
      hasSummaryRows: false,
    };

    const updatedCard: TableMetadataCard = {
      ...currentCard,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.columnsMeta !== undefined && {
        columnsMeta: { ...currentCard.columnsMeta, ...input.columnsMeta },
      }),
      ...(input.hasSummaryRows !== undefined && { hasSummaryRows: input.hasSummaryRows }),
    };

    const updated = await tablesRepository.updateMetadata(id, updatedCard);

    // Sincronizar archivo gz si existe
    try {
      const gzPath = path.join(path.dirname(table.storagePath), `${table.shortCode}.data.json.gz`);
      const gzBuffer = await fs.readFile(gzPath);
      const parsedGz = JSON.parse((await gunzipAsync(gzBuffer)).toString('utf-8'));
      parsedGz.metadataCard = updatedCard;
      parsedGz.updatedAt = updated.updatedAt;
      const newGzBuffer = await gzipAsync(Buffer.from(JSON.stringify(parsedGz), 'utf-8'));
      await fs.writeFile(gzPath, newGzBuffer);
    } catch {}

    return {
      id: updated.id,
      shortCode: updated.shortCode,
      metadataCard: updated.metadataCard,
    };
  }
}

export const tablesMetadataService = new TablesMetadataService();
