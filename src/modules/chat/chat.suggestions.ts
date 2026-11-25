import type { ChatAnswerResponse } from './chat.service.js';

export interface SuggestionTableDoc {
  tableName: string;
  metadataCard?: any;
}

export interface SuggestionPdfDoc {
  originalName: string;
  metadataCard?: any;
}

/**
 * Construye hasta 5 sugerencias de preguntas a partir de tablas y documentos PDF accesibles.
 */
export function buildSuggestionsFromDocuments(
  tables: SuggestionTableDoc[],
  pdfs: SuggestionPdfDoc[],
  fallbackMessage: string = '¿Cuáles son los datos más relevantes de los documentos disponibles?'
): string[] {
  const suggestions: string[] = [];

  for (const tbl of tables) {
    const card = (tbl.metadataCard as any) || {};
    const title = card.title || tbl.tableName.replace(/\.[^/.]+$/, '');
    const entities: string[] = card.entities || [];
    const columns = Object.keys(card.columnsMeta || {});

    if (entities.length > 0 && columns.length > 0) {
      suggestions.push(`¿Cuál es el valor de ${columns[0]} para ${entities[0]} en ${title}?`);
    } else if (entities.length > 0) {
      suggestions.push(`¿Qué información hay sobre ${entities[0]} en ${title}?`);
    } else {
      suggestions.push(`¿Cuál es el resumen estadístico de ${title}?`);
    }
    if (suggestions.length >= 3 && pdfs.length > 0) break;
    if (suggestions.length >= 5) break;
  }

  for (const pdf of pdfs) {
    if (suggestions.length >= 5) break;
    const card = (pdf.metadataCard as any) || {};
    const title = card.title || pdf.originalName.replace(/\.pdf$/i, '');
    const keywords: string[] = Array.isArray(card.keywords) ? card.keywords : [];
    const tags: string[] = Array.isArray(card.tags) ? card.tags : [];
    const topic = keywords[0] || tags[0];

    if (topic) {
      suggestions.push(`¿Qué dice ${title} sobre ${topic}?`);
    } else if (card.summary) {
      suggestions.push(`¿Cuál es el resumen principal de ${title}?`);
    } else {
      suggestions.push(`¿Qué información contiene el documento ${title}?`);
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(fallbackMessage);
  }

  return suggestions;
}

/**
 * Combina respuestas cuando una pregunta encuentra resultados relevantes tanto en tablas como en PDFs.
 */
export function mergeMultiSourceChatAnswers(
  tableRes: ChatAnswerResponse | null,
  pdfRes: ChatAnswerResponse | null
): ChatAnswerResponse | null {
  const hasTable = Boolean(tableRes?.foundInSystem);
  const hasPdf = Boolean(pdfRes?.foundInSystem);

  if (hasTable && hasPdf && tableRes && pdfRes) {
    return {
      answer: `${tableRes.answer}\n\nInformación complementaria en documentos PDF:\n${pdfRes.answer}`,
      foundInSystem: true,
      usedAi: Boolean(tableRes.usedAi || pdfRes.usedAi),
      sources: [...tableRes.sources, ...pdfRes.sources],
      chartData: tableRes.chartData ?? pdfRes.chartData ?? null,
    };
  }

  if (hasTable && tableRes) return tableRes;
  if (hasPdf && pdfRes) return pdfRes;
  return null;
}
