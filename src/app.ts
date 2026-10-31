import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import fastifyJwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { loggerConfig } from './shared/logger.js';
import { registerGatewayRoutes } from './gateway/router.js';
import { AppError } from './shared/errors.js';
import { rateLimitPlugin } from './gateway/rate-limit.plugin.js';
import { corsOriginValidator } from './gateway/cors.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    connectionTimeout: 10000, // 10s Anti-Slowloris
    requestTimeout: 30000,    // 30s
    requestIdHeader: 'x-request-id',
  });

  // Blindaje de cabeceras HTTP de seguridad (Helmet)
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // Gestión de cookies seguras (HttpOnly, SameSite)
  await app.register(cookie, {
    secret: env.JWT_SECRET,
  });

  // Autenticación con JWT
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: '7d',
    },
  });

  // Plugins de utilidad del ecosistema Fastify
  await app.register(sensible);
  await app.register(cors, {
    origin: corsOriginValidator,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Rate Limiting anti-DDoS y saturación global
  await app.register(rateLimitPlugin);

  // Streaming de subidas de archivos (límite 50MB)
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
    },
  });

  // Manejador Global de Errores RFC 7807
  app.setErrorHandler((error: Error & { statusCode?: number; status?: number; code?: string; validation?: unknown; detail?: string; title?: string; type?: string }, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError || error.name === 'AppError') {
      const appErr =
        error instanceof AppError
          ? error
          : new AppError(
              error.status || error.statusCode || 500,
              error.message || error.detail || 'Error',
              error.code,
              (error as any).invalidParams
            );
      return reply.status(appErr.status).send(appErr.toProblemDetails(request.url));
    }

    if (error.status && error.code && error.detail) {
      return reply.status(error.status).send({
        type: error.type || `https://httpstatuses.com/${error.status}`,
        title: error.title || 'Error',
        status: error.status,
        detail: error.detail,
        code: error.code,
        instance: request.url,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        type: 'https://httpstatuses.com/400',
        title: 'Bad Request',
        status: 400,
        detail: error.message,
        code: 'VALIDATION_ERROR',
        instance: request.url,
      });
    }

    const statusCode = error.statusCode || error.status || 500;
    return reply.status(statusCode).send({
      type: `https://httpstatuses.com/${statusCode}`,
      title: statusCode === 500 ? 'Internal Server Error' : (error.title || error.name),
      status: statusCode,
      detail: statusCode === 500 ? 'Ha ocurrido un error inesperado en el servidor' : (error.detail || error.message),
      code: error.code || 'INTERNAL_ERROR',
      instance: request.url,
    });
  });

  // Registro de rutas (Health, Imágenes, Tablas, Usuarios)
  await registerGatewayRoutes(app);

  return app;
}
