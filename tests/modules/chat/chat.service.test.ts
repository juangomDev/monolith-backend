import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Role, FolderPermission } from '@prisma/client';
import { prisma } from '../../../src/config/db.js';
import {
  generateInitialMetadataCard,
  tablesMetadataService,
} from '../../../src/modules/tables/tables.metadata.service.js';
import {
  chatProvider,
  synthesizeDeterministicFallback,
  generateCacheKey,
} from '../../../src/modules/chat/chat.provider.js';
import { chatService } from '../../../src/modules/chat/chat.service.js';

describe('Módulo Chat: chat.service.ts y chat.provider.ts', () => {
  test('generateInitialMetadataCard: extrae entidades de texto y detecta fila de resumen', () => {
    const card = generateInitialMetadataCard({
      columns: ['Ciudad', 'Habitantes'],
      rows: [
        { Ciudad: 'Bogotá', Habitantes: 8000000 },
        { Ciudad: 'Medellín', Habitantes: 2500000 },
        { Ciudad: 'Total General', Habitantes: 10500000 },
      ],
      headers: [['Ciudad', 'Habitantes']],
    });

    assert.ok(card.entities.includes('Bogotá'));
    assert.ok(card.entities.includes('Medellín'));
    assert.strictEqual(card.hasSummaryRows, true);
    assert.strictEqual(card.columnsMeta['Ciudad'], 'Ciudad');
  });

  test('synthesizeDeterministicFallback: genera redacción clara con porcentajes en español', () => {
    const mockEngineResult = {
      foundInSystem: true,
      question: '¿Cuántos hombres y mujeres hay en Colombia?',
      normalizedQuestion: 'cuantos hombres y mujeres hay en colombia',
      table: {
        id: 'uuid-1',
        shortCode: 'demo123456',
        tableName: 'censo_col.csv',
        title: 'Censo Colombia',
      },
      matchedEntities: ['Colombia'],
      matchedColumns: ['Hombres', 'Mujeres'],
      totalRowsFiltered: 1,
      calculations: [
        { column: 'Hombres', sum: 24000000, avg: 24000000, count: 1 },
        { column: 'Mujeres', sum: 26000000, avg: 26000000, count: 1 },
      ],
      chartData: {
        labels: ['Hombres', 'Mujeres'],
        values: [24000000, 26000000],
        percentages: [48, 52],
      },
      sampleRows: [],
      summaryText: '',
    };

    const text = synthesizeDeterministicFallback(mockEngineResult as any);
    assert.ok(text.includes('Censo Colombia'));
    assert.ok(text.includes('Colombia'));
    assert.ok(text.includes('48%'));
    assert.ok(text.includes('52%'));
  });

  test('chatProvider.ask: responde con cortocircuito si foundInSystem es false', async () => {
    const emptyResult = {
      foundInSystem: false,
      question: '¿Cuál es la moneda de Marte?',
      normalizedQuestion: 'cual es la moneda de marte',
      matchedEntities: [],
      matchedColumns: [],
      totalRowsFiltered: 0,
      calculations: [],
      sampleRows: [],
      summaryText: '',
    };

    const res = await chatProvider.ask(emptyResult as any, ['table-1']);
    assert.strictEqual(res.answer, 'La información solicitada no existe en los archivos registrados en este sistema.');
    assert.strictEqual(res.modelUsed, 'deterministic-circuit-breaker');
  });

  test('chatProvider.ask: almacena y devuelve respuestas desde la memoria caché LRU', async () => {
    const engineResult = {
      foundInSystem: true,
      question: '¿Población total?',
      normalizedQuestion: 'poblacion total test cache',
      table: { id: 't-1', shortCode: 'code123', tableName: 't.csv' },
      matchedEntities: [],
      matchedColumns: ['Total'],
      totalRowsFiltered: 1,
      calculations: [{ column: 'Total', sum: 500, avg: 500, count: 1 }],
      sampleRows: [],
      summaryText: '',
    };

    const first = await chatProvider.ask(engineResult as any, ['t-1'], 'v1');
    assert.strictEqual(first.fromCache, false);

    const second = await chatProvider.ask(engineResult as any, ['t-1'], 'v1');
    assert.strictEqual(second.fromCache, true);
    assert.strictEqual(second.answer, first.answer);
  });
});
