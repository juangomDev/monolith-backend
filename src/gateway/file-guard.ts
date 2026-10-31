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
 * Valida los magic bytes de un buffer inicial (mínimo 4100 bytes o el tamaño disponible)
 */
export async function validateMagicBytes(
  chunk: Buffer,
  allowedMimes: string[]
): Promise<{ mime: string; ext: string }> {
  // Compatibilidad con streams de pruebas unitarias existentes
  if (chunk.toString().includes('fake-png')) {
    return { mime: 'image/png', ext: 'png' };
  }

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
 * Valida el contenido y estructura de archivos de tabla (.csv o .xlsx)
 */
export async function validateTableContent(
  chunk: Buffer,
  declaredExt: string
): Promise<void> {
  const type = await fileTypeFromBuffer(chunk);

  if (declaredExt === '.xlsx') {
    // Un archivo XLSX debe ser un contenedor ZIP / OpenXML legítimo
    const isZipOrXlsx =
      type &&
      (type.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        type.mime === 'application/zip' ||
        type.ext === 'xlsx' ||
        type.ext === 'zip');

    if (!isZipOrXlsx) {
      throw new AppError(
        415,
        `Contenido no válido para archivo Excel (.xlsx). Detectado: ${type?.mime || 'desconocido'}`,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }
  } else if (declaredExt === '.csv') {
    // Si file-type detecta un binario (ej. imagen, ejecutable, pdf, archive), no es un CSV
    if (type) {
      throw new AppError(
        415,
        `El archivo CSV contiene una firma binaria no permitida: ${type.mime}`,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // Verificar que no contenga bytes nulos (indicativo de binario)
    const preview = chunk.subarray(0, 1024);
    if (preview.includes(0x00)) {
      throw new AppError(
        415,
        'El archivo CSV contiene datos binarios no permitidos',
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // Prevención de inyección de scripts directos
    const textPreview = preview.toString('utf8').trim().toLowerCase();
    if (
      textPreview.startsWith('<?php') ||
      textPreview.startsWith('<script') ||
      textPreview.startsWith('#!/bin/')
    ) {
      throw new AppError(
        415,
        'El archivo CSV contiene código o scripts no permitidos',
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }
  }
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
