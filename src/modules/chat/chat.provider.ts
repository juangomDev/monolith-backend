import crypto from 'node:crypto';
import { LRUCache } from 'lru-cache';
import { env } from '../../config/env.js';
import type { EngineCalculationResult } from './chat.engine.js';

export interface AiResponse {
  answer: string;
  modelUsed: string;
  fromCache: boolean;
}

const chatCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutos
});

export function getChatCache(): LRUCache<string, string> {
  return chatCache;
}

export function generateCacheKey(normalizedQuestion: string, tableIds: string[], updatedAt = ''): string {
  const raw = `${normalizedQuestion}:${tableIds.sort().join(',')}:${updatedAt}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function synthesizeDeterministicFallback(engineResult: EngineCalculationResult): string {
  if (!engineResult.foundInSystem || engineResult.calculations.length === 0) {
    return 'La información solicitada no existe en los archivos registrados en este sistema.';
  }

  const tableTitle = engineResult.table?.title || engineResult.table?.tableName || 'la tabla analizada';
  const entities = engineResult.matchedEntities.length > 0
    ? ` para ${engineResult.matchedEntities.join(', ')}`
    : '';

  const calcDescriptions = engineResult.calculations.map((c) => {
    const sumFormatted = c.sum !== undefined ? c.sum.toLocaleString('es-ES') : 'N/D';
    const avgFormatted = c.avg !== undefined ? c.avg.toFixed(2) : 'N/D';
    return `en "${c.column}" se registra un total de ${sumFormatted} (promedio: ${avgFormatted})`;
  });

  let text = `De acuerdo con los datos de ${tableTitle}${entities}, ${calcDescriptions.join('; ')}.`;

  if (engineResult.chartData && engineResult.chartData.percentages.length > 0) {
    const dist = engineResult.chartData.labels
      .map((l, i) => `${l}: ${engineResult.chartData!.percentages[i]}%`)
      .join(', ');
    text += ` La distribución porcentual calculada es: ${dist}.`;
  }

  return text;
}

async function callChatCompletions(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; status: number }> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      return { text: '', status: 429 };
    }

    if (!res.ok) {
      return { text: '', status: res.status };
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    return { text: content, status: 200 };
  } catch (err: any) {
    return { text: '', status: err.name === 'AbortError' ? 408 : 500 };
  } finally {
    clearTimeout(timeoutId);
  }
}

export class ChatProvider {
  async ask(
    engineResult: EngineCalculationResult,
    tableIds: string[],
    updatedAt = ''
  ): Promise<AiResponse> {
    if (!engineResult.foundInSystem) {
      return {
        answer: 'La información solicitada no existe en los archivos registrados en este sistema.',
        modelUsed: 'deterministic-circuit-breaker',
        fromCache: false,
      };
    }

    const cacheKey = generateCacheKey(engineResult.normalizedQuestion, tableIds, updatedAt);
    const cachedAnswer = chatCache.get(cacheKey);
    if (cachedAnswer) {
      return { answer: cachedAnswer, modelUsed: 'cache', fromCache: true };
    }

    const apiKey = env.AI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      const fallback = synthesizeDeterministicFallback(engineResult);
      chatCache.set(cacheKey, fallback);
      return { answer: fallback, modelUsed: 'deterministic-local', fromCache: false };
    }

    const systemPrompt =
      'Eres un analista de datos analítico y riguroso. Responde a la pregunta del usuario en español de forma concisa, profesional y directa, basándote ÚNICA Y EXCLUSIVAMENTE en los cálculos matemáticos exactos provistos a continuación. NO inventes números ni agregues información externa.';

    const userPrompt = `Pregunta: ${engineResult.question}\n\nDatos Analíticos Verificados:\n${engineResult.summaryText}\nFilas filtradas: ${engineResult.totalRowsFiltered}\nMuestra de datos: ${JSON.stringify(engineResult.sampleRows)}`;

    let primaryRes = await callChatCompletions(
      env.AI_BASE_URL,
      apiKey,
      env.AI_MODEL,
      systemPrompt,
      userPrompt
    );

    let modelUsed = env.AI_MODEL;
    let answerText = primaryRes.text;

    // Rotación automática si recibe 429
    if (primaryRes.status === 429 && env.AI_FALLBACK_MODEL) {
      const fallbackRes = await callChatCompletions(
        env.AI_BASE_URL,
        apiKey,
        env.AI_FALLBACK_MODEL,
        systemPrompt,
        userPrompt
      );
      if (fallbackRes.status === 200 && fallbackRes.text) {
        modelUsed = env.AI_FALLBACK_MODEL;
        answerText = fallbackRes.text;
      }
    }

    // Fallback determinista si los modelos cloud no respondieron
    if (!answerText) {
      answerText = synthesizeDeterministicFallback(engineResult);
      modelUsed = 'deterministic-fallback';
    }

    chatCache.set(cacheKey, answerText);
    return { answer: answerText, modelUsed, fromCache: false };
  }
}

export const chatProvider = new ChatProvider();
