import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { normalizeText, expandTokens } from './chat.engine.js';

const gunzipAsync = promisify(zlib.gunzip);

export interface MatchedPdfItem {
  id: string;
  shortCode: string;
  originalName: string;
  title?: string;
  relevanceScore: number;
}

export function matchPdfsByMetadata(
  question: string,
  pdfs: Array<{ id: string; shortCode: string; originalName: string; metadataCard?: any }>
): MatchedPdfItem[] {
  const tokens = expandTokens(question);
  if (tokens.length === 0) return [];

  const results: MatchedPdfItem[] = [];

  for (const pdf of pdfs) {
    const card = pdf.metadataCard || {};
    const tags = (card.tags || []).map((t: string) => normalizeText(t));
    const keywords = (card.keywords || []).map((k: string) => normalizeText(k));
    const title = card.title ? normalizeText(card.title) : '';
    const name = normalizeText(pdf.originalName);

    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) score += 6;
      if (name.includes(token)) score += 4;
      if (tags.some((t: string) => t.includes(token))) score += 5;
      if (keywords.some((k: string) => k.includes(token))) score += 5;
    }

    if (score > 0) {
      results.push({
        id: pdf.id,
        shortCode: pdf.shortCode,
        originalName: pdf.originalName,
        title: card.title,
        relevanceScore: score,
      });
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export async function readPdfArtifact(textArtifactPath: string): Promise<any> {
  const buffer = await fs.readFile(textArtifactPath);
  const decompressed = await gunzipAsync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

export function findRelevantPdfPages(
  artifact: any,
  question: string,
  maxPages: number = 3
): { pageNumbers: number[]; pagesText: string } {
  const tokens = expandTokens(question);
  const rawPages: Array<{ pageNumber: number; text: string }> = artifact?.pages || [];

  const scoredPages = rawPages.map((p) => {
    const norm = normalizeText(p.text);
    let matchCount = 0;
    for (const token of tokens) {
      if (norm.includes(token)) matchCount += 1;
    }
    return { ...p, score: matchCount };
  });

  const topPages = scoredPages
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (topPages.length === 0 && rawPages.length > 0) {
    const first = rawPages.slice(0, 1);
    return {
      pageNumbers: first.map((p) => p.pageNumber),
      pagesText: first.map((p) => `[Página ${p.pageNumber}]\n${p.text.slice(0, 1000)}`).join('\n\n'),
    };
  }

  return {
    pageNumbers: topPages.map((p) => p.pageNumber),
    pagesText: topPages.map((p) => `[Página ${p.pageNumber}]\n${p.text.slice(0, 1500)}`).join('\n\n'),
  };
}

export async function processQuestionWithPdfs(
  question: string,
  pdfs: Array<{ id: string; shortCode: string; originalName: string; textArtifactPath: string; metadataCard: any; updatedAt: Date }>,
  provider: { ask: (engineResult: any, docIds: string[], updatedAt: string) => Promise<{ answer: string }> }
): Promise<any | null> {
  if (!pdfs || pdfs.length === 0) return null;
  const matches = matchPdfsByMetadata(question, pdfs);
  if (matches.length === 0) return null;

  const bestMatch = matches[0];
  const targetPdf = pdfs.find((p) => p.id === bestMatch.id);
  if (!targetPdf) return null;

  try {
    const artifact = await readPdfArtifact(targetPdf.textArtifactPath);
    const { pageNumbers, pagesText } = findRelevantPdfPages(artifact, question);
    if (pageNumbers.length === 0 && !pagesText) return null;

    const engineResult = {
      foundInSystem: true,
      question,
      normalizedQuestion: normalizeText(question),
      table: undefined,
      matchedEntities: [],
      matchedColumns: [],
      totalRowsFiltered: 0,
      calculations: [],
      chartData: null,
      sampleRows: [],
      summaryText: `Documento PDF: ${targetPdf.originalName} | Páginas citadas: [${pageNumbers.join(', ')}]\n${pagesText}`,
    };

    const aiRes = await provider.ask(engineResult, [targetPdf.id], targetPdf.updatedAt.toISOString());

    return {
      answer: aiRes.answer,
      foundInSystem: true,
      sources: [
        {
          type: 'PDF',
          tableId: targetPdf.id,
          tableName: targetPdf.originalName,
          shortCode: targetPdf.shortCode,
          title: bestMatch.title,
          url: `/p/${targetPdf.shortCode}`,
          pages: pageNumbers,
        },
      ],
      chartData: null,
    };
  } catch {
    return null;
  }
}
