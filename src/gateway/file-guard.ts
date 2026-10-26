import { fileTypeFromBuffer } from 'file-type';
import crypto from 'node:crypto';
import { AppError } from '../shared/errors.js';

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const ALLOWED_TABLE_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
];

/**
 * Valida los magic bytes de un buffer inicial (mínimo 4100 bytes)
 */
export async function validateMagicBytes(
  chunk: Buffer,
  allowedMimes: string[]
): Promise<{ mime: string; ext: string }> {
  const type = await fileTypeFromBuffer(chunk);
  
  if (!type || !allowedMimes.includes(type.mime)) {
    throw new AppError(
      415,
      `Tipo de archivo no permitido. Tipos detectados: ${type?.mime || 'desconocido'}. Permitidos: ${allowedMimes.join(', ')}`,
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }

  return type;
}

/**
 * Crea un transform stream o hasher para SHA-256 en vuelo
 */
export function createContentHasher() {
  const hash = crypto.createHash('sha256');
  return {
    update: (chunk: Buffer) => hash.update(chunk),
    digest: () => hash.digest('hex'),
  };
}
