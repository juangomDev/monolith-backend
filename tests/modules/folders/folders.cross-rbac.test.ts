import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import { Role, FolderPermission } from '@prisma/client';
import { buildApp } from '../../../src/app.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { AppError } from '../../../src/shared/errors.js';
import { prisma } from '../../../src/config/db.js';

describe('Módulo Carpetas: RBAC Cruzado e Ingesta de Archivos', () => {
  const validFolderId = '11111111-2222-4333-8444-555555555551';
  const collaboratorUser = {
    id: '11111111-2222-4333-8444-555555555552',
    role: Role.COLLABORATOR,
  };

  it('imagesService.saveImage: rechaza con 403 si un COLLABORATOR sube imagen sin folderId', async () => {
    const fakeFile = {
      filename: 'sample.png',
      mimetype: 'image/png',
      file: Readable.from([Buffer.from('fake-data')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakeFile, undefined, collaboratorUser);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        assert.match((err as AppError).message, /Los colaboradores solo pueden subir archivos/);
        return true;
      }
    );
  });

  it('imagesService.saveImage: rechaza con 403 si un COLLABORATOR solo tiene permiso READ en la carpeta', async () => {
    const fakeFile = {
      filename: 'sample.png',
      mimetype: 'image/png',
      file: Readable.from([Buffer.from('fake-data')]),
    } as unknown as MultipartFile;

    mock.method(foldersSharesService, 'assertFolderAccess', async () => {
      throw new AppError(403, 'Permiso insuficiente: solo tienes acceso de lectura en esta carpeta', 'FORBIDDEN');
    });

    await assert.rejects(
      async () => {
        await imagesService.saveImage(fakeFile, validFolderId, collaboratorUser);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('tablesService.saveTable: rechaza con 403 si un COLLABORATOR sube tabla sin folderId', async () => {
    const fakeFile = {
      filename: 'report.csv',
      mimetype: 'text/csv',
      file: Readable.from([Buffer.from('col1,col2\n1,2')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      async () => {
        await tablesService.saveTable(fakeFile, undefined, collaboratorUser);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('tablesService.saveTable: rechaza con 403 si un COLLABORATOR solo tiene permiso READ en la carpeta', async () => {
    const fakeFile = {
      filename: 'report.csv',
      mimetype: 'text/csv',
      file: Readable.from([Buffer.from('col1,col2\n1,2')]),
    } as unknown as MultipartFile;

    mock.method(foldersSharesService, 'assertFolderAccess', async () => {
      throw new AppError(403, 'Permiso insuficiente: solo tienes acceso de lectura en esta carpeta', 'FORBIDDEN');
    });

    await assert.rejects(
      async () => {
        await tablesService.saveTable(fakeFile, validFolderId, collaboratorUser);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        assert.strictEqual((err as AppError).code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('POST /api/v1/folders: rechaza con 403 si un COLLABORATOR intenta crear carpeta raíz', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ id: collaboratorUser.id, username: 'colab_user', role: Role.COLLABORATOR });

    (prisma.user as any).findUnique = async () => ({
      id: collaboratorUser.id,
      username: 'colab_user',
      role: Role.COLLABORATOR,
      isActive: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Carpeta No Permitida',
        type: 'IMAGE',
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
    assert.match(body.detail, /Los colaboradores no tienen permiso para crear carpetas/);
  });
});
