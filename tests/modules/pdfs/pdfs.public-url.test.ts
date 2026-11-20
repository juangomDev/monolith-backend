import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { buildApp } from '../../../src/app.js';
import { env } from '../../../src/config/env.js';
import { AppError } from '../../../src/shared/errors.js';
import { formatPdfItem, PdfsService, pdfsService } from '../../../src/modules/pdfs/pdfs.service.js';
import { pdfsStorage } from '../../../src/modules/pdfs/pdfs.storage.js';

describe('Módulo PDFs: URL Pública (/p/:short_code), Visor Nativo, Iframe y Verificación de Disco', () => {
  afterEach(() => {
    mock.reset();
  });

  it('formatPdfItem: genera URLs públicas absolutas con env.BASE_URL (igual que Imágenes y Tablas)', () => {
    const now = new Date('2026-11-20T00:00:00.000Z');
    const baseUrl = env.BASE_URL.replace(/\/$/, '');

    const formatted = formatPdfItem({
      id: '77777777-7777-4777-8777-777777777777',
      shortCode: 'pdfPub1234',
      originalName: 'informe.pdf',
      storagePath: '/storage/pdfs/pdfPub1234.pdf',
      textArtifactPath: '/storage/pdfs/pdfPub1234.text.json.gz',
      sizeBytes: 2048,
      pageCount: 4,
      isScanned: false,
      metadataCard: null,
      folderId: null,
      createdAt: now,
      updatedAt: now,
    });

    assert.strictEqual(formatted.url, `${baseUrl}/p/pdfPub1234`);
    assert.strictEqual(formatted.urlWithVersion, `${baseUrl}/p/pdfPub1234?v=${now.getTime()}`);
    assert.strictEqual(formatted.downloadUrl, `${baseUrl}/p/pdfPub1234?download=true`);
    assert.strictEqual(formatted.textUrl, `${baseUrl}/p/pdfPub1234?format=text`);
  });

  it('GET /p/:short_code: remueve X-Frame-Options y no aplica CSP sandbox vacío para permitir visor nativo e iframe', async () => {
    const app = await buildApp();
    mock.method(pdfsService, 'getPdfDownload', async () => ({
      record: { id: 'pdf-1', shortCode: 'pdfView123', originalName: 'guia.pdf' } as any,
      stream: Readable.from(['%PDF-1.4\n%%EOF']) as any,
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/p/pdfView123',
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert.strictEqual(res.headers['x-frame-options'], undefined);
    assert.notStrictEqual(res.headers['content-security-policy'], 'sandbox');
    assert.ok(String(res.headers['content-security-policy']).includes('frame-ancestors *'));
  });

  it('getPdfDownload: lanza 404 FILE_NOT_FOUND controlado si el archivo físico no existe en almacenamiento', async () => {
    const mockRepo: any = {
      findByShortCode: async () => ({
        id: 'pdf-missing-1',
        shortCode: 'missing123',
        originalName: 'borrado.pdf',
        storagePath: './storage/pdfs/no_existe_jamas_12345.pdf',
      }),
    };

    const service = new PdfsService(mockRepo, pdfsStorage, {} as any, {} as any);

    await assert.rejects(
      async () => {
        await service.getPdfDownload('missing123');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'FILE_NOT_FOUND');
        return true;
      }
    );
  });
});
