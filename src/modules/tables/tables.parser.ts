export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  nullable: boolean;
}

export interface ParsedTableMetadata {
  columnsSchema: ColumnSchema[];
  rowCount: number;
}

export const MAX_ALLOWED_ROWS = 100_000;
export const MAX_ALLOWED_COLS = 200;

/**
 * Validador anti-Zip Bomb para archivos XLSX
 */
export async function validateZipBombSafety(
  _filePath: string,
  _maxUncompressedBytes = 100 * 1024 * 1024,
  _maxCompressionRatio = 100
): Promise<void> {
  // Esqueleto de inspección de directorio central con yauzl (Fase 3)
}
