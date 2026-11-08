import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FormsService } from '../../../src/modules/forms/forms.service.js';
import { Role, FolderPermission } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Formularios: FormsService (Casos de Uso)', () => {
  const adminCaller = { id: 'admin-uuid', role: Role.ADMIN };

  const fakeForm = {
    id: 'form-uuid-1',
    slug: 'contacto-ciudadano',
    title: 'Contacto Ciudadano',
    folderId: 'folder-uuid-1',
    entryFieldsSchema: [
      { name: 'fullName', type: 'string', required: true },
      { name: 'comment', type: 'string', required: true },
    ],
    resolutionFieldsSchema: [
      { name: 'responseSummary', type: 'string', required: true },
    ],
    allowedResolutionStates: ['VALID', 'INVALID'],
    autoResolveWithAi: false,
    externalTargetUrl: 'https://external-service.local/webhook',
    linkedTableId: 'table-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('createForm: crea formulario exitosamente e inicializa tabla viva', async () => {
    let initializedTable = false;
    const mockRepo: any = {
      findFormBySlug: async () => null,
      createForm: async (data: any) => ({ ...fakeForm, ...data, id: 'created-id' }),
      findFormById: async (id: string) => ({ ...fakeForm, id }),
    };
    const mockTableSync: any = {
      initializeLinkedTable: async () => { initializedTable = true; return { id: 'tbl-1' }; },
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new FormsService(mockRepo, mockTableSync, mockShares);
    const result = await service.createForm(
      {
        slug: 'contacto-ciudadano',
        title: 'Contacto Ciudadano',
        folderId: 'folder-uuid-1',
        entryFieldsSchema: fakeForm.entryFieldsSchema,
        resolutionFieldsSchema: fakeForm.resolutionFieldsSchema,
      },
      adminCaller
    );

    assert.equal(result.id, 'created-id');
    assert.equal(initializedTable, true);
  });

  it('createForm: rechaza con 409 SLUG_ALREADY_EXISTS si ya existe el slug', async () => {
    const mockRepo: any = {
      findFormBySlug: async () => fakeForm,
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new FormsService(mockRepo, {} as any, mockShares);
    await assert.rejects(
      () => service.createForm({ slug: 'contacto-ciudadano', title: 'Test', folderId: 'f1', entryFieldsSchema: [{ name: 'a' }], resolutionFieldsSchema: [] }, adminCaller),
      (err: any) => err instanceof AppError && err.status === 409 && err.code === 'SLUG_ALREADY_EXISTS'
    );
  });

  it('submitEntry: registra entrada pública en estado NEW y sincroniza tabla viva', async () => {
    let synced = false;
    const mockRepo: any = {
      findFormBySlug: async () => fakeForm,
      createEntry: async (data: any) => ({
        id: 'entry-uuid-1',
        ...data,
        createdAt: new Date(),
      }),
    };
    const mockTableSync: any = {
      syncEntryToTable: async () => { synced = true; },
    };

    const service = new FormsService(mockRepo, mockTableSync, {} as any);
    const result = await service.submitEntry('contacto-ciudadano', {
      fullName: 'Carlos Gomez',
      comment: 'Solicitud de informe',
    });

    assert.equal(result.id, 'entry-uuid-1');
    assert.equal(result.status, 'NEW');
    assert.equal(synced, true);
  });

  it('resolveEntry: resuelve entrada única vez y sella status a VALID', async () => {
    let syncedResolution = false;
    const entryInNew = {
      id: 'entry-uuid-1',
      formId: fakeForm.id,
      form: fakeForm,
      entryPayload: { fullName: 'Carlos Gomez', comment: 'Solicitud' },
      status: 'NEW',
      resolutionPayload: null,
      resolvedAt: null,
      createdAt: new Date(),
    };

    const mockRepo: any = {
      findEntryById: async () => entryInNew,
      updateEntry: async (_id: string, data: any) => ({
        ...entryInNew,
        status: data.status,
        resolutionPayload: data.resolutionPayload,
        resolvedAt: data.resolvedAt,
      }),
    };
    const mockTableSync: any = {
      syncEntryToTable: async () => { syncedResolution = true; },
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new FormsService(mockRepo, mockTableSync, mockShares);
    const resolved = await service.resolveEntry(
      'entry-uuid-1',
      { status: 'VALID', resolutionPayload: { responseSummary: 'Aprobado formalmente' } },
      adminCaller
    );

    assert.equal(resolved.status, 'VALID');
    assert.equal(syncedResolution, true);
    assert.ok(resolved.resolvedAt);
  });

  it('resolveEntry: rechaza con 409 ENTRY_ALREADY_RESOLVED al intentar resolver por segunda vez', async () => {
    const alreadyResolvedEntry = {
      id: 'entry-uuid-1',
      form: fakeForm,
      status: 'VALID',
      resolvedAt: new Date(),
    };

    const mockRepo: any = {
      findEntryById: async () => alreadyResolvedEntry,
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.EDIT }),
    };

    const service = new FormsService(mockRepo, {} as any, mockShares);
    await assert.rejects(
      () => service.resolveEntry('entry-uuid-1', { status: 'INVALID', resolutionPayload: { responseSummary: 'Rechazado' } }, adminCaller),
      (err: any) => err instanceof AppError && err.status === 409 && err.code === 'ENTRY_ALREADY_RESOLVED'
    );
  });

  it('dispatchEntry: reenvía datos sellados hacia el sistema externo', async () => {
    const sealedEntry = {
      id: 'entry-uuid-1',
      form: fakeForm,
      status: 'VALID',
      entryPayload: { fullName: 'Maria' },
      resolutionPayload: { responseSummary: 'OK' },
      createdAt: new Date(),
      resolvedAt: new Date(),
    };

    const mockRepo: any = {
      findEntryById: async () => sealedEntry,
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.READ }),
    };

    const service = new FormsService(mockRepo, {} as any, mockShares);
    const result = await service.dispatchEntry('entry-uuid-1', adminCaller);

    assert.equal(result.entryId, 'entry-uuid-1');
    assert.equal(result.targetUrl, fakeForm.externalTargetUrl);
  });

  it('dispatchEntry: rechaza si el formulario no tiene externalTargetUrl configurada', async () => {
    const formWithoutUrl = { ...fakeForm, externalTargetUrl: null };
    const sealedEntry = {
      id: 'entry-uuid-1',
      form: formWithoutUrl,
      status: 'VALID',
    };

    const mockRepo: any = {
      findEntryById: async () => sealedEntry,
    };
    const mockShares: any = {
      assertFolderAccess: async () => ({ permission: FolderPermission.READ }),
    };

    const service = new FormsService(mockRepo, {} as any, mockShares);
    await assert.rejects(
      () => service.dispatchEntry('entry-uuid-1', adminCaller),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'TARGET_URL_NOT_CONFIGURED'
    );
  });
});

