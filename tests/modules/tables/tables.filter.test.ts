import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { buildApp } from '../../../src/app.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import {
  hasDynamicTableFilters,
  resolveTargetColumn,
  applyDynamicTableFilters,
} from '../../../src/modules/tables/tables.filter.js';

const gzipAsync = promisify(zlib.gzip);

describe('Módulo Tablas: Filtrado Dinámico Universal por Columnas y Jerarquía Padre-Hijo (/t/:short_code)', () => {
  const venezuelaEntitiesArtifact = {
    id: '88888888-8888-4888-8888-888888888888',
    shortCode: 'venEnt1234',
    tableName: 'entidades_venezuela.json',
    rowCount: 7,
    columns: ['id', 'name', 'code', 'father'],
    metadataCard: {
      title: 'Entidades de Venezuela',
      columnsMeta: {
        id: 'id',
        name: 'name',
        code: 'code',
        father: 'father_id',
      },
    },
    data: [
      { id: 1, name: 'Distrito Capital', code: '01', father: null },
      { id: 15, name: 'Miranda', code: '15', father: null },
      { id: 101, name: 'Libertador', code: '0101', father: 1 },
      { id: 1501, name: 'Acevedo', code: '1501', father: 15 },
      { id: 1502, name: 'Andrés Bello', code: '1502', father: 15 },
      { id: 1503, name: 'Baruta', code: '1503', father: 15 },
      { id: 150301, name: 'El Cafetal', code: '150301', father: 1503 },
    ],
  };

  afterEach(() => {
    mock.reset();
  });

  async function mockArtifactInStorage(artifact = venezuelaEntitiesArtifact) {
    const gzBuffer = await gzipAsync(Buffer.from(JSON.stringify(artifact), 'utf-8'));
    mock.method(tablesRepository, 'findByShortCode', async () => ({
      id: artifact.id,
      shortCode: artifact.shortCode,
      tableName: artifact.tableName,
      rowCount: artifact.rowCount,
      columnsSchema: artifact.columns,
      metadataCard: artifact.metadataCard,
      sizeBytes: 1024,
      storagePath: './storage/tables/venEnt1234.json',
      createdAt: new Date(),
    }));
    mock.method(fs, 'access', async () => {});
    mock.method(fs, 'readFile', async () => gzBuffer);
  }

  it('hasDynamicTableFilters y resolveTargetColumn: detectan filtros y resuelven alias en columnsMeta (father <-> father_id)', () => {
    assert.strictEqual(hasDynamicTableFilters({ page: '1', limit: '50' }), false);
    assert.strictEqual(hasDynamicTableFilters({ father: '15' }), true);
    assert.strictEqual(hasDynamicTableFilters({ father_id: '15' }), true);
    assert.strictEqual(hasDynamicTableFilters({ search: 'Miranda' }), true);

    const cols = ['id', 'name', 'code', 'father'];
    const meta = { id: 'id', name: 'name', code: 'code', father: 'father_id' };

    assert.strictEqual(resolveTargetColumn('father', cols, meta), 'father');
    assert.strictEqual(resolveTargetColumn('father_id', cols, meta), 'father');
    assert.strictEqual(resolveTargetColumn('CODE', cols, meta), 'code');
  });

  it('GET /t/:short_code?father=15&format=rows: obtiene todos los hijos cuyo padre es 15', async () => {
    await mockArtifactInStorage();
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/t/venEnt1234?father=15&format=rows',
      headers: { 'accept-encoding': 'gzip' },
    });

    assert.strictEqual(res.statusCode, 200);
    const children = JSON.parse(res.body);
    assert.ok(Array.isArray(children));
    assert.strictEqual(children.length, 3);
    assert.deepStrictEqual(
      children.map((c: any) => c.name),
      ['Acevedo', 'Andrés Bello', 'Baruta']
    );
  });

  it('GET /t/:short_code?father_id=1503: resuelve el alias father_id de columnsMeta y devuelve sus hijos', async () => {
    await mockArtifactInStorage();
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/t/venEnt1234?father_id=1503',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.rowCount, 1);
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].name, 'El Cafetal');
    assert.strictEqual(body.data[0].code, '150301');
  });

  it('GET /t/:short_code?father=null&format=rows: obtiene únicamente las entidades raíz (Estados sin padre)', async () => {
    await mockArtifactInStorage();
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/t/venEnt1234?father=null&format=rows',
    });

    assert.strictEqual(res.statusCode, 200);
    const roots = JSON.parse(res.body);
    assert.strictEqual(roots.length, 2);
    assert.deepStrictEqual(
      roots.map((r: any) => r.name),
      ['Distrito Capital', 'Miranda']
    );
  });

  it('GET /t/:short_code?father=1,15&select=id,name&format=rows: soporta múltiples padres por coma y proyección de columnas', async () => {
    await mockArtifactInStorage();
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/t/venEnt1234?father=1,15&select=id,name&format=rows',
    });

    assert.strictEqual(res.statusCode, 200);
    const rows = JSON.parse(res.body);
    assert.strictEqual(rows.length, 4);
    assert.deepStrictEqual(Object.keys(rows[0]), ['id', 'name']);
    assert.strictEqual('father' in rows[0], false);
    assert.strictEqual('code' in rows[0], false);
  });

  it('Funciona con cualquier otra tabla y columnas arbitrarias + búsqueda sin acentos (?search=)', () => {
    const customCols = ['Estado', 'Sector', 'Presupuesto'];
    const customRows = [
      { Estado: 'Miranda', Sector: 'Educación', Presupuesto: 500 },
      { Estado: 'Miranda', Sector: 'Salud', Presupuesto: 800 },
      { Estado: 'Zulia', Sector: 'Educación', Presupuesto: 600 },
    ];

    const byCol = applyDynamicTableFilters(customCols, customRows, {
      estado: 'miranda',
      search: 'educacion',
    });

    assert.strictEqual(byCol.rows.length, 1);
    assert.strictEqual(byCol.rows[0].Estado, 'Miranda');
    assert.strictEqual(byCol.rows[0].Sector, 'Educación');
  });
});
