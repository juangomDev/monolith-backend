import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  expandTokens,
  matchTablesByMetadata,
  executeMathScratchpad,
} from '../../../src/modules/chat/chat.engine.js';

describe('Módulo Chat: chat.engine.ts (Motor Analítico Local)', () => {
  test('normalizeText: elimina acentos, diacríticos y convierte a minúsculas', () => {
    assert.strictEqual(normalizeText('Población de São Paulo 2024!'), 'poblacion de sao paulo 2024!');
    assert.strictEqual(normalizeText('MÉXICO Y PERÚ'), 'mexico y peru');
  });

  test('expandTokens: expande sinónimos demográficos y descarta stopwords', () => {
    const tokensHombre = expandTokens('¿Cuántos hombres hay en la región?');
    assert.ok(tokensHombre.includes('hombre'));
    assert.ok(tokensHombre.includes('masculino'));
    assert.ok(tokensHombre.includes('varon') || tokensHombre.includes('varones'));
    assert.ok(!tokensHombre.includes('de'));
    assert.ok(!tokensHombre.includes('la'));

    const tokensMujer = expandTokens('población de mujeres');
    assert.ok(tokensMujer.includes('mujer'));
    assert.ok(tokensMujer.includes('femenino'));
    assert.ok(tokensMujer.includes('poblacion'));
  });

  test('matchTablesByMetadata: rankea tablas según relevancia de entidades y columnas', () => {
    const mockTables = [
      {
        id: 't-1',
        shortCode: 'censo2024x',
        tableName: 'censo_latam.csv',
        metadataCard: {
          title: 'Censo Sudamérica 2024',
          entities: ['Brasil', 'Argentina', 'Chile'],
          columnsMeta: { Hombres: 'Población masculina', Mujeres: 'Población femenina', Total: 'Total censado' },
          tags: ['demografia', 'censo'],
        },
      },
      {
        id: 't-2',
        shortCode: 'ventas2024',
        tableName: 'ventas_autos.xlsx',
        metadataCard: {
          title: 'Ventas de Vehículos',
          entities: ['Toyota', 'Ford'],
          columnsMeta: { Precio: 'Precio unitario', Unidades: 'Cantidad vendida' },
          tags: ['comercio'],
        },
      },
    ];

    const matchesBrasil = matchTablesByMetadata('¿Cuántos hombres hay en Brasil?', mockTables);
    assert.strictEqual(matchesBrasil.length, 1);
    assert.strictEqual(matchesBrasil[0].id, 't-1');
    assert.ok(matchesBrasil[0].matchedEntities.includes('brasil'));

    const matchesInexistente = matchTablesByMetadata('¿Cuál es la inflación en Japón?', mockTables);
    assert.strictEqual(matchesInexistente.length, 0);
  });

  test('executeMathScratchpad: calcula sumas, promedios y porcentajes con precisión exacta', () => {
    const payload = {
      columns: ['Pais', 'Hombres', 'Mujeres', 'Total'],
      metadataCard: { hasSummaryRows: true },
      data: [
        { Pais: 'Brasil', Hombres: 100, Mujeres: 150, Total: 250 },
        { Pais: 'Argentina', Hombres: 40, Mujeres: 60, Total: 100 },
        { Pais: 'Total General', Hombres: 140, Mujeres: 210, Total: 350 }, // Fila de totales
      ],
    };

    const matchedTable = {
      id: 't-1',
      shortCode: 'censo2024x',
      tableName: 'censo_latam.csv',
      relevanceScore: 10,
      matchedEntities: ['brasil'],
      matchedColumns: ['Hombres', 'Mujeres'],
    };

    const result = executeMathScratchpad('¿Cuántos hombres y mujeres hay en Brasil?', payload, matchedTable);

    assert.strictEqual(result.foundInSystem, true);
    assert.strictEqual(result.totalRowsFiltered, 1);

    const calcHombres = result.calculations.find((c) => c.column === 'Hombres');
    const calcMujeres = result.calculations.find((c) => c.column === 'Mujeres');

    assert.ok(calcHombres);
    assert.ok(calcMujeres);
    assert.strictEqual(calcHombres?.sum, 100);
    assert.strictEqual(calcMujeres?.sum, 150);

    // Verificación de chartData y porcentajes
    assert.ok(result.chartData);
    assert.strictEqual(result.chartData?.labels.length, 2);
    // 100 / 250 = 40%, 150 / 250 = 60%
    assert.strictEqual(result.chartData?.percentages[0], 40);
    assert.strictEqual(result.chartData?.percentages[1], 60);
  });

  test('executeMathScratchpad: descarta fila de resumen para no duplicar sumas globales', () => {
    const payload = {
      columns: ['Item', 'Monto'],
      metadataCard: { hasSummaryRows: true },
      data: [
        { Item: 'Producto A', Monto: 100 },
        { Item: 'Producto B', Monto: 200 },
        { Item: 'Total', Monto: 300 }, // No debe sumarse al total de filas
      ],
    };

    const result = executeMathScratchpad('¿Cuál es el total de Monto?', payload);
    assert.strictEqual(result.foundInSystem, true);
    assert.strictEqual(result.totalRowsFiltered, 2);
    const calcMonto = result.calculations.find((c) => c.column === 'Monto');
    assert.strictEqual(calcMonto?.sum, 300); // 100 + 200 = 300 (sin sumar la fila Total)
  });
});
