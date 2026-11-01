import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { setupInMemoryE2EDb, buildMultipart, TINY_PNG, SAMPLE_CSV } from './e2e.helper.js';
import { Role } from '@prisma/client';

describe('E2E Workflows: Compartición RBAC, Reasignación Cruzada y Ciclo Multimedia', () => {
  let app: any;
  let teardownDb: () => void;
  let managerToken: string;
  let collabToken: string;

  const managerId = '11111111-1111-4111-8111-111111111111';
  const collabId = '22222222-2222-4222-8222-222222222222';
  let imgFolderId: string;
  let tblFolderId: string;
  let targetEditFolderId: string;
  let targetReadFolderId: string;

  let testImageId: string;
  let testImageShortCode: string;
  let testTableId: string;
  let testTableShortCode: string;

  before(async () => {
    const { teardown } = await setupInMemoryE2EDb();
    teardownDb = teardown;
    app = await buildApp();
    managerToken = app.jwt.sign({ id: managerId, username: 'mgr_wf', role: Role.MANAGER, tokenVersion: 0 });
    collabToken = app.jwt.sign({ id: collabId, username: 'collab_wf', role: Role.COLLABORATOR, tokenVersion: 0 });

    const { prisma } = await import('../../src/config/db.js');
    await (prisma.user as any).create({ data: { id: managerId, username: 'mgr_wf', passwordHash: 'x', role: Role.MANAGER } });
    await (prisma.user as any).create({ data: { id: collabId, username: 'collab_wf', passwordHash: 'x', role: Role.COLLABORATOR, createdById: managerId } });
  });

  after(async () => teardownDb());

  it('3.1 COLLABORATOR intenta subir sin folderId -> 403 FORBIDDEN', async () => {
    const imgData = buildMultipart('collab.png', TINY_PNG, 'image/png');
    const res = await app.inject({ method: 'POST', url: '/api/v1/images', headers: { authorization: `Bearer ${collabToken}`, ...imgData.headers }, payload: imgData.payload });
    assert.strictEqual(res.statusCode, 403);
  });

  it('3.2 MANAGER comparte carpeta con READ -> COLLABORATOR puede listar pero no mutar (403)', async () => {
    const resFold = await app.inject({ method: 'POST', url: '/api/v1/folders', headers: { authorization: `Bearer ${managerToken}` }, payload: { name: 'Compartida', type: 'IMAGE' } });
    assert.strictEqual(resFold.statusCode, 201);
    imgFolderId = JSON.parse(resFold.body).folder.id;

    const imgInit = buildMultipart('init.png', TINY_PNG, 'image/png', { folderId: imgFolderId });
    const resInit = await app.inject({ method: 'POST', url: '/api/v1/images', headers: { authorization: `Bearer ${managerToken}`, ...imgInit.headers }, payload: imgInit.payload });
    assert.strictEqual(resInit.statusCode, 201);
    const initBody = JSON.parse(resInit.body);
    testImageId = initBody.id;
    testImageShortCode = initBody.shortCode;

    const resShare = await app.inject({ method: 'POST', url: `/api/v1/folders/${imgFolderId}/shares`, headers: { authorization: `Bearer ${managerToken}` }, payload: { userId: collabId, permission: 'READ' } });
    assert.strictEqual(resShare.statusCode, 201);

    const resListF = await app.inject({ method: 'GET', url: '/api/v1/folders', headers: { authorization: `Bearer ${collabToken}` } });
    assert.strictEqual(resListF.statusCode, 200);
    const sharedF = JSON.parse(resListF.body).folders.find((f: any) => f.id === imgFolderId);
    assert.strictEqual(sharedF?.myPermission, 'READ');

    const resListImg = await app.inject({ method: 'GET', url: `/api/v1/images?folderId=${imgFolderId}`, headers: { authorization: `Bearer ${collabToken}` } });
    assert.strictEqual(resListImg.statusCode, 200);

    // Intentos de mutación con READ denegados con 403
    const resUp = await app.inject({ method: 'POST', url: '/api/v1/images', headers: { authorization: `Bearer ${collabToken}`, ...imgInit.headers }, payload: imgInit.payload });
    assert.strictEqual(resUp.statusCode, 403);
    const resRen = await app.inject({ method: 'PATCH', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${collabToken}` }, payload: { originalName: 'hack.png' } });
    assert.strictEqual(resRen.statusCode, 403);
    const resRep = await app.inject({ method: 'PUT', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${collabToken}`, ...imgInit.headers }, payload: imgInit.payload });
    assert.strictEqual(resRep.statusCode, 403);
    const resDel = await app.inject({ method: 'DELETE', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${collabToken}` } });
    assert.strictEqual(resDel.statusCode, 403);
  });

  it('3.3 Actualizar a EDIT -> COLLABORATOR puede subir/renombrar/reemplazar pero no borrar carpeta (403)', async () => {
    const resUpdPerm = await app.inject({ method: 'PATCH', url: `/api/v1/folders/${imgFolderId}/shares/${collabId}`, headers: { authorization: `Bearer ${managerToken}` }, payload: { permission: 'EDIT' } });
    assert.strictEqual(resUpdPerm.statusCode, 200);

    const newImgData = buildMultipart('collab-edit.png', TINY_PNG, 'image/png', { folderId: imgFolderId });
    const resUploadOk = await app.inject({ method: 'POST', url: '/api/v1/images', headers: { authorization: `Bearer ${collabToken}`, ...newImgData.headers }, payload: newImgData.payload });
    assert.strictEqual(resUploadOk.statusCode, 201);

    const resRenameOk = await app.inject({ method: 'PATCH', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${collabToken}` }, payload: { originalName: 'renombrada.png' } });
    assert.strictEqual(resRenameOk.statusCode, 200);

    const resReplaceOk = await app.inject({ method: 'PUT', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${collabToken}`, ...newImgData.headers }, payload: newImgData.payload });
    assert.strictEqual(resReplaceOk.statusCode, 200);

    const resDelFold = await app.inject({ method: 'DELETE', url: `/api/v1/folders/${imgFolderId}`, headers: { authorization: `Bearer ${collabToken}` } });
    assert.strictEqual(resDelFold.statusCode, 403);
  });

  it('4.1 Reasignación cruzada rechaza tipo incompatible con 400 INVALID_FOLDER_TYPE', async () => {
    const resTblFold = await app.inject({ method: 'POST', url: '/api/v1/folders', headers: { authorization: `Bearer ${managerToken}` }, payload: { name: 'Tablas', type: 'TABLE' } });
    assert.strictEqual(resTblFold.statusCode, 201);
    tblFolderId = JSON.parse(resTblFold.body).folder.id;

    const tblData = buildMultipart('tabla.csv', SAMPLE_CSV, 'text/csv', { folderId: tblFolderId });
    const resTbl = await app.inject({ method: 'POST', url: '/api/v1/tables', headers: { authorization: `Bearer ${managerToken}`, ...tblData.headers }, payload: tblData.payload });
    assert.strictEqual(resTbl.statusCode, 201);
    testTableId = JSON.parse(resTbl.body).id;
    testTableShortCode = JSON.parse(resTbl.body).shortCode;

    const resImgToTbl = await app.inject({ method: 'PATCH', url: `/api/v1/images/${testImageId}/folder`, headers: { authorization: `Bearer ${managerToken}` }, payload: { folderId: tblFolderId } });
    assert.strictEqual(resImgToTbl.statusCode, 400);
    assert.strictEqual(JSON.parse(resImgToTbl.body).code, 'INVALID_FOLDER_TYPE');

    const resTblToImg = await app.inject({ method: 'PATCH', url: `/api/v1/tables/${testTableId}/folder`, headers: { authorization: `Bearer ${managerToken}` }, payload: { folderId: imgFolderId } });
    assert.strictEqual(resTblToImg.statusCode, 400);
    assert.strictEqual(JSON.parse(resTblToImg.body).code, 'INVALID_FOLDER_TYPE');
  });

  it('4.2 Reasignación de recursos con RBAC: EDIT permite mover (200), READ rechaza con 403', async () => {
    const resFoldEdit = await app.inject({ method: 'POST', url: '/api/v1/folders', headers: { authorization: `Bearer ${managerToken}` }, payload: { name: 'Destino EDIT', type: 'IMAGE' } });
    targetEditFolderId = JSON.parse(resFoldEdit.body).folder.id;
    await app.inject({ method: 'POST', url: `/api/v1/folders/${targetEditFolderId}/shares`, headers: { authorization: `Bearer ${managerToken}` }, payload: { userId: collabId, permission: 'EDIT' } });

    const resFoldRead = await app.inject({ method: 'POST', url: '/api/v1/folders', headers: { authorization: `Bearer ${managerToken}` }, payload: { name: 'Destino READ', type: 'IMAGE' } });
    targetReadFolderId = JSON.parse(resFoldRead.body).folder.id;
    await app.inject({ method: 'POST', url: `/api/v1/folders/${targetReadFolderId}/shares`, headers: { authorization: `Bearer ${managerToken}` }, payload: { userId: collabId, permission: 'READ' } });

    const resMoveOk = await app.inject({ method: 'PATCH', url: `/api/v1/images/${testImageId}/folder`, headers: { authorization: `Bearer ${collabToken}` }, payload: { folderId: targetEditFolderId } });
    assert.strictEqual(resMoveOk.statusCode, 200);

    const resMoveFail = await app.inject({ method: 'PATCH', url: `/api/v1/images/${testImageId}/folder`, headers: { authorization: `Bearer ${collabToken}` }, payload: { folderId: targetReadFolderId } });
    assert.strictEqual(resMoveFail.statusCode, 403);
  });

  it('5.1 Subida de SVG malicioso con script -> 400 MALICIOUS_PAYLOAD', async () => {
    const badSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const svgData = buildMultipart('malicious.svg', badSvg, 'image/svg+xml');
    const res = await app.inject({ method: 'POST', url: '/api/v1/images', headers: { authorization: `Bearer ${managerToken}`, ...svgData.headers }, payload: svgData.payload });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(JSON.parse(res.body).code, 'MALICIOUS_PAYLOAD');
  });

  it('5.2 Hot-swap conserva shortCode y urlWithVersion; miniatura WebP responde 200', async () => {
    const replaceData = buildMultipart('hot-swap.png', TINY_PNG, 'image/png');
    const resPut = await app.inject({ method: 'PUT', url: `/api/v1/images/${testImageId}`, headers: { authorization: `Bearer ${managerToken}`, ...replaceData.headers }, payload: replaceData.payload });
    assert.strictEqual(resPut.statusCode, 200);
    const putBody = JSON.parse(resPut.body);
    assert.strictEqual(putBody.shortCode, testImageShortCode);
    assert.ok(putBody.urlWithVersion.includes('?v='));

    const resThumb = await app.inject({ method: 'GET', url: `/i/${testImageShortCode}?variant=thumb` });
    assert.strictEqual(resThumb.statusCode, 200);
    assert.strictEqual(resThumb.headers['content-type'], 'image/webp');
  });

  it('5.3 GET /t/:short_code entrega JSON enriquecido y ?download=true entrega binario original', async () => {
    const resJson = await app.inject({ method: 'GET', url: `/t/${testTableShortCode}` });
    assert.strictEqual(resJson.statusCode, 200);
    const tblJson = JSON.parse(resJson.body);
    assert.ok(tblJson.data);
    assert.ok(tblJson.columns);

    const resDown = await app.inject({ method: 'GET', url: `/t/${testTableShortCode}?download=true` });
    assert.strictEqual(resDown.statusCode, 200);
    assert.ok(resDown.headers['content-disposition']?.includes('attachment'));
  });

  it('5.4 Eliminación en cascada destruye registros y devuelve 404 en capability URLs', async () => {
    const resDelImgF = await app.inject({ method: 'DELETE', url: `/api/v1/folders/${targetEditFolderId}`, headers: { authorization: `Bearer ${managerToken}` } });
    assert.strictEqual(resDelImgF.statusCode, 200);

    const resDelTblF = await app.inject({ method: 'DELETE', url: `/api/v1/folders/${tblFolderId}`, headers: { authorization: `Bearer ${managerToken}` } });
    assert.strictEqual(resDelTblF.statusCode, 200);

    const resGetImg = await app.inject({ method: 'GET', url: `/i/${testImageShortCode}` });
    assert.strictEqual(resGetImg.statusCode, 404);

    const resGetTbl = await app.inject({ method: 'GET', url: `/t/${testTableShortCode}` });
    assert.strictEqual(resGetTbl.statusCode, 404);
  });
});
