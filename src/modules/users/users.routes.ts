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
  // POST /api/v1/auth/login (Público: Genera token JWT con protección anti-fuerza bruta)
  fastify.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request) => {
            const body = request.body as { username?: string } | undefined;
            const username = body?.username?.trim().toLowerCase();
            return username ? `${request.ip}:${username}` : request.ip;
          },
          errorResponseBuilder: (_request, context) => ({
            type: 'https://httpstatuses.com/429',
            title: 'Too Many Requests',
            status: 429,
            detail: `Demasiados intentos de inicio de sesión. Intenta nuevamente en ${context.after}`,
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        },
      },
    },
    async (request, reply) => {
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
    const tokenVersion = user.tokenVersion ?? 0;

    const token = fastify.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      tokenVersion,
    });

    // Refresh Token de 7 días colocado en cookie HttpOnly
    const refreshToken = fastify.jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        tokenVersion,
        type: 'refresh',
      },
      {
        expiresIn: '7d',
      }
    );

    reply.setCookie('refreshToken', refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(200).send({
      token,
      user,
    });
  });

  // POST /api/v1/auth/refresh (Emite un nuevo Access Token leyendo la cookie HttpOnly o header)
  fastify.post('/api/v1/auth/refresh', async (request, reply) => {
    const rawRefreshToken =
      request.cookies?.refreshToken ||
      (request.headers['x-refresh-token'] as string | undefined);

    if (!rawRefreshToken) {
      throw new AppError(401, 'Refresh token no proporcionado en cookies o cabeceras', 'UNAUTHORIZED');
    }

    let decoded: { id: string; username: string; role: Role; tokenVersion?: number; type?: string };
    try {
      decoded = fastify.jwt.verify(rawRefreshToken);
    } catch {
      throw new AppError(401, 'Refresh token inválido, expirado o malformado', 'UNAUTHORIZED');
    }

    if (decoded.type !== 'refresh') {
      throw new AppError(401, 'Tipo de token no válido para refresco', 'UNAUTHORIZED');
    }

    const user = await usersService.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new AppError(401, 'Usuario no encontrado o inactivo', 'UNAUTHORIZED');
    }

    const userVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== userVersion) {
      throw new AppError(401, 'Sesión revocada o cerrada', 'SESSION_REVOKED');
    }

    // Emitir nuevo Access Token
    const token = fastify.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: userVersion,
    });

    return reply.status(200).send({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  // POST /api/v1/auth/logout (Invalida la sesión actual en DB y destruye la cookie)
  fastify.post('/api/v1/auth/logout', async (request, reply) => {
    let userId: string | undefined;

    // 1. Extraer usuario del Access Token si se envió Authorization Bearer
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        userId = request.user.id;
      } catch {
        // Token expirado o malformado; continuar intentando con refreshToken
      }
    }

    // 2. Extraer usuario del Refresh Token si aún no se determinó
    if (!userId) {
      const refreshToken = request.cookies?.refreshToken;
      if (refreshToken) {
        try {
          const decoded = fastify.jwt.verify<{ id: string }>(refreshToken);
          userId = decoded.id;
        } catch {
          // Token de refresco inválido
        }
      }
    }

    if (userId) {
      // Incrementar tokenVersion en PostgreSQL para revocar inmediatamente cualquier token previo
      await usersService.logout(userId);
    }

    // Limpiar físicamente la cookie de refresco en el navegador
    reply.clearCookie('refreshToken', {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return reply.status(200).send({
      message: 'Sesión cerrada exitosamente',
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
