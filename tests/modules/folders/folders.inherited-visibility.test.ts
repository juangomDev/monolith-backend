import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { MultipartFile } from '@fastify/multipart';
import { FolderPermission, FolderType, Role } from '@prisma/client';
import { prisma } from '../../../src/config/db.js';
import { AppError } from '../../../src/shared/errors.js';
import { foldersRepository } from '../../../src/modules/folders/folders.repository.js';
import { foldersService } from '../../../src/modules/folders/folders.service.js';
import { foldersSharesService } from '../../../src/modules/folders/folders.shares.service.js';
import { imagesRepository } from '../../../src/modules/images/images.repository.js';
import { imagesService } from '../../../src/modules/images/images.service.js';
import { tablesRepository } from '../../../src/modules/tables/tables.repository.js';
import { tablesService } from '../../../src/modules/tables/tables.service.js';
import { pdfsRepository } from '../../../src/modules/pdfs/pdfs.repository.js';
import { PdfsService } from '../../../src/modules/pdfs/pdfs.service.js';
import { formsRepository } from '../../../src/modules/forms/forms.repository.js';
import { FormsService } from '../../../src/modules/forms/forms.service.js';
import { usersRepository } from '../../../src/modules/users/users.repository.js';
import { UsersService } from '../../../src/modules/users/users.service.js';

describe('Fase 25: Visibilidad Heredada de Colaboradores, Blindaje RBAC y Limpieza PDF', () => {
  const managerId = 'aaaaaaaa-1111-4111-8111-111111111111';
  const collabId = 'bbbbbbbb-2222-4222-8222-222222222222';
  const parentFolderId = '11111111-1111-4111-8111-111111111111';
  const childFolderId = '22222222-2222-4222-8222-222222222222';
  const grandChildFolderId = '33333333-3333-4333-8333-333333333333';

  const originalFolderFindMany = prisma.folder.findMany;
  const originalImageFindMany = prisma.imageRegistry.findMany;
  const originalTableFindMany = prisma.tableRegistry.findMany;
  const originalPdfFindMany = prisma.pdfRegistry.findMany;
  const originalFormFindMany = prisma.formDefinition.findMany;

  afterEach(() => {
    (prisma.folder as any).findMany = originalFolderFindMany;
    (prisma.imageRegistry as any).findMany = originalImageFindMany;
    (prisma.tableRegistry as any).findMany = originalTableFindMany;
    (prisma.pdfRegistry as any).findMany = originalPdfFindMany;
    (prisma.formDefinition as any).findMany = originalFormFindMany;
    mock.reset();
  });

  it('25.1.1: FoldersRepository.findFolders incluye herencia de 3 niveles (members, parent.members, parent.parent.members) para COLLABORATOR', async () => {
    let capturedArgs: any;
    (prisma.folder as any).findMany = async (args: any) => {
      capturedArgs = args;
      return [];
    };

    await foldersRepository.findFolders({
      userId: collabId,
      isAdmin: false,
      role: Role.COLLABORATOR,
    });

    assert.ok(Array.isArray(capturedArgs.where.OR));
    assert.deepStrictEqual(capturedArgs.where.OR, [
      { isSystem: true },
      { members: { some: { userId: collabId } } },
      { parent: { members: { some: { userId: collabId } } } },
      { parent: { parent: { members: { some: { userId: collabId } } } } },
    ]);
    assert.ok(capturedArgs.include.members);
    assert.ok(capturedArgs.include.parent.select.members);
    assert.ok(capturedArgs.include.parent.select.parent.select.members);
  });

  it('25.1.2: COLLABORATOR ve en listFolders y getFolderTree la subcarpeta recién creada heredando myPermission EDIT desde el padre', async () => {
    const sharedParent = {
      id: parentFolderId,
      name: 'Marketing',
      type: FolderType.IMAGE,
      color: '#3b82f6',
      isPrivate: true,
      isSystem: false,
      parentId: '99999999-9999-4999-8999-999999999999', // Contenedor privado del Manager no visible
      userId: managerId,
      createdAt: new Date(),
      _count: { images: 0, tables: 0, pdfs: 0 },
      user: { id: managerId, username: 'juan' },
      members: [{ permission: FolderPermission.EDIT }],
      parent: null,
    };

    const createdSubfolder = {
      id: childFolderId,
      name: 'Campañas 2026',
      type: FolderType.IMAGE,
      color: null,
      isPrivate: true,
      isSystem: false,
      parentId: parentFolderId,
      userId: managerId, // Pertenece al Manager por Control Supremo
      createdAt: new Date(),
      _count: { images: 2, tables: 0, pdfs: 0 },
      user: { id: managerId, username: 'juan' },
      members: [], // Sin membresía directa
      parent: {
        id: parentFolderId,
        userId: managerId,
        parentId: '99999999-9999-4999-8999-999999999999',
        members: [{ permission: FolderPermission.EDIT }],
        parent: null,
      },
    };

    mock.method(foldersRepository, 'findFolders', async () => [sharedParent, createdSubfolder]);
    mock.method(foldersRepository, 'countFolders', async () => 2);

    const treeResult = await foldersService.getFolderTree({ id: collabId, role: Role.COLLABORATOR });

    // Marketing sube a raíz virtual porque su padre contenedor no es visible, y Campañas 2026 anida debajo
    assert.strictEqual(treeResult.total, 2);
    assert.strictEqual(treeResult.tree.length, 1);
    assert.strictEqual(treeResult.tree[0].id, parentFolderId);
    assert.strictEqual(treeResult.tree[0].myPermission, 'EDIT');
    assert.strictEqual(treeResult.tree[0].children.length, 1);
    assert.strictEqual(treeResult.tree[0].children[0].id, childFolderId);
    assert.strictEqual(treeResult.tree[0].children[0].myPermission, 'EDIT');
    assert.strictEqual(treeResult.tree[0].children[0].itemCount, 2);
  });

  it('25.1.3: getFolderById permite a COLLABORATOR acceder a subcarpeta privada heredada del abuelo y rechaza con 403 si se revoca el acceso', async () => {
    mock.method(foldersRepository, 'findFolderById', async (_id: string, userId?: string) => {
      assert.strictEqual(userId, collabId);
      return {
        id: grandChildFolderId,
        name: 'Nivel 3 Privado',
        type: FolderType.PDF,
        color: null,
        isPrivate: true,
        isSystem: false,
        parentId: childFolderId,
        userId: managerId,
        createdAt: new Date(),
        _count: { images: 0, tables: 0, pdfs: 4 },
        user: { id: managerId, username: 'juan' },
        members: [],
        parent: {
          id: childFolderId,
          userId: managerId,
          parentId: parentFolderId,
          members: [],
          parent: {
            id: parentFolderId,
            userId: managerId,
            members: [{ permission: FolderPermission.EDIT }],
          },
        },
      };
    });

    const folder = await foldersService.getFolderById(grandChildFolderId, {
      id: collabId,
      role: Role.COLLABORATOR,
    });
    assert.strictEqual(folder.id, grandChildFolderId);
    assert.strictEqual(folder.myPermission, 'EDIT');
    assert.strictEqual(folder.itemCount, 4);

    // Simular revocación del permiso en el padre/abuelo -> 403 FORBIDDEN
    mock.reset();
    mock.method(foldersRepository, 'findFolderById', async () => ({
      id: grandChildFolderId,
      name: 'Nivel 3 Privado',
      type: FolderType.PDF,
      color: null,
      isPrivate: true,
      isSystem: false,
      parentId: childFolderId,
      userId: managerId,
      createdAt: new Date(),
      _count: { images: 0, tables: 0, pdfs: 4 },
      user: { id: managerId, username: 'juan' },
      members: [],
      parent: { id: childFolderId, userId: managerId, parentId: parentFolderId, members: [], parent: null },
    }));

    await assert.rejects(
      () => foldersService.getFolderById(grandChildFolderId, { id: collabId, role: Role.COLLABORATOR }),
      (err: unknown) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );
  });

  it('25.2: repositorios de images, tables, pdfs y forms aplican herencia de membresías de 3 niveles para COLLABORATOR', async () => {
    const captured: Record<string, any> = {};
    (prisma.imageRegistry as any).findMany = async (args: any) => { captured.images = args.where; return []; };
    (prisma.tableRegistry as any).findMany = async (args: any) => { captured.tables = args.where; return []; };
    (prisma.pdfRegistry as any).findMany = async (args: any) => { captured.pdfs = args.where; return []; };
    (prisma.formDefinition as any).findMany = async (args: any) => { captured.forms = args.where; return []; };

    const opts = { userId: collabId, isAdmin: false, role: Role.COLLABORATOR };
    await Promise.all([
      imagesRepository.findAll(opts),
      tablesRepository.findAll(opts),
      pdfsRepository.findAll(opts),
      formsRepository.listForms(opts),
    ]);

    for (const key of ['images', 'tables', 'pdfs', 'forms']) {
      assert.deepStrictEqual(captured[key], {
        folder: {
          OR: [
            { isSystem: true },
            { members: { some: { userId: collabId } } },
            { parent: { members: { some: { userId: collabId } } } },
            { parent: { parent: { members: { some: { userId: collabId } } } } },
          ],
        },
      });
    }
  });

  it('25.3.1: pdfsService.uploadPdf rechaza con 403 FORBIDDEN si un COLLABORATOR sube PDF sin folderId', async () => {
    const service = new PdfsService({} as any, {} as any, {} as any, {} as any);
    const pdfBuf = Buffer.from('%PDF-1.4\n%%EOF');

    await assert.rejects(
      () => service.uploadPdf(pdfBuf, 'doc.pdf', undefined, { id: collabId, role: Role.COLLABORATOR }),
      (err: unknown) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );
  });

  it('25.3.2: images, tables y forms rechazan con 400 INVALID_FOLDER_TYPE si folder.type no corresponde', async () => {
    mock.method(foldersSharesService, 'assertFolderAccess', async () => ({
      permission: FolderPermission.EDIT,
      folder: { id: parentFolderId, type: FolderType.PDF, userId: managerId } as any,
    }));

    const imgPart = {
      filename: 'pic.png',
      mimetype: 'image/png',
      file: Readable.from([Buffer.from('fake')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      () => imagesService.saveImage(imgPart, parentFolderId, { id: managerId, role: Role.MANAGER }),
      (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_FOLDER_TYPE'
    );

    const tblPart = {
      filename: 'data.csv',
      mimetype: 'text/csv',
      file: Readable.from([Buffer.from('a,b\n1,2')]),
    } as unknown as MultipartFile;

    await assert.rejects(
      () => tablesService.saveTable(tblPart, parentFolderId, { id: managerId, role: Role.MANAGER }),
      (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_FOLDER_TYPE'
    );

    const formsSvc = new FormsService(
      {} as any,
      {} as any,
      {
        assertFolderAccess: async () => ({
          permission: FolderPermission.EDIT,
          folder: { id: parentFolderId, type: FolderType.IMAGE },
        }),
      } as any
    );

    await assert.rejects(
      () =>
        formsSvc.createForm(
          {
            slug: 'form-invalido',
            title: 'Formulario Inválido',
            folderId: parentFolderId,
            entryFieldsSchema: [{ name: 'campo' }],
            resolutionFieldsSchema: [],
          },
          { id: managerId, role: Role.MANAGER }
        ),
      (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_FOLDER_TYPE'
    );
  });

  it('25.4: usersRepository.getUserStoragePaths y usersService.deleteUser eliminan también ambos artefactos de PDFs', async () => {
    (prisma.folder as any).findMany = async (args: any) => {
      assert.deepStrictEqual(args.include.pdfs, { select: { storagePath: true, textArtifactPath: true } });
      return [
        {
          images: [{ storagePath: 'storage/images/img1.png' }],
          tables: [{ storagePath: 'storage/tables/tbl1.csv' }],
          pdfs: [
            {
              storagePath: 'storage/pdfs/doc1.pdf',
              textArtifactPath: 'storage/pdfs/doc1.text.json.gz',
            },
          ],
        },
      ];
    };

    const collectedPaths = await usersRepository.getUserStoragePaths(managerId);
    assert.deepStrictEqual(collectedPaths, [
      'storage/images/img1.png',
      'storage/tables/tbl1.csv',
      'storage/pdfs/doc1.pdf',
      'storage/pdfs/doc1.text.json.gz',
    ]);

    const unlinked: string[] = [];
    mock.method(fs, 'unlink', async (p: string) => {
      unlinked.push(p.replace(/\\/g, '/'));
    });

    const mockUsersRepo: any = {
      findById: async () => ({
        id: collabId,
        username: 'colab_pdfs',
        role: Role.COLLABORATOR,
        createdById: managerId,
      }),
      getUserStoragePaths: async () => ['storage/pdfs/doc1.pdf'],
      deleteById: async () => ({}),
    };

    const usersSvc = new UsersService(mockUsersRepo);
    await usersSvc.deleteUser({ id: managerId, role: Role.MANAGER }, collabId);

    assert.ok(unlinked.includes('storage/pdfs/doc1.pdf'));
    assert.ok(unlinked.includes('storage/pdfs/doc1.text.json.gz'));
  });
});
