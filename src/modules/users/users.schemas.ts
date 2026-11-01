import type { FastifySchema } from 'fastify';
import { z } from 'zod';
import { standardErrorResponses, securityBearerAuth } from '../../shared/schemas.js';

export const passValidator = () => () => true;

export const loginSchema = z.object({
  username: z.string().min(1, 'El nombre de usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const createUserSchema = z.object({
  username: z.string().min(3, 'El nombre de usuario debe tener al menos 3 caracteres'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  role: z.enum(['ADMIN', 'MANAGER', 'COLLABORATOR']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean({ message: 'El campo isActive es requerido' }),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

const userSummaryProperties = {
  id: { type: 'string', format: 'uuid' },
  username: { type: 'string' },
  role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'COLLABORATOR'] },
};

const userObjectProperties = {
  ...userSummaryProperties,
  isActive: { type: 'boolean' },
  createdById: { type: 'string', format: 'uuid', nullable: true },
  createdAt: { type: 'string', format: 'date-time' },
};

export const loginRouteSchema: FastifySchema = {
  tags: ['Auth'],
  summary: 'Iniciar sesión y obtener tokens de acceso',
  description: 'Autentica a un usuario mediante username y password. Devuelve un Access Token JWT de 15 minutos y emite una cookie segura HttpOnly con el refreshToken.',
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 1, example: 'admin' },
      password: { type: 'string', minLength: 1, example: 'AdminPass123!' },
    },
  },
  response: {
    200: {
      description: 'Sesión iniciada exitosamente',
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Access Token JWT' },
        user: { type: 'object', properties: userSummaryProperties },
      },
      required: ['token', 'user'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    429: standardErrorResponses[429],
  },
};

export const loginRateLimitConfig = {
  rateLimit: {
    max: 5,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (request: any) => {
      const body = request.body as { username?: string } | undefined;
      const username = body?.username?.trim().toLowerCase();
      return username ? `${request.ip}:${username}` : request.ip;
    },
    errorResponseBuilder: (_request: any, context: any) => ({
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: `Demasiados intentos de inicio de sesión. Intenta nuevamente en ${context.after}`,
      code: 'RATE_LIMIT_EXCEEDED',
    }),
  },
};

export const refreshRouteSchema: FastifySchema = {
  tags: ['Auth'],
  summary: 'Renovar Access Token mediante Refresh Token',
  description: 'Lee el refreshToken desde la cookie segura HttpOnly o cabecera x-refresh-token y genera un nuevo Access Token.',
  response: {
    200: {
      description: 'Token renovado exitosamente',
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Nuevo Access Token JWT' },
        user: { type: 'object', properties: userSummaryProperties },
      },
      required: ['token', 'user'],
    },
    401: standardErrorResponses[401],
  },
};

export const logoutRouteSchema: FastifySchema = {
  tags: ['Auth'],
  summary: 'Cerrar sesión e invalidar tokens',
  description: 'Invalida la sesión incrementando tokenVersion en PostgreSQL y limpia la cookie HttpOnly.',
  security: securityBearerAuth,
  response: {
    200: {
      description: 'Sesión finalizada exitosamente',
      type: 'object',
      properties: { message: { type: 'string', example: 'Sesión cerrada exitosamente' } },
      required: ['message'],
    },
  },
};

export const authMeRouteSchema: FastifySchema = {
  tags: ['Auth'],
  summary: 'Obtener información del usuario autenticado',
  description: 'Retorna los datos de sesión activa del usuario autenticado por Bearer Token.',
  security: securityBearerAuth,
  response: {
    200: {
      description: 'Perfil de usuario',
      type: 'object',
      properties: { user: { type: 'object', properties: userObjectProperties } },
      required: ['user'],
    },
    401: standardErrorResponses[401],
  },
};

export const changePasswordRouteSchema: FastifySchema = {
  tags: ['Auth'],
  summary: 'Cambiar propia contraseña de usuario',
  description: 'Permite al usuario autenticado cambiar su contraseña validando la contraseña actual.',
  security: securityBearerAuth,
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: { type: 'string', minLength: 1 },
      newPassword: { type: 'string', minLength: 6 },
    },
  },
  response: {
    200: {
      description: 'Contraseña actualizada exitosamente',
      type: 'object',
      properties: { message: { type: 'string', example: 'Contraseña actualizada exitosamente' } },
      required: ['message'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
  },
};

export const createUserRouteSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Crear nuevo usuario en el sistema',
  description: 'ADMIN puede crear MANAGER o COLLABORATOR; MANAGER puede crear COLLABORATOR vinculado.',
  security: securityBearerAuth,
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 50, example: 'gestor_juan' },
      password: { type: 'string', minLength: 6, example: 'ContrasenaSegura123' },
      role: { type: 'string', enum: ['MANAGER', 'COLLABORATOR'], default: 'MANAGER' },
    },
  },
  response: {
    201: {
      description: 'Usuario creado exitosamente',
      type: 'object',
      properties: { user: { type: 'object', properties: userObjectProperties } },
      required: ['user'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    409: standardErrorResponses[400],
  },
};

export const listUsersRouteSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Listar usuarios según jerarquía',
  description: 'ADMIN lista todos los usuarios; MANAGER lista sus colaboradores vinculados.',
  security: securityBearerAuth,
  response: {
    200: {
      description: 'Listado de usuarios',
      type: 'object',
      properties: {
        users: { type: 'array', items: { type: 'object', properties: userObjectProperties } },
      },
      required: ['users'],
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
  },
};

export const updateUserStatusRouteSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Activar o suspender usuario',
  description: 'Permite al ADMIN o MANAGER habilitar o deshabilitar una cuenta de usuario.',
  security: securityBearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['isActive'],
    properties: { isActive: { type: 'boolean' } },
  },
  response: {
    200: {
      description: 'Estado actualizado',
      type: 'object',
      properties: { user: { type: 'object', properties: userObjectProperties } },
      required: ['user'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const resetUserPasswordRouteSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Restablecer contraseña de usuario por superior',
  description: 'Permite al ADMIN o MANAGER reasignar la contraseña de un colaborador o usuario.',
  security: securityBearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['newPassword'],
    properties: { newPassword: { type: 'string', minLength: 6 } },
  },
  response: {
    200: {
      description: 'Contraseña restablecida exitosamente',
      type: 'object',
      properties: { message: { type: 'string', example: 'Contraseña restablecida exitosamente' } },
      required: ['message'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const deleteUserRouteSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Eliminar usuario del sistema',
  description: 'ADMIN elimina usuarios; MANAGER elimina sus propios colaboradores vinculados.',
  security: securityBearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      description: 'Usuario eliminado exitosamente',
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};
