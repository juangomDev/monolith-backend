import fs from 'node:fs/promises';
import path from 'node:path';
import { Role } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { eventBus } from '../../shared/event-bus.js';
import type { RequesterContext } from '../folders/folders.service.js';

export interface StorageStatsResponse {
  isAdmin: boolean;
  database: {
    images: { count: number; sizeBytes: number };
    tables: { count: number; sizeBytes: number };
    pdfs: { count: number; sizeBytes: number };
    totalCount: number;
    totalSizeBytes: number;
  };
  disk: {
    imagesBytes: number;
    imagesFilesCount: number;
    tablesBytes: number;
    tablesFilesCount: number;
    pdfsBytes: number;
    pdfsFilesCount: number;
    totalBytes: number;
    totalFilesCount: number;
    maxStorageBytes?: number;
    usagePercent?: number;
  } | null;
  topFolders: Array<{
    id: string;
    name: string;
    type: string;
    totalBytes: number;
    itemsCount: number;
  }>;
  summary?: {
    activeUsersCount?: number;
    formsCount: number;
    pendingEntriesCount: number;
    resolvedEntriesCount: number;
  };
  warning: boolean;
  warningMessage: string | null;
}

export async function getDirectorySize(dirPath: string): Promise<{ bytes: number; filesCount: number }> {
  let bytes = 0;
  let filesCount = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        bytes += stats.size;
        filesCount++;
      } else if (entry.isDirectory()) {
        const sub = await getDirectorySize(fullPath);
        bytes += sub.bytes;
        filesCount += sub.filesCount;
      }
    }
  } catch {
    // Si la carpeta física aún no ha sido creada, retorna 0
  }
  return { bytes, filesCount };
}

export class StatsService {
  async getStorageStats(caller: RequesterContext): Promise<StorageStatsResponse> {
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'Los colaboradores no tienen permiso para consultar estadísticas del sistema', 'FORBIDDEN');
    }

    const isAdmin = caller.role === Role.ADMIN;
    const folderWhere = isAdmin ? {} : { userId: caller.id };
    const imageWhere = isAdmin ? {} : { folder: { userId: caller.id } };
    const tableWhere = isAdmin ? {} : { folder: { userId: caller.id } };
    const pdfWhere = isAdmin ? {} : { folder: { userId: caller.id } };

    const [imageAgg, tableAgg, pdfAgg, folders] = await Promise.all([
      prisma.imageRegistry.aggregate({
        where: imageWhere,
        _count: { id: true },
        _sum: { sizeBytes: true },
      }),
      prisma.tableRegistry.aggregate({
        where: tableWhere,
        _count: { id: true },
        _sum: { sizeBytes: true },
      }),
      prisma.pdfRegistry.aggregate({
        where: pdfWhere,
        _count: { id: true },
        _sum: { sizeBytes: true },
      }),
      prisma.folder.findMany({
        where: folderWhere,
        include: {
          images: { select: { sizeBytes: true } },
          tables: { select: { sizeBytes: true } },
          pdfs: { select: { sizeBytes: true } },
        },
      }),
    ]);

    const imagesCount = imageAgg._count.id;
    const imagesBytes = imageAgg._sum.sizeBytes ?? 0;
    const tablesCount = tableAgg._count.id;
    const tablesBytes = tableAgg._sum.sizeBytes ?? 0;
    const pdfsCount = pdfAgg._count.id;
    const pdfsBytes = pdfAgg._sum.sizeBytes ?? 0;

    const topFolders = folders
      .map((f) => {
        const imgSize = (f.images || []).reduce((acc, i) => acc + (i.sizeBytes || 0), 0);
        const tblSize = (f.tables || []).reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
        const pdfSize = (f.pdfs || []).reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          totalBytes: imgSize + tblSize + pdfSize,
          itemsCount: (f.images || []).length + (f.tables || []).length + (f.pdfs || []).length,
        };
      })
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 5);

    let diskInfo = null;
    let warning = false;
    let warningMessage: string | null = null;

    if (isAdmin) {
      const storageBase = path.resolve(env.STORAGE_DIR);
      const [imagesDisk, tablesDisk, pdfsDisk] = await Promise.all([
        getDirectorySize(path.join(storageBase, 'images')),
        getDirectorySize(path.join(storageBase, 'tables')),
        getDirectorySize(path.join(storageBase, 'pdfs')),
      ]);

      const totalDiskBytes = imagesDisk.bytes + tablesDisk.bytes + pdfsDisk.bytes;
      const totalDiskFiles = imagesDisk.filesCount + tablesDisk.filesCount + pdfsDisk.filesCount;
      const maxStorageBytes = Math.max(1, env.MAX_STORAGE_GB) * 1024 * 1024 * 1024;
      const usagePercent = Math.round((totalDiskBytes / maxStorageBytes) * 10000) / 100;

      diskInfo = {
        imagesBytes: imagesDisk.bytes,
        imagesFilesCount: imagesDisk.filesCount,
        tablesBytes: tablesDisk.bytes,
        tablesFilesCount: tablesDisk.filesCount,
        pdfsBytes: pdfsDisk.bytes,
        pdfsFilesCount: pdfsDisk.filesCount,
        totalBytes: totalDiskBytes,
        totalFilesCount: totalDiskFiles,
        maxStorageBytes,
        usagePercent,
      };

      // Alerta preventiva al superar el 80% de env.MAX_STORAGE_GB
      const WARNING_THRESHOLD_BYTES = maxStorageBytes * 0.8;
      if (totalDiskBytes >= WARNING_THRESHOLD_BYTES) {
        warning = true;
        warningMessage = `El almacenamiento físico ha superado el 80% del umbral operativo configurado (${env.MAX_STORAGE_GB} GB).`;
        eventBus.emitEvent('storage.quota.warning', {
          totalBytes: totalDiskBytes,
          maxStorageBytes,
          usagePercent,
          message: warningMessage,
        });
      }
    }

    const formWhere = isAdmin ? {} : { folder: { userId: caller.id } };
    const entryWhere = isAdmin ? {} : { form: { folder: { userId: caller.id } } };
    const [activeUsersCount, formsCount, pendingEntriesCount, resolvedEntriesCount] = await Promise.all([
      isAdmin ? prisma.user.count({ where: { isActive: true } }).catch(() => undefined) : Promise.resolve(undefined),
      prisma.formDefinition.count({ where: formWhere }).catch(() => 0),
      prisma.formEntry.count({ where: { ...entryWhere, status: 'NEW' } }).catch(() => 0),
      prisma.formEntry.count({ where: { ...entryWhere, status: { not: 'NEW' } } }).catch(() => 0),
    ]);

    return {
      isAdmin,
      database: {
        images: { count: imagesCount, sizeBytes: imagesBytes },
        tables: { count: tablesCount, sizeBytes: tablesBytes },
        pdfs: { count: pdfsCount, sizeBytes: pdfsBytes },
        totalCount: imagesCount + tablesCount + pdfsCount,
        totalSizeBytes: imagesBytes + tablesBytes + pdfsBytes,
      },
      disk: diskInfo,
      topFolders,
      summary: {
        ...(activeUsersCount !== undefined ? { activeUsersCount } : {}),
        formsCount,
        pendingEntriesCount,
        resolvedEntriesCount,
      },
      warning,
      warningMessage,
    };
  }
}

export const statsService = new StatsService();

