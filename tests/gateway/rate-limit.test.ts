import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { usersService } from '../../src/modules/users/users.service.js';
import { prisma } from '../../src/config/db.js';
import { AppError } from '../../src/shared/errors.js';
import fs from 'node:fs/promises';

describe('Gateway: Rate Limiting y Protección Anti-Fuerza Bruta', () => {
  const originalQueryRaw = prisma.$queryRaw;

  afterEach(() => {
    (prisma as any).$queryRaw = originalQueryRaw;
    mock.reset();
  });

  it('debe incluir cabeceras estándar de rate-limit en respuestas HTTP', async () => {
    (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
    mock.method(fs, 'access', async () => undefined);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.headers['x-ratelimit-limit'], 'Debe contener cabecera x-ratelimit-limit');
    assert.ok(response.headers['x-ratelimit-remaining'] !== undefined, 'Debe contener cabecera x-ratelimit-remaining');
  });

  it('POST /api/v1/auth/login: debe permitir hasta 5 intentos y bloquear el 6to con 429 RFC 7807', async () => {
    mock.method(usersService, 'login', async () => {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    });

    const app = await buildApp();
    const targetUser = `brute_victim_${Date.now()}`;

    // Ejecutar 5 intentos (todos deben retornar 401 por credenciales incorrectas, no 429)
    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: targetUser,
          password: `wrong_pass_${i}`,
        },
      });

      assert.strictEqual(
        res.statusCode,
        401,
        `El intento #${i} debería procesarse y retornar 401, no 429`
      );
    }

    // El 6to intento consecutivo debe ser bloqueado por Rate Limiting
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: targetUser,
        password: 'another_wrong_password',
      },
    });

    assert.strictEqual(blockedRes.statusCode, 429, 'El 6to intento debe ser bloqueado con 429 Too Many Requests');

    const body = JSON.parse(blockedRes.body);
    assert.strictEqual(body.status, 429);
    assert.strictEqual(body.code, 'RATE_LIMIT_EXCEEDED');
    assert.strictEqual(body.title, 'Too Many Requests');
    assert.ok(
      body.detail.includes('Demasiados intentos de inicio de sesión'),
      `El mensaje de detalle debe alertar sobre intentos de inicio de sesión excedidos. Obtenido: ${body.detail}`
    );
  });

  it('POST /api/v1/auth/login: no debe bloquear a un usuario distinto tras agotar el cupo de otro', async () => {
    mock.method(usersService, 'login', async () => {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    });

    const app = await buildApp();
    const victimUser = `victim_${Date.now()}`;
    const cleanUser = `innocent_${Date.now()}`;

    // Agotar los 5 intentos de la víctima
    for (let i = 1; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: victimUser,
          password: `wrong_pass_${i}`,
        },
      });
    }

    // La víctima está bloqueada
    const victimBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: victimUser,
        password: 'wrong_password',
      },
    });
    assert.strictEqual(victimBlocked.statusCode, 429);

    // Un usuario diferente con credenciales incompletas recibe 400 (no 429)
    const cleanRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: cleanUser,
        password: '',
      },
    });

    assert.strictEqual(cleanRes.statusCode, 400, 'El usuario no bloqueado no debe verse afectado por el bloqueo de otro');
    const cleanBody = JSON.parse(cleanRes.body);
    assert.strictEqual(cleanBody.code, 'BAD_REQUEST');
  });
});
