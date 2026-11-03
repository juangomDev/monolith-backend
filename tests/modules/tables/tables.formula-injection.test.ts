import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { readCsvRows, readXlsxRows, extractRichTableData } from '../../../src/modules/tables/tables.parser.js';

describe('Seguridad Tablas: Neutralización de Inyección de Fórmulas CSV/XLSX', () => {
  const tmpDir = path.resolve('./storage/test_fixtures_formula');
  const csvInjectionPath = path.join(tmpDir, 'formula.csv');
  const xlsxInjectionPath = path.join(tmpDir, 'formula.xlsx');

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    // CSV con celdas de inyección de fórmulas
    const csvContent = 'id,payload,safe\n1,=CMD|\'/C calc\'!A0,Normal\n2,+12345,Otro\n3,@SUM(A1:B2),Tercero\n4,-999,Cuarto\n';
    await fs.writeFile(csvInjectionPath, csvContent, 'utf-8');

    // XLSX con celdas de inyección de fórmulas
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inyeccion');
    sheet.addRow(['id', 'payload', 'safe']);
    sheet.addRow([1, '=CMD|\'/C calc\'!A0', 'Normal']);
    sheet.addRow([2, '+9999', 'Otro']);
    sheet.addRow([3, '@SUM(A1:B2)', 'Tercero']);
    await workbook.xlsx.writeFile(xlsxInjectionPath);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('readCsvRows: neutraliza fórmulas anteponiendo apóstrofe en CSV', async () => {
    const result = await readCsvRows(csvInjectionPath, 1, 10);
    assert.strictEqual(result.rows[0].payload, "'=CMD|'/C calc'!A0");
    assert.strictEqual(result.rows[1].payload, "'+12345");
    assert.strictEqual(result.rows[2].payload, "'@SUM(A1:B2)");
    assert.strictEqual(result.rows[3].payload, "'-999");
    assert.strictEqual(result.rows[0].safe, 'Normal');
  });

  it('extractRichTableData: neutraliza fórmulas en extracción completa CSV', async () => {
    const result = await extractRichTableData(csvInjectionPath, '.csv');
    assert.strictEqual(result.rows[0].payload, "'=CMD|'/C calc'!A0");
    assert.strictEqual(result.rows[2].payload, "'@SUM(A1:B2)");
  });

  it('readXlsxRows: neutraliza fórmulas anteponiendo apóstrofe en XLSX', async () => {
    const result = await readXlsxRows(xlsxInjectionPath, 1, 10);
    assert.strictEqual(result.rows[0].payload, "'=CMD|'/C calc'!A0");
    assert.strictEqual(result.rows[1].payload, "'+9999");
    assert.strictEqual(result.rows[2].payload, "'@SUM(A1:B2)");
    assert.strictEqual(result.rows[0].safe, 'Normal');
  });

  it('extractRichTableData: neutraliza fórmulas en extracción completa XLSX', async () => {
    const result = await extractRichTableData(xlsxInjectionPath, '.xlsx');
    assert.strictEqual(result.rows[0].payload, "'=CMD|'/C calc'!A0");
    assert.strictEqual(result.rows[1].payload, "'+9999");
    assert.strictEqual(result.rows[2].payload, "'@SUM(A1:B2)");
  });
});
