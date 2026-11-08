import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import * as csv from 'fast-csv';
import type { FormDefinition, FormEntry, TableRegistry } from '@prisma/client';
import { tablesRepository } from '../tables/tables.repository.js';
import { formsRepository } from './forms.repository.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { extractFieldNames } from './forms.validator.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const tablesDir = path.resolve(process.cwd(), 'storage/tables');

export class FormsTableSync {
  async initializeLinkedTable(form: FormDefinition): Promise<TableRegistry> {
    await fs.mkdir(tablesDir, { recursive: true });
    const shortCode = generateShortCode();

    const entryCols = extractFieldNames(form.entryFieldsSchema);
    const resCols = extractFieldNames(form.resolutionFieldsSchema);
    const combinedCols = ['id', ...entryCols, 'status', ...resCols, 'createdAt', 'resolvedAt'];

    const csvPath = path.join(tablesDir, `form_${shortCode}.csv`);
    const headerLine = combinedCols.join(',') + '\n';
    await fs.writeFile(csvPath, headerLine, 'utf-8');

    const precalculated = {
      id: '',
      shortCode,
      tableName: `Respuestas: ${form.title}`,
      rowCount: 0,
      columns: combinedCols,
      headers: [combinedCols],
      merges: [],
      data: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const record = await tablesRepository.create({
      shortCode,
      tableName: `Respuestas: ${form.title}`,
      rowCount: 0,
      columnsSchema: combinedCols,
      metadataCard: {
        title: `Tabla Abierta: ${form.title}`,
        description: `Respuestas sincronizadas en tiempo real del formulario ${form.slug}`,
        tags: ['form', 'respuestas', form.slug],
      } as any,
      sizeBytes: Buffer.byteLength(headerLine),
      storagePath: csvPath,
      folderId: form.folderId,
    });

    precalculated.id = record.id;
    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculated), 'utf-8'));
    await fs.writeFile(path.join(tablesDir, `${shortCode}.data.json.gz`), gzBuffer);

    await formsRepository.updateForm(form.id, {
      linkedTable: { connect: { id: record.id } },
    });

    return record;
  }

  async syncEntryToTable(form: FormDefinition, entry: FormEntry, isResolution: boolean = false): Promise<void> {
    if (!form.linkedTableId) return;

    const table = await tablesRepository.findById(form.linkedTableId);
    if (!table) return;

    const gzPath = path.join(tablesDir, `${table.shortCode}.data.json.gz`);
    let precalculated: any = null;

    try {
      const compressed = await fs.readFile(gzPath);
      const jsonBuf = await gunzipAsync(compressed);
      precalculated = JSON.parse(jsonBuf.toString('utf-8'));
    } catch {
      const entryCols = extractFieldNames(form.entryFieldsSchema);
      const resCols = extractFieldNames(form.resolutionFieldsSchema);
      const combinedCols = ['id', ...entryCols, 'status', ...resCols, 'createdAt', 'resolvedAt'];
      precalculated = {
        id: table.id,
        shortCode: table.shortCode,
        tableName: table.tableName,
        rowCount: 0,
        columns: combinedCols,
        headers: [combinedCols],
        merges: [],
        data: [],
      };
    }

    const entryCols = extractFieldNames(form.entryFieldsSchema);
    const resCols = extractFieldNames(form.resolutionFieldsSchema);

    const entryPayload = (typeof entry.entryPayload === 'object' && entry.entryPayload) ? entry.entryPayload as Record<string, any> : {};
    const resPayload = (typeof entry.resolutionPayload === 'object' && entry.resolutionPayload) ? entry.resolutionPayload as Record<string, any> : {};

    const row: Record<string, any> = {
      id: entry.id,
      status: entry.status,
      createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
      resolvedAt: entry.resolvedAt ? (entry.resolvedAt instanceof Date ? entry.resolvedAt.toISOString() : String(entry.resolvedAt)) : null,
    };

    for (const c of entryCols) row[c] = entryPayload[c] ?? null;
    for (const c of resCols) row[c] = resPayload[c] ?? null;

    const data: Record<string, any>[] = Array.isArray(precalculated.data) ? precalculated.data : [];

    if (isResolution) {
      const idx = data.findIndex((r) => r.id === entry.id);
      if (idx >= 0) data[idx] = row;
      else data.push(row);
    } else {
      data.push(row);
    }

    precalculated.data = data;
    precalculated.rowCount = data.length;
    precalculated.updatedAt = new Date();

    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculated), 'utf-8'));
    await fs.writeFile(gzPath, gzBuffer);

    await tablesRepository.update(table.id, {
      rowCount: data.length,
      updatedAt: new Date(),
    });
  }

  async exportEntries(
    entries: FormEntry[],
    form: FormDefinition,
    format: 'xlsx' | 'csv'
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const entryCols = extractFieldNames(form.entryFieldsSchema);
    const resCols = extractFieldNames(form.resolutionFieldsSchema);
    const columns = ['id', ...entryCols, 'status', ...resCols, 'createdAt', 'resolvedAt'];

    const rows = entries.map((e) => {
      const ep = (e.entryPayload as Record<string, any>) || {};
      const rp = (e.resolutionPayload as Record<string, any>) || {};
      const r: Record<string, any> = {
        id: e.id,
        status: e.status,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
        resolvedAt: e.resolvedAt ? (e.resolvedAt instanceof Date ? e.resolvedAt.toISOString() : String(e.resolvedAt)) : '',
      };
      for (const c of entryCols) r[c] = ep[c] ?? '';
      for (const c of resCols) r[c] = rp[c] ?? '';
      return r;
    });

    if (format === 'csv') {
      const csvStr = await csv.writeToString(rows, { headers: columns });
      return {
        buffer: Buffer.from(csvStr, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `${form.slug}_export_${Date.now()}.csv`,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Respuestas');

    worksheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(c.length + 4, 14) }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.commit();

    for (const r of rows) {
      worksheet.addRow(r);
    }

    const xlsxBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(xlsxBuffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${form.slug}_export_${Date.now()}.xlsx`,
    };
  }
}

export const formsTableSync = new FormsTableSync();

