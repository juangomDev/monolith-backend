import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import {
  parseJsonMetadata,
  readJsonRows,
  parseJsonTable,
} from '../../../src/modules/tables/tables.json-parser.js';
import {
  extractRichTableData,
  parseTableMetadata,
  readTableRows,
} from '../../../src/modules/tables/tables.parser.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { validateTableContent } from '../../../src/gateway/file-guard.js';
import { chatService } from '../../../src/modules/chat/chat.service.js';
import { prisma } from '../../../src/config/db.js';
import { AppError } from '../../../src/shared/errors.js';
import { Role } from '@prisma/client';

describe('Módulo Tablas: Soporte Nativo de Archivos JSON y Flag usedAi', () => {
  const tmpDir = path.resolve('./storage/test_fixtures_json');
  const sampleArrayJsonPath = path.join(tmpDir, 'sample_array.json');
  const sampleObjectDataJsonPath = path.join(tmpDir, 'sample_object_data.json');
  const sampleColumnsRowsJsonPath = path.join(tmpDir, 'sample_columns_rows.json');
  const injectionJsonPath = path.join(tmpDir, 'injection.json');
  const invalidJsonPath = path.join(tmpDir, 'invalid.json');
  const emptyArrayJsonPath = path.join(tmpDir, 'empty.json');

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    // 1. Array estándar de objetos
    const arrayData = [
      { id: 1, producto: 'Laptop', precio: 1200, activo: true },
      { id: 2, producto: 'Mouse', precio: 25, activo: true },
      { id: 3, producto: 'Teclado', precio: 75, activo: false },
      { id: 4, producto: 'Monitor', precio: 300, activo: true },
      { id: 5, producto: 'Auriculares', precio: 50, activo: true },
    ];
    await fs.writeFile(sampleArrayJsonPath, JSON.stringify(arrayData, null, 2), 'utf-8');

    // 2. Objeto con propiedad "data"
    const objectData = {
      meta: { exportedAt: '2026-03-01' },
      data: [
        { sku: 'SKU-01', stock: 100, ciudad: 'Madrid' },
        { sku: 'SKU-02', stock: 50, ciudad: 'Barcelona' },
      ],
    };
    await fs.writeFile(sampleObjectDataJsonPath, JSON.stringify(objectData, null, 2), 'utf-8');

    // 3. Objeto con "columns" y "rows"
    const columnsRowsData = {
      columns: ['año', 'ventas', 'margen'],
      rows: [
        { año: 2024, ventas: 10000, margen: 0.2 },
        { año: 2025, ventas: 15000, margen: 0.25 },
      ],
    };
    await fs.writeFile(sampleColumnsRowsJsonPath, JSON.stringify(columnsRowsData, null, 2), 'utf-8');

    // 4. JSON con fórmulas maliciosas
    const injectionData = [
      { id: 1, formula: '=CMD|\'/C calc\'!A0', safe: 'Texto normal' },
      { id: 2, formula: '+12345', safe: 'Otro texto' },
      { id: 3, formula: '@SUM(A1:B2)', safe: 'Tercer texto' },
    ];
    await fs.writeFile(injectionJsonPath, JSON.stringify(injectionData, null, 2), 'utf-8');

    // 5. JSON inválido (sintaxis rota)
    await fs.writeFile(invalidJsonPath, '{"broken": [true, 12,}', 'utf-8');

    // 6. JSON con array vacío
    await fs.writeFile(emptyArrayJsonPath, '[]', 'utf-8');
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Parser JSON (tables.json-parser.ts)', () => {
    it('parseJsonMetadata: extrae columnas y total de filas desde array de objetos', async () => {
      const meta = await parseJsonMetadata(sampleArrayJsonPath);
      assert.deepStrictEqual(meta.columns, ['id', 'producto', 'precio', 'activo']);
      assert.strictEqual(meta.rowCount, 5);
    });

    it('readJsonRows: pagina correctamente las filas de un array de objetos', async () => {
      const page1 = await readJsonRows(sampleArrayJsonPath, 1, 2);
      assert.strictEqual(page1.rows.length, 2);
      assert.strictEqual(page1.rows[0].producto, 'Laptop');
      assert.strictEqual(page1.rows[1].producto, 'Mouse');

      const page2 = await readJsonRows(sampleArrayJsonPath, 2, 2);
      assert.strictEqual(page2.rows.length, 2);
      assert.strictEqual(page2.rows[0].producto, 'Teclado');
      assert.strictEqual(page2.rows[1].producto, 'Monitor');
    });

    it('parseJsonMetadata: soporta estructuras con envoltorio { data: [...] }', async () => {
      const meta = await parseJsonMetadata(sampleObjectDataJsonPath);
      assert.deepStrictEqual(meta.columns, ['sku', 'stock', 'ciudad']);
      assert.strictEqual(meta.rowCount, 2);
    });

    it('parseJsonMetadata: soporta estructuras con { columns: [...], rows: [...] }', async () => {
      const meta = await parseJsonMetadata(sampleColumnsRowsJsonPath);
      assert.deepStrictEqual(meta.columns, ['año', 'ventas', 'margen']);
      assert.strictEqual(meta.rowCount, 2);
    });

    it('neutraliza inyecciones de fórmulas anteponiendo apóstrofe en celdas de texto', async () => {
      const page = await readJsonRows(injectionJsonPath, 1, 10);
      assert.strictEqual(page.rows[0].formula, "'=CMD|'/C calc'!A0");
      assert.strictEqual(page.rows[1].formula, "'+12345");
      assert.strictEqual(page.rows[2].formula, "'@SUM(A1:B2)");
      assert.strictEqual(page.rows[0].safe, 'Texto normal');
    });

    it('lanza AppError(400) si el archivo contiene un JSON con sintaxis rota', async () => {
      await assert.rejects(
        async () => {
          await parseJsonMetadata(invalidJsonPath);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual((err as AppError).status, 400);
          assert.strictEqual((err as AppError).code, 'INVALID_JSON');
          return true;
        }
      );
    });

    it('lanza AppError(400) si el array de datos está vacío', async () => {
      await assert.rejects(
        async () => {
          await parseJsonMetadata(emptyArrayJsonPath);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual((err as AppError).status, 400);
          assert.strictEqual((err as AppError).code, 'EMPTY_TABLE');
          return true;
        }
      );
    });
  });

  describe('Integración con tables.parser.ts', () => {
    it('parseTableMetadata: delega a parseJsonMetadata cuando ext es .json', async () => {
      const meta = await parseTableMetadata(sampleArrayJsonPath, '.json');
      assert.strictEqual(meta.rowCount, 5);
      assert.strictEqual(meta.columns.length, 4);
    });

    it('readTableRows: delega a readJsonRows cuando ext es .json', async () => {
      const page = await readTableRows(sampleArrayJsonPath, '.json', 1, 3);
      assert.strictEqual(page.rows.length, 3);
    });

    it('extractRichTableData: extrae filas y cabeceras completas para .json', async () => {
      const rich = await extractRichTableData(sampleArrayJsonPath, '.json');
      assert.strictEqual(rich.rowCount, 5);
      assert.ok(rich.columns.includes('producto'));
      assert.ok(rich.columns.includes('precio'));
      assert.strictEqual(rich.rows.length, 5);
      assert.strictEqual(rich.rows[0].producto, 'Laptop');
    });
  });

  describe('Seguridad File-Guard (file-guard.ts)', () => {
    it('validateTableContent: aprueba archivo JSON de texto legítimo', async () => {
      const buf = Buffer.from(JSON.stringify([{ a: 1 }]));
      await assert.doesNotReject(async () => {
        await validateTableContent(buf, '.json');
      });
    });

    it('validateTableContent: rechaza JSON con bytes nulos binarios', async () => {
      const badBuf = Buffer.concat([Buffer.from('[{"a":'), Buffer.from([0x00]), Buffer.from('}]')]);
      await assert.rejects(
        async () => {
          await validateTableContent(badBuf, '.json');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual((err as AppError).status, 415);
          assert.strictEqual((err as AppError).code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });

    it('validateTableContent: rechaza archivo con scripts incrustados (<?php o <script)', async () => {
      const scriptBuf = Buffer.from('<?php echo "evil"; ?> [{"a": 1}]');
      await assert.rejects(
        async () => {
          await validateTableContent(scriptBuf, '.json');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual((err as AppError).status, 415);
          assert.strictEqual((err as AppError).code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });
  });

  describe('Bandera usedAi en Respuestas de Chat (chat.service.ts)', () => {
    const origTableFindMany = (prisma.tableRegistry as any)?.findMany;
    const origPdfFindMany = (prisma.pdfRegistry as any)?.findMany;
    const origUserFindUnique = (prisma.user as any)?.findUnique;

    afterEach(() => {
      if (origTableFindMany) (prisma.tableRegistry as any).findMany = origTableFindMany;
      if (origPdfFindMany) (prisma.pdfRegistry as any).findMany = origPdfFindMany;
      if (origUserFindUnique) (prisma.user as any).findUnique = origUserFindUnique;
      mock.reset();
    });

    it('CIRCUIT_BREAKER: retorna usedAi: false cuando la información no existe en el sistema', async () => {
      (prisma.tableRegistry as any).findMany = async () => [];
      (prisma.pdfRegistry as any).findMany = async () => [];

      const requester = { id: '00000000-0000-0000-0000-000000000000', role: Role.ADMIN };
      const res = await chatService.askInternal(
        { question: '¿Cuál es el valor del neutrino en la nebulosa inexistente?' },
        requester
      );
      assert.strictEqual(res.foundInSystem, false);
      assert.strictEqual(res.usedAi, false);
      assert.strictEqual(res.sources.length, 0);
    });

    it('CIRCUIT_BREAKER público: retorna usedAi: false cuando no hay datos públicos', async () => {
      (prisma.user as any).findUnique = async () => null;

      const res = await chatService.askPublic({
        question: '¿Cuál es la tasa de cambio de Marte hoy?',
      });
      assert.strictEqual(res.foundInSystem, false);
      assert.strictEqual(res.usedAi, false);
    });

    it('Respuesta generada por IA: incluye usedAi: true en el resultado', async () => {
      (prisma.tableRegistry as any).findMany = async () => [];
      (prisma.pdfRegistry as any).findMany = async () => [];

      mock.method(chatService as any, 'processQuestionWithTables', async () => ({
        answer: 'Respuesta analítica con IA.',
        foundInSystem: true,
        usedAi: true,
        sources: [{ tableId: '00000000-0000-0000-0000-000000000000', tableName: 'ventas.json', shortCode: 'vnt123' }],
        chartData: null,
      }));

      const requester = { id: '00000000-0000-0000-0000-000000000000', role: Role.ADMIN };
      const res = await chatService.askInternal(
        { question: '¿Cuáles fueron las ventas totales de 2026?' },
        requester
      );
      assert.strictEqual(res.foundInSystem, true);
      assert.strictEqual(res.usedAi, true);
      assert.strictEqual(res.sources.length, 1);
    });
  });

  describe('Ingesta y Guardado de Tablas JSON (tablesService.saveTable)', () => {
    const validUuid = '44444444-5555-4666-8777-888888888888';

    afterEach(() => {
      mock.reset();
    });

    it('saveTable: guarda archivo JSON, extrae metadatos y retorna URL y shortCode', async () => {
      const jsonData = JSON.stringify([
        { id: 101, producto: 'Mouse Gamer', stock: 15 },
        { id: 102, producto: 'Teclado Mecánico', stock: 8 },
      ]);

      const fakePart = {
        filename: 'inventario.json',
        mimetype: 'application/json',
        file: Readable.from([Buffer.from(jsonData)]),
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
      assert.strictEqual(result.tableName, 'inventario.json');
      assert.strictEqual(result.rowCount, 2);
      assert.deepStrictEqual(result.columns, ['id', 'producto', 'stock']);
      assert.ok(result.shortCode);
      assert.ok(result.url.includes(`/t/${result.shortCode}`));

      // Limpieza del archivo físico generado
      await tablesService.deleteTable(validUuid).catch(() => {});
    });
  });
});
