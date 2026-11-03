import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(zlib.gunzip);

export interface EngineMatchedTable {
  id: string;
  shortCode: string;
  tableName: string;
  title?: string;
  relevanceScore: number;
  matchedEntities: string[];
  matchedColumns: string[];
}

export interface EngineCalculationResult {
  foundInSystem: boolean;
  question: string;
  normalizedQuestion: string;
  table?: {
    id: string;
    shortCode: string;
    tableName: string;
    title?: string;
  };
  matchedEntities: string[];
  matchedColumns: string[];
  totalRowsFiltered: number;
  calculations: Array<{
    column: string;
    sum?: number;
    avg?: number;
    min?: number;
    max?: number;
    count: number;
  }>;
  chartData?: {
    labels: string[];
    values: number[];
    percentages: number[];
  } | null;
  sampleRows: Record<string, any>[];
  summaryText: string;
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le',
  'ya', 'o', 'este', 'si', 'porque', 'esta', 'son', 'entre', 'esta', 'sobre',
  'cual', 'cuales', 'cuanto', 'cuantos', 'cuanta', 'cuantas', 'dime', 'que',
  'es', 'son', 'hay', 'tiene', 'tienen', 'representan', 'representa',
]);

const SYNONYMS: Record<string, string[]> = {
  masculino: ['hombre', 'hombres', 'varon', 'varones'],
  femenino: ['mujer', 'mujeres', 'femenina', 'femeninas'],
  poblacion: ['habitantes', 'habitante', 'personas', 'persona', 'total', 'gente'],
  precio: ['costo', 'valor', 'monto', 'tarifa'],
  ventas: ['ingresos', 'facturacion', 'ventas_totales'],
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function expandTokens(text: string): string[] {
  const words = normalizeText(text)
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  const expanded = new Set<string>();
  for (const w of words) {
    expanded.add(w);
    for (const [canonical, syns] of Object.entries(SYNONYMS)) {
      if (w === canonical || syns.includes(w)) {
        expanded.add(canonical);
        syns.forEach((s) => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

export function matchTablesByMetadata(
  question: string,
  tables: Array<{ id: string; shortCode: string; tableName: string; metadataCard?: any }>
): EngineMatchedTable[] {
  const tokens = expandTokens(question);
  if (tokens.length === 0) return [];

  const results: EngineMatchedTable[] = [];

  for (const table of tables) {
    const card = table.metadataCard || {};
    const entities = (card.entities || []).map((e: string) => normalizeText(e));
    const columnsMeta = card.columnsMeta || {};
    const tags = (card.tags || []).map((t: string) => normalizeText(t));
    const title = card.title ? normalizeText(card.title) : '';
    const tableName = normalizeText(table.tableName);

    let score = 0;
    const matchedEntities: string[] = [];
    const matchedColumns: string[] = [];

    for (const token of tokens) {
      if (title.includes(token)) score += 5;
      if (tableName.includes(token)) score += 3;
      if (tags.some((t: string) => t.includes(token))) score += 4;

      for (const ent of entities) {
        if (ent.includes(token) || token.includes(ent)) {
          score += 6;
          if (!matchedEntities.includes(ent)) matchedEntities.push(ent);
        }
      }

      for (const [colKey, colLabel] of Object.entries(columnsMeta)) {
        const normKey = normalizeText(colKey);
        const normLabel = normalizeText(String(colLabel));
        if (normKey.includes(token) || normLabel.includes(token)) {
          score += 4;
          if (!matchedColumns.includes(colKey)) matchedColumns.push(colKey);
        }
      }
    }

    if (score > 0) {
      results.push({
        id: table.id,
        shortCode: table.shortCode,
        tableName: table.tableName,
        title: card.title,
        relevanceScore: score,
        matchedEntities,
        matchedColumns,
      });
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

const SUMMARY_ROW_REGEX = /\b(total|totales|sum|suma|promedio|average|resumen|subtotal|general)\b/i;

export async function readTableArtifact(storagePath: string, shortCode: string): Promise<any> {
  const gzPath = path.join(path.dirname(storagePath), `${shortCode}.data.json.gz`);
  const buffer = await fs.readFile(gzPath);
  const decompressed = await gunzipAsync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

export function executeMathScratchpad(
  question: string,
  payload: any,
  matchedTable?: EngineMatchedTable
): EngineCalculationResult {
  const normQ = normalizeText(question);
  const rows: Record<string, any>[] = payload.data || [];
  const card = payload.metadataCard || {};
  const hasSummary = card.hasSummaryRows ?? false;

  const validRows = rows.filter((row, idx) => {
    if (!hasSummary) return true;
    if (idx < rows.length - 2) return true;
    return !Object.values(row).some((val) => typeof val === 'string' && SUMMARY_ROW_REGEX.test(val.trim()));
  });

  const matchedEntities = matchedTable?.matchedEntities || [];
  let filteredRows = validRows;

  if (matchedEntities.length > 0) {
    const candidateRows = validRows.filter((row) =>
      Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        const normVal = normalizeText(String(val));
        return matchedEntities.some((ent) => normVal.includes(ent) || ent.includes(normVal));
      })
    );
    if (candidateRows.length > 0) {
      filteredRows = candidateRows;
    }
  }

  const columns: string[] = payload.columns || Object.keys(rows[0] || {});
  const numericColumns = columns.filter((col) =>
    filteredRows.some((r) => r[col] !== null && r[col] !== undefined && !isNaN(Number(r[col])))
  );

  const tokens = expandTokens(question);
  let targetCols = numericColumns.filter((col) => {
    const norm = normalizeText(col);
    return tokens.some((t) => norm.includes(t) || t.includes(norm));
  });

  if (targetCols.length === 0) {
    targetCols = numericColumns;
  }

  const calculations = targetCols.slice(0, 5).map((col) => {
    const values = filteredRows
      .map((r) => Number(r[col]))
      .filter((v) => !isNaN(v));

    const sum = values.reduce((acc, v) => acc + v, 0);
    const count = values.length;
    const avg = count > 0 ? sum / count : 0;
    const min = count > 0 ? Math.min(...values) : 0;
    const max = count > 0 ? Math.max(...values) : 0;

    return { column: col, sum, avg, min, max, count };
  });

  let chartData: { labels: string[]; values: number[]; percentages: number[] } | null = null;
  if (calculations.length >= 2) {
    const labels = calculations.map((c) => c.column);
    const values = calculations.map((c) => c.sum ?? 0);
    const totalSum = values.reduce((a, b) => a + b, 0);
    const percentages = values.map((v) => (totalSum > 0 ? Number(((v / totalSum) * 100).toFixed(2)) : 0));
    chartData = { labels, values, percentages };
  }

  const summaryParts: string[] = [];
  if (matchedTable?.tableName) {
    summaryParts.push(`Fuente: ${matchedTable.tableName}`);
  }
  if (matchedEntities.length > 0) {
    summaryParts.push(`Entidades filtradas: ${matchedEntities.join(', ')}`);
  }
  for (const calc of calculations) {
    summaryParts.push(`${calc.column}: Total = ${calc.sum?.toLocaleString()} (Promedio: ${calc.avg?.toFixed(2)})`);
  }
  if (chartData && chartData.labels.length > 0) {
    const dist = chartData.labels.map((l, i) => `${l}: ${chartData!.percentages[i]}%`).join(', ');
    summaryParts.push(`Distribución: ${dist}`);
  }

  return {
    foundInSystem: calculations.length > 0 && filteredRows.length > 0,
    question,
    normalizedQuestion: normQ,
    table: matchedTable ? {
      id: matchedTable.id,
      shortCode: matchedTable.shortCode,
      tableName: matchedTable.tableName,
      title: matchedTable.title,
    } : undefined,
    matchedEntities,
    matchedColumns: targetCols,
    totalRowsFiltered: filteredRows.length,
    calculations,
    chartData,
    sampleRows: filteredRows.slice(0, 5),
    summaryText: summaryParts.join(' | '),
  };
}
