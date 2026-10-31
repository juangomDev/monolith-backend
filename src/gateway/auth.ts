import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors.js';
import { Role, type ApiClient } from '@prisma/client';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      username: string;
      role: Role;
      tokenVersion?: number;
      type?: string;
    };
    user: {
      id: string;
      username: string;
      role: Role;
      tokenVersion?: number;
      type?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    apiClient?: ApiClient;
  }
}

export function hashApiKey(key: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(key).digest('hex');
}

/**
 * Hook preHandler para proteger rutas que requieren API Key
 */
export async function authenticateApiKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers['x-api-key'] as string | undefined;

  if (!authHeader) {
    throw new AppError(401, 'Cabecera X-API-Key requerida', 'UNAUTHORIZED');
  }

  const keyHash = hashApiKey(authHeader, env.API_KEY_PEPPER);
  const client = await prisma.apiClient.findUnique({
    where: { keyHash },
  });

  if (!client || !client.isActive) {
    throw new AppError(401, 'API Key inválida o inactiva', 'UNAUTHORIZED');
  }

  request.apiClient = client;
}

/**
 * Hook preHandler para proteger rutas que requieren autenticación por JWT Bearer Token
 */
export async function authenticateJwt(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'Cabecera Authorization: Bearer <token> requerida', 'UNAUTHORIZED');
  }

  try {
    await request.jwtVerify();
  } catch (err) {
    throw new AppError(401, 'Token JWT inválido, expirado o malformado', 'UNAUTHORIZED');
  }

  // Verificar que el usuario continúe activo en base de datos
  const user = await prisma.user.findUnique({
    where: { id: request.user.id },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'Usuario no encontrado o inactivo', 'UNAUTHORIZED');
  }

  // Verificar tokenVersion para revocación inmediata de sesión
  const userVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
  if (request.user.tokenVersion !== undefined && request.user.tokenVersion !== userVersion) {
    throw new AppError(401, 'Sesión revocada o cerrada', 'SESSION_REVOKED');
  }
}

/**
 * Generador de hook para restringir acceso según el rol del usuario autenticado
 */
export function requireRole(allowedRoles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      throw new AppError(403, 'Acceso denegado: rol insuficiente para esta operación', 'FORBIDDEN');
    }
  };
}

/**
 * Portero Dual: Admite autenticación mediante Bearer JWT (usuarios) o X-API-Key (clientes máquina).
 * Permite mantener la retrocompatibilidad y satisfacer la inmutabilidad de los contratos de prueba existentes.
 */
export async function authenticateUserOrApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJwt(request, reply);
  }

  if (apiKeyHeader) {
    return authenticateApiKey(request, reply);
  }

  throw new AppError(
    401,
    'Cabecera de autenticación requerida (Authorization: Bearer <token> o X-API-Key)',
    'UNAUTHORIZED'
  );
}
