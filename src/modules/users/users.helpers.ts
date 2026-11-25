import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export async function cleanupUserStorageFiles(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const filesToDelete = new Set<string>();
  for (const filePath of storagePaths) {
    filesToDelete.add(filePath);
    const parsed = path.parse(filePath);
    if (filePath.includes('tables')) {
      filesToDelete.add(path.join(parsed.dir, `${parsed.name}.data.json.gz`));
    } else if (filePath.includes('images')) {
      filesToDelete.add(path.join(parsed.dir, 'thumbs', `${parsed.name}.webp`));
    } else if (filePath.includes('pdfs') && parsed.ext === '.pdf') {
      filesToDelete.add(path.join(parsed.dir, `${parsed.name}.text.json.gz`));
    }
  }
  await Promise.allSettled(Array.from(filesToDelete).map((p) => fs.unlink(p).catch(() => {})));
}
