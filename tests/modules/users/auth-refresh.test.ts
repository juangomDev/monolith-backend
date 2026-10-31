import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { usersService } from '../../../src/modules/users/users.service.js';
import { Role } from '@prisma/client';

describe('Módulo Usuarios: Refresh Tokens, Logout y Revocación (tokenVersion)', () => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUserUpdate = prisma.user.update;
  const originalUserCreate = prisma.user.create;

  afterEach(() => {
    (prisma.user as any).findUnique = originalUserFindUnique;
    (prisma.user as any).update = originalUserUpdate;
    (prisma.user as any).create = originalUserCreate;
    mock.reset();
  });

  it('POST /api/v1/auth/login: debe emitir cookie HttpOnly refreshToken con SameSite=Strict', async () => {
    const mockUserPayload = {
      id: 'admin-uuid-1',
      username: 'admin',
      role: Role.ADMIN,
      tokenVersion: 0,
    };

    mock.method(usersService, 'login', async () => mockUserPayload);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'admin',
        password: 'AdminPassword123!',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.token, 'Debe devolver un access token JWT');

    // Verificar cabecera Set-Cookie
    const setCookieHeader = response.headers['set-cookie'];
    assert.ok(setCookieHeader, 'Debe incluir cabecera Set-Cookie');

    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : setCookieHeader;
    assert.ok(cookieStr.includes('refreshToken='), 'Debe incluir la cookie refreshToken');
    assert.ok(cookieStr.toLowerCase().includes('httponly'), 'Debe tener flag HttpOnly');
    assert.ok(cookieStr.toLowerCase().includes('samesite=strict'), 'Debe tener flag SameSite=Strict');
    assert.ok(cookieStr.includes('Path=/api/v1/auth'), 'Debe tener Path=/api/v1/auth');
  });

  it('POST /api/v1/auth/refresh: rechaza 401 si no se envía la cookie de refresco', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/auth/refresh: rechaza 401 con refresh token inválido o manipulado', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: {
        refreshToken: 'invalid_corrupted_token',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/auth/refresh: emite nuevo Access Token si el refresh token es válido', async () => {
    const app = await buildApp();
    const testUser = {
      id: 'user-refresh-id',
      username: 'usuario_activo',
      role: Role.USER,
      tokenVersion: 0,
      isActive: true,
    };

    (prisma.user as any).findUnique = async () => testUser;

    const validRefreshToken = app.jwt.sign(
      {
        id: testUser.id,
        username: testUser.username,
        role: testUser.role,
        tokenVersion: 0,
        type: 'refresh',
      },
      { expiresIn: '7d' }
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: {
        refreshToken: validRefreshToken,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.token, 'Debe devolver un nuevo access token');
    assert.strictEqual(body.user.id, testUser.id);
    assert.strictEqual(body.user.username, testUser.username);

    // Verificar que el nuevo token sea válido
    const decoded = app.jwt.verify(body.token) as any;
    assert.strictEqual(decoded.id, testUser.id);
    assert.strictEqual(decoded.tokenVersion, 0);
  });

  it('POST /api/v1/auth/logout: limpia la cookie y revoca inmediatamente el token previo (SESSION_REVOKED)', async () => {
    const app = await buildApp();

    let currentVersionInDb = 0;
    const testAdmin = {
      id: 'admin-logout-id',
      username: 'admin',
      role: Role.ADMIN,
      tokenVersion: currentVersionInDb,
      isActive: true,
    };

    (prisma.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === testAdmin.id || where?.username === testAdmin.username) {
        return {
          ...testAdmin,
          tokenVersion: currentVersionInDb,
        };
      }
      return null;
    };

    (prisma.user as any).update = async ({ data }: any) => {
      if (data.tokenVersion?.increment) {
        currentVersionInDb += data.tokenVersion.increment;
      }
      return {
        ...testAdmin,
        tokenVersion: currentVersionInDb,
      };
    };

    (prisma.user as any).create = async ({ data }: any) => ({
      id: 'new-user-id',
      ...data,
      createdAt: new Date(),
    });

    // 1. Emitir token con versión 0
    const tokenVersion0 = app.jwt.sign({
      id: testAdmin.id,
      username: testAdmin.username,
      role: testAdmin.role,
      tokenVersion: 0,
    });

    const uniqueUser1 = `user_valido_${Date.now()}`;
    const uniqueUser2 = `otro_user_${Date.now()}`;

    // 2. Probar que el token es aceptado antes de hacer logout
    const preLogoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: `Bearer ${tokenVersion0}`,
      },
      payload: {
        username: uniqueUser1,
        password: 'password123',
      },
    });
    // Debe responder 201 Created (token válido)
    assert.strictEqual(preLogoutRes.statusCode, 201);

    // 3. Ejecutar POST /api/v1/auth/logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${tokenVersion0}`,
      },
    });

    assert.strictEqual(logoutRes.statusCode, 200);
    const logoutBody = JSON.parse(logoutRes.body);
    assert.strictEqual(logoutBody.message, 'Sesión cerrada exitosamente');

    // Verificar que la cookie fue eliminada (Max-Age=0 o expirada)
    const logoutCookieHeader = logoutRes.headers['set-cookie'];
    assert.ok(logoutCookieHeader);
    const cookieStr = Array.isArray(logoutCookieHeader) ? logoutCookieHeader.join(';') : logoutCookieHeader;
    assert.ok(
      cookieStr.includes('Max-Age=0') || cookieStr.toLowerCase().includes('expires='),
      'Debe destruir la cookie con Max-Age=0 o expires'
    );

    // 4. Intentar usar nuevamente el token anterior (versión 0) tras el logout
    const postLogoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: `Bearer ${tokenVersion0}`,
      },
      payload: {
        username: uniqueUser2,
        password: 'password123',
      },
    });

    // Debe ser RECHAZADO de inmediato con 401 SESSION_REVOKED
    assert.strictEqual(postLogoutRes.statusCode, 401);
    const postLogoutBody = JSON.parse(postLogoutRes.body);
    assert.strictEqual(postLogoutBody.code, 'SESSION_REVOKED');
    assert.strictEqual(postLogoutBody.detail, 'Sesión revocada o cerrada');
  });

  it('POST /api/v1/auth/refresh: rechaza refresh token emitido antes del logout', async () => {
    const app = await buildApp();

    // El usuario en DB ya tiene tokenVersion: 1 (debido a un logout previo)
    (prisma.user as any).findUnique = async () => ({
      id: 'revoked-user-id',
      username: 'usuario',
      role: Role.USER,
      tokenVersion: 1,
      isActive: true,
    });

    // Se intenta refrescar con un token antiguo que tiene tokenVersion: 0
    const oldRefreshToken = app.jwt.sign(
      {
        id: 'revoked-user-id',
        username: 'usuario',
        role: Role.USER,
        tokenVersion: 0,
        type: 'refresh',
      },
      { expiresIn: '7d' }
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: {
        refreshToken: oldRefreshToken,
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'SESSION_REVOKED');
  });
});
