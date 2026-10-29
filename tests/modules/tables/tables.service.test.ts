import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { AppError } from '../../../src/shared/errors.js';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs/promises';

describe('Módulo Tablas: TablesService', () => {
  afterEach(() => {
    mock.reset();
  });

  const validUuid = '33333333-4444-4555-8666-777777777777';

  it('saveTable: debe rechazar archivos cuyo formato no sea .csv o .xlsx (415)', async () => {
    const fakePart = {
      filename: 'documento.txt',
      mimetype: 'text/plain',
      file: Readable.from([Buffer.from('texto plano')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await tablesService.saveTable(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 415);
        assert.strictEqual((err as AppError).code, 'UNSUPPORTED_MEDIA_TYPE');
        return true;
      }
    );
  });

  it('saveTable: debe lanzar 413 si el stream de la tabla fue truncado', async () => {
    const stream = Readable.from([Buffer.from('a,b\n1,2\n')]) as Readable & { truncated?: boolean };
    stream.truncated = true;

    const fakePart = {
      filename: 'pesado.csv',
      mimetype: 'text/csv',
      file: stream,
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await tablesService.saveTable(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 413);
        assert.strictEqual((err as AppError).code, 'PAYLOAD_TOO_LARGE');
        return true;
      }
    );
  });

  it('saveTable: debe guardar archivo CSV, extraer metadatos y registrar en repositorio', async () => {
    const csvData = 'id,nombre,rol\n1,Carlos,Admin\n2,Ana,Editor\n3,Luis,Viewer\n';
    const fakePart = {
      filename: 'usuarios.csv',
      mimetype: 'text/csv',
      file: Readable.from([Buffer.from(csvData)]),
    } as unknown as MultipartFile;

    mock.method(tablesRepository, 'create', async (data: any) => ({
      id: validUuid,
      shortCode: data.shortCode,
      tableName: data.tableName,
      rowCount: data.rowCount,
      columnsSchema: data.columnsSchema,
      sizeBytes: data.sizeBytes,
      storagePath: data.storagePath,
      createdAt: new Date(),
    }));

    const result = await tablesService.saveTable(fakePart);

    assert.strictEqual(result.id, validUuid);
    assert.strictEqual(result.tableName, 'usuarios.csv');
    assert.strictEqual(result.rowCount, 3);
    assert.deepStrictEqual(result.columns, ['id', 'nombre', 'rol']);
    assert.ok(result.shortCode);
    assert.ok(result.url.includes(`/t/${result.shortCode}`));

    // Limpieza del archivo físico generado en test
    await tablesService.deleteTable(validUuid).catch(() => {});
  });

  it('getTableByShortCode: debe lanzar 404 si la tabla no existe en la base de datos', async () => {
    mock.method(tablesRepository, 'findByShortCode', async () => null);

    await assert.rejects(
      async () => {
        await tablesService.getTableByShortCode('tabla404');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('getTableByShortCode: debe lanzar 404 FILE_NOT_FOUND si el archivo físico no existe en disco', async () => {
    mock.method(tablesRepository, 'findByShortCode', async () => ({
      id: validUuid,
      shortCode: 'codigoTab1',
      tableName: 'inexistente.csv',
      rowCount: 10,
      columnsSchema: ['col1'],
      sizeBytes: 100,
      storagePath: './storage/tables/archivo_inexistente.csv',
      createdAt: new Date(),
    }));

    await assert.rejects(
      async () => {
        await tablesService.getTableByShortCode('codigoTab1');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'FILE_NOT_FOUND');
        return true;
      }
    );
  });

  it('deleteTable: debe rechazar IDs que no sean UUID válidos con 400', async () => {
    await assert.rejects(
      async () => {
        await tablesService.deleteTable('no-es-un-uuid');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 400);
        assert.strictEqual((err as AppError).code, 'INVALID_ID');
        return true;
      }
    );
  });

  it('deleteTable: debe lanzar 404 si la tabla no existe en base de datos', async () => {
    mock.method(tablesRepository, 'findById', async () => null);

    await assert.rejects(
      async () => {
        await tablesService.deleteTable(validUuid);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('deleteTable: debe eliminar registro en BD y borrar archivo físico', async () => {
    let dbDeleted = false;
    let deletedPath = '';

    mock.method(tablesRepository, 'findById', async () => ({
      id: validUuid,
      shortCode: 'tablaBorrar',
      tableName: 'borrar.csv',
      rowCount: 5,
      columnsSchema: ['a', 'b'],
      sizeBytes: 50,
      storagePath: '/mock/storage/tables/borrar.csv',
      createdAt: new Date(),
    }));

    mock.method(tablesRepository, 'deleteById', async () => {
      dbDeleted = true;
      return {} as any;
    });

    mock.method(fs, 'unlink', async (p: string) => {
      deletedPath = p;
    });

    const result = await tablesService.deleteTable(validUuid);

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(dbDeleted, true);
    assert.strictEqual(deletedPath, '/mock/storage/tables/borrar.csv');
  });

  it('listTables: debe retornar lista vacía si no hay tablas registradas', async () => {
    mock.method(tablesRepository, 'findAll', async () => []);

    const result = await tablesService.listTables();

    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.tables, []);
  });

  it('listTables: debe retornar lista formateada con URL pública, columnas y rowCount', async () => {
    mock.method(tablesRepository, 'findAll', async () => [
      {
        id: validUuid,
        shortCode: 'tabList123',
        tableName: 'dataset.csv',
        rowCount: 45,
        columnsSchema: ['id', 'producto', 'precio'],
        sizeBytes: 1500,
        storagePath: '/storage/tables/tabList123.csv',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const result = await tablesService.listTables();

    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.tables.length, 1);
    assert.strictEqual(result.tables[0].id, validUuid);
    assert.strictEqual(result.tables[0].shortCode, 'tabList123');
    assert.ok(result.tables[0].url.includes('/t/tabList123'));
    assert.strictEqual(result.tables[0].tableName, 'dataset.csv');
    assert.strictEqual(result.tables[0].rowCount, 45);
    assert.deepStrictEqual(result.tables[0].columns, ['id', 'producto', 'precio']);
    assert.strictEqual(result.tables[0].sizeBytes, 1500);
  });
});
