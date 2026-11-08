import fs from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const pdfsDir = path.resolve(process.cwd(), 'storage/pdfs');

export class PdfsStorage {
  async ensureDir(): Promise<void> {
    await fs.mkdir(pdfsDir, { recursive: true });
  }

  getPdfPath(shortCode: string): string {
    return path.join(pdfsDir, `${shortCode}.pdf`);
  }

  getTextArtifactPath(shortCode: string): string {
    return path.join(pdfsDir, `${shortCode}.text.json.gz`);
  }

  async savePdfFile(shortCode: string, buffer: Buffer): Promise<string> {
    await this.ensureDir();
    const filePath = this.getPdfPath(shortCode);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async saveTextArtifact(shortCode: string, payload: any): Promise<string> {
    await this.ensureDir();
    const artifactPath = this.getTextArtifactPath(shortCode);
    const jsonStr = JSON.stringify(payload);
    const gzBuffer = await gzipAsync(Buffer.from(jsonStr, 'utf-8'));
    await fs.writeFile(artifactPath, gzBuffer);
    return artifactPath;
  }

  getPdfStream(shortCode: string): ReadStream {
    return createReadStream(this.getPdfPath(shortCode));
  }

  getArtifactStream(shortCode: string): ReadStream {
    return createReadStream(this.getTextArtifactPath(shortCode));
  }

  async readTextArtifact(shortCode: string): Promise<any | null> {
    try {
      const artifactPath = this.getTextArtifactPath(shortCode);
      const gzBuffer = await fs.readFile(artifactPath);
      const jsonBuffer = await gunzipAsync(gzBuffer);
      return JSON.parse(jsonBuffer.toString('utf-8'));
    } catch {
      return null;
    }
  }

  async deletePdfFiles(shortCode: string): Promise<void> {
    await Promise.allSettled([
      fs.unlink(this.getPdfPath(shortCode)),
      fs.unlink(this.getTextArtifactPath(shortCode)),
    ]);
  }
}

export const pdfsStorage = new PdfsStorage();

