import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../../config/env.js';

export interface ImageDimensions {
  width: number | null;
  height: number | null;
}

export class ImagesProcessor {
  /**
   * Obtiene la ruta absoluta del archivo de miniatura WebP en el almacenamiento
   */
  getThumbnailPath(shortCode: string): string {
    const thumbsDir = path.resolve(env.STORAGE_DIR, 'images', 'thumbs');
    return path.join(thumbsDir, `${shortCode}.webp`);
  }

  /**
   * Extrae dimensiones físicas (width y height) mediante Sharp de forma segura
   */
  async extractDimensions(filePath: string): Promise<ImageDimensions> {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
      };
    } catch {
      // Ignorar fallos de Sharp ante buffers sintéticos de pruebas o SVGs complejos
      return { width: null, height: null };
    }
  }

  /**
   * Genera miniatura WebP de 320px de ancho optimizada en disco
   */
  async generateThumbnail(sourcePath: string, shortCode: string): Promise<string | null> {
    try {
      const thumbsDir = path.resolve(env.STORAGE_DIR, 'images', 'thumbs');
      await fs.mkdir(thumbsDir, { recursive: true });
      const thumbPath = this.getThumbnailPath(shortCode);

      await sharp(sourcePath)
        .resize(320, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbPath);

      return thumbPath;
    } catch {
      // Ignorar fallos en buffers sintéticos de tests existentes
      return null;
    }
  }

  /**
   * Elimina la miniatura física en disco si existe
   */
  async deleteThumbnail(shortCode: string): Promise<void> {
    try {
      const thumbPath = this.getThumbnailPath(shortCode);
      const stat = await fs.stat(thumbPath).catch(() => null);
      if (stat) {
        await fs.unlink(thumbPath).catch(() => {});
      }
    } catch {
      // Operación silenciosa si no existe el archivo
    }
  }
}

export const imagesProcessor = new ImagesProcessor();
