import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const PLACEHOLDER_COL_REGEX = /^col_\d+$/i;
const MERGED_DUP_SUFFIX_REGEX = /_\d+$/;

function isSyntheticColumn(col: string, allCols: string[]): boolean {
  if (PLACEHOLDER_COL_REGEX.test(col)) return true;
  if (MERGED_DUP_SUFFIX_REGEX.test(col)) {
    const base = col.replace(MERGED_DUP_SUFFIX_REGEX, '');
    if (allCols.includes(base)) return true;
  }
  return false;
}

function isEmptyCell(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  return false;
}

function isHeaderCandidateValue(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 120) return false;
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(trimmed) && isNaN(Number(trimmed));
}

/**
 * Limpia filas y columnas tabulares:
 * 1. Si las columnas originales contienen placeholders (col_2, col_3...) o títulos repetidos (_2, _3...)
 *    por celdas combinadas en la fila 1 de Excel, detecta automáticamente la fila real de encabezados y re-mapea las filas.
 * 2. Elimina filas 100% vacías.
 * 3. Elimina columnas fantasma (col_N / _N) o columnas 100% vacías originadas por bordes/relleno de Excel.
 */
export function cleanTabularRowsAndColumns(
  rawColumns: string[],
  rawRows: Record<string, any>[]
): { columns: string[]; rows: Record<string, any>[]; rowCount: number } {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    const baseCols = rawColumns || [];
    const cleanCols = baseCols.filter((c) => !isSyntheticColumn(c, baseCols));
    return { columns: cleanCols.length > 0 ? cleanCols : baseCols, rows: [], rowCount: 0 };
  }

  let workingColumns = [...(rawColumns || Object.keys(rawRows[0] || {}))];
  let workingRows = rawRows;

  const syntheticCount = workingColumns.filter((c) => isSyntheticColumn(c, workingColumns)).length;
  const realNamedCount = workingColumns.length - syntheticCount;

  // Si hay columnas sintéticas (típico de Excel con título combinado en fila 1), buscar la cabecera real
  if (syntheticCount > 0 && workingRows.length > 1) {
    const scanLimit = Math.min(12, workingRows.length - 1);
    let bestHeaderIdx = -1;
    let bestHeaderScore = realNamedCount;

    for (let i = 0; i < scanLimit; i++) {
      const candidateRow = workingRows[i];
      if (!candidateRow || typeof candidateRow !== 'object') continue;

      const distinctTexts = new Set<string>();
      let nonEmpty = 0;
      let textHeaders = 0;
      for (const col of workingColumns) {
        const val = candidateRow[col];
        if (!isEmptyCell(val)) {
          nonEmpty++;
          const strVal = String(val).trim();
          distinctTexts.add(strVal);
          if (isHeaderCandidateValue(val)) textHeaders++;
        }
      }

      // Una fila de cabecera real tiene al menos 2 encabezados distintos (no un subtítulo combinado repetido)
      if (textHeaders >= 2 && distinctTexts.size >= 2 && distinctTexts.size > bestHeaderScore) {
        bestHeaderScore = distinctTexts.size;
        bestHeaderIdx = i;
      }
    }

    if (bestHeaderIdx >= 0) {
      const headerRowObj = workingRows[bestHeaderIdx];
      const usedNames = new Map<string, number>();
      const colMapping: Array<{ oldCol: string; newCol: string }> = [];
      const newColumns: string[] = [];

      workingColumns.forEach((oldCol, idx) => {
        const rawHeaderVal = headerRowObj[oldCol];
        let baseName = !isEmptyCell(rawHeaderVal)
          ? String(rawHeaderVal).trim()
          : !isSyntheticColumn(oldCol, workingColumns)
            ? oldCol
            : `col_${idx + 1}`;

        const count = usedNames.get(baseName) || 0;
        usedNames.set(baseName, count + 1);
        const finalName = count === 0 ? baseName : `${baseName}_${count + 1}`;

        newColumns.push(finalName);
        colMapping.push({ oldCol, newCol: finalName });
      });

      workingColumns = newColumns;
      workingRows = workingRows.slice(bestHeaderIdx + 1).map((row) => {
        const mapped: Record<string, any> = {};
        for (const { oldCol, newCol } of colMapping) {
          mapped[newCol] = row[oldCol] !== undefined ? row[oldCol] : null;
        }
        return mapped;
      });
    }
  }

  // Filtrar filas que estén 100% vacías
  const nonEmptyRows = workingRows.filter((row) =>
    workingColumns.some((col) => !isEmptyCell(row?.[col]))
  );

  // Determinar qué columnas conservar
  const hasAnySynthetic =
    syntheticCount > 0 || workingColumns.some((c) => isSyntheticColumn(c, workingColumns));

  const activeColumns = workingColumns.filter((col) => {
    const hasData = nonEmptyRows.some((row) => !isEmptyCell(row?.[col]));
    if (isSyntheticColumn(col, workingColumns)) return hasData;
    if (hasAnySynthetic) return hasData;
    return true;
  });

  const finalColumns = activeColumns.length > 0 ? activeColumns : workingColumns;

  const finalRows = nonEmptyRows.map((row) => {
    const cleanRow: Record<string, any> = {};
    for (const col of finalColumns) {
      cleanRow[col] = row?.[col] !== undefined ? row[col] : null;
    }
    return cleanRow;
  });

  return {
    columns: finalColumns,
    rows: finalRows,
    rowCount: finalRows.length,
  };
}

/**
 * Construye el payload limpio para entrega en GET /t/:short_code
 * omitiendo relleno (cellStyles, metadataCard, merges, headers) salvo que se pida includeStyles.
 */
export function buildCleanTablePayload(
  rawPayload: {
    id: string;
    shortCode: string;
    tableName: string;
    columns: string[];
    rows: Record<string, any>[];
    total?: number;
    page?: number;
    limit?: number;
    headers?: string[][];
    merges?: string[];
    cellStyles?: any;
  },
  includeStyles = false
) {
  const cleaned = cleanTabularRowsAndColumns(rawPayload.columns, rawPayload.rows);
  const page = rawPayload.page ?? 1;
  const total = rawPayload.total !== undefined && rawPayload.total >= cleaned.rowCount && rawPayload.page !== undefined
    ? (cleaned.rowCount < rawPayload.rows.length ? cleaned.rowCount : rawPayload.total)
    : cleaned.rowCount;
  const limit = rawPayload.limit ?? (total > 0 ? total : 100);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    id: rawPayload.id,
    shortCode: rawPayload.shortCode,
    tableName: rawPayload.tableName,
    rowCount: total,
    columns: cleaned.columns,
    ...(includeStyles && rawPayload.headers ? { headers: rawPayload.headers } : {}),
    ...(includeStyles && rawPayload.merges ? { merges: rawPayload.merges } : {}),
    ...(includeStyles && rawPayload.cellStyles ? { cellStyles: rawPayload.cellStyles } : {}),
    data: cleaned.rows,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
    },
  };
}

/**
 * Transforma un buffer .data.json.gz en un stream gzip limpio sin relleno (sin cellStyles, metadataCard, merges ni col_N vacías).
 */
export async function createCleanGzipStreamFromBuffer(
  gzBuffer: Buffer,
  record: { id: string; shortCode: string; tableName: string; rowCount: number; columnsSchema: any }
): Promise<Readable> {
  const decompressed = await gunzipAsync(gzBuffer);
  const parsed = JSON.parse(decompressed.toString('utf-8'));
  const rawCols: string[] = parsed.columns || (record.columnsSchema as string[]) || [];
  const rawRows: Record<string, any>[] = parsed.data || [];

  const cleaned = cleanTabularRowsAndColumns(rawCols, rawRows);
  const cleanPayload = {
    id: parsed.id || record.id,
    shortCode: parsed.shortCode || record.shortCode,
    tableName: parsed.tableName || record.tableName,
    rowCount: cleaned.rowCount,
    columns: cleaned.columns,
    data: cleaned.rows,
    meta: {
      page: 1,
      limit: cleaned.rowCount || 100,
      total: cleaned.rowCount,
      totalPages: 1,
      hasNext: false,
    },
  };

  const cleanGz = await gzipAsync(Buffer.from(JSON.stringify(cleanPayload), 'utf-8'));
  return Readable.from([cleanGz]);
}
