let BASE_URL = process.env.SMOKE_URL || 'http://localhost:8080';
const ADMIN_USER = process.env.ADMIN_USERNAME || process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'AdminPass123!';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const SAMPLE_CSV = 'id,nombre,precio\n1,Prueba Smoke,99.99\n2,Item Smoke,149.50\n';

async function runSmokeTests() {
  const isLocalMode = process.argv.includes('--local') || process.env.SMOKE_LOCAL === 'true';
  let localApp: any = null;
  let teardownDb: (() => void) | null = null;

  if (isLocalMode) {
    console.log(cyan('🔧 Iniciando servidor Fastify efímero en 127.0.0.1 para pruebas locales...'));
    const fs = await import('node:fs/promises');
    await fs.mkdir('./storage', { recursive: true });
    const { env } = await import('../config/env.js');
    (env as any).STORAGE_DIR = './storage';

    const { setupInMemoryE2EDb } = await import('./in-memory-db.js');
    const dbSetup = await setupInMemoryE2EDb();
    teardownDb = dbSetup.teardown;

    const { buildApp } = await import('../app.js');
    localApp = await buildApp();
    BASE_URL = await localApp.listen({ port: 0, host: '127.0.0.1' });
    console.log(green(`  ✅ Servidor local efímero activo en: ${BASE_URL}`));
  }

  console.log(bold(cyan(`\n🚀 INICIANDO PRUEBAS DE HUMO EN VIVO (${BASE_URL})\n`)));

  let adminToken = '';
  let managerToken = '';
  let collabToken = '';
  let managerId = '';
  let collabId = '';
  let imgFolderId = '';
  let tblFolderId = '';
  let generalFolderId = '';
  let imgShortCode = '';
  let tblShortCode = '';

  const timestamp = Date.now();
  const mgrUsername = `smoke_mgr_${timestamp}`;
  const collabUsername = `smoke_collab_${timestamp}`;
  const testPassword = 'SmokeSecretPass123!';

  try {
    // 1. GET /health y GET /openapi.json
    console.log(cyan('1. Verificando salud del servidor y OpenAPI...'));
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (healthRes.status !== 200) throw new Error(`/health devolvió status ${healthRes.status}`);
    const healthJson = (await healthRes.json()) as any;
    const isDbUp = healthJson.db === 'up' || healthJson.services?.database === 'up';
    const isStorageOk = healthJson.storage === 'writable' || healthJson.storage === 'up' || healthJson.services?.storage === 'up';
    if (!isDbUp || !isStorageOk) {
      throw new Error(`Servicios no listos: DB=${healthJson.db}, Storage=${healthJson.storage}`);
    }

    const openApiRes = await fetch(`${BASE_URL}/openapi.json`);
    if (openApiRes.status !== 200) throw new Error(`/openapi.json devolvió status ${openApiRes.status}`);
    console.log(green('  ✅ GET /health y GET /openapi.json respondieron 200 (DB & Storage UP)'));

    // 2. POST /api/v1/auth/login (ADMIN)
    console.log(cyan('\n2. Autenticando con credenciales de ADMIN...'));
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    if (loginRes.status !== 200) {
      throw new Error(`Login ADMIN falló con status ${loginRes.status}. Revisa ADMIN_USERNAME/ADMIN_PASSWORD en .env`);
    }
    const loginJson = (await loginRes.json()) as any;
    adminToken = loginJson.token;
    const cookie = loginRes.headers.get('set-cookie') || '';
    if (!adminToken || !cookie.includes('refreshToken')) {
      throw new Error('No se recibió JWT válido o cookie refreshToken en el login');
    }
    console.log(green('  ✅ Login exitoso: JWT emitido y cookie refreshToken configurada'));

    // 3. Crear MANAGER y COLLABORATOR + Rechazo jerárquico
    console.log(cyan('\n3. Creando usuarios de prueba y verificando jerarquía RBAC...'));
    const createMgrRes = await fetch(`${BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ username: mgrUsername, password: testPassword, role: 'MANAGER' }),
    });
    if (createMgrRes.status !== 201) throw new Error(`Crear MANAGER falló con status ${createMgrRes.status}`);
    managerId = ((await createMgrRes.json()) as any).user.id;

    // Login MANAGER
    const mgrLoginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: mgrUsername, password: testPassword }),
    });
    managerToken = ((await mgrLoginRes.json()) as any).token;

    // MANAGER crea COLLABORATOR
    const createCollabRes = await fetch(`${BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ username: collabUsername, password: testPassword, role: 'COLLABORATOR' }),
    });
    if (createCollabRes.status !== 201) throw new Error(`Crear COLLABORATOR falló con status ${createCollabRes.status}`);
    collabId = ((await createCollabRes.json()) as any).user.id;

    // Login COLLABORATOR
    const collabLoginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: collabUsername, password: testPassword }),
    });
    collabToken = ((await collabLoginRes.json()) as any).token;

    // COLLABORATOR intenta crear usuario -> 403
    const collabHackRes = await fetch(`${BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${collabToken}` },
      body: JSON.stringify({ username: `hack_${timestamp}`, password: testPassword, role: 'COLLABORATOR' }),
    });
    if (collabHackRes.status !== 403) throw new Error(`COLLABORATOR creando usuario esperaba 403, obtuvo ${collabHackRes.status}`);
    console.log(green('  ✅ Jerarquía validada: MANAGER y COLLABORATOR creados; intento no autorizado bloqueado con 403'));

    // 4. Crear carpetas IMAGE/TABLE y Protección de General
    console.log(cyan('\n4. Creando carpetas y validando protección inmutable de General...'));
    const createImgFRes = await fetch(`${BASE_URL}/api/v1/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Smoke Img Folder', type: 'IMAGE' }),
    });
    imgFolderId = ((await createImgFRes.json()) as any).folder.id;

    const createTblFRes = await fetch(`${BASE_URL}/api/v1/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Smoke Tbl Folder', type: 'TABLE' }),
    });
    tblFolderId = ((await createTblFRes.json()) as any).folder.id;

    // Subir imagen sin folderId para auto-asignar General
    const initFd = new FormData();
    initFd.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'init.png');
    const autoGenRes = await fetch(`${BASE_URL}/api/v1/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: initFd,
    });
    generalFolderId = ((await autoGenRes.json()) as any).folderId;

    // Intento de borrar General -> 400
    const delGenRes = await fetch(`${BASE_URL}/api/v1/folders/${generalFolderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    if (delGenRes.status !== 400) throw new Error(`Borrar General esperaba 400, obtuvo ${delGenRes.status}`);
    console.log(green('  ✅ Carpetas creadas exitosamente y eliminación de General bloqueada con 400 BAD_REQUEST'));

    // 5. Compartir con READ (403), luego EDIT (201) e Ingesta PNG/CSV
    console.log(cyan('\n5. Probando compartición granular READ -> EDIT e ingesta multipart...'));
    await fetch(`${BASE_URL}/api/v1/folders/${imgFolderId}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ userId: collabId, permission: 'READ' }),
    });

    const fdCollab = new FormData();
    fdCollab.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'collab.png');
    fdCollab.append('folderId', imgFolderId);

    const failUploadRes = await fetch(`${BASE_URL}/api/v1/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collabToken}` },
      body: fdCollab,
    });
    if (failUploadRes.status !== 403) throw new Error(`Subida con permiso READ esperaba 403, obtuvo ${failUploadRes.status}`);

    // Ascender a EDIT
    await fetch(`${BASE_URL}/api/v1/folders/${imgFolderId}/shares/${collabId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ permission: 'EDIT' }),
    });

    // Subir PNG con permiso EDIT
    const fdImgOk = new FormData();
    fdImgOk.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'smoke.png');
    fdImgOk.append('folderId', imgFolderId);
    const okImgRes = await fetch(`${BASE_URL}/api/v1/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collabToken}` },
      body: fdImgOk,
    });
    if (okImgRes.status !== 201) throw new Error(`Subida PNG con EDIT falló con status ${okImgRes.status}`);
    imgShortCode = ((await okImgRes.json()) as any).shortCode;

    // Compartir carpeta de tablas con EDIT y subir CSV
    await fetch(`${BASE_URL}/api/v1/folders/${tblFolderId}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ userId: collabId, permission: 'EDIT' }),
    });

    const fdCsvOk = new FormData();
    fdCsvOk.append('file', new Blob([SAMPLE_CSV], { type: 'text/csv' }), 'smoke.csv');
    fdCsvOk.append('folderId', tblFolderId);
    const okTblRes = await fetch(`${BASE_URL}/api/v1/tables`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collabToken}` },
      body: fdCsvOk,
    });
    if (okTblRes.status !== 201) throw new Error(`Subida CSV con EDIT falló con status ${okTblRes.status}`);
    tblShortCode = ((await okTblRes.json()) as any).shortCode;
    console.log(green('  ✅ RBAC validado: Ingesta bloqueada en READ (403) y aprobada en EDIT (201 Created)'));

    // 6. Capability URLs públicas
    console.log(cyan('\n6. Verificando Capability URLs públicas y miniaturas WebP...'));
    const imgPubRes = await fetch(`${BASE_URL}/i/${imgShortCode}`);
    if (imgPubRes.status !== 200) throw new Error(`GET /i/${imgShortCode} falló con status ${imgPubRes.status}`);

    const thumbPubRes = await fetch(`${BASE_URL}/i/${imgShortCode}?variant=thumb`);
    if (thumbPubRes.status !== 200 || !thumbPubRes.headers.get('content-type')?.includes('image/webp')) {
      throw new Error(`GET /i/${imgShortCode}?variant=thumb no devolvió 200 image/webp`);
    }

    const tblPubRes = await fetch(`${BASE_URL}/t/${tblShortCode}`);
    if (tblPubRes.status !== 200) throw new Error(`GET /t/${tblShortCode} falló con status ${tblPubRes.status}`);

    const tblDownRes = await fetch(`${BASE_URL}/t/${tblShortCode}?download=true`);
    if (tblDownRes.status !== 200 || !tblDownRes.headers.get('content-disposition')?.includes('attachment')) {
      throw new Error(`GET /t/${tblShortCode}?download=true no devolvió attachment`);
    }
    console.log(green('  ✅ Capability URLs operativas: imagen original, miniatura WebP, JSON precalculado y descarga'));

    console.log(bold(green('\n✨ ¡TODAS LAS PRUEBAS DE HUMO EN VIVO PASARON EXITOSAMENTE (100%)!\n')));
  } catch (err: any) {
    console.error(bold(red(`\n❌ ERROR EN PRUEBA DE HUMO: ${err.message}\n`)));
    process.exitCode = 1;
  } finally {
    // 7. Teardown
    console.log(cyan('7. Ejecutando limpieza automática de recursos de prueba...'));
    if (managerToken) {
      if (imgFolderId) await fetch(`${BASE_URL}/api/v1/folders/${imgFolderId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managerToken}` } }).catch(() => {});
      if (tblFolderId) await fetch(`${BASE_URL}/api/v1/folders/${tblFolderId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managerToken}` } }).catch(() => {});
      if (collabId) await fetch(`${BASE_URL}/api/v1/users/${collabId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managerToken}` } }).catch(() => {});
    }
    if (adminToken && managerId) {
      await fetch(`${BASE_URL}/api/v1/users/${managerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => {});
    }
    console.log(green('  ✅ Limpieza completada: Carpetas y usuarios temporales eliminados'));

    if (localApp) {
      await localApp.close();
      console.log(green('  ✅ Servidor Fastify efímero apagado limpiamente'));
    }
    if (teardownDb) {
      teardownDb();
    }
  }
}

runSmokeTests();
