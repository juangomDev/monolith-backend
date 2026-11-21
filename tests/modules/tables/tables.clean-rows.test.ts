import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import { buildApp } from '../../../src/app.js';
import { cleanTabularRowsAndColumns } from '../../../src/modules/tables/tables.cleaner.js';
import { extractRichTableData } from '../../../src/modules/tables/tables.parser.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

describe('Módulo Tablas: Entrega Limpia Fila por Fila y Eliminación de Relleno (/t/:short_code)', () => {
  const tmpDir = path.resolve('./storage/test_fixtures_clean_rows');
  const ineTitleXlsxPath = path.join(tmpDir, 'cuadro_ine.xlsx');

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    // Simular un cuadro estadístico del INE con título combinado arriba y columnas vacías a la derecha
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cuadro 1');

    // Fila 1: Título institucional combinado A1:F1
    ws.addRow(['INSTITUTO NACIONAL DE ESTADÍSTICA - CENSO POBLACIONAL', null, null, null, null, null]);
    ws.mergeCells('A1:F1');

    // Fila 2: Subtítulo
    ws.addRow(['Cuadro 1.1 Población por Entidad Federal', null, null, null, null, null]);

    // Fila 3: Fila en blanco decorativa
    ws.addRow([null, null, null, null, null, null]);

    // Fila 4: Cabecera real (4 columnas reales + 2 columnas vacías de borde)
    ws.addRow(['Entidad', 'Total', 'Hombres', 'Mujeres', null, null]);

    // Filas 5 y 6: Datos reales
    ws.addRow(['Distrito Capital', 2100000, 1000000, 1100000, null, null]);
    ws.addRow(['Miranda', 3200000, 1550000, 1650000, null, null]);

    // Fila 7: Fila vacía al final
    ws.addRow([null, null, null, null, null, null]);

    await wb.xlsx.writeFile(ineTitleXlsxPath);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  afterEach(() => {
    mock.reset();
  });

  it('cleanTabularRowsAndColumns: detecta la fila real de encabezados y elimina columnas fantasma col_N: null', () => {
    const rawCols = ['Cuadro 1. Poblacion', 'col_2', 'col_3', 'col_4', 'col_5', 'col_6'];
    const rawRows = [
      { 'Cuadro 1. Poblacion': 'Subtitulo', col_2: null, col_3: null, col_4: null, col_5: null, col_6: null },
      { 'Cuadro 1. Poblacion': 'Estado', col_2: 'Poblacion', col_3: 'Hombres', col_4: 'Mujeres', col_5: null, col_6: null },
      { 'Cuadro 1. Poblacion': 'Zulia', col_2: 4100000, col_3: 2000000, col_4: 2100000, col_5: null, col_6: null },
      { 'Cuadro 1. Poblacion': 'Lara', col_2: 2000000, col_3: 980000, col_4: 1020000, col_5: null, col_6: null },
      { 'Cuadro 1. Poblacion': null, col_2: null, col_3: null, col_4: null, col_5: null, col_6: null },
    ];

    const cleaned = cleanTabularRowsAndColumns(rawCols, rawRows);

    assert.deepStrictEqual(cleaned.columns, ['Estado', 'Poblacion', 'Hombres', 'Mujeres']);
    assert.strictEqual(cleaned.rowCount, 2);
    assert.deepStrictEqual(cleaned.rows[0], {
      Estado: 'Zulia',
      Poblacion: 4100000,
      Hombres: 2000000,
      Mujeres: 2100000,
    });
    assert.strictEqual('col_5' in cleaned.rows[0], false);
    assert.strictEqual('col_6' in cleaned.rows[0], false);
  });

  it('extractRichTableData: limpia automáticamente hojas Excel con títulos combinados arriba y columnas vacías', async () => {
    const rich = await extractRichTableData(ineTitleXlsxPath, '.xlsx');

    assert.deepStrictEqual(rich.columns, ['Entidad', 'Total', 'Hombres', 'Mujeres']);
    assert.strictEqual(rich.rowCount, 2);
    assert.deepStrictEqual(rich.rows[0], {
      Entidad: 'Distrito Capital',
      Total: 2100000,
      Hombres: 1000000,
      Mujeres: 1100000,
    });
    assert.deepStrictEqual(rich.rows[1], {
      Entidad: 'Miranda',
      Total: 3200000,
      Hombres: 1550000,
      Mujeres: 1650000,
    });
  });

  it('GET /t/:short_code (paginado y gzip): omite cellStyles, metadataCard, merges y headers por defecto y limpia tablas legacy', async () => {
    // Simular un artefacto legacy en disco (.data.json.gz) lleno de relleno como 12cRDnYduz
    const bloatedArtifact = {
      id: '99999999-9999-4999-8999-999999999999',
      shortCode: '12cRDnYduz',
      tableName: 'cuadro_ine.xlsx',
      rowCount: 4,
      columns: ['Titulo Cuadro', 'col_2', 'col_3', 'col_4'],
      headers: [['Titulo Cuadro', 'col_2', 'col_3', 'col_4']],
      merges: ['A1:D1'],
      cellStyles: {
        '0': { 'Titulo Cuadro': { bg: '#FFFFFF', bold: true, align: 'center' } },
        '1': { 'Titulo Cuadro': { bg: '#FFFFFF' }, col_2: { bg: '#FFFFFF' } },
      },
      metadataCard: {
        title: 'Ficha interna IA',
        entities: ['Miranda', 'Zulia'],
        columnsMeta: {},
      },
      data: [
        { 'Titulo Cuadro': 'Estado', col_2: 'Total', col_3: 'Hombres', col_4: null },
        { 'Titulo Cuadro': 'Miranda', col_2: 3200000, col_3: 1550000, col_4: null },
        { 'Titulo Cuadro': 'Zulia', col_2: 4100000, col_3: 2000000, col_4: null },
      ],
    };

    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(bloatedArtifact), 'utf-8'));

    mock.method(tablesRepository, 'findByShortCode', async () => ({
      id: bloatedArtifact.id,
      shortCode: '12cRDnYduz',
      tableName: 'cuadro_ine.xlsx',
      rowCount: 4,
      columnsSchema: bloatedArtifact.columns,
      sizeBytes: 500,
      storagePath: ineTitleXlsxPath,
      createdAt: new Date(),
    }));
    mock.method(fs, 'readFile', async () => gzBuffer);

    const app = await buildApp();

    // 1. Petición con Accept-Encoding: gzip (como navegador en http://divulgacion.ine.gob.ve/api/v1/t/12cRDnYduz)
    const resGzip = await app.inject({
      method: 'GET',
      url: '/t/12cRDnYduz',
      headers: { 'accept-encoding': 'gzip' },
    });

    assert.strictEqual(resGzip.statusCode, 200);
    const bodyGzip = JSON.parse((await gunzipAsync(resGzip.rawPayload)).toString('utf-8'));

    assert.strictEqual(bodyGzip.cellStyles, undefined);
    assert.strictEqual(bodyGzip.metadataCard, undefined);
    assert.strictEqual(bodyGzip.merges, undefined);
    assert.strictEqual(bodyGzip.headers, undefined);
    assert.deepStrictEqual(bodyGzip.columns, ['Estado', 'Total', 'Hombres']);
    assert.strictEqual(bodyGzip.data.length, 2);
    assert.deepStrictEqual(bodyGzip.data[0], { Estado: 'Miranda', Total: 3200000, Hombres: 1550000 });

    // 2. Petición con ?format=rows (devuelve directamente el array fila por fila [{...}, {...}])
    const resRows = await app.inject({
      method: 'GET',
      url: '/t/12cRDnYduz?format=rows',
    });

    assert.strictEqual(resRows.statusCode, 200);
    const rowsOnly = JSON.parse(resRows.body);
    assert.ok(Array.isArray(rowsOnly));
    assert.strictEqual(rowsOnly.length, 2);
    assert.deepStrictEqual(rowsOnly[0], { Estado: 'Miranda', Total: 3200000, Hombres: 1550000 });
    assert.deepStrictEqual(rowsOnly[1], { Estado: 'Zulia', Total: 4100000, Hombres: 2000000 });
  });
});
