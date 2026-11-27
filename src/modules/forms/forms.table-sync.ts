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
import {
  extractFieldNames,
  normalizeFieldsSchema,
  mergeEntryAndResolutionPayload,
  formatValueForFlatExport,
  type FieldDefinition,
} from './forms.validator.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const tablesDir = path.resolve(process.cwd(), 'storage/tables');

function buildOpenTableColumns(form: FormDefinition): string[] {
  const entryFields = normalizeFieldsSchema(form.entryFieldsSchema);
  const resFields = normalizeFieldsSchema(form.resolutionFieldsSchema);
  const arrayFields = entryFields.filter((f) => f.type === 'array');

  if (arrayFields.length === 0) {
    return ['id', ...entryFields.map((f) => f.name), 'status', ...resFields.map((f) => f.name), 'createdAt', 'resolvedAt'];
  }

  const scalarEntryCols = entryFields.filter((f) => f.type !== 'array').map((f) => f.name);
  const itemColSet = new Set<string>();
  for (const af of arrayFields) {
    for (const sub of af.itemsSchema || []) itemColSet.add(sub.name);
    for (const rSub of af.resolutionItemsSchema || []) itemColSet.add(rSub.name);
  }
  for (const raf of resFields.filter((f) => f.type === 'array')) {
    for (const sub of raf.itemsSchema || []) itemColSet.add(sub.name);
  }
  const scalarResCols = resFields.filter((f) => f.type !== 'array').map((f) => f.name);

  return ['id', 'entryId', 'itemIndex', ...scalarEntryCols, ...Array.from(itemColSet), 'status', ...scalarResCols, 'createdAt', 'resolvedAt'];
}

export class FormsTableSync {
  async initializeLinkedTable(form: FormDefinition): Promise<TableRegistry> {
    await fs.mkdir(tablesDir, { recursive: true });
    const shortCode = generateShortCode();
    const combinedCols = buildOpenTableColumns(form);
    const csvPath = path.join(tablesDir, `form_${shortCode}.csv`);
    const headerLine = combinedCols.join(',') + '\n';
    await fs.writeFile(csvPath, headerLine, 'utf-8');

    const precalculated = {
      id: '', shortCode, tableName: `Respuestas: ${form.title}`, rowCount: 0,
      columns: combinedCols, headers: [combinedCols], merges: [], data: [],
      createdAt: new Date(), updatedAt: new Date(),
    };

    const record = await tablesRepository.create({
      shortCode, tableName: `Respuestas: ${form.title}`, rowCount: 0, columnsSchema: combinedCols,
      metadataCard: {
        title: `Tabla Abierta: ${form.title}`,
        description: `Respuestas sincronizadas en tiempo real del formulario ${form.slug}`,
        tags: ['form', 'respuestas', form.slug],
      } as any,
      sizeBytes: Buffer.byteLength(headerLine), storagePath: csvPath, folderId: form.folderId,
    });

    precalculated.id = record.id;
    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculated), 'utf-8'));
    await fs.writeFile(path.join(tablesDir, `${shortCode}.data.json.gz`), gzBuffer);
    await formsRepository.updateForm(form.id, { linkedTable: { connect: { id: record.id } } });
    return record;
  }

  async syncEntryToTable(form: FormDefinition, entry: FormEntry, isResolution: boolean = false): Promise<void> {
    if (!form.linkedTableId) return;
    const table = await tablesRepository.findById(form.linkedTableId);
    if (!table) return;

    const gzPath = path.join(tablesDir, `${table.shortCode}.data.json.gz`);
    let precalculated: any = null;
    const baseCols = buildOpenTableColumns(form);

    try {
      const compressed = await fs.readFile(gzPath);
      precalculated = JSON.parse((await gunzipAsync(compressed)).toString('utf-8'));
    } catch {
      precalculated = { id: table.id, shortCode: table.shortCode, tableName: table.tableName, rowCount: 0, columns: baseCols, headers: [baseCols], merges: [], data: [] };
    }

    const entryFields = normalizeFieldsSchema(form.entryFieldsSchema);
    const resFields = normalizeFieldsSchema(form.resolutionFieldsSchema);
    const primaryArrayField: FieldDefinition | undefined = entryFields.find((f) => f.type === 'array');

    const entryPayload = typeof entry.entryPayload === 'object' && entry.entryPayload ? (entry.entryPayload as Record<string, any>) : {};
    const resPayload = typeof entry.resolutionPayload === 'object' && entry.resolutionPayload ? (entry.resolutionPayload as Record<string, any>) : {};
    const mergedPayload = mergeEntryAndResolutionPayload(entryPayload, resPayload);

    const createdAtStr = entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt);
    const resolvedAtStr = entry.resolvedAt ? (entry.resolvedAt instanceof Date ? entry.resolvedAt.toISOString() : String(entry.resolvedAt)) : null;

    let data: Record<string, any>[] = Array.isArray(precalculated.data) ? precalculated.data : [];
    const colSet = new Set<string>(Array.isArray(precalculated.columns) ? precalculated.columns : baseCols);

    if (primaryArrayField && Array.isArray(mergedPayload[primaryArrayField.name]) && mergedPayload[primaryArrayField.name].length > 0) {
      const items: any[] = mergedPayload[primaryArrayField.name];
      const scalarEntryCols = entryFields.filter((f) => f.type !== 'array').map((f) => f.name);
      const scalarResCols = resFields.filter((f) => f.type !== 'array').map((f) => f.name);

      colSet.add('entryId');
      colSet.add('itemIndex');

      const newRows: Record<string, any>[] = items.map((item, idx) => {
        const row: Record<string, any> = {
          id: `${entry.id}_${idx + 1}`,
          entryId: entry.id,
          itemIndex: idx + 1,
          status: entry.status,
          createdAt: createdAtStr,
          resolvedAt: resolvedAtStr,
        };
        for (const c of scalarEntryCols) row[c] = mergedPayload[c] ?? null;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            colSet.add(k);
            row[k] = v ?? null;
          }
        }
        for (const c of scalarResCols) row[c] = mergedPayload[c] ?? null;
        return row;
      });

      if (isResolution) {
        data = data.filter((r) => r.entryId !== entry.id && r.id !== entry.id);
      }
      data.push(...newRows);
    } else {
      const entryCols = extractFieldNames(form.entryFieldsSchema);
      const resCols = extractFieldNames(form.resolutionFieldsSchema);
      const row: Record<string, any> = {
        id: entry.id,
        status: entry.status,
        createdAt: createdAtStr,
        resolvedAt: resolvedAtStr,
      };
      for (const c of entryCols) row[c] = mergedPayload[c] ?? null;
      for (const c of resCols) row[c] = mergedPayload[c] ?? null;

      if (isResolution) {
        const idx = data.findIndex((r) => r.id === entry.id);
        if (idx >= 0) data[idx] = row;
        else data.push(row);
      } else {
        data.push(row);
      }
    }

    const updatedColumns = Array.from(colSet);
    precalculated.columns = updatedColumns;
    precalculated.headers = [updatedColumns];
    precalculated.data = data;
    precalculated.rowCount = data.length;
    precalculated.updatedAt = new Date();

    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculated), 'utf-8'));
    await fs.writeFile(gzPath, gzBuffer);

    await tablesRepository.update(table.id, {
      rowCount: data.length,
      columnsSchema: updatedColumns,
      updatedAt: new Date(),
    });
  }

  async removeEntryFromTable(form: FormDefinition, entryId: string): Promise<number> {
    if (!form.linkedTableId) return 0;
    const table = await tablesRepository.findById(form.linkedTableId);
    if (!table) return 0;

    const gzPath = table.storagePath
      ? path.join(path.dirname(table.storagePath), `${table.shortCode}.data.json.gz`)
      : path.join(tablesDir, `${table.shortCode}.data.json.gz`);

    let precalculated: any = null;
    try {
      const compressed = await fs.readFile(gzPath);
      precalculated = JSON.parse((await gunzipAsync(compressed)).toString('utf-8'));
    } catch {
      return 0;
    }

    const currentRows: Record<string, any>[] = Array.isArray(precalculated.data) ? precalculated.data : [];
    const filteredRows = currentRows.filter((r) => r?.entryId !== entryId && r?.id !== entryId);
    const removedCount = currentRows.length - filteredRows.length;

    precalculated.data = filteredRows;
    precalculated.rowCount = filteredRows.length;
    precalculated.updatedAt = new Date();

    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(precalculated), 'utf-8'));
    await fs.writeFile(gzPath, gzBuffer);

    await tablesRepository.update(table.id, {
      rowCount: filteredRows.length,
      updatedAt: new Date(),
    });

    return removedCount;
  }

  async exportEntries(
    entries: FormEntry[],
    form: FormDefinition,
    format: 'xlsx' | 'csv'
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const entryFields = normalizeFieldsSchema(form.entryFieldsSchema);
    const resFields = normalizeFieldsSchema(form.resolutionFieldsSchema);
    const entryCols = entryFields.map((f) => f.name);
    const resCols = resFields.filter((f) => !entryCols.includes(f.name)).map((f) => f.name);
    const columns = ['id', ...entryCols, 'status', ...resCols, 'createdAt', 'resolvedAt'];

    const rows = entries.map((e) => {
      const merged = mergeEntryAndResolutionPayload(e.entryPayload as any, e.resolutionPayload as any);
      const r: Record<string, any> = {
        id: e.id,
        status: e.status,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
        resolvedAt: e.resolvedAt ? (e.resolvedAt instanceof Date ? e.resolvedAt.toISOString() : String(e.resolvedAt)) : '',
      };
      for (const c of entryCols) r[c] = formatValueForFlatExport(merged[c]);
      for (const c of resCols) r[c] = formatValueForFlatExport(merged[c]);
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
    const worksheet = workbook.addWorksheet('Solicitudes');
    worksheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(c.length + 4, 16) }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.commit();

    for (const r of rows) worksheet.addRow(r);

    // Si hay campos de tipo lista (array), generar automáticamente una Hoja 2 de Detalle conectada por entryId
    const arrayFields = entryFields.filter((f) => f.type === 'array');
    const scalarEntryCols = entryFields.filter((f) => f.type !== 'array').map((f) => f.name);
    const scalarResCols = resFields.filter((f) => f.type !== 'array').map((f) => f.name);

    for (const af of arrayFields) {
      const detailRows: Record<string, any>[] = [];
      const itemColSet = new Set<string>();
      for (const sub of af.itemsSchema || []) itemColSet.add(sub.name);
      for (const rSub of af.resolutionItemsSchema || []) itemColSet.add(rSub.name);

      for (const e of entries) {
        const merged = mergeEntryAndResolutionPayload(e.entryPayload as any, e.resolutionPayload as any);
        const list = Array.isArray(merged[af.name]) ? merged[af.name] : [];
        list.forEach((item: any, idx: number) => {
          const dRow: Record<string, any> = {
            entryId: e.id,
            itemIndex: idx + 1,
            status: e.status,
          };
          for (const sc of scalarEntryCols) dRow[sc] = merged[sc] ?? '';
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            for (const [k, v] of Object.entries(item)) {
              itemColSet.add(k);
              dRow[k] = v ?? '';
            }
          }
          for (const rc of scalarResCols) dRow[rc] = merged[rc] ?? '';
          detailRows.push(dRow);
        });
      }

      const sheetName = `Detalle_${af.name}`.slice(0, 31);
      const detailSheet = workbook.addWorksheet(sheetName);
      const detailCols = ['entryId', 'itemIndex', ...scalarEntryCols, ...Array.from(itemColSet), 'status', ...scalarResCols];
      detailSheet.columns = detailCols.map((c) => ({ header: c, key: c, width: Math.max(c.length + 4, 15) }));

      const dHeader = detailSheet.getRow(1);
      dHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      dHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      dHeader.commit();

      for (const dr of detailRows) detailSheet.addRow(dr);
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

