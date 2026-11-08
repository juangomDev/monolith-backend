import { extractText } from 'unpdf';
import { AppError } from '../../shared/errors.js';

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfMetadataCard {
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  summary: string;
}

export interface ParsedPdfResult {
  pageCount: number;
  isScanned: boolean;
  pages: PdfPageText[];
  metadataCard: PdfMetadataCard;
  totalTextLength: number;
}

const STOP_WORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con',
  'no', 'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'si',
  'the', 'of', 'and', 'to', 'in', 'is', 'you', 'that', 'it', 'he', 'was', 'for', 'on', 'are', 'as', 'with',
]);

function extractKeywords(text: string, limit: number = 8): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export async function parsePdfDocument(
  pdfBuffer: Buffer,
  originalName: string
): Promise<ParsedPdfResult> {
  try {
    const uint8Data = new Uint8Array(pdfBuffer);
    const extracted = await extractText(uint8Data, { mergePages: false });

    const totalPages = extracted.totalPages || (Array.isArray(extracted.text) ? extracted.text.length : 1);
    const rawPages: string[] = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text || '')];

    const pages: PdfPageText[] = rawPages.map((pageText, idx) => ({
      pageNumber: idx + 1,
      text: typeof pageText === 'string' ? pageText.trim() : '',
    }));

    const combinedText = pages.map((p) => p.text).join(' ').trim();
    const isScanned = combinedText.length < 20;

    const baseTitle = originalName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const keywords = extractKeywords(combinedText);
    const summary = isScanned
      ? 'Documento PDF escaneado (basado en imágenes sin capa de texto seleccionable).'
      : combinedText.slice(0, 300).trim();

    const metadataCard: PdfMetadataCard = {
      title: baseTitle || 'Documento PDF',
      description: isScanned
        ? `Documento PDF escaneado de ${totalPages} página(s).`
        : `Documento PDF de ${totalPages} página(s) con ${combinedText.length} caracteres de texto extraído.`,
      tags: ['pdf', ...keywords.slice(0, 5)],
      keywords,
      summary,
    };

    return {
      pageCount: totalPages,
      isScanned,
      pages,
      metadataCard,
      totalTextLength: combinedText.length,
    };
  } catch (err: any) {
    throw new AppError(400, `Error extrayendo texto del documento PDF: ${err.message}`, 'PARSER_ERROR');
  }
}

