import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { env } from '../../config/env.js';

export class ImagesStorage {
  private getImagesDir(): string {
    return path.resolve(env.STORAGE_DIR, 'images');
  }

  async ensureDirectory(): Promise<string> {
    const dir = this.getImagesDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  resolvePath(fileName: string): string {
    return path.join(this.getImagesDir(), fileName);
  }

  async saveStream(fileStream: Readable, targetPath: string): Promise<void> {
    await this.ensureDirectory();
    try {
      await pipeline(fileStream, createWriteStream(targetPath));
    } catch (err) {
      await this.deleteFile(targetPath);
      throw err;
    }
  }

  async readHeaderChunk(filePath: string, bytes = 4100): Promise<Buffer> {
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(bytes);
    try {
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath).catch(() => {});
  }

  async renameFile(sourcePath: string, targetPath: string): Promise<void> {
    await fs.rename(sourcePath, targetPath);
  }

  async isAccessible(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(filePath: string): ReadStream {
    return createReadStream(filePath);
  }
}

export const imagesStorage = new ImagesStorage();
