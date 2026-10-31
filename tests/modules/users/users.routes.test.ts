import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../src/app.js';
import { prisma } from '../../../src/config/db.js';
import { usersService } from '../../../src/modules/users/users.service.js';
import { Role } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Usuarios: Rutas HTTP (/api/v1/auth y /api/v1/users)', () => {
  const originalUserFindUnique = prisma.user.findUnique;

  afterEach(() => {
    (prisma.user as any).findUnique = originalUserFindUnique;
    mock.reset();
  });

  it('POST /api/v1/auth/login: retorna 400 si el cuerpo no contiene username o password', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  it('POST /api/v1/auth/login: retorna 401 si las credenciales son incorrectas', async () => {
    mock.method(usersService, 'login', async () => {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'desconocido',
        password: 'wrongPassword',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/login: retorna 200 con token JWT y datos de usuario al autenticar con éxito', async () => {
    const mockUserPayload = {
      id: 'admin-uuid-1234',
      username: 'admin',
      role: Role.ADMIN,
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
    assert.ok(body.token, 'Debe devolver un token JWT');
    assert.strictEqual(body.user.id, mockUserPayload.id);
    assert.strictEqual(body.user.username, mockUserPayload.username);
    assert.strictEqual(body.user.role, Role.ADMIN);

    // Verificar que el token sea decodificable
    const decoded = app.jwt.verify(body.token) as any;
    assert.strictEqual(decoded.id, mockUserPayload.id);
    assert.strictEqual(decoded.role, Role.ADMIN);
  });

  it('POST /api/v1/auth/login: bloquea con 429 tras exceder el límite de 5 intentos por minuto', async () => {
    mock.method(usersService, 'login', async () => {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    });

    const app = await buildApp();
    const payload = { username: 'attacker_test', password: 'wrongPassword' };

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload,
      });
      assert.strictEqual(res.statusCode, 401);
    }

    // El 6º intento debe ser bloqueado con 429
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload,
    });
    assert.strictEqual(blockedRes.statusCode, 429);
    const body = JSON.parse(blockedRes.body);
    assert.strictEqual(body.code, 'RATE_LIMIT_EXCEEDED');
  });

  it('POST /api/v1/users: retorna 401 si no se envía cabecera Authorization Bearer', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        username: 'nuevo_usuario',
        password: 'password123',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/users: retorna 401 con token inválido', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: 'Bearer token_completamente_invalido',
      },
      payload: {
        username: 'nuevo_usuario',
        password: 'password123',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/users: retorna 403 si el usuario autenticado tiene rol USER', async () => {
    const app = await buildApp();
    const userToken = app.jwt.sign({
      id: 'regular-user-id',
      username: 'analista1',
      role: Role.USER,
    });

    (prisma.user as any).findUnique = async () => ({
      id: 'regular-user-id',
      username: 'analista1',
      role: Role.USER,
      isActive: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: `Bearer ${userToken}`,
      },
      payload: {
        username: 'otro_usuario',
        password: 'password123',
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'FORBIDDEN');
  });

  it('POST /api/v1/users: retorna 400 si se intenta crear otro usuario con rol ADMIN', async () => {
    const app = await buildApp();
    const adminToken = app.jwt.sign({
      id: 'admin-id',
      username: 'admin',
      role: Role.ADMIN,
    });

    (prisma.user as any).findUnique = async () => ({
      id: 'admin-id',
      username: 'admin',
      role: Role.ADMIN,
      isActive: true,
    });

    mock.method(usersService, 'createUser', async () => {
      throw new AppError(
        400,
        'No está permitido crear administradores adicionales. Solo existe un único ADMIN en el sistema.',
        'ADMIN_CREATION_FORBIDDEN'
      );
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        username: 'segundo_admin',
        password: 'password123',
        role: 'ADMIN',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'ADMIN_CREATION_FORBIDDEN');
  });

  it('POST /api/v1/users: retorna 201 y crea usuario USER cuando es ejecutado por ADMIN', async () => {
    const app = await buildApp();
    const adminToken = app.jwt.sign({
      id: 'admin-id',
      username: 'admin',
      role: Role.ADMIN,
    });

    (prisma.user as any).findUnique = async () => ({
      id: 'admin-id',
      username: 'admin',
      role: Role.ADMIN,
      isActive: true,
    });

    const createdUserMock = {
      id: 'nuevo-user-uuid',
      username: 'operador_dokploy',
      role: Role.USER,
      isActive: true,
      createdAt: new Date(),
    };

    mock.method(usersService, 'createUser', async () => createdUserMock);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        username: 'operador_dokploy',
        password: 'passwordSeguro123!',
      },
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.user.id, createdUserMock.id);
    assert.strictEqual(body.user.username, createdUserMock.username);
    assert.strictEqual(body.user.role, Role.USER);
  });
});
