import { prisma } from '../../config/db.js';
import { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';
import { buildFolderMemberOrConditions } from '../../shared/folder-visibility.js';
import type { RequesterContext } from '../folders/folders.service.js';
import {
  matchTablesByMetadata,
  readTableArtifact,
  executeMathScratchpad,
  normalizeText,
} from './chat.engine.js';
import { processQuestionWithPdfs } from './chat.pdf.engine.js';
import { chatProvider } from './chat.provider.js';
import { buildSuggestionsFromDocuments, mergeMultiSourceChatAnswers } from './chat.suggestions.js';

export interface ChatAskInput {
  question: string;
  folderId?: string;
  shortCode?: string;
}

export interface ChatAnswerResponse {
  answer: string;
  foundInSystem: boolean;
  usedAi: boolean;
  sources: Array<{
    type?: 'TABLE' | 'PDF';
    tableId: string;
    tableName: string;
    shortCode: string;
    title?: string;
    url?: string;
    pages?: number[];
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
  usedAi: false,
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
  private buildInternalWhere(requester: RequesterContext, folderId?: string, shortCode?: string): any {
    let where: any = {};
    if (requester.role === Role.ADMIN) {
      where = {};
    } else if (requester.role === Role.MANAGER) {
      where = {
        OR: [
          { folderId: null },
          { folder: { isSystem: true } },
          { folder: { isPrivate: false } },
          { folder: { userId: requester.id } },
          ...buildFolderMemberOrConditions(requester.id).map((cond) => ({ folder: cond })),
        ],
      };
    } else {
      where = {
        folder: {
          OR: [{ isSystem: true }, ...buildFolderMemberOrConditions(requester.id)],
        },
      };
    }
    if (folderId) where.folderId = folderId;
    if (shortCode) where.shortCode = shortCode;
    return where;
  }

  async askInternal(input: ChatAskInput, requester: RequesterContext): Promise<ChatAnswerResponse> {
    const question = input.question?.trim();
    if (!question || question.length < 3) {
      throw new AppError(400, 'La pregunta debe contener al menos 3 caracteres', 'BAD_REQUEST');
    }

    const where = this.buildInternalWhere(requester, input.folderId, input.shortCode);

    const [tables, pdfs] = await Promise.all([
      prisma.tableRegistry.findMany({
        where,
        select: { id: true, shortCode: true, tableName: true, storagePath: true, metadataCard: true, updatedAt: true },
      }),
      prisma.pdfRegistry.findMany({
        where,
        select: { id: true, shortCode: true, originalName: true, textArtifactPath: true, metadataCard: true, updatedAt: true },
      }),
    ]);

    const [tableRes, pdfRes] = await Promise.all([
      this.processQuestionWithTables(question, tables),
      processQuestionWithPdfs(question, pdfs, chatProvider),
    ]);

    return mergeMultiSourceChatAnswers(tableRes, pdfRes) ?? CIRCUIT_BREAKER_ANSWER;
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
          ...buildFolderMemberOrConditions(aiManagerId),
        ],
      },
    };

    if (input.folderId) where.folderId = input.folderId;
    if (input.shortCode) where.shortCode = input.shortCode;

    const [tables, pdfs] = await Promise.all([
      prisma.tableRegistry.findMany({
        where,
        select: { id: true, shortCode: true, tableName: true, storagePath: true, metadataCard: true, updatedAt: true },
      }),
      prisma.pdfRegistry.findMany({
        where,
        select: { id: true, shortCode: true, originalName: true, textArtifactPath: true, metadataCard: true, updatedAt: true },
      }),
    ]);

    const [tableRes, pdfRes] = await Promise.all([
      this.processQuestionWithTables(question, tables),
      processQuestionWithPdfs(question, pdfs, chatProvider),
    ]);

    return mergeMultiSourceChatAnswers(tableRes, pdfRes) ?? CIRCUIT_BREAKER_ANSWER;
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
          ...buildFolderMemberOrConditions(aiManagerId),
        ],
      },
    };
    if (folderId) where.folderId = folderId;

    const [tables, pdfs] = await Promise.all([
      prisma.tableRegistry.findMany({ where, select: { tableName: true, metadataCard: true }, take: 10 }).catch(() => []),
      prisma.pdfRegistry.findMany({ where, select: { originalName: true, metadataCard: true }, take: 10 }).catch(() => []),
    ]);

    return {
      suggestions: buildSuggestionsFromDocuments(
        tables,
        pdfs,
        '¿Cuáles son los datos más relevantes de las tablas públicas?'
      ),
    };
  }

  async getInternalSuggestions(requester: RequesterContext, folderId?: string): Promise<{ suggestions: string[] }> {
    const where = this.buildInternalWhere(requester, folderId);
    const [tables, pdfs] = await Promise.all([
      prisma.tableRegistry.findMany({ where, select: { tableName: true, metadataCard: true }, take: 10 }).catch(() => []),
      prisma.pdfRegistry.findMany({ where, select: { originalName: true, metadataCard: true }, take: 10 }).catch(() => []),
    ]);

    return {
      suggestions: buildSuggestionsFromDocuments(
        tables,
        pdfs,
        '¿Cuáles son los datos más relevantes de tus tablas y documentos?'
      ),
    };
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
        usedAi: Boolean(aiRes.usedAi),
        sources: [
          {
            type: 'TABLE',
            tableId: targetTable.id,
            tableName: targetTable.tableName,
            shortCode: targetTable.shortCode,
            title: bestMatch.title,
            url: `/t/${targetTable.shortCode}`,
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
