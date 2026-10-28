import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { usersService } from './users.service.js';
import { authenticateJwt, requireRole } from '../../gateway/auth.js';
import { AppError } from '../../shared/errors.js';

const loginSchema = z.object({
  username: z.string().min(1, 'El nombre de usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const createUserSchema = z.object({
  username: z.string().min(3, 'El nombre de usuario debe tener al menos 3 caracteres'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/login (Público: Genera token JWT)
  fastify.post('/api/v1/auth/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(
        400,
        parseResult.error.issues[0]?.message || 'Datos de login inválidos',
        'BAD_REQUEST',
        parseResult.error.issues.map((e) => ({
          name: e.path.join('.'),
          reason: e.message,
        }))
      );
    }

    const user = await usersService.login(parseResult.data);
    const token = fastify.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return reply.status(200).send({
      token,
      user,
    });
  });

  // POST /api/v1/users (Protegido: Solo ADMIN puede crear nuevos usuarios USER)
  fastify.post(
    '/api/v1/users',
    { preHandler: [authenticateJwt, requireRole([Role.ADMIN])] },
    async (request, reply) => {
      const parseResult = createUserSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          parseResult.error.issues[0]?.message || 'Datos de usuario inválidos',
          'BAD_REQUEST',
          parseResult.error.issues.map((e) => ({
            name: e.path.join('.'),
            reason: e.message,
          }))
        );
      }

      const newUser = await usersService.createUser(request.user.role, parseResult.data);
      return reply.status(201).send({
        user: newUser,
      });
    }
  );
};
