import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { imagesRepository } from '../../../src/modules/images/images.repository.js';
import { AppError } from '../../../src/shared/errors.js';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs/promises';
import { Role } from '@prisma/client';

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

  it('listImages: debe retornar lista vacía si no hay imágenes registradas', async () => {
    mock.method(imagesRepository, 'findAll', async () => []);

    const result = await imagesService.listImages();

    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.images, []);
  });

  it('listImages: debe retornar lista formateada con URL pública generada', async () => {
    mock.method(imagesRepository, 'findAll', async () => [
      {
        id: validUuid,
        shortCode: 'imgList123',
        originalName: 'banner.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        storagePath: '/storage/images/imgList123.png',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const result = await imagesService.listImages();

    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].id, validUuid);
    assert.strictEqual(result.images[0].shortCode, 'imgList123');
    assert.ok(result.images[0].url.includes('/i/imgList123'));
    assert.strictEqual(result.images[0].originalName, 'banner.png');
    assert.strictEqual(result.images[0].mimeType, 'image/png');
    assert.strictEqual(result.images[0].sizeBytes, 2048);
  });

  it('saveImage: debe guardar archivo .svg seguro y persistir en repositorio', async () => {
    const validSvgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
    const fakePart = {
      filename: 'logo.svg',
      mimetype: 'image/svg+xml',
      file: Readable.from([Buffer.from(validSvgContent, 'utf-8')]),
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
    assert.strictEqual(result.originalName, 'logo.svg');
    assert.strictEqual(result.mimeType, 'image/svg+xml');
    assert.ok(result.shortCode);

    // Limpieza
    await imagesService.deleteImage(validUuid).catch(() => {});
  });

  it('saveImage: debe rechazar archivo .svg con tag script malicioso (400)', async () => {
    const xssSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="10" height="10"/></svg>';
    const fakePart = {
      filename: 'malicious.svg',
      mimetype: 'image/svg+xml',
      file: Readable.from([Buffer.from(xssSvg, 'utf-8')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 400);
        assert.strictEqual((err as AppError).code, 'MALICIOUS_PAYLOAD');
        return true;
      }
    );
  });

  it('saveImage: debe rechazar archivo .svg con handlers onload o onclick maliciosos (400)', async () => {
    const xssSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>';
    const fakePart = {
      filename: 'event-xss.svg',
      mimetype: 'image/svg+xml',
      file: Readable.from([Buffer.from(xssSvg, 'utf-8')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakePart);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 400);
        assert.strictEqual((err as AppError).code, 'MALICIOUS_PAYLOAD');
        return true;
      }
    );
  });

  it('renameImage: debe renombrar imagen si el usuario es ADMIN o propietario de la carpeta', async () => {
    const mockImage = {
      id: validUuid,
      shortCode: 'shortCode1',
      originalName: 'old-name.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/mock/path/shortCode1.png',
      createdAt: new Date(),
      updatedAt: new Date(),
      folder: { id: 'folder-1', userId: 'user-owner' },
    };

    mock.method(imagesRepository, 'findById', async () => mockImage);
    mock.method(imagesRepository, 'update', async (_id: string, data: any) => ({
      ...mockImage,
      ...data,
      updatedAt: new Date(),
    }));

    const result = await imagesService.renameImage(validUuid, 'new-name.png', {
      id: 'user-owner',
      role: Role.MANAGER,
    });

    assert.strictEqual(result.id, validUuid);
    assert.strictEqual(result.originalName, 'new-name.png');
  });

  it('renameImage: debe rechazar nombre vacío con 400', async () => {
    await assert.rejects(
      async () => {
        await imagesService.renameImage(validUuid, '   ');
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 400);
        assert.strictEqual((err as AppError).code, 'INVALID_NAME');
        return true;
      }
    );
  });

  it('renameImage: debe denegar con 403 a un usuario ajeno a la carpeta (anti-IDOR)', async () => {
    const mockImage = {
      id: validUuid,
      shortCode: 'shortCode1',
      originalName: 'secret.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/mock/path/shortCode1.png',
      createdAt: new Date(),
      updatedAt: new Date(),
      folder: { id: 'folder-1', userId: 'user-owner' },
    };

    mock.method(imagesRepository, 'findById', async () => mockImage);

    await assert.rejects(
      async () => {
        await imagesService.renameImage(validUuid, 'hacked.png', {
          id: 'user-attacker',
          role: Role.MANAGER,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('replaceImageFile: debe denegar con 403 a un usuario ajeno a la carpeta (anti-IDOR)', async () => {
    const mockImage = {
      id: validUuid,
      shortCode: 'shortCode1',
      originalName: 'logo.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/mock/path/shortCode1.png',
      createdAt: new Date(),
      folder: { id: 'folder-1', userId: 'user-owner' },
    };

    mock.method(imagesRepository, 'findById', async () => mockImage);

    const fakePart = {
      filename: 'replacement.png',
      mimetype: 'image/png',
      file: Readable.from([Buffer.from('new-binary')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.replaceImageFile(validUuid, fakePart, {
          id: 'user-attacker',
          role: Role.MANAGER,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('deleteImage: debe denegar con 403 a un usuario ajeno a la carpeta (anti-IDOR)', async () => {
    const mockImage = {
      id: validUuid,
      shortCode: 'shortCode1',
      originalName: 'logo.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/mock/path/shortCode1.png',
      createdAt: new Date(),
      folder: { id: 'folder-1', userId: 'user-owner' },
    };

    mock.method(imagesRepository, 'findById', async () => mockImage);

    await assert.rejects(
      async () => {
        await imagesService.deleteImage(validUuid, {
          id: 'user-attacker',
          role: Role.MANAGER,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('listImages: debe filtrar por folderId y devolver paginación', async () => {
    const mockRecord = {
      id: validUuid,
      shortCode: 'sc12345678',
      originalName: 'folder-image.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/storage/images/sc12345678.png',
      createdAt: new Date(),
      folderId: 'folder-abc',
    };

    mock.method(imagesRepository, 'findAll', async (opts: any) => {
      assert.strictEqual(opts.folderId, 'folder-abc');
      assert.strictEqual(opts.page, 2);
      assert.strictEqual(opts.limit, 10);
      return [mockRecord];
    });

    mock.method(imagesRepository, 'count', async (opts: any) => {
      assert.strictEqual(opts.folderId, 'folder-abc');
      return 15;
    });

    const result = await imagesService.listImages({
      page: 2,
      limit: 10,
      folderId: 'folder-abc',
      requester: { id: 'admin-1', role: Role.ADMIN },
    });

    assert.strictEqual(result.total, 15);
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.totalPages, 2);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].originalName, 'folder-image.png');
  });
});
