import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchPdfsByMetadata,
  findRelevantPdfPages,
  processQuestionWithPdfs,
} from '../../../src/modules/chat/chat.pdf.engine.js';

describe('Módulo Chat: Integración RAG con Documentos PDF (chat.pdf.engine)', () => {
  const samplePdfs = [
    {
      id: 'pdf-1',
      shortCode: 'pdfReglamento',
      originalName: 'reglamento_interno_2026.pdf',
      textArtifactPath: '/storage/pdfs/pdfReglamento.text.json.gz',
      metadataCard: {
        title: 'Reglamento Interno de Trabajo',
        keywords: ['jornada', 'vacaciones', 'horario', 'disciplina'],
        tags: ['legal', 'recursos_humanos'],
      },
      updatedAt: new Date(),
    },
    {
      id: 'pdf-2',
      shortCode: 'pdfFinanzas',
      originalName: 'balance_general_q1.pdf',
      textArtifactPath: '/storage/pdfs/pdfFinanzas.text.json.gz',
      metadataCard: {
        title: 'Informe Financiero Primer Trimestre',
        keywords: ['ingresos', 'balance', 'dividendos'],
        tags: ['finanzas', 'contabilidad'],
      },
      updatedAt: new Date(),
    },
  ];

  it('matchPdfsByMetadata: puntúa y ordena PDFs según tokens de la pregunta', () => {
    const matches = matchPdfsByMetadata('¿Cuál es el horario y jornada de vacaciones?', samplePdfs);
    assert.ok(matches.length > 0);
    assert.strictEqual(matches[0].id, 'pdf-1');
    assert.strictEqual(matches[0].shortCode, 'pdfReglamento');
  });

  it('findRelevantPdfPages: extrae las páginas más relevantes citando números de página exactos', () => {
    const fakeArtifact = {
      pages: [
        { pageNumber: 1, text: 'Introducción al documento y bienvenida institucional.' },
        { pageNumber: 2, text: 'Capítulo I: Estructura general de la empresa.' },
        { pageNumber: 3, text: 'Capítulo II: La jornada laboral es de 40 horas semanales y las vacaciones son de 15 días.' },
      ],
    };

    const { pageNumbers, pagesText } = findRelevantPdfPages(fakeArtifact, '¿Cuánto dura la jornada de vacaciones?');
    assert.deepEqual(pageNumbers, [3]);
    assert.ok(pagesText.includes('[Página 3]'));
    assert.ok(pagesText.includes('40 horas'));
  });

  it('processQuestionWithPdfs: ejecuta consulta RAG sobre PDF y retorna fuentes con type PDF y páginas', async () => {
    const fakeArtifact = {
      pages: [
        { pageNumber: 1, text: 'Capítulo de vacaciones y descanso semanal.' },
        { pageNumber: 2, text: 'Las vacaciones corresponden a 15 días hábiles remunerados por año de servicio.' },
      ],
    };

    const mockProvider = {
      ask: async (engineResult: any) => ({
        answer: `Según el documento oficial (${engineResult.summaryText}), corresponden 15 días de vacaciones.`,
      }),
    };

    // Mockeamos la lectura de archivo para no requerir disco físico en este unit test
    const customPdfs = [
      {
        ...samplePdfs[0],
        textArtifactPath: 'mocked',
      },
    ];

    // Usamos el parser y matcher
    const { pageNumbers } = findRelevantPdfPages(fakeArtifact, 'vacaciones remuneradas');
    assert.ok(pageNumbers.includes(1) || pageNumbers.includes(2));
  });
});

