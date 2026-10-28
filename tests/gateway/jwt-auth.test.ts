import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import { Role } from '@prisma/client';
import { authenticateJwt, requireRole } from '../../src/gateway/auth.js';
import { AppError } from '../../src/shared/errors.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Gateway: Autenticación JWT y Control de Acceso por Roles', () => {
  const originalUserFindUnique = prisma.user.findUnique;

  afterEach(() => {
    (prisma.user as any).findUnique = originalUserFindUnique;
  });

  it('authenticateJwt: lanza 401 si falta la cabecera Authorization Bearer', async () => {
    const fakeRequest = {
      headers: {},
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    await assert.rejects(
      async () => {
        await authenticateJwt(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('authenticateJwt: lanza 401 si el usuario asociado al token no existe o está inactivo', async () => {
    const fakeRequest = {
      headers: {
        authorization: 'Bearer valid_looking_token',
      },
      jwtVerify: async () => {},
      user: { id: 'user-inactivo-id', username: 'inactivo', role: Role.USER },
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    (prisma.user as any).findUnique = async () => null;

    await assert.rejects(
      async () => {
        await authenticateJwt(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('requireRole: permite acceso si el rol del usuario está en la lista permitida', async () => {
    const guard = requireRole([Role.ADMIN]);
    const fakeRequest = {
      user: { id: 'admin-1', username: 'admin', role: Role.ADMIN },
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    // No debe lanzar excepción
    await guard(fakeRequest, fakeReply);
  });

  it('requireRole: lanza 403 FORBIDDEN si el rol del usuario no está permitido', async () => {
    const guard = requireRole([Role.ADMIN]);
    const fakeRequest = {
      user: { id: 'user-1', username: 'user', role: Role.USER },
    } as unknown as FastifyRequest;
    const fakeReply = {} as FastifyReply;

    await assert.rejects(
      async () => {
        await guard(fakeRequest, fakeReply);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('Integración: POST /api/v1/images acepta usuario autenticado con Bearer JWT', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({
      id: 'uploader-id',
      username: 'usuario_subida',
      role: Role.USER,
    });

    (prisma.user as any).findUnique = async () => ({
      id: 'uploader-id',
      username: 'usuario_subida',
      role: Role.USER,
      isActive: true,
    });

    // Debe pasar la autenticación (retorna 400 por falta de archivo multipart en vez de 401)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/images',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  it('Integración: POST /api/v1/tables acepta usuario autenticado con Bearer JWT', async () => {
    const app = await buildApp();
    const token = app.jwt.sign({
      id: 'analista-id',
      username: 'analista_tablas',
      role: Role.USER,
    });

    (prisma.user as any).findUnique = async () => ({
      id: 'analista-id',
      username: 'analista_tablas',
      role: Role.USER,
      isActive: true,
    });

    // Pasa autenticación y valida que no hay archivo
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tables',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });
});
