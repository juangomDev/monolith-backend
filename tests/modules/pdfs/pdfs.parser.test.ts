import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePdfContent } from '../../../src/gateway/file-guard.js';
import { parsePdfDocument } from '../../../src/modules/pdfs/pdfs.parser.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo PDFs: Seguridad y Parser de Doble Artefacto (file-guard & pdfs.parser)', () => {
  const minimalValidPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
  );

  it('validatePdfContent: acepta PDF con magic bytes legítimos (%PDF-)', async () => {
    await assert.doesNotReject(() => validatePdfContent(minimalValidPdf));
  });

  it('validatePdfContent: rechaza con 415 si los magic bytes no son de PDF', async () => {
    const invalidBuffer = Buffer.from('NOT-A-PDF-CONTENT-AT-ALL');
    await assert.rejects(
      () => validatePdfContent(invalidBuffer),
      (err: any) => err instanceof AppError && err.status === 415
    );
  });

  it('validatePdfContent: rechaza con 400 MALICIOUS_PAYLOAD ante PDF con /JavaScript inyectado', async () => {
    const maliciousPdf = Buffer.from('%PDF-1.4\n/Type /Action /S /JavaScript /JS (app.alert("hack"))\n%%EOF');
    await assert.rejects(
      () => validatePdfContent(maliciousPdf),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'MALICIOUS_PAYLOAD'
    );
  });

  it('validatePdfContent: rechaza con 400 MALICIOUS_PAYLOAD ante PDF con /Launch inyectado', async () => {
    const maliciousPdf = Buffer.from('%PDF-1.4\n/Type /Action /S /Launch /F (cmd.exe)\n%%EOF');
    await assert.rejects(
      () => validatePdfContent(maliciousPdf),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'MALICIOUS_PAYLOAD'
    );
  });

  it('parsePdfDocument: extrae metadatos y marca isScanned=true si el PDF carece de texto seleccionable', async () => {
    const result = await parsePdfDocument(minimalValidPdf, 'contrato_escaneado.pdf');
    assert.strictEqual(result.pageCount, 1);
    assert.strictEqual(result.isScanned, true);
    assert.strictEqual(result.metadataCard.title, 'contrato escaneado');
    assert.ok(Array.isArray(result.pages));
    assert.strictEqual(result.pages.length, 1);
  });
});

