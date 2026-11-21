const RESERVED_QUERY_KEYS = new Set([
  'download',
  'page',
  'limit',
  'raw',
  'format',
  'includeStyles',
  'v',
  'search',
  'q',
  'select',
]);

function normalizeTextForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Determina si el query string de GET /t/:short_code incluye algún filtro dinámico de columna,
 * búsqueda global (?search= / ?q=) o proyección de columnas (?select=).
 */
export function hasDynamicTableFilters(query?: Record<string, any>): boolean {
  if (!query || typeof query !== 'object') return false;
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined) continue;
    if (key === 'search' || key === 'q' || key === 'select') {
      if (String(val).trim() !== '') return true;
      continue;
    }
    if (!RESERVED_QUERY_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

/**
 * Resuelve un nombre de parámetro query (ej. "father" o "father_id") al nombre real de la columna en la tabla,
 * consultando tanto `columns` como los alias definidos en `metadataCard.columnsMeta`.
 */
export function resolveTargetColumn(
  queryKey: string,
  columns: string[],
  columnsMeta?: Record<string, any> | null
): string | null {
  const normQuery = normalizeTextForMatch(queryKey);
  if (!normQuery) return null;

  // 1. Coincidencia directa con el nombre de columna (case-insensitive y sin acentos)
  const direct = columns.find((col) => normalizeTextForMatch(col) === normQuery);
  if (direct) return direct;

  // 2. Coincidencia por alias en metadataCard.columnsMeta (ej. "columnsMeta": { "father": "father_id" })
  if (columnsMeta && typeof columnsMeta === 'object') {
    for (const [colKey, metaVal] of Object.entries(columnsMeta)) {
      const aliasStr =
        typeof metaVal === 'string'
          ? metaVal
          : metaVal && typeof metaVal === 'object'
            ? String(metaVal.alias || metaVal.label || metaVal.name || '')
            : '';

      if (aliasStr && normalizeTextForMatch(aliasStr) === normQuery) {
        const matchedCol = columns.find(
          (c) => normalizeTextForMatch(c) === normalizeTextForMatch(colKey)
        );
        if (matchedCol) return matchedCol;
      }
    }
  }

  // 3. Coincidencia flexible quitando o agregando sufijo "_id" (ej. father <-> father_id)
  const strippedQuery = normQuery.replace(/_id$/, '');
  const withIdQuery = `${strippedQuery}_id`;
  const byIdVariant = columns.find((col) => {
    const normCol = normalizeTextForMatch(col);
    return normCol === strippedQuery || normCol === withIdQuery;
  });
  if (byIdVariant) return byIdVariant;

  return null;
}

function isNullOrEmptyCell(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  return false;
}

function matchesSingleValue(cellValue: unknown, targetToken: string): boolean {
  const lowerToken = targetToken.trim().toLowerCase();

  // Filtro explícito de raíces / valores nulos o vacíos (?father=null o ?father=empty o ?father=)
  if (lowerToken === 'null' || lowerToken === 'empty' || lowerToken === 'none' || lowerToken === '') {
    return isNullOrEmptyCell(cellValue);
  }

  if (isNullOrEmptyCell(cellValue)) return false;

  const cellStr = String(cellValue).trim();
  if (normalizeTextForMatch(cellStr) === normalizeTextForMatch(targetToken)) {
    return true;
  }

  // Coincidencia numérica (ej. 15 === "15"), evitando colapsar códigos con ceros a la izquierda distintos (ej. "01" vs "1")
  const cellHasLeadingZero = /^0\d+$/.test(cellStr);
  const tokenHasLeadingZero = /^0\d+$/.test(targetToken.trim());
  if (!cellHasLeadingZero && !tokenHasLeadingZero) {
    const numCell = Number(cellStr);
    const numToken = Number(targetToken);
    if (!isNaN(numCell) && !isNaN(numToken) && numCell === numToken) {
      return true;
    }
  }

  return false;
}

function matchesColumnFilter(cellValue: unknown, rawFilterValue: unknown): boolean {
  const filterStr = String(rawFilterValue ?? '').trim();
  if (filterStr === '') {
    return isNullOrEmptyCell(cellValue);
  }
  const tokens = filterStr.split(',').map((t) => t.trim());
  return tokens.some((token) => matchesSingleValue(cellValue, token));
}

/**
 * Aplica filtros dinámicos por columna/alias, búsqueda global (?search= / ?q=)
 * y selección de columnas (?select=col1,col2) sobre las filas de cualquier tabla.
 */
export function applyDynamicTableFilters(
  columns: string[],
  rows: Record<string, any>[],
  query?: Record<string, any>,
  metadataCard?: Record<string, any> | null
): { columns: string[]; rows: Record<string, any>[] } {
  if (!hasDynamicTableFilters(query)) {
    return { columns, rows };
  }

  const columnsMeta = metadataCard?.columnsMeta ?? null;
  let filteredRows = rows;

  // 1. Filtros por columna o alias de columnsMeta (ej. ?father=15, ?father_id=15, ?Estado=Miranda)
  const columnFilters: Array<{ colName: string; filterVal: unknown }> = [];
  for (const [key, val] of Object.entries(query!)) {
    if (val === undefined || RESERVED_QUERY_KEYS.has(key)) continue;
    const targetCol = resolveTargetColumn(key, columns, columnsMeta);
    if (targetCol) {
      columnFilters.push({ colName: targetCol, filterVal: val });
    } else {
      // Si se filtra por una columna inexistente en la tabla, 0 coincidencias
      return { columns, rows: [] };
    }
  }

  if (columnFilters.length > 0) {
    filteredRows = filteredRows.filter((row) =>
      columnFilters.every(({ colName, filterVal }) => matchesColumnFilter(row?.[colName], filterVal))
    );
  }

  // 2. Búsqueda parcial de texto libre (?search=... o ?q=...)
  const rawSearch = query?.search ?? query?.q;
  if (rawSearch !== undefined && String(rawSearch).trim() !== '') {
    const normSearch = normalizeTextForMatch(String(rawSearch));
    filteredRows = filteredRows.filter((row) =>
      columns.some((col) => {
        const val = row?.[col];
        if (isNullOrEmptyCell(val)) return false;
        return normalizeTextForMatch(String(val)).includes(normSearch);
      })
    );
  }

  // 3. Proyección de columnas (?select=id,name,code)
  let outputColumns = columns;
  if (query?.select !== undefined && String(query.select).trim() !== '') {
    const requestedCols = String(query.select)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const resolvedCols: string[] = [];
    for (const reqCol of requestedCols) {
      const target = resolveTargetColumn(reqCol, columns, columnsMeta);
      if (target && !resolvedCols.includes(target)) {
        resolvedCols.push(target);
      }
    }
    if (resolvedCols.length > 0) {
      outputColumns = resolvedCols;
      filteredRows = filteredRows.map((row) => {
        const projected: Record<string, any> = {};
        for (const col of outputColumns) {
          projected[col] = row?.[col] !== undefined ? row[col] : null;
        }
        return projected;
      });
    }
  }

  return { columns: outputColumns, rows: filteredRows };
}
