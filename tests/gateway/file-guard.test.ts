import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import {
  validateMagicBytes,
  validateTableContent,
  ALLOWED_IMAGE_MIMES,
} from '../../src/gateway/file-guard.js';
import { imagesService } from '../../src/modules/images/images.service.js';
import { tablesService } from '../../src/modules/tables/tables.service.js';
import { AppError } from '../../src/shared/errors.js';

// Firmas binarias reales para pruebas
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
  0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
  0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
]);

const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20, 0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00,
  0x01, 0x00, 0x02, 0x00, 0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd,
  0x50, 0x00,
]);

const FAKE_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
);

const VALID_ZIP_XLSX_BUFFER = Buffer.from([
  0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

describe('Gateway: Validación de Magic Bytes y Contenido (file-guard)', () => {
  describe('validateMagicBytes (Imágenes)', () => {
    it('debe validar exitosamente un búfer PNG legítimo', async () => {
      const result = await validateMagicBytes(VALID_PNG_BUFFER, ALLOWED_IMAGE_MIMES);
      assert.strictEqual(result.mime, 'image/png');
      assert.strictEqual(result.ext, 'png');
    });

    it('debe validar exitosamente un búfer JPEG legítimo', async () => {
      const result = await validateMagicBytes(VALID_JPEG_BUFFER, ALLOWED_IMAGE_MIMES);
      assert.strictEqual(result.mime, 'image/jpeg');
      assert.strictEqual(result.ext, 'jpg');
    });

    it('debe validar exitosamente un búfer WebP legítimo', async () => {
      const result = await validateMagicBytes(VALID_WEBP_BUFFER, ALLOWED_IMAGE_MIMES);
      assert.strictEqual(result.mime, 'image/webp');
      assert.strictEqual(result.ext, 'webp');
    });

    it('debe rechazar con 415 un archivo PDF disfrazado de imagen', async () => {
      await assert.rejects(
        async () => {
          await validateMagicBytes(FAKE_PDF_BUFFER, ALLOWED_IMAGE_MIMES);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          assert.ok(err.detail.includes('Tipo de archivo no permitido'));
          return true;
        }
      );
    });

    it('debe rechazar con 415 un archivo de texto con script HTML disfrazado de imagen', async () => {
      const maliciousScript = Buffer.from('<script>alert("xss")</script>');
      await assert.rejects(
        async () => {
          await validateMagicBytes(maliciousScript, ALLOWED_IMAGE_MIMES);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });
  });

  describe('validateTableContent (Tablas CSV / XLSX)', () => {
    it('debe validar exitosamente un contenido CSV legítimo', async () => {
      const validCsv = Buffer.from('id,producto,precio\n1,Teclado,25.50\n2,Mouse,15.00\n');
      await assert.doesNotReject(async () => {
        await validateTableContent(validCsv, '.csv');
      });
    });

    it('debe validar exitosamente un contenedor XLSX / ZIP legítimo', async () => {
      await assert.doesNotReject(async () => {
        await validateTableContent(VALID_ZIP_XLSX_BUFFER, '.xlsx');
      });
    });

    it('debe rechazar con 415 un archivo binario (PDF) disfrazado con extensión .csv', async () => {
      await assert.rejects(
        async () => {
          await validateTableContent(FAKE_PDF_BUFFER, '.csv');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          assert.ok(err.detail.includes('firma binaria no permitida'));
          return true;
        }
      );
    });

    it('debe rechazar con 415 un archivo con bytes nulos disfrazado como .csv', async () => {
      const binaryDisguised = Buffer.from([0x61, 0x62, 0x00, 0x63, 0x64]);
      await assert.rejects(
        async () => {
          await validateTableContent(binaryDisguised, '.csv');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          assert.ok(err.detail.includes('datos binarios no permitidos'));
          return true;
        }
      );
    });

    it('debe rechazar con 415 un archivo .csv que contenga scripts (PHP / JS)', async () => {
      const maliciousPhp = Buffer.from('<?php echo "inyeccion"; ?>\n');
      await assert.rejects(
        async () => {
          await validateTableContent(maliciousPhp, '.csv');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          assert.ok(err.detail.includes('código o scripts no permitidos'));
          return true;
        }
      );
    });

    it('debe rechazar con 415 un archivo que no sea ZIP/OpenXML disfrazado con extensión .xlsx', async () => {
      const fakeXlsx = Buffer.from('No soy un excel binario ni zip');
      await assert.rejects(
        async () => {
          await validateTableContent(fakeXlsx, '.xlsx');
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          assert.ok(err.detail.includes('Contenido no válido para archivo Excel'));
          return true;
        }
      );
    });
  });

  describe('Integración con Services (ImagesService & TablesService)', () => {
    it('imagesService.saveImage: debe rechazar y borrar archivo en disco si los magic bytes son inválidos', async () => {
      const fakePart = {
        filename: 'malicioso.png',
        mimetype: 'image/png',
        file: Readable.from([FAKE_PDF_BUFFER]),
      } as unknown as MultipartFile;

      await assert.rejects(
        async () => {
          await imagesService.saveImage(fakePart);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });

    it('tablesService.saveTable: debe rechazar y borrar archivo en disco si es un script disfrazado de .csv', async () => {
      const fakePart = {
        filename: 'exploit.csv',
        mimetype: 'text/csv',
        file: Readable.from([Buffer.from('<script>alert("hack")</script>')]),
      } as unknown as MultipartFile;

      await assert.rejects(
        async () => {
          await tablesService.saveTable(fakePart);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });

    it('tablesService.saveTable: debe rechazar y borrar archivo si un binario corrupto se envía como .xlsx', async () => {
      const fakePart = {
        filename: 'corrupto.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file: Readable.from([Buffer.from('not-a-valid-zip-content-at-all')]),
      } as unknown as MultipartFile;

      await assert.rejects(
        async () => {
          await tablesService.saveTable(fakePart);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 415);
          assert.strictEqual(err.code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    });
  });
});
