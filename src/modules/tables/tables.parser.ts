import * as csv from 'fast-csv';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { AppError } from '../../shared/errors.js';
export { generateInitialMetadataCard, type TableMetadataCard } from './tables.metadata.service.js';

export interface ParsedTableMetadata {
  columns: string[];
  rowCount: number;
}

export interface PaginatedTableData {
  columns: string[];
  rows: Record<string, any>[];
}

export interface CellStyle {
  bg?: string;
  bold?: boolean;
  align?: string;
}

export interface RichTableData {
  columns: string[];
  rowCount: number;
  headers: string[][];
  merges: string[];
  rows: Record<string, any>[];
  cellStyles?: Record<string, Record<string, CellStyle>>;
}

/**
 * Sanitiza valores contra inyección de fórmulas CSV (=, +, -, @, \t, \r)
 */
export function sanitizeFormulaCell(value: any): any {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Extrae metadatos (columnas y número de filas) de un archivo CSV
 */
export async function parseCsvMetadata(filePath: string): Promise<ParsedTableMetadata> {
  return new Promise((resolve, reject) => {
    let columns: string[] = [];
    let rowCount = 0;
    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, trim: true }))
      .on('headers', (headers: string[]) => {
        columns = headers.filter((h) => typeof h === 'string' && h.trim().length > 0);
      })
      .on('data', () => { rowCount++; })
      .on('end', () => resolve({ columns, rowCount }))
      .on('error', (err) => reject(new AppError(400, `Error procesando archivo CSV: ${err.message}`, 'PARSER_ERROR')));
  });
}

/**
 * Lee filas paginadas de un archivo CSV
 */
export async function readCsvRows(filePath: string, page: number, limit: number): Promise<PaginatedTableData> {
  return new Promise((resolve, reject) => {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    let currentIndex = 0;
    let columns: string[] = [];
    const rows: Record<string, any>[] = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, trim: true }))
      .on('headers', (headers: string[]) => {
        columns = headers.filter((h) => typeof h === 'string' && h.trim().length > 0);
      })
      .on('data', (row: Record<string, any>) => {
        if (currentIndex >= startIndex && currentIndex < endIndex) rows.push(row);
        currentIndex++;
      })
      .on('end', () => resolve({ columns, rows }))
      .on('error', (err) => reject(new AppError(400, `Error leyendo datos del CSV: ${err.message}`, 'PARSER_ERROR')));
  });
}

/**
 * Extrae metadatos (columnas y conteo de filas) de un archivo Excel (.xlsx)
 */
export async function parseXlsxMetadata(filePath: string): Promise<ParsedTableMetadata> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { columns: [], rowCount: 0 };

    const headerRow = worksheet.getRow(1);
    const columns: string[] = [];
    headerRow.eachCell((cell) => {
      const val = cell.value !== undefined && cell.value !== null ? String(cell.value).trim() : '';
      if (val) columns.push(val);
    });

    return { columns, rowCount: Math.max(0, worksheet.rowCount - 1) };
  } catch (err: any) {
    throw new AppError(400, `Error procesando archivo Excel: ${err.message}`, 'PARSER_ERROR');
  }
}

/**
 * Lee filas paginadas de un archivo Excel (.xlsx)
 */
export async function readXlsxRows(filePath: string, page: number, limit: number): Promise<PaginatedTableData> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { columns: [], rows: [] };

    const headerRow = worksheet.getRow(1);
    const columns: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      const val = cell.value !== undefined && cell.value !== null ? String(cell.value).trim() : `col_${colNumber}`;
      columns.push(val);
    });

    const startIndex = (page - 1) * limit + 2; // Fila 1 es cabecera, datos inician en fila 2
    const totalRows = worksheet.rowCount;
    const endIndex = Math.min(startIndex + limit - 1, totalRows);
    const rows: Record<string, any>[] = [];

    for (let r = startIndex; r <= endIndex; r++) {
      const row = worksheet.getRow(r);
      const rowData: Record<string, any> = {};
      let hasValue = false;

      columns.forEach((colName, index) => {
        const cell = row.getCell(index + 1);
        let val: any = cell.value;
        if (val && typeof val === 'object' && 'result' in val) val = (val as any).result;
        rowData[colName] = val !== undefined ? val : null;
        if (val !== undefined && val !== null && val !== '') hasValue = true;
      });

      if (hasValue) rows.push(rowData);
    }

    return { columns, rows };
  } catch (err: any) {
    throw new AppError(400, `Error extrayendo filas de Excel: ${err.message}`, 'PARSER_ERROR');
  }
}

/**
 * Enrutador principal de parseo según extensión
 */
export async function parseTableMetadata(filePath: string, ext: string): Promise<ParsedTableMetadata> {
  const cleanExt = ext.toLowerCase();
  if (cleanExt === '.csv') return parseCsvMetadata(filePath);
  if (cleanExt === '.xlsx') return parseXlsxMetadata(filePath);
  throw new AppError(415, `Formato '${ext}' no soportado. Use .csv o .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
}

/**
 * Enrutador principal para lectura paginada según extensión
 */
export async function readTableRows(filePath: string, ext: string, page: number, limit: number): Promise<PaginatedTableData> {
  const cleanExt = ext.toLowerCase();
  if (cleanExt === '.csv') return readCsvRows(filePath, page, limit);
  if (cleanExt === '.xlsx') return readXlsxRows(filePath, page, limit);
  throw new AppError(415, `Formato '${ext}' no soportado. Use .csv o .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
}

function extractCellStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  let bg: string | undefined;
  if (cell.fill && cell.fill.type === 'pattern') {
    const fg = (cell.fill as ExcelJS.FillPattern).fgColor;
    if (fg?.argb) bg = fg.argb.length === 8 ? `#${fg.argb.slice(2)}` : `#${fg.argb}`;
  }
  const bold = Boolean(cell.font?.bold);
  const align = typeof cell.alignment?.horizontal === 'string' ? cell.alignment.horizontal : undefined;
  if (!bg && !bold && !align) return undefined;
  return { ...(bg && { bg }), ...(bold && { bold }), ...(align && { align }) };
}

/**
 * Extrae datos completos y enriquecidos (celdas combinadas, colores, estilos de celda)
 * para generar el artefacto pre-calculado .data.json.gz
 */
export async function extractRichTableData(filePath: string, ext: string): Promise<RichTableData> {
  const cleanExt = ext.toLowerCase();

  if (cleanExt === '.csv') {
    return new Promise((resolve, reject) => {
      let columns: string[] = [];
      const rows: Record<string, any>[] = [];

      fs.createReadStream(filePath)
        .pipe(csv.parse({ headers: true, trim: true }))
        .on('headers', (headers: string[]) => {
          columns = headers.filter((h) => typeof h === 'string' && h.trim().length > 0);
        })
        .on('data', (row: Record<string, any>) => { rows.push(row); })
        .on('end', () => resolve({ columns, rowCount: rows.length, headers: [columns], merges: [], rows }))
        .on('error', (err) => reject(new AppError(400, `Error procesando archivo CSV: ${err.message}`, 'PARSER_ERROR')));
    });
  }

  if (cleanExt === '.xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return { columns: [], rowCount: 0, headers: [], merges: [], rows: [] };

      const rawMerges = (worksheet.model.merges || []) as (string | { tl: string; br: string })[];
      const merges = rawMerges.map((m) => (typeof m === 'string' ? m : `${m.tl}:${m.br}`));

      const headerRow = worksheet.getRow(1);
      const colDefs: { name: string; colNumber: number }[] = [];
      const columns: string[] = [];
      const seenColCounts = new Map<string, number>();

      headerRow.eachCell((cell, colNumber) => {
        let baseVal = cell.value !== undefined && cell.value !== null ? String(cell.value).trim() : `col_${colNumber}`;
        if (!baseVal) baseVal = `col_${colNumber}`;
        const count = seenColCounts.get(baseVal) || 0;
        seenColCounts.set(baseVal, count + 1);
        const colName = count === 0 ? baseVal : `${baseVal}_${count + 1}`;

        columns.push(colName);
        colDefs.push({ name: colName, colNumber });
      });

      const totalRows = worksheet.rowCount;
      const rows: Record<string, any>[] = [];
      const cellStyles: Record<string, Record<string, CellStyle>> = {};

      for (let r = 2; r <= totalRows; r++) {
        const row = worksheet.getRow(r);
        const rowData: Record<string, any> = {};
        const rowStyles: Record<string, CellStyle> = {};
        let hasValue = false;

        colDefs.forEach(({ name: colName, colNumber }) => {
          const cell = row.getCell(colNumber);
          let val: any = cell.value;
          if (val && typeof val === 'object' && 'result' in val) val = (val as any).result;
          rowData[colName] = val !== undefined ? val : null;
          if (val !== undefined && val !== null && val !== '') hasValue = true;

          const style = extractCellStyle(cell);
          if (style) rowStyles[colName] = style;
        });

        if (hasValue) {
          const rowIndexKey = String(rows.length);
          rows.push(rowData);
          if (Object.keys(rowStyles).length > 0) cellStyles[rowIndexKey] = rowStyles;
        }
      }

      return {
        columns,
        rowCount: rows.length,
        headers: [columns],
        merges,
        rows,
        cellStyles: Object.keys(cellStyles).length > 0 ? cellStyles : undefined,
      };
    } catch (err: any) {
      throw new AppError(400, `Error extrayendo datos enriquecidos de Excel: ${err.message}`, 'PARSER_ERROR');
    }
  }

  throw new AppError(415, `Formato '${ext}' no soportado. Use .csv o .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
}
