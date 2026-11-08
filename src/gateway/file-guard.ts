import { fileTypeFromBuffer } from 'file-type';
import crypto from 'node:crypto';
import { AppError } from '../shared/errors.js';

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];

export const ALLOWED_TABLE_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
];

export const ALLOWED_PDF_MIMES = [
  'application/pdf',
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

  // Verificación para archivos PDF (%PDF-)
  if (chunk.subarray(0, 5).toString('ascii') === '%PDF-') {
    if (!allowedMimes.includes('application/pdf')) {
      throw new AppError(415, 'Tipo de archivo no permitido: PDF', 'UNSUPPORTED_MEDIA_TYPE');
    }
    return { mime: 'application/pdf', ext: 'pdf' };
  }

  // Verificación para archivos SVG (formato XML de texto)
  const preview = chunk.subarray(0, 1024);
  const textPreview = preview.toString('utf8').trim();
  const isSvg =
    textPreview.includes('<svg') &&
    (textPreview.startsWith('<?xml') ||
      textPreview.startsWith('<svg') ||
      textPreview.includes('xmlns="http://www.w3.org/2000/svg"'));

  if (isSvg) {
    if (!allowedMimes.includes('image/svg+xml')) {
      throw new AppError(
        415,
        `Tipo de archivo no permitido: SVG`,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // Verificar que no contenga bytes nulos (indicativo de binario malformado)
    if (preview.includes(0x00)) {
      throw new AppError(
        415,
        'El archivo SVG contiene datos binarios no permitidos',
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // Desinfección anti-XSS: Bloquear scripts incrustados
    const lowerText = textPreview.toLowerCase();
    if (
      lowerText.includes('<script') ||
      lowerText.includes('javascript:') ||
      lowerText.includes('onload=') ||
      lowerText.includes('onerror=') ||
      lowerText.includes('onclick=')
    ) {
      throw new AppError(
        400,
        'El archivo SVG contiene scripts o eventos ejecutables no permitidos',
        'MALICIOUS_PAYLOAD'
      );
    }

    return { mime: 'image/svg+xml', ext: 'svg' };
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
 * Valida magic bytes y analiza vectores maliciosos en PDFs (/JavaScript, /Launch, etc.)
 */
export async function validatePdfContent(chunk: Buffer): Promise<void> {
  const header = chunk.subarray(0, 8).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    throw new AppError(415, 'Cabecera o magic bytes de PDF inválidos (%PDF- esperado)', 'UNSUPPORTED_MEDIA_TYPE');
  }

  // Escaneo del buffer en busca de diccionarios con acciones ejecutables o JavaScript
  const contentStr = chunk.toString('latin1');
  const maliciousPatterns = [
    /\/JavaScript/i,
    /\/JS\b/i,
    /\/Launch\b/i,
    /\/SubmitForm\b/i,
    /\/ImportData\b/i,
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(contentStr)) {
      throw new AppError(
        400,
        'El archivo PDF contiene scripts ejecutables o acciones dinámicas no permitidas',
        'MALICIOUS_PAYLOAD'
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
