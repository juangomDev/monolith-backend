import { Role, FolderType, FolderPermission, type PdfRegistry } from '@prisma/client';
import { pdfsRepository, type PdfsRepository, type FindPdfsOptions } from './pdfs.repository.js';
import { pdfsStorage, type PdfsStorage } from './pdfs.storage.js';
import { parsePdfDocument, type ParsedPdfResult } from './pdfs.parser.js';
import { validatePdfContent } from '../../gateway/file-guard.js';
import { foldersRepository, type FoldersRepository } from '../folders/folders.repository.js';
import { foldersSharesService, type FoldersSharesService } from '../folders/folders.shares.service.js';
import { generateShortCode } from '../../shared/shortcode.js';
import { auditService } from '../audit/audit.service.js';
import { AppError } from '../../shared/errors.js';

export interface RequesterContext {
  id: string;
  role: Role;
}

export function formatPdfItem(record: PdfRegistry & { folder?: any }) {
  const version = record.updatedAt.getTime();
  return {
    id: record.id,
    shortCode: record.shortCode,
    originalName: record.originalName,
    sizeBytes: record.sizeBytes,
    pageCount: record.pageCount,
    isScanned: record.isScanned,
    metadataCard: record.metadataCard,
    folderId: record.folderId,
    folder: record.folder ? { id: record.folder.id, name: record.folder.name, isPrivate: record.folder.isPrivate } : undefined,
    url: `/p/${record.shortCode}`,
    urlWithVersion: `/p/${record.shortCode}?v=${version}`,
    downloadUrl: `/p/${record.shortCode}?download=true`,
    textUrl: `/p/${record.shortCode}?format=text`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PdfsService {
  constructor(
    private readonly repo: PdfsRepository = pdfsRepository,
    private readonly storage: PdfsStorage = pdfsStorage,
    private readonly foldersRepo: FoldersRepository = foldersRepository,
    private readonly sharesService: FoldersSharesService = foldersSharesService
  ) {}

  async uploadPdf(fileBuffer: Buffer, filename: string, folderId?: string, requester?: RequesterContext) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new AppError(400, 'El archivo PDF no puede estar vacío', 'EMPTY_FILE');
    }
    if (fileBuffer.length > 50 * 1024 * 1024) {
      throw new AppError(413, 'El archivo PDF supera el tamaño máximo permitido de 50MB', 'PAYLOAD_TOO_LARGE');
    }

    await validatePdfContent(fileBuffer);
    const parsed = await parsePdfDocument(fileBuffer, filename);

    let targetFolderId = folderId;
    if (!targetFolderId && requester?.id) {
      const defaultFolder = await this.foldersRepo.findOrCreateDefaultFolder(requester.id, FolderType.PDF);
      targetFolderId = defaultFolder.id;
    } else if (targetFolderId && requester) {
      const folder = await this.foldersRepo.findFolderById(targetFolderId);
      if (!folder) throw new AppError(404, 'Carpeta destino no encontrada', 'FOLDER_NOT_FOUND');
      if (folder.type === FolderType.CONTAINER) {
        throw new AppError(400, 'No se permite subir archivos a una carpeta contenedora. Debe crear o seleccionar una subcarpeta.', 'CANNOT_UPLOAD_TO_CONTAINER_FOLDER');
      }
      if (folder.type !== FolderType.PDF) {
        throw new AppError(400, "Incompatibilidad: los PDFs solo pueden subirse a carpetas de tipo 'PDF'", 'INVALID_FOLDER_TYPE');
      }
      await this.sharesService.assertFolderAccess(targetFolderId, requester, FolderPermission.EDIT);
    }

    const shortCode = generateShortCode();
    const storagePath = await this.storage.savePdfFile(shortCode, fileBuffer);

    const record = await this.repo.create({
      shortCode,
      originalName: filename,
      storagePath,
      textArtifactPath: this.storage.getTextArtifactPath(shortCode),
      sizeBytes: fileBuffer.length,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      metadataCard: parsed.metadataCard as any,
      folderId: targetFolderId || null,
    });

    const textArtifactPayload = {
      id: record.id,
      shortCode,
      originalName: filename,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      metadataCard: parsed.metadataCard,
      pages: parsed.pages,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    await this.storage.saveTextArtifact(shortCode, textArtifactPayload);

    auditService.recordLog({
      actorId: requester?.id,
      actorUsername: requester?.role || 'system',
      action: 'PDF_UPLOAD',
      resourceType: 'PDF',
      resourceId: record.id,
      folderId: record.folderId,
    });

    return formatPdfItem(record);
  }

  async getPdfDownload(shortCode: string) {
    const record = await this.repo.findByShortCode(shortCode);
    if (!record) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    const stream = this.storage.getPdfStream(shortCode);
    return { record, stream };
  }

  async getPdfTextArtifact(shortCode: string) {
    const record = await this.repo.findByShortCode(shortCode);
    if (!record) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    const data = await this.storage.readTextArtifact(shortCode);
    if (!data) throw new AppError(404, 'Artefacto de texto no disponible', 'NOT_FOUND');
    return data;
  }

  async listPdfs(options: FindPdfsOptions, requester: RequesterContext) {
    const isAdmin = requester.role === Role.ADMIN;
    const [records, total] = await Promise.all([
      this.repo.findAll({ ...options, userId: requester.id, isAdmin }),
      this.repo.count({ ...options, userId: requester.id, isAdmin }),
    ]);
    return {
      pdfs: records.map(formatPdfItem),
      total,
      page: options.page || 1,
      limit: options.limit || 50,
    };
  }

  async renamePdf(id: string, newName: string, requester: RequesterContext) {
    const pdf = await this.repo.findById(id);
    if (!pdf) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    if (pdf.folderId) {
      await this.sharesService.assertFolderAccess(pdf.folderId, requester, FolderPermission.EDIT);
    }

    const cleanName = newName.trim();
    if (!cleanName) throw new AppError(400, 'El nombre no puede estar vacío', 'INVALID_NAME');

    const updated = await this.repo.update(id, { originalName: cleanName });

    auditService.recordLog({
      actorId: requester.id,
      actorUsername: requester.role,
      action: 'PDF_RENAME',
      resourceType: 'PDF',
      resourceId: updated.id,
      folderId: updated.folderId,
    });

    return formatPdfItem(updated);
  }

  async replacePdf(id: string, newBuffer: Buffer, filename: string, requester: RequesterContext) {
    const pdf = await this.repo.findById(id);
    if (!pdf) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    if (pdf.folderId) {
      await this.sharesService.assertFolderAccess(pdf.folderId, requester, FolderPermission.EDIT);
    }

    await validatePdfContent(newBuffer);
    const parsed = await parsePdfDocument(newBuffer, filename || pdf.originalName);

    await this.storage.savePdfFile(pdf.shortCode, newBuffer);

    const mergedMetadata = {
      ...(pdf.metadataCard as any || {}),
      ...parsed.metadataCard,
    };

    const textPayload = {
      id: pdf.id,
      shortCode: pdf.shortCode,
      originalName: filename || pdf.originalName,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      metadataCard: mergedMetadata,
      pages: parsed.pages,
      createdAt: pdf.createdAt,
      updatedAt: new Date(),
    };

    await this.storage.saveTextArtifact(pdf.shortCode, textPayload);

    const updated = await this.repo.update(id, {
      sizeBytes: newBuffer.length,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      metadataCard: mergedMetadata as any,
    });

    auditService.recordLog({
      actorId: requester.id,
      actorUsername: requester.role,
      action: 'PDF_HOTSWAP',
      resourceType: 'PDF',
      resourceId: updated.id,
      folderId: updated.folderId,
    });

    return formatPdfItem(updated);
  }

  async updateMetadataCard(id: string, patch: any, requester: RequesterContext) {
    const pdf = await this.repo.findById(id);
    if (!pdf) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    if (pdf.folderId) {
      await this.sharesService.assertFolderAccess(pdf.folderId, requester, FolderPermission.EDIT);
    }

    const currentCard = (pdf.metadataCard as any) || {};
    const merged = { ...currentCard, ...patch };

    const updated = await this.repo.update(id, { metadataCard: merged });

    const currentArtifact = await this.storage.readTextArtifact(pdf.shortCode);
    if (currentArtifact) {
      currentArtifact.metadataCard = merged;
      await this.storage.saveTextArtifact(pdf.shortCode, currentArtifact);
    }

    return formatPdfItem(updated);
  }

  async deletePdf(id: string, requester: RequesterContext) {
    const pdf = await this.repo.findById(id);
    if (!pdf) throw new AppError(404, 'Documento PDF no encontrado', 'NOT_FOUND');
    if (pdf.folderId) {
      await this.sharesService.assertFolderAccess(pdf.folderId, requester, FolderPermission.EDIT);
    }

    await this.repo.delete(id);
    await this.storage.deletePdfFiles(pdf.shortCode);

    auditService.recordLog({
      actorId: requester.id,
      actorUsername: requester.role,
      action: 'PDF_DELETE',
      resourceType: 'PDF',
      resourceId: pdf.id,
      folderId: pdf.folderId,
    });

    return { deleted: true, id };
  }
}

export const pdfsService = new PdfsService();

