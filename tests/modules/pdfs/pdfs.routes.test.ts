import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { pdfsService } from '../../../src/modules/pdfs/pdfs.service.js';
import { foldersMovementService } from '../../../src/modules/folders/folders.movement.service.js';

describe('Módulo PDFs: Rutas HTTP Fastify (/p/:short_code y /api/v1/pdfs)', () => {
  const validKey = 'mk_live_valid_test_api_key_12345';
  const pdfUuid = '77777777-7777-4777-8777-777777777777';
  const shortCode = 'pdf9876543';

  const originalFindUnique = prisma.apiClient.findUnique;

  afterEach(() => {
    (prisma.apiClient as any).findUnique = originalFindUnique;
    mock.reset();
  });

  function mockValidAuthClient() {
    (prisma.apiClient as any).findUnique = async () => ({
      id: 'client-test-id',
      name: 'Cliente Test',
      keyPrefix: 'mk_live_valid_test',
      keyHash: 'fake_hash',
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    });
  }

  it('GET /p/:short_code: entrega visualización inline con Content-Type application/pdf', async () => {
    const app = await buildApp();
    mock.method(pdfsService, 'getPdfDownload', async () => ({
      record: { id: pdfUuid, shortCode, originalName: 'manual.pdf' },
      stream: Readable.from(['%PDF-1.4\n...']),
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/p/${shortCode}`,
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition']?.includes('inline'));
    assert.ok(res.headers['cache-control']?.includes('immutable'));
  });

  it('GET /p/:short_code?download=true: fuerza descarga con Content-Disposition attachment', async () => {
    const app = await buildApp();
    mock.method(pdfsService, 'getPdfDownload', async () => ({
      record: { id: pdfUuid, shortCode, originalName: 'manual.pdf' },
      stream: Readable.from(['%PDF-1.4\n...']),
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/p/${shortCode}?download=true`,
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-disposition']?.includes('attachment'));
  });

  it('GET /p/:short_code?format=text: entrega el artefacto de texto extraído (.text.json.gz)', async () => {
    const app = await buildApp();
    mock.method(pdfsService, 'getPdfTextArtifact', async () => ({
      id: pdfUuid,
      shortCode,
      originalName: 'manual.pdf',
      pageCount: 3,
      pages: [
        { pageNumber: 1, text: 'Contenido página 1' },
        { pageNumber: 2, text: 'Contenido página 2' },
      ],
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/p/${shortCode}?format=text`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.pageCount, 3);
    assert.strictEqual(body.pages.length, 2);
  });

  it('GET /api/v1/pdfs: protegido retorna 401 si no hay credenciales', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/pdfs',
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('GET /api/v1/pdfs: retorna listado de PDFs para cliente autorizado', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(pdfsService, 'listPdfs', async () => ({
      pdfs: [
        { id: pdfUuid, shortCode, originalName: 'doc.pdf', pageCount: 5, sizeBytes: 5000 },
      ],
      total: 1,
      page: 1,
      limit: 50,
    } as any));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/pdfs',
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().total, 1);
  });

  it('PATCH /api/v1/pdfs/:id: renombra el archivo PDF exitosamente', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(pdfsService, 'renamePdf', async () => ({
      id: pdfUuid,
      shortCode,
      originalName: 'nuevo_nombre.pdf',
    } as any));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pdfs/${pdfUuid}`,
      headers: { 'x-api-key': validKey },
      payload: { originalName: 'nuevo_nombre.pdf' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().originalName, 'nuevo_nombre.pdf');
  });

  it('PATCH /api/v1/pdfs/:id/metadata: actualiza la Ficha Técnica del PDF', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(pdfsService, 'updateMetadataCard', async () => ({
      id: pdfUuid,
      shortCode,
      metadataCard: { title: 'Ficha Enriquecida' },
    } as any));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pdfs/${pdfUuid}/metadata`,
      headers: { 'x-api-key': validKey },
      payload: { title: 'Ficha Enriquecida' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().metadataCard.title, 'Ficha Enriquecida');
  });

  it('DELETE /api/v1/pdfs/:id: elimina PDF exitosamente', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(pdfsService, 'deletePdf', async () => ({ deleted: true, id: pdfUuid }));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/pdfs/${pdfUuid}`,
      headers: { 'x-api-key': validKey },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().deleted, true);
  });

  it('PATCH /api/v1/pdfs/:id/folder: mueve PDF a otra carpeta de tipo PDF', async () => {
    const app = await buildApp();
    mockValidAuthClient();
    mock.method(foldersMovementService, 'movePdfToFolder', async () => ({
      id: pdfUuid,
      shortCode,
      folderId: 'folder-destino-uuid',
      originalName: 'manual.pdf',
      pageCount: 1,
      sizeBytes: 100,
    } as any));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pdfs/${pdfUuid}/folder`,
      headers: { 'x-api-key': validKey },
      payload: { folderId: '00000000-0000-0000-0000-000000000000' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().folderId, 'folder-destino-uuid');
  });
});

