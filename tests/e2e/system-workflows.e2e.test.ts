import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { setupInMemoryE2EDb, buildMultipart, TINY_PNG, SAMPLE_CSV } from './e2e.helper.js';
import { Role } from '@prisma/client';

describe('E2E Workflows: Jerarquía de Usuarios, Sesiones y Reglas de Carpetas', () => {
  let app: any;
  let teardownDb: () => void;
  let adminToken: string;
  let managerAToken: string;
  let managerBToken: string;
  let collab1Token: string;
  let collab2Token: string;

  let managerAId: string;
  let managerBId: string;
  let collab1Id: string;
  let collab2Id: string;
  let generalFolderId: string;

  before(async () => {
    const { teardown } = await setupInMemoryE2EDb();
    teardownDb = teardown;
    app = await buildApp();
  });

  after(async () => {
    teardownDb();
  });

  it('1.1 Login de ADMIN -> emite 200 con Access Token y Cookie de Refresco', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'AdminPass123!',
      },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.token);
    assert.strictEqual(body.user.role, Role.ADMIN);
    assert.ok(res.headers['set-cookie']);
    adminToken = body.token;
  });

  it('1.2 ADMIN crea MANAGER_A, MANAGER_B y COLLAB_1 (201)', async () => {
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'manager_a', password: 'ManagerPass123!', role: Role.MANAGER },
    });
    assert.strictEqual(resA.statusCode, 201);
    const bodyA = JSON.parse(resA.body);
    managerAId = bodyA.user.id;
    managerAToken = app.jwt.sign({ id: managerAId, username: 'manager_a', role: Role.MANAGER, tokenVersion: 0 });

    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'manager_b', password: 'ManagerPass123!', role: Role.MANAGER },
    });
    assert.strictEqual(resB.statusCode, 201);
    managerBId = JSON.parse(resB.body).user.id;
    managerBToken = app.jwt.sign({ id: managerBId, username: 'manager_b', role: Role.MANAGER, tokenVersion: 0 });

    const resC1 = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'collab_1', password: 'CollabPass123!', role: Role.COLLABORATOR },
    });
    assert.strictEqual(resC1.statusCode, 201);
    collab1Id = JSON.parse(resC1.body).user.id;
    collab1Token = app.jwt.sign({ id: collab1Id, username: 'collab_1', role: Role.COLLABORATOR, tokenVersion: 0 });
  });

  it('1.3 MANAGER_A crea COLLAB_2 verificando createdById === MANAGER_A.id (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { username: 'collab_2', password: 'CollabPass123!', role: Role.COLLABORATOR },
    });
    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.user.createdById, managerAId);
    collab2Id = body.user.id;
    collab2Token = app.jwt.sign({ id: collab2Id, username: 'collab_2', role: Role.COLLABORATOR, tokenVersion: 0 });
  });

  it('1.4 Rechazo Jerárquico: MANAGER no puede crear MANAGER/ADMIN; COLLABORATOR no puede crear usuario', async () => {
    const resMgr = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { username: 'manager_hack', password: 'Password123!', role: Role.MANAGER },
    });
    assert.strictEqual(resMgr.statusCode, 403);

    const resAdm = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { username: 'admin_hack', password: 'Password123!', role: Role.ADMIN },
    });
    assert.strictEqual(resAdm.statusCode, 400);

    const resCollab = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${collab1Token}` },
      payload: { username: 'collab_hack', password: 'Password123!', role: Role.COLLABORATOR },
    });
    assert.strictEqual(resCollab.statusCode, 403);
  });

  it('1.5 Visibilidad en GET /api/v1/users: MANAGER_A solo ve a COLLAB_2; ADMIN ve a todos', async () => {
    const resA = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(resA.statusCode, 200);
    const usersA = JSON.parse(resA.body).users;
    assert.strictEqual(usersA.length, 1);
    assert.strictEqual(usersA[0].id, collab2Id);

    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resAdmin.statusCode, 200);
    const usersAll = JSON.parse(resAdmin.body).users;
    assert.ok(usersAll.length >= 5);
  });

  it('1.6 Revocación por tokenVersion: password change, user suspension y logout invalidan token previo (401)', async () => {
    const staleManagerToken = managerAToken;
    const resPwd = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/password',
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { currentPassword: 'ManagerPass123!', newPassword: 'NewManagerPass123!' },
    });
    assert.strictEqual(resPwd.statusCode, 200);

    const resRevoked = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${staleManagerToken}` },
    });
    assert.strictEqual(resRevoked.statusCode, 401);

    managerAToken = app.jwt.sign({ id: managerAId, username: 'manager_a', role: Role.MANAGER, tokenVersion: 1 });

    const resSusp = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${collab2Id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    assert.strictEqual(resSusp.statusCode, 200);

    const resCollabSusp = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${collab2Token}` },
    });
    assert.strictEqual(resCollabSusp.statusCode, 401);

    const resLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${managerBToken}` },
    });
    assert.strictEqual(resLogout.statusCode, 200);

    const resPostLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${managerBToken}` },
    });
    assert.strictEqual(resPostLogout.statusCode, 401);
  });

  it('2.1 MANAGER sube imagen y tabla sin folderId -> auto-asignación a carpeta General (201)', async () => {
    const imgData = buildMultipart('foto.png', TINY_PNG, 'image/png');
    const resImg = await app.inject({
      method: 'POST',
      url: '/api/v1/images',
      headers: { authorization: `Bearer ${managerAToken}`, ...imgData.headers },
      payload: imgData.payload,
    });
    assert.strictEqual(resImg.statusCode, 201);
    const imgBody = JSON.parse(resImg.body);
    assert.ok(imgBody.folderId);
    generalFolderId = imgBody.folderId;

    const tblData = buildMultipart('datos.csv', SAMPLE_CSV, 'text/csv');
    const resTbl = await app.inject({
      method: 'POST',
      url: '/api/v1/tables',
      headers: { authorization: `Bearer ${managerAToken}`, ...tblData.headers },
      payload: tblData.payload,
    });
    assert.strictEqual(resTbl.statusCode, 201);
    const tblBody = JSON.parse(resTbl.body);
    assert.ok(tblBody.folderId);
  });

  it('2.2 Protección defensiva de General: renombrar (PATCH) o eliminar (DELETE) devuelve 400 BAD_REQUEST', async () => {
    const resRename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${generalFolderId}`,
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { name: 'MiNombrePersonalizado' },
    });
    assert.strictEqual(resRename.statusCode, 400);
    assert.strictEqual(JSON.parse(resRename.body).code, 'BAD_REQUEST');

    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${generalFolderId}`,
      headers: { authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(resDelete.statusCode, 400);
    assert.strictEqual(JSON.parse(resDelete.body).code, 'BAD_REQUEST');
  });

  it('2.3 COLLABORATOR intenta crear carpeta raíz -> 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${collab1Token}` },
      payload: { name: 'Carpeta Colaborador', type: 'IMAGE' },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  it('2.4 MANAGER crea carpeta privada -> otros usuarios no la ven ni pueden acceder por ID (403)', async () => {
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${managerAToken}` },
      payload: { name: 'Privada Manager A', type: 'IMAGE', isPrivate: true },
    });
    assert.strictEqual(resCreate.statusCode, 201);
    const privateFolderId = JSON.parse(resCreate.body).folder.id;

    // Manager B re-autenticado tras logout previo (tokenVersion incrementado a 1)
    const activeManagerBToken = app.jwt.sign({ id: managerBId, username: 'manager_b', role: Role.MANAGER, tokenVersion: 1 });

    const resListB = await app.inject({
      method: 'GET',
      url: '/api/v1/folders',
      headers: { authorization: `Bearer ${activeManagerBToken}` },
    });
    assert.strictEqual(resListB.statusCode, 200);
    const foldersB = JSON.parse(resListB.body).folders || [];
    assert.ok(!foldersB.some((f: any) => f.id === privateFolderId));

    const resGetById = await app.inject({
      method: 'GET',
      url: `/api/v1/folders/${privateFolderId}`,
      headers: { authorization: `Bearer ${collab1Token}` },
    });
    assert.strictEqual(resGetById.statusCode, 403);
  });
});
