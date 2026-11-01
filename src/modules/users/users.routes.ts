import type { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { usersService } from './users.service.js';
import { authenticateJwt, requireRole } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  passValidator,
  loginSchema,
  createUserSchema,
  changePasswordSchema,
  updateUserStatusSchema,
  resetUserPasswordSchema,
  loginRouteSchema,
  loginRateLimitConfig,
  refreshRouteSchema,
  logoutRouteSchema,
  authMeRouteSchema,
  changePasswordRouteSchema,
  createUserRouteSchema,
  listUsersRouteSchema,
  updateUserStatusRouteSchema,
  resetUserPasswordRouteSchema,
  deleteUserRouteSchema,
} from './users.schemas.js';

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/login
  fastify.post(
    '/api/v1/auth/login',
    { validatorCompiler: passValidator, schema: loginRouteSchema, config: loginRateLimitConfig },
    async (request, reply) => {
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(400, parseResult.error.issues[0]?.message || 'Datos de login inválidos', 'BAD_REQUEST');
      }

      const user = await usersService.login(parseResult.data);
      const tokenVersion = user.tokenVersion ?? 0;

      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role, tokenVersion });
      const refreshToken = fastify.jwt.sign(
        { id: user.id, username: user.username, role: user.role, tokenVersion, type: 'refresh' },
        { expiresIn: '7d' }
      );

      reply.setCookie('refreshToken', refreshToken, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.status(200).send({ token, user });
    }
  );

  // POST /api/v1/auth/refresh
  fastify.post('/api/v1/auth/refresh', { schema: refreshRouteSchema }, async (request, reply) => {
    const rawRefreshToken = request.cookies?.refreshToken || (request.headers['x-refresh-token'] as string | undefined);
    if (!rawRefreshToken) throw new AppError(401, 'Refresh token no proporcionado', 'UNAUTHORIZED');

    let decoded: { id: string; username: string; role: Role; tokenVersion?: number; type?: string };
    try {
      decoded = fastify.jwt.verify(rawRefreshToken);
    } catch {
      throw new AppError(401, 'Refresh token inválido o expirado', 'UNAUTHORIZED');
    }

    if (decoded.type !== 'refresh') throw new AppError(401, 'Tipo de token no válido para refresco', 'UNAUTHORIZED');

    const user = await usersService.findById(decoded.id);
    if (!user || !user.isActive) throw new AppError(401, 'Usuario no encontrado o inactivo', 'UNAUTHORIZED');

    const userVersion = user.tokenVersion ?? 0;
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== userVersion) {
      throw new AppError(401, 'Sesión revocada o cerrada', 'SESSION_REVOKED');
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role, tokenVersion: userVersion });
    return reply.status(200).send({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/api/v1/auth/logout', { schema: logoutRouteSchema }, async (request, reply) => {
    let userId: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        userId = request.user.id;
      } catch {}
    }
    if (!userId && request.cookies?.refreshToken) {
      try {
        const decoded = fastify.jwt.verify<{ id: string }>(request.cookies.refreshToken);
        userId = decoded.id;
      } catch {}
    }

    if (userId) await usersService.logout(userId);
    reply.clearCookie('refreshToken', {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return reply.status(200).send({ message: 'Sesión cerrada exitosamente' });
  });

  // GET /api/v1/auth/me (Perfil activo)
  fastify.get('/api/v1/auth/me', { preHandler: [authenticateJwt], schema: authMeRouteSchema }, async (request, reply) => {
    const user = await usersService.getProfile(request.user.id);
    return reply.status(200).send({ user });
  });

  // PATCH /api/v1/auth/password (Cambio de contraseña propio)
  fastify.patch(
    '/api/v1/auth/password',
    { validatorCompiler: passValidator, preHandler: [authenticateJwt], schema: changePasswordRouteSchema },
    async (request, reply) => {
      const parseResult = changePasswordSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(400, parseResult.error.issues[0]?.message || 'Datos inválidos', 'BAD_REQUEST');
      }
      await usersService.changePassword(request.user.id, parseResult.data.currentPassword, parseResult.data.newPassword);
      return reply.status(200).send({ message: 'Contraseña actualizada exitosamente' });
    }
  );

  // POST /api/v1/users (Creación jerárquica)
  fastify.post(
    '/api/v1/users',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateJwt, requireRole([Role.ADMIN, Role.MANAGER])],
      schema: createUserRouteSchema,
    },
    async (request, reply) => {
      const parseResult = createUserSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(400, parseResult.error.issues[0]?.message || 'Datos de usuario inválidos', 'BAD_REQUEST');
      }
      const newUser = await usersService.createUser(request.user, parseResult.data);
      return reply.status(201).send({ user: newUser });
    }
  );

  // GET /api/v1/users (Listado jerárquico)
  fastify.get(
    '/api/v1/users',
    { preHandler: [authenticateJwt, requireRole([Role.ADMIN, Role.MANAGER])], schema: listUsersRouteSchema },
    async (request, reply) => {
      const users = await usersService.listUsers(request.user);
      return reply.status(200).send({ users });
    }
  );

  // PATCH /api/v1/users/:id/status (Activar / suspender)
  fastify.patch(
    '/api/v1/users/:id/status',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateJwt, requireRole([Role.ADMIN, Role.MANAGER])],
      schema: updateUserStatusRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateUserStatusSchema.safeParse(request.body);
      if (!parseResult.success) throw new AppError(400, 'Campo isActive requerido y booleano', 'BAD_REQUEST');

      const updated = await usersService.updateUserStatus(request.user, id, parseResult.data.isActive);
      return reply.status(200).send({ user: updated });
    }
  );

  // PATCH /api/v1/users/:id/password (Resetear contraseña)
  fastify.patch(
    '/api/v1/users/:id/password',
    {
      validatorCompiler: passValidator,
      preHandler: [authenticateJwt, requireRole([Role.ADMIN, Role.MANAGER])],
      schema: resetUserPasswordRouteSchema,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = resetUserPasswordSchema.safeParse(request.body);
      if (!parseResult.success) throw new AppError(400, parseResult.error.issues[0]?.message || 'Contraseña inválida', 'BAD_REQUEST');

      await usersService.resetUserPassword(request.user, id, parseResult.data.newPassword);
      return reply.status(200).send({ message: 'Contraseña restablecida exitosamente' });
    }
  );

  // DELETE /api/v1/users/:id (Eliminar usuario)
  fastify.delete(
    '/api/v1/users/:id',
    { preHandler: [authenticateJwt, requireRole([Role.ADMIN, Role.MANAGER])], schema: deleteUserRouteSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await usersService.deleteUser(request.user, id);
      return reply.status(200).send(result);
    }
  );
};
