import fs from 'node:fs/promises';
import path from 'node:path';
import { Role } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import type { RequesterContext } from '../folders/folders.service.js';

export interface StorageStatsResponse {
  isAdmin: boolean;
  database: {
    images: { count: number; sizeBytes: number };
    tables: { count: number; sizeBytes: number };
    totalCount: number;
    totalSizeBytes: number;
  };
  disk: {
    imagesBytes: number;
    imagesFilesCount: number;
    tablesBytes: number;
    tablesFilesCount: number;
    totalBytes: number;
    totalFilesCount: number;
  } | null;
  topFolders: Array<{
    id: string;
    name: string;
    type: string;
    totalBytes: number;
    itemsCount: number;
  }>;
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

    const [imageAgg, tableAgg, folders] = await Promise.all([
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
      prisma.folder.findMany({
        where: folderWhere,
        include: {
          images: { select: { sizeBytes: true } },
          tables: { select: { sizeBytes: true } },
        },
      }),
    ]);

    const imagesCount = imageAgg._count.id;
    const imagesBytes = imageAgg._sum.sizeBytes ?? 0;
    const tablesCount = tableAgg._count.id;
    const tablesBytes = tableAgg._sum.sizeBytes ?? 0;

    const topFolders = folders
      .map((f) => {
        const imgSize = (f.images || []).reduce((acc, i) => acc + (i.sizeBytes || 0), 0);
        const tblSize = (f.tables || []).reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          totalBytes: imgSize + tblSize,
          itemsCount: (f.images || []).length + (f.tables || []).length,
        };
      })
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 5);

    let diskInfo = null;
    let warning = false;
    let warningMessage: string | null = null;

    if (isAdmin) {
      const storageBase = path.resolve(env.STORAGE_DIR);
      const [imagesDisk, tablesDisk] = await Promise.all([
        getDirectorySize(path.join(storageBase, 'images')),
        getDirectorySize(path.join(storageBase, 'tables')),
      ]);

      const totalDiskBytes = imagesDisk.bytes + tablesDisk.bytes;
      const totalDiskFiles = imagesDisk.filesCount + tablesDisk.filesCount;

      diskInfo = {
        imagesBytes: imagesDisk.bytes,
        imagesFilesCount: imagesDisk.filesCount,
        tablesBytes: tablesDisk.bytes,
        tablesFilesCount: tablesDisk.filesCount,
        totalBytes: totalDiskBytes,
        totalFilesCount: totalDiskFiles,
      };

      // Alerta preventiva si el volumen físico supera 10GB o umbral configurable
      const WARNING_THRESHOLD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
      if (totalDiskBytes >= WARNING_THRESHOLD_BYTES) {
        warning = true;
        warningMessage = 'El almacenamiento físico ha superado el 80% del umbral operativo sugerido.';
      }
    }

    return {
      isAdmin,
      database: {
        images: { count: imagesCount, sizeBytes: imagesBytes },
        tables: { count: tablesCount, sizeBytes: tablesBytes },
        totalCount: imagesCount + tablesCount,
        totalSizeBytes: imagesBytes + tablesBytes,
      },
      disk: diskInfo,
      topFolders,
      warning,
      warningMessage,
    };
  }
}

export const statsService = new StatsService();

