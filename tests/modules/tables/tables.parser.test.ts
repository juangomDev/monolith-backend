import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {
  parseCsvMetadata,
  readCsvRows,
  parseXlsxMetadata,
  readXlsxRows,
  parseTableMetadata,
  readTableRows,
} from '../../../src/modules/tables/tables.parser.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Tablas: Parser CSV y XLSX', () => {
  const tmpDir = path.resolve('./storage/test_fixtures');
  const sampleCsvPath = path.join(tmpDir, 'sample.csv');
  const sampleXlsxPath = path.join(tmpDir, 'sample.xlsx');

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    // Crear CSV de prueba (5 filas)
    const csvContent = 'id,nombre,precio\n1,Manzanas,1.5\n2,Platanos,2.0\n3,Naranjas,3.2\n4,Fresas,4.5\n5,Uvas,5.0\n';
    await fs.writeFile(sampleCsvPath, csvContent, 'utf-8');

    // Crear XLSX de prueba (3 filas de datos)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    sheet.addRow(['codigo', 'cliente', 'total']);
    sheet.addRow(['V001', 'Juan Perez', 150]);
    sheet.addRow(['V002', 'Maria Lopez', 280]);
    sheet.addRow(['V003', 'Carlos Ruiz', 95]);
    await workbook.xlsx.writeFile(sampleXlsxPath);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('parseCsvMetadata: debe extraer nombres de columnas y conteo exacto de filas', async () => {
    const meta = await parseCsvMetadata(sampleCsvPath);
    assert.deepStrictEqual(meta.columns, ['id', 'nombre', 'precio']);
    assert.strictEqual(meta.rowCount, 5);
  });

  it('readCsvRows: debe paginar correctamente las filas según page y limit', async () => {
    const page1 = await readCsvRows(sampleCsvPath, 1, 2);
    assert.strictEqual(page1.rows.length, 2);
    assert.strictEqual(page1.rows[0].nombre, 'Manzanas');
    assert.strictEqual(page1.rows[1].nombre, 'Platanos');

    const page2 = await readCsvRows(sampleCsvPath, 2, 2);
    assert.strictEqual(page2.rows.length, 2);
    assert.strictEqual(page2.rows[0].nombre, 'Naranjas');
    assert.strictEqual(page2.rows[1].nombre, 'Fresas');

    const page3 = await readCsvRows(sampleCsvPath, 3, 2);
    assert.strictEqual(page3.rows.length, 1);
    assert.strictEqual(page3.rows[0].nombre, 'Uvas');
  });

  it('parseXlsxMetadata: debe extraer cabeceras y conteo de filas de Excel', async () => {
    const meta = await parseXlsxMetadata(sampleXlsxPath);
    assert.deepStrictEqual(meta.columns, ['codigo', 'cliente', 'total']);
    assert.strictEqual(meta.rowCount, 3);
  });

  it('readXlsxRows: debe leer registros de la hoja Excel paginados', async () => {
    const page1 = await readXlsxRows(sampleXlsxPath, 1, 2);
    assert.strictEqual(page1.rows.length, 2);
    assert.strictEqual(page1.rows[0].codigo, 'V001');
    assert.strictEqual(page1.rows[0].cliente, 'Juan Perez');
    assert.strictEqual(page1.rows[1].codigo, 'V002');

    const page2 = await readXlsxRows(sampleXlsxPath, 2, 2);
    assert.strictEqual(page2.rows.length, 1);
    assert.strictEqual(page2.rows[0].codigo, 'V003');
    assert.strictEqual(page2.rows[0].cliente, 'Carlos Ruiz');
  });

  it('parseTableMetadata: debe rechazar extensiones no soportadas con 415', async () => {
    await assert.rejects(
      async () => {
        await parseTableMetadata('archivo.pdf', '.pdf');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 415);
        return true;
      }
    );
  });

  it('readTableRows: debe despachar correctamente por extensión', async () => {
    const csvResult = await readTableRows(sampleCsvPath, '.csv', 1, 10);
    assert.strictEqual(csvResult.rows.length, 5);

    const xlsxResult = await readTableRows(sampleXlsxPath, '.xlsx', 1, 10);
    assert.strictEqual(xlsxResult.rows.length, 3);
  });
});
