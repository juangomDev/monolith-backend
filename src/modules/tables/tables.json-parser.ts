import fs from 'node:fs/promises';
import { AppError } from '../../shared/errors.js';
import { sanitizeFormulaCell, type RichTableData } from './tables.parser.js';

/**
 * Parsea un archivo JSON estructurado (array de objetos o contenedor tabular)
 * y lo convierte a RichTableData para almacenamiento y análisis RAG.
 */
export async function parseJsonTable(filePath: string): Promise<RichTableData> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    throw new AppError(400, `No se pudo leer el archivo JSON: ${err.message}`, 'READ_ERROR');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err: any) {
    throw new AppError(400, `Formato JSON inválido: ${err.message}`, 'INVALID_JSON');
  }

  let rawRows: any[] = [];
  let explicitColumns: string[] | null = null;

  if (Array.isArray(raw)) {
    rawRows = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
      explicitColumns = obj.columns.map(String);
      rawRows = obj.rows;
    } else if (Array.isArray(obj.data)) {
      rawRows = obj.data;
    } else if (Array.isArray(obj.rows)) {
      rawRows = obj.rows;
    } else if (Array.isArray(obj.items)) {
      rawRows = obj.items;
    } else {
      rawRows = [obj];
    }
  } else {
    throw new AppError(
      400,
      'El contenido JSON debe ser una lista de registros o un objeto tabular',
      'INVALID_JSON_STRUCTURE'
    );
  }

  if (rawRows.length === 0) {
    throw new AppError(400, 'El archivo JSON no contiene registros', 'EMPTY_TABLE');
  }

  const columnSet = new Set<string>();
  if (explicitColumns && explicitColumns.length > 0) {
    for (const c of explicitColumns) columnSet.add(c);
  }

  const normalizedRows: Record<string, any>[] = [];
  for (const item of rawRows) {
    if (item === null || item === undefined) continue;

    if (typeof item !== 'object') {
      columnSet.add('valor');
      normalizedRows.push({ valor: sanitizeFormulaCell(item) });
      continue;
    }

    if (Array.isArray(item)) {
      const rowObj: Record<string, any> = {};
      item.forEach((val, idx) => {
        const colName =
          explicitColumns && explicitColumns[idx] ? explicitColumns[idx] : `col_${idx + 1}`;
        columnSet.add(colName);
        rowObj[colName] = sanitizeFormulaCell(val);
      });
      normalizedRows.push(rowObj);
    } else {
      const rowObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        const cleanKey = String(k).trim() || 'col';
        columnSet.add(cleanKey);
        rowObj[cleanKey] = sanitizeFormulaCell(v);
      }
      normalizedRows.push(rowObj);
    }
  }

  const columns = Array.from(columnSet);
  if (columns.length === 0) {
    throw new AppError(400, 'No se pudieron deducir columnas del archivo JSON', 'NO_COLUMNS_FOUND');
  }

  const finalRows = normalizedRows.map((r) => {
    const fullRow: Record<string, any> = {};
    for (const c of columns) {
      fullRow[c] = r[c] !== undefined ? r[c] : null;
    }
    return fullRow;
  });

  return {
    columns,
    rowCount: finalRows.length,
    headers: [columns],
    merges: [],
    rows: finalRows,
  };
}

/**
 * Extrae metadatos (columnas y total de filas) de un archivo JSON
 */
export async function parseJsonMetadata(filePath: string): Promise<{ columns: string[]; rowCount: number }> {
  const table = await parseJsonTable(filePath);
  return { columns: table.columns, rowCount: table.rowCount };
}

/**
 * Lee y pagina las filas de un archivo JSON estructurado
 */
export async function readJsonRows(filePath: string, page = 1, limit = 50): Promise<{ columns: string[]; rows: any[] }> {
  const table = await parseJsonTable(filePath);
  const startIndex = (page - 1) * limit;
  const rows = table.rows.slice(startIndex, startIndex + limit);
  return { columns: table.columns, rows };
}

