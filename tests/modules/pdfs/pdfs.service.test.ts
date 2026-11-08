import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfsService } from '../../../src/modules/pdfs/pdfs.service.js';
import { Role, FolderPermission } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo PDFs: PdfsService (Operaciones y Ciclo de Vida)', () => {
  const adminCaller = { id: 'admin-uuid', role: Role.ADMIN };
  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
  );

  const fakePdfRecord = {
    id: 'pdf-uuid-1',
    shortCode: 'pdf1234567',
    originalName: 'manual.pdf',
    storagePath: '/storage/pdfs/pdf1234567.pdf',
    textArtifactPath: '/storage/pdfs/pdf1234567.text.json.gz',
    sizeBytes: 1024,
    pageCount: 1,
    isScanned: false,
    metadataCard: { title: 'Manual Oficial', description: 'Manual de operaciones' },
    folderId: 'folder-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('uploadPdf: carga documento PDF exitosamente, guarda binario y artefacto de texto', async () => {
    let savedPdf = false;
    let savedArtifact = false;

    const mockRepo: any = {
      create: async (data: any) => ({ ...fakePdfRecord, ...data, id: 'created-pdf-id' }),
    };
    const mockStorage: any = {
      savePdfFile: async () => { savedPdf = true; return '/fake/path.pdf'; },
      getTextArtifactPath: () => '/fake/path.text.json.gz',
      saveTextArtifact: async () => { savedArtifact = true; },
    };
    const mockFoldersRepo: any = {
      findOrCreateDefaultFolder: async () => ({ id: 'default-pdf-folder' }),
    };

    const service = new PdfsService(mockRepo, mockStorage, mockFoldersRepo, {} as any);
    const result = await service.uploadPdf(validPdfBuffer, 'manual.pdf', undefined, adminCaller);

    assert.equal(result.id, 'created-pdf-id');
    assert.equal(result.originalName, 'manual.pdf');
    assert.equal(savedPdf, true);
    assert.equal(savedArtifact, true);
  });

  it('renamePdf: renombra el documento PDF preservando shortCode', async () => {
    const mockRepo: any = {
      findById: async () => fakePdfRecord,
      update: async (id: string, data: any) => ({ ...fakePdfRecord, id, originalName: data.originalName }),
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new PdfsService(mockRepo, {} as any, {} as any, mockShares);
    const updated = await service.renamePdf('pdf-uuid-1', 'manual_v2.pdf', adminCaller);

    assert.equal(updated.originalName, 'manual_v2.pdf');
    assert.equal(updated.shortCode, 'pdf1234567');
  });

  it('replacePdf: reemplazo en caliente (Hot-Swap) sobrescribe binario y regenera .text.json.gz', async () => {
    let savedPdf = false;
    let savedArtifact = false;

    const mockRepo: any = {
      findById: async () => fakePdfRecord,
      update: async (id: string, data: any) => ({ ...fakePdfRecord, id, ...data }),
    };
    const mockStorage: any = {
      savePdfFile: async () => { savedPdf = true; },
      saveTextArtifact: async () => { savedArtifact = true; },
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new PdfsService(mockRepo, mockStorage, {} as any, mockShares);
    const result = await service.replacePdf('pdf-uuid-1', validPdfBuffer, 'nuevo_manual.pdf', adminCaller);

    assert.equal(result.id, 'pdf-uuid-1');
    assert.equal(savedPdf, true);
    assert.equal(savedArtifact, true);
  });

  it('updateMetadataCard: actualiza la Ficha Técnica y sincroniza el artefacto de texto', async () => {
    let syncedArtifact = false;

    const mockRepo: any = {
      findById: async () => fakePdfRecord,
      update: async (id: string, data: any) => ({ ...fakePdfRecord, id, metadataCard: data.metadataCard }),
    };
    const mockStorage: any = {
      readTextArtifact: async () => ({ id: 'pdf-uuid-1', pages: [] }),
      saveTextArtifact: async () => { syncedArtifact = true; },
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new PdfsService(mockRepo, mockStorage, {} as any, mockShares);
    const updated = await service.updateMetadataCard(
      'pdf-uuid-1',
      { title: 'Título Enriquecido', tags: ['nuevo', 'oficial'] },
      adminCaller
    );

    assert.equal((updated.metadataCard as any).title, 'Título Enriquecido');
    assert.equal(syncedArtifact, true);
  });

  it('deletePdf: elimina registro en base de datos y destruye archivos en disco', async () => {
    let deletedFiles = false;

    const mockRepo: any = {
      findById: async () => fakePdfRecord,
      delete: async () => fakePdfRecord,
    };
    const mockStorage: any = {
      deletePdfFiles: async () => { deletedFiles = true; },
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new PdfsService(mockRepo, mockStorage, {} as any, mockShares);
    const result = await service.deletePdf('pdf-uuid-1', adminCaller);

    assert.equal(result.deleted, true);
    assert.equal(deletedFiles, true);
  });
});

