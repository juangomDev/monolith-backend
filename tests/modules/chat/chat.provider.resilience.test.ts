import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { env } from '../../../src/config/env.js';
import { chatProvider, getChatCache } from '../../../src/modules/chat/chat.provider.js';
import { processQuestionWithPdfs } from '../../../src/modules/chat/chat.pdf.engine.js';
import type { EngineCalculationResult } from '../../../src/modules/chat/chat.engine.js';

const gzipAsync = promisify(zlib.gzip);

function buildEngineResult(suffix: string): EngineCalculationResult {
  return {
    foundInSystem: true,
    question: `¿Cuál es el total de ventas ${suffix}?`,
    normalizedQuestion: `cual es el total de ventas ${suffix}`,
    table: {
      id: 'table-resilience-1',
      shortCode: 'res1234567',
      tableName: 'ventas.csv',
      title: 'Ventas 2026',
    },
    matchedEntities: ['Norte'],
    matchedColumns: ['Total'],
    totalRowsFiltered: 2,
    calculations: [{ column: 'Total', sum: 1500, avg: 750, count: 2 }],
    chartData: null,
    sampleRows: [{ Region: 'Norte', Total: 1500 }],
    summaryText: 'Total = 1500',
  };
}

describe('Módulo Chat: Resiliencia de ChatProvider (logging 404, fallback y usedAi real)', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = env.AI_API_KEY;
  const originalModel = env.AI_MODEL;
  const originalFallback = env.AI_FALLBACK_MODEL;
  const originalBaseUrl = env.AI_BASE_URL;

  beforeEach(() => {
    getChatCache().clear();
    env.AI_API_KEY = 'AIza_fake_test_key_never_logged';
    env.AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
    env.AI_MODEL = 'gemini-2.5-flash';
    env.AI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    env.AI_API_KEY = originalApiKey;
    env.AI_MODEL = originalModel;
    env.AI_FALLBACK_MODEL = originalFallback;
    env.AI_BASE_URL = originalBaseUrl;
    getChatCache().clear();
    mock.reset();
  });

  it('normaliza prefijo models/ en AI_MODEL, retorna usedAi: true y preserva usedAi: true en caché', async () => {
    env.AI_MODEL = 'models/gemini-2.5-flash';
    const capturedBodies: any[] = [];

    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBodies.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'El total de ventas es 1.500.' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const engineResult = buildEngineResult('case-ok');
    const first = await chatProvider.ask(engineResult, ['t-1'], 'v1');

    assert.strictEqual(capturedBodies.length, 1);
    assert.strictEqual(capturedBodies[0].model, 'gemini-2.5-flash');
    assert.strictEqual(first.usedAi, true);
    assert.strictEqual(first.fromCache, false);
    assert.strictEqual(first.modelUsed, 'gemini-2.5-flash');

    const second = await chatProvider.ask(engineResult, ['t-1'], 'v1');
    assert.strictEqual(second.fromCache, true);
    assert.strictEqual(second.usedAi, true);
    assert.strictEqual(second.answer, first.answer);
  });

  it('ante 404 NotFound en modelo primario: registra log con status y detalle (sin API key) y rota a AI_FALLBACK_MODEL', async () => {
    const errorLogs: string[] = [];
    mock.method(console, 'error', (...args: any[]) => {
      errorLogs.push(args.map(String).join(' '));
    });

    const calledModels: string[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);

      if (body.model === 'gemini-2.5-flash') {
        return new Response(
          JSON.stringify({
            error: {
              code: 404,
              message: 'models/gemini-2.5-flash is not found for API version v1beta',
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Respuesta desde el modelo fallback.' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const res = await chatProvider.ask(buildEngineResult('case-404-fallback'), ['t-1'], 'v1');

    assert.deepStrictEqual(calledModels, ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    assert.strictEqual(res.usedAi, true);
    assert.strictEqual(res.modelUsed, 'gemini-2.5-flash-lite');
    assert.strictEqual(res.answer, 'Respuesta desde el modelo fallback.');
    assert.ok(errorLogs.some((line) => line.includes('404') && line.includes('not found')));
    assert.ok(errorLogs.every((line) => !line.includes('AIza_fake_test_key_never_logged')));
  });

  it('cuando primario y fallback fallan (404/500): cae a deterministic-fallback con usedAi: false incluso en caché', async () => {
    mock.method(console, 'error', () => {});

    globalThis.fetch = (async () =>
      new Response('{"error":{"message":"model not found"}}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const engineResult = buildEngineResult('case-both-fail');
    const first = await chatProvider.ask(engineResult, ['t-1'], 'v1');

    assert.strictEqual(first.modelUsed, 'deterministic-fallback');
    assert.strictEqual(first.usedAi, false);
    assert.strictEqual(first.fromCache, false);
    assert.ok(first.answer.includes('Ventas 2026'));

    const second = await chatProvider.ask(engineResult, ['t-1'], 'v1');
    assert.strictEqual(second.fromCache, true);
    assert.strictEqual(second.usedAi, false);
  });

  it('sin AI_API_KEY: responde con deterministic-local y usedAi: false', async () => {
    env.AI_API_KEY = undefined;
    const prevEnvKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;

    try {
      const res = await chatProvider.ask(buildEngineResult('case-no-key'), ['t-1'], 'v1');
      assert.strictEqual(res.modelUsed, 'deterministic-local');
      assert.strictEqual(res.usedAi, false);
    } finally {
      if (prevEnvKey !== undefined) process.env.AI_API_KEY = prevEnvKey;
    }
  });

  it('processQuestionWithPdfs: propaga usedAi: false cuando el proveedor cae a fallback determinista', async () => {
    const tmpDir = path.resolve('./storage/test_fixtures_pdf_resilience');
    const artifactPath = path.join(tmpDir, 'reglamento.text.json.gz');
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      const gz = await gzipAsync(
        Buffer.from(
          JSON.stringify({
            pages: [{ pageNumber: 1, text: 'Las vacaciones son de 15 días hábiles anuales.' }],
          })
        )
      );
      await fs.writeFile(artifactPath, gz);

      const pdfRes = await processQuestionWithPdfs(
        '¿Cuántos días de vacaciones corresponden?',
        [
          {
            id: 'pdf-res-1',
            shortCode: 'pdfRes1234',
            originalName: 'reglamento.pdf',
            textArtifactPath: artifactPath,
            metadataCard: { title: 'Reglamento', keywords: ['vacaciones'] },
            updatedAt: new Date(),
          },
        ],
        {
          ask: async () => ({
            answer: 'Respuesta determinista local sin LLM.',
            usedAi: false,
          }),
        }
      );

      assert.ok(pdfRes);
      assert.strictEqual(pdfRes.foundInSystem, true);
      assert.strictEqual(pdfRes.usedAi, false);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
