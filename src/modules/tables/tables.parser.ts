import * as csv from 'fast-csv';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { AppError } from '../../shared/errors.js';

export interface ParsedTableMetadata {
  columns: string[];
  rowCount: number;
}

export interface PaginatedTableData {
  columns: string[];
  rows: Record<string, any>[];
}

/**
 * Extrae metadatos (columnas y número de filas) de un archivo CSV
 */
export async function parseCsvMetadata(filePath: string): Promise<ParsedTableMetadata> {
  return new Promise((resolve, reject) => {
    let columns: string[] = [];
    let rowCount = 0;

    const stream = fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, trim: true }))
      .on('headers', (headers: string[]) => {
        columns = headers.filter((h) => typeof h === 'string' && h.trim().length > 0);
      })
      .on('data', () => {
        rowCount++;
      })
      .on('end', () => {
        resolve({ columns, rowCount });
      })
      .on('error', (err) => {
        reject(new AppError(400, `Error procesando archivo CSV: ${err.message}`, 'PARSER_ERROR'));
      });

    stream.on('error', (err) => {
      reject(new AppError(400, `Error leyendo archivo CSV: ${err.message}`, 'PARSER_ERROR'));
    });
  });
}

/**
 * Lee filas paginadas de un archivo CSV
 */
export async function readCsvRows(
  filePath: string,
  page: number,
  limit: number
): Promise<PaginatedTableData> {
  return new Promise((resolve, reject) => {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    let currentIndex = 0;
    let columns: string[] = [];
    const rows: Record<string, any>[] = [];

    const stream = fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, trim: true }))
      .on('headers', (headers: string[]) => {
        columns = headers.filter((h) => typeof h === 'string' && h.trim().length > 0);
      })
      .on('data', (row: Record<string, any>) => {
        if (currentIndex >= startIndex && currentIndex < endIndex) {
          rows.push(row);
        }
        currentIndex++;
      })
      .on('end', () => {
        resolve({ columns, rows });
      })
      .on('error', (err) => {
        reject(new AppError(400, `Error leyendo datos del CSV: ${err.message}`, 'PARSER_ERROR'));
      });

    stream.on('error', (err) => {
      reject(new AppError(400, `Error en el flujo del CSV: ${err.message}`, 'PARSER_ERROR'));
    });
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

    if (!worksheet) {
      return { columns: [], rowCount: 0 };
    }

    const headerRow = worksheet.getRow(1);
    const columns: string[] = [];
    headerRow.eachCell((cell) => {
      const val = cell.value !== undefined && cell.value !== null ? String(cell.value).trim() : '';
      if (val) columns.push(val);
    });

    const totalRows = worksheet.rowCount;
    const rowCount = Math.max(0, totalRows - 1);

    return { columns, rowCount };
  } catch (err: any) {
    throw new AppError(400, `Error procesando archivo Excel: ${err.message}`, 'PARSER_ERROR');
  }
}

/**
 * Lee filas paginadas de un archivo Excel (.xlsx)
 */
export async function readXlsxRows(
  filePath: string,
  page: number,
  limit: number
): Promise<PaginatedTableData> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return { columns: [], rows: [] };
    }

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
        if (val && typeof val === 'object' && 'result' in val) {
          val = (val as any).result;
        }
        rowData[colName] = val !== undefined ? val : null;
        if (val !== undefined && val !== null && val !== '') {
          hasValue = true;
        }
      });

      if (hasValue) {
        rows.push(rowData);
      }
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
  if (cleanExt === '.csv') {
    return parseCsvMetadata(filePath);
  }
  if (cleanExt === '.xlsx') {
    return parseXlsxMetadata(filePath);
  }
  throw new AppError(415, `Formato '${ext}' no soportado. Use .csv o .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
}

/**
 * Enrutador principal para lectura paginada según extensión
 */
export async function readTableRows(
  filePath: string,
  ext: string,
  page: number,
  limit: number
): Promise<PaginatedTableData> {
  const cleanExt = ext.toLowerCase();
  if (cleanExt === '.csv') {
    return readCsvRows(filePath, page, limit);
  }
  if (cleanExt === '.xlsx') {
    return readXlsxRows(filePath, page, limit);
  }
  throw new AppError(415, `Formato '${ext}' no soportado. Use .csv o .xlsx`, 'UNSUPPORTED_MEDIA_TYPE');
}
