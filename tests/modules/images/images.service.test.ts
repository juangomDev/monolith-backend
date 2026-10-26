import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { imagesRepository } from '../../../src/modules/images/images.repository.js';
import { AppError } from '../../../src/shared/errors.js';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs/promises';

describe('Módulo Imágenes: ImagesService', () => {
  afterEach(() => {
    mock.reset();
  });

  const validUuid = '11111111-2222-4333-8444-555555555555';

  it('saveImage: debe rechazar archivos cuyo MIME no sea de imagen (415)', async () => {
    const fakePart = {
      filename: 'documento.pdf',
      mimetype: 'application/pdf',
      file: Readable.from([Buffer.from('fake-pdf-content')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 415);
        assert.strictEqual((err as AppError).code, 'UNSUPPORTED_MEDIA_TYPE');
        return true;
      }
    );
  });

  it('saveImage: debe guardar imagen válida en disco y persistir en repositorio', async () => {
    const fakePart = {
      filename: 'avatar.png',
      mimetype: 'image/png',
      file: Readable.from([Buffer.from('fake-png-binary-stream')]),
    } as unknown as MultipartFile;

    mock.method(imagesRepository, 'create', async (data: any) => ({
      id: validUuid,
      shortCode: data.shortCode,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storagePath: data.storagePath,
      createdAt: new Date(),
    }));

    const result = await imagesService.saveImage(fakePart);

    assert.strictEqual(result.id, validUuid);
    assert.strictEqual(result.originalName, 'avatar.png');
    assert.strictEqual(result.mimeType, 'image/png');
    assert.ok(result.shortCode);
    assert.ok(result.url.includes(`/i/${result.shortCode}`));
    assert.ok(result.sizeBytes > 0);

    // Limpieza del archivo físico generado en test
    await imagesService.deleteImage(validUuid).catch(() => {});
  });

  it('saveImage: debe lanzar 413 si el stream fue truncado por exceder el tamaño límite', async () => {
    const stream = Readable.from([Buffer.from('datos-pesados')]) as Readable & { truncated?: boolean };
    stream.truncated = true;

    const fakePart = {
      filename: 'gigante.jpg',
      mimetype: 'image/jpeg',
      file: stream,
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 413);
        assert.strictEqual((err as AppError).code, 'PAYLOAD_TOO_LARGE');
        return true;
      }
    );
  });

  it('getImageFileByShortCode: debe lanzar 404 si el shortCode no existe en la base de datos', async () => {
    mock.method(imagesRepository, 'findByShortCode', async () => null);

    await assert.rejects(
      async () => {
        await imagesService.getImageFileByShortCode('inexist123');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('getImageFileByShortCode: debe lanzar 404 FILE_NOT_FOUND si el archivo físico en disco no existe', async () => {
    mock.method(imagesRepository, 'findByShortCode', async () => ({
      id: validUuid,
      shortCode: 'codigo1234',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: './storage/images/archivo_fantasma_inexistente.jpg',
      createdAt: new Date(),
    }));

    await assert.rejects(
      async () => {
        await imagesService.getImageFileByShortCode('codigo1234');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'FILE_NOT_FOUND');
        return true;
      }
    );
  });

  it('deleteImage: debe rechazar IDs que no sean UUID válidos con 400', async () => {
    await assert.rejects(
      async () => {
        await imagesService.deleteImage('id-invalido-no-uuid');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 400);
        assert.strictEqual((err as AppError).code, 'INVALID_ID');
        return true;
      }
    );
  });

  it('deleteImage: debe lanzar 404 si la imagen no existe en BD', async () => {
    mock.method(imagesRepository, 'findById', async () => null);

    await assert.rejects(
      async () => {
        await imagesService.deleteImage(validUuid);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 404);
        assert.strictEqual((err as AppError).code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('deleteImage: debe eliminar registro en BD y borrar archivo físico', async () => {
    let deletedFromDb = false;
    let unlinkedPath = '';

    mock.method(imagesRepository, 'findById', async () => ({
      id: validUuid,
      shortCode: 'codigo1234',
      originalName: 'foto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storagePath: '/mock/storage/images/codigo1234.jpg',
      createdAt: new Date(),
    }));

    mock.method(imagesRepository, 'deleteById', async () => {
      deletedFromDb = true;
      return {} as any;
    });

    mock.method(fs, 'unlink', async (p: string) => {
      unlinkedPath = p;
    });

    const result = await imagesService.deleteImage(validUuid);

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(deletedFromDb, true);
    assert.strictEqual(unlinkedPath, '/mock/storage/images/codigo1234.jpg');
  });
});
