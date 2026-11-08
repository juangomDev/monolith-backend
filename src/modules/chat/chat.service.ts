import { prisma } from '../../config/db.js';
import { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';
import type { RequesterContext } from '../folders/folders.service.js';
import {
  matchTablesByMetadata,
  readTableArtifact,
  executeMathScratchpad,
  normalizeText,
} from './chat.engine.js';
import { chatProvider } from './chat.provider.js';

export interface ChatAskInput {
  question: string;
  folderId?: string;
  shortCode?: string;
}

export interface ChatAnswerResponse {
  answer: string;
  foundInSystem: boolean;
  sources: Array<{
    tableId: string;
    tableName: string;
    shortCode: string;
    title?: string;
  }>;
  chartData: {
    labels: string[];
    values: number[];
    percentages: number[];
  } | null;
}

const CIRCUIT_BREAKER_ANSWER: ChatAnswerResponse = {
  answer: 'La información solicitada no existe en los archivos registrados en este sistema.',
  foundInSystem: false,
  sources: [],
  chartData: null,
};

let cachedAiManagerId: string | null = null;
let lastAiManagerLookup = 0;
const AI_MANAGER_CACHE_TTL = 60 * 1000; // 1 minuto

async function resolveAiManagerId(): Promise<string | null> {
  const now = Date.now();
  if (cachedAiManagerId && now - lastAiManagerLookup < AI_MANAGER_CACHE_TTL) {
    return cachedAiManagerId;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { username: 'ai_manager' },
      select: { id: true, isActive: true },
    });
    if (user && user.isActive) {
      cachedAiManagerId = user.id;
      lastAiManagerLookup = now;
      return user.id;
    }
  } catch {
    // Si la BD no está disponible o la tabla no existe, retorno resiliente sin lanzar 500
  }
  cachedAiManagerId = null;
  return null;
}

export class ChatService {
  async askInternal(input: ChatAskInput, requester: RequesterContext): Promise<ChatAnswerResponse> {
    const question = input.question?.trim();
    if (!question || question.length < 3) {
      throw new AppError(400, 'La pregunta debe contener al menos 3 caracteres', 'BAD_REQUEST');
    }

    let where: any = {};
    if (requester.role === Role.ADMIN) {
      // ADMIN tiene acceso a todas las tablas
      where = {};
    } else if (requester.role === Role.MANAGER) {
      where = {
        OR: [
          { folderId: null },
          { folder: { isPrivate: false } },
          { folder: { userId: requester.id } },
          { folder: { members: { some: { userId: requester.id } } } },
        ],
      };
    } else {
      // COLLABORATOR solo tablas en carpetas compartidas
      where = {
        folder: { members: { some: { userId: requester.id } } },
      };
    }

    if (input.folderId) where.folderId = input.folderId;
    if (input.shortCode) where.shortCode = input.shortCode;

    const tables = await prisma.tableRegistry.findMany({
      where,
      select: {
        id: true,
        shortCode: true,
        tableName: true,
        storagePath: true,
        metadataCard: true,
        updatedAt: true,
      },
    });

    return this.processQuestionWithTables(question, tables);
  }

  async askPublic(input: ChatAskInput): Promise<ChatAnswerResponse> {
    const question = input.question?.trim();
    if (!question || question.length < 3) {
      throw new AppError(400, 'La pregunta debe contener al menos 3 caracteres', 'BAD_REQUEST');
    }

    // Visibilidad IA: Bóveda de ai_manager (carpetas de ai_manager o compartidas con ai_manager)
    const aiManagerId = await resolveAiManagerId();
    if (!aiManagerId) {
      return CIRCUIT_BREAKER_ANSWER;
    }

    const where: any = {
      folder: {
        OR: [
          { userId: aiManagerId },
          { members: { some: { userId: aiManagerId } } },
        ],
      },
    };

    if (input.folderId) where.folderId = input.folderId;
    if (input.shortCode) where.shortCode = input.shortCode;

    const tables = await prisma.tableRegistry.findMany({
      where,
      select: {
        id: true,
        shortCode: true,
        tableName: true,
        storagePath: true,
        metadataCard: true,
        updatedAt: true,
      },
    });

    return this.processQuestionWithTables(question, tables);
  }

  async getPublicSuggestions(folderId?: string): Promise<{ suggestions: string[] }> {
    const aiManagerId = await resolveAiManagerId();
    if (!aiManagerId) {
      return { suggestions: ['¿Cuáles son los datos más relevantes de las tablas públicas?'] };
    }

    const where: any = {
      folder: {
        OR: [
          { userId: aiManagerId },
          { members: { some: { userId: aiManagerId } } },
        ],
      },
    };
    if (folderId) where.folderId = folderId;

    const tables = await prisma.tableRegistry.findMany({
      where,
      select: {
        tableName: true,
        metadataCard: true,
      },
      take: 10,
    });

    const suggestions: string[] = [];

    for (const tbl of tables) {
      const card = (tbl.metadataCard as any) || {};
      const title = card.title || tbl.tableName.replace(/\.[^/.]+$/, '');
      const entities: string[] = card.entities || [];
      const columns = Object.keys(card.columnsMeta || {});

      if (entities.length > 0 && columns.length > 0) {
        const ent = entities[0];
        const col = columns[0];
        suggestions.push(`¿Cuál es el valor de ${col} para ${ent} en ${title}?`);
      } else if (entities.length > 0) {
        suggestions.push(`¿Qué información hay sobre ${entities[0]} en ${title}?`);
      } else {
        suggestions.push(`¿Cuál es el resumen estadístico de ${title}?`);
      }

      if (suggestions.length >= 5) break;
    }

    if (suggestions.length === 0) {
      suggestions.push('¿Cuáles son los datos más relevantes de las tablas públicas?');
    }

    return { suggestions };
  }

  private async processQuestionWithTables(
    question: string,
    tables: Array<{
      id: string;
      shortCode: string;
      tableName: string;
      storagePath: string;
      metadataCard: any;
      updatedAt: Date;
    }>
  ): Promise<ChatAnswerResponse> {
    if (tables.length === 0) {
      return CIRCUIT_BREAKER_ANSWER;
    }

    const matches = matchTablesByMetadata(question, tables);
    if (matches.length === 0) {
      return CIRCUIT_BREAKER_ANSWER;
    }

    const bestMatch = matches[0];
    const targetTable = tables.find((t) => t.id === bestMatch.id);
    if (!targetTable) {
      return CIRCUIT_BREAKER_ANSWER;
    }

    try {
      const payload = await readTableArtifact(targetTable.storagePath, targetTable.shortCode);
      const engineResult = executeMathScratchpad(question, payload, bestMatch);

      if (!engineResult.foundInSystem) {
        return CIRCUIT_BREAKER_ANSWER;
      }

      const aiRes = await chatProvider.ask(
        engineResult,
        [targetTable.id],
        targetTable.updatedAt.toISOString()
      );

      return {
        answer: aiRes.answer,
        foundInSystem: true,
        sources: [
          {
            tableId: targetTable.id,
            tableName: targetTable.tableName,
            shortCode: targetTable.shortCode,
            title: bestMatch.title,
          },
        ],
        chartData: engineResult.chartData ?? null,
      };
    } catch {
      return CIRCUIT_BREAKER_ANSWER;
    }
  }
}

export const chatService = new ChatService();
