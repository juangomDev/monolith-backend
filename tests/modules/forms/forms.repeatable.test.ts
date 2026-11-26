import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import { Role, FolderPermission } from '@prisma/client';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import {
  validatePayloadAgainstSchema,
  mergeEntryAndResolutionPayload,
  formatValueForFlatExport,
} from '../../../src/modules/forms/forms.validator.js';
import { FormsService, formsService } from '../../../src/modules/forms/forms.service.js';
import { FormsTableSync } from '../../../src/modules/forms/forms.table-sync.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';

const gunzipAsync = promisify(zlib.gunzip);

describe('Módulo Formularios (Fase 28): Listas Repetibles (array), Resolución por Fila, Excel Multi-Hoja y Tabla Abierta', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const adminCaller = { id: 'admin-uuid-28', role: Role.ADMIN };
  const originalFindUnique = prisma.apiClient.findUnique;

  const constanciaGeograficaForm: any = {
    id: '55555555-5555-4555-8555-555555555555',
    slug: 'constancia-periodos-ubicacion',
    title: 'Solicitud de Períodos y Ubicaciones Geográficas',
    folderId: '66666666-6666-4666-8666-666666666666',
    linkedTableId: '77777777-7777-4777-8777-777777777777',
    allowedResolutionStates: ['VALID', 'INVALID'],
    autoResolveWithAi: false,
    externalTargetUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    entryFieldsSchema: [
      { name: 'nombres_apellidos', label: 'Nombres y Apellidos', type: 'string', required: true },
      { name: 'cedula', label: 'Cédula', type: 'string', required: true },
      { name: 'entidad_federal', label: 'Entidad Federal', type: 'string', required: true },
      { name: 'direccion', label: 'Dirección', type: 'string', required: false },
      {
        name: 'periodos',
        label: 'Períodos y Ubicaciones Geográficas',
        type: 'array',
        required: true,
        itemsSchema: [
          { name: 'desde', type: 'number', required: true },
          { name: 'hasta', type: 'number', required: true },
          { name: 'estado', type: 'string', required: true },
          { name: 'municipio', type: 'string', required: true },
          { name: 'parroquia', type: 'string', required: true },
          { name: 'centro_poblado', type: 'string', required: false },
        ],
        resolutionItemsSchema: [
          { name: 'poblacion', type: 'number', required: true },
          { name: 'censo', type: 'string', required: true },
        ],
      },
    ],
    resolutionFieldsSchema: [
      { name: 'observaciones', label: 'Observaciones', type: 'string', required: false },
    ],
  };

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
    mock.reset();
  });

  it('validatePayloadAgainstSchema: valida solicitudes con múltiples períodos (2+) y solicitudes con 1 solo período y campos opcionales vacíos', () => {
    // 1. Usuario con mucha información (2 períodos + dirección + centro poblado)
    const fullRequest = {
      nombres_apellidos: 'Kelvis Alexander Croquer Gonzalez',
      cedula: 'V-24087712',
      entidad_federal: 'Distrito Capital',
      direccion: 'Caracas - Caricuao',
      periodos: [
        {
          desde: '2001',
          hasta: 2026,
          estado: 'Miranda',
          municipio: 'Pedro Gual',
          parroquia: 'Machurucuto',
          centro_poblado: 'machurucuto',
        },
        {
          desde: 2011,
          hasta: 2027,
          estado: 'Miranda',
          municipio: 'Pedro Gual',
          parroquia: 'Machurucuto',
          centro_poblado: '=CMD|calc', // prueba sanitización de fórmula dentro del array
        },
      ],
    };

    const validatedFull = validatePayloadAgainstSchema(fullRequest, constanciaGeograficaForm.entryFieldsSchema);
    assert.strictEqual(validatedFull.nombres_apellidos, 'Kelvis Alexander Croquer Gonzalez');
    assert.strictEqual(validatedFull.periodos.length, 2);
    assert.strictEqual(validatedFull.periodos[0].desde, 2001);
    assert.strictEqual(validatedFull.periodos[1].centro_poblado, "'=CMD|calc");

    // 2. Usuario con poca información (1 solo período, sin dirección ni centro_poblado)
    const minimalRequest = {
      nombres_apellidos: 'Maria Perez',
      cedula: 'V-15000111',
      entidad_federal: 'Miranda',
      periodos: [
        {
          desde: 2018,
          hasta: 2022,
          estado: 'Miranda',
          municipio: 'Sucre',
          parroquia: 'Petare',
        },
      ],
    };

    const validatedMin = validatePayloadAgainstSchema(minimalRequest, constanciaGeograficaForm.entryFieldsSchema);
    assert.strictEqual(validatedMin.direccion, null);
    assert.strictEqual(validatedMin.periodos.length, 1);
    assert.strictEqual(validatedMin.periodos[0].centro_poblado, null);
  });

  it('mergeEntryAndResolutionPayload: une Datos Personales y cada Período con su Población y Censo para el PDF', () => {
    const entryPayload = {
      nombres_apellidos: 'Kelvis Alexander Croquer Gonzalez',
      cedula: 'V-24087712',
      entidad_federal: 'Distrito Capital',
      direccion: 'Caracas - Caricuao',
      periodos: [
        { desde: 2001, hasta: 2026, estado: 'Miranda', municipio: 'Pedro Gual', parroquia: 'Machurucuto', centro_poblado: 'machurucuto' },
        { desde: 2011, hasta: 2027, estado: 'Miranda', municipio: 'Pedro Gual', parroquia: 'Machurucuto', centro_poblado: 'machurucuto' },
      ],
    };

    const resolutionPayload = {
      periodos: [
        { poblacion: 850, censo: '2011' },
        { poblacion: 1120, censo: '2011' },
      ],
      observaciones: 'Verificado INE',
    };

    const merged = mergeEntryAndResolutionPayload(entryPayload, resolutionPayload);
    assert.strictEqual(merged.nombres_apellidos, 'Kelvis Alexander Croquer Gonzalez');
    assert.strictEqual(merged.observaciones, 'Verificado INE');
    assert.strictEqual(merged.periodos.length, 2);
    assert.deepStrictEqual(merged.periodos[0], {
      desde: 2001,
      hasta: 2026,
      estado: 'Miranda',
      municipio: 'Pedro Gual',
      parroquia: 'Machurucuto',
      centro_poblado: 'machurucuto',
      poblacion: 850,
      censo: '2011',
    });
    assert.strictEqual(merged.periodos[1].poblacion, 1120);
  });

  it('getEntry y resolveEntry (1 solo guardado): carga solicitud y al resolver devuelve mergedPayload con todos los períodos y su población/censo', async () => {
    const entryRecord = {
      id: '88888888-8888-4888-8888-888888888888',
      formId: constanciaGeograficaForm.id,
      form: constanciaGeograficaForm,
      status: 'NEW',
      entryPayload: {
        nombres_apellidos: 'Kelvis Alexander Croquer Gonzalez',
        cedula: 'V-24087712',
        entidad_federal: 'Distrito Capital',
        direccion: 'Caracas - Caricuao',
        periodos: [
          { desde: 2001, hasta: 2026, estado: 'Miranda', municipio: 'Pedro Gual', parroquia: 'Machurucuto', centro_poblado: 'machurucuto' },
        ],
      },
      resolutionPayload: null,
      resolvedAt: null,
      createdAt: new Date(),
    };

    const mockRepo: any = {
      findEntryById: async () => entryRecord,
      updateEntry: async (_id: string, data: any) => ({
        ...entryRecord,
        status: data.status,
        resolutionPayload: data.resolutionPayload,
        resolvedAt: data.resolvedAt,
      }),
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };
    const mockTableSync: any = {
      syncEntryToTable: async () => {},
    };

    const service = new FormsService(mockRepo, mockTableSync, mockShares);

    // 1. El analista abre la solicitud en su pantalla
    const loaded = await service.getEntry(entryRecord.id, adminCaller);
    assert.strictEqual(loaded.id, entryRecord.id);
    assert.strictEqual(loaded.mergedPayload.periodos.length, 1);
    assert.strictEqual(loaded.mergedPayload.periodos[0].municipio, 'Pedro Gual');

    // 2. El analista llena Población (850) y Censo (2011) y presiona "Continuar a Emisión y Descarga" (1 solo guardado)
    const resolved = await service.resolveEntry(
      entryRecord.id,
      {
        status: 'VALID',
        resolutionPayload: {
          periodos: [
            {
              desde: 2001,
              hasta: 2026,
              estado: 'Miranda',
              municipio: 'Pedro Gual',
              parroquia: 'Machurucuto',
              centro_poblado: 'machurucuto',
              poblacion: 850,
              censo: '2011',
            },
          ],
          observaciones: 'Constancia emitida',
        },
      },
      adminCaller
    );

    assert.strictEqual(resolved.status, 'VALID');
    assert.ok(resolved.mergedPayload);
    assert.strictEqual(resolved.mergedPayload.periodos[0].poblacion, 850);
    assert.strictEqual(resolved.mergedPayload.periodos[0].censo, '2011');
    assert.strictEqual(resolved.mergedPayload.periodos[0].parroquia, 'Machurucuto');
  });

  it('GET /api/v1/forms/entries/:id: endpoint HTTP devuelve la solicitud lista para auto-rellenar la pantalla del analista', async () => {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'client-test-id',
      name: 'Cliente Test',
      keyPrefix: 'mk_live_valid_test',
      keyHash: 'fake_hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });

    const entryId = '99999999-9999-4999-8999-999999999999';
    mock.method(formsService, 'getEntry', async () => ({
      id: entryId,
      formId: constanciaGeograficaForm.id,
      status: 'NEW',
      entryPayload: { cedula: 'V-24087712', periodos: [{ estado: 'Miranda' }] },
      resolutionPayload: null,
      mergedPayload: { cedula: 'V-24087712', periodos: [{ estado: 'Miranda' }] },
      createdAt: new Date(),
    } as any));

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/entries/${entryId}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.id, entryId);
    assert.strictEqual(body.mergedPayload.cedula, 'V-24087712');
    assert.strictEqual(body.mergedPayload.periodos[0].estado, 'Miranda');
  });

  it('FormsTableSync: desglosa cada período en la Tabla Abierta (.data.json.gz) y genera Excel (.xlsx) Multi-Hoja (Solicitudes + Detalle_periodos) y CSV legible', async () => {
    const sync = new FormsTableSync();
    const shortCode = 'tblFormP28';
    const gzPath = path.resolve(process.cwd(), 'storage/tables', `${shortCode}.data.json.gz`);

    mock.method(tablesRepository, 'findById', async () => ({
      id: constanciaGeograficaForm.linkedTableId,
      shortCode,
      tableName: 'Respuestas: Solicitud de Períodos',
      rowCount: 0,
      columnsSchema: [],
      sizeBytes: 0,
      storagePath: gzPath,
      folderId: constanciaGeograficaForm.folderId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any));
    mock.method(tablesRepository, 'update', async () => ({} as any));

    const resolvedEntry: any = {
      id: 'entry-kelvis-1',
      formId: constanciaGeograficaForm.id,
      status: 'VALID',
      createdAt: new Date('2026-11-25T12:00:00.000Z'),
      resolvedAt: new Date('2026-11-25T12:30:00.000Z'),
      entryPayload: {
        nombres_apellidos: 'Kelvis Alexander Croquer Gonzalez',
        cedula: 'V-24087712',
        entidad_federal: 'Distrito Capital',
        direccion: 'Caracas - Caricuao',
        periodos: [
          { desde: 2001, hasta: 2026, estado: 'Miranda', municipio: 'Pedro Gual', parroquia: 'Machurucuto', centro_poblado: 'machurucuto' },
          { desde: 2011, hasta: 2027, estado: 'Miranda', municipio: 'Pedro Gual', parroquia: 'Machurucuto', centro_poblado: 'machurucuto' },
        ],
      },
      resolutionPayload: {
        periodos: [
          { poblacion: 850, censo: '2011' },
          { poblacion: 1120, censo: '2011' },
        ],
        observaciones: 'Aprobado',
      },
    };

    try {
      // 1. Sincronizar a Tabla Abierta (.data.json.gz)
      await sync.syncEntryToTable(constanciaGeograficaForm, resolvedEntry, true);
      const gzBuf = await fs.readFile(gzPath);
      const openTable = JSON.parse((await gunzipAsync(gzBuf)).toString('utf-8'));

      // Debe haber 2 filas desglosadas (Período #1 y Período #2) conectadas con entryId y cedula
      assert.strictEqual(openTable.rowCount, 2);
      assert.strictEqual(openTable.data.length, 2);
      assert.strictEqual(openTable.data[0].entryId, 'entry-kelvis-1');
      assert.strictEqual(openTable.data[0].cedula, 'V-24087712');
      assert.strictEqual(openTable.data[0].itemIndex, 1);
      assert.strictEqual(openTable.data[0].desde, 2001);
      assert.strictEqual(openTable.data[0].poblacion, 850);
      assert.strictEqual(openTable.data[1].itemIndex, 2);
      assert.strictEqual(openTable.data[1].desde, 2011);
      assert.strictEqual(openTable.data[1].poblacion, 1120);

      // 2. Exportación a CSV (legible, sin [object Object])
      const csvExport = await sync.exportEntries([resolvedEntry], constanciaGeograficaForm, 'csv');
      const csvText = csvExport.buffer.toString('utf-8');
      assert.strictEqual(csvText.includes('[object Object]'), false);
      assert.ok(csvText.includes('#1 ('));
      assert.ok(csvText.includes('poblacion: 850'));
      assert.ok(csvText.includes('#2 ('));

      // 3. Exportación a Excel (.xlsx) Multi-Hoja: Hoja 1 "Solicitudes" + Hoja 2 "Detalle_periodos"
      const xlsxExport = await sync.exportEntries([resolvedEntry], constanciaGeograficaForm, 'xlsx');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxExport.buffer as any);

      assert.strictEqual(wb.worksheets.length, 2);
      assert.strictEqual(wb.worksheets[0].name, 'Solicitudes');
      assert.strictEqual(wb.worksheets[1].name, 'Detalle_periodos');
      // Hoja 1 tiene cabecera + 1 solicitud = 2 filas
      assert.strictEqual(wb.worksheets[0].rowCount, 2);
      // Hoja 2 tiene cabecera + 2 períodos = 3 filas
      assert.strictEqual(wb.worksheets[1].rowCount, 3);
    } finally {
      await fs.unlink(gzPath).catch(() => {});
    }
  });
});
