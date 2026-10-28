import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import fastifyJwt from '@fastify/jwt';
import { env } from './config/env.js';
import { loggerConfig } from './shared/logger.js';
import { registerGatewayRoutes } from './gateway/router.js';
import { AppError } from './shared/errors.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    connectionTimeout: 10000, // 10s Anti-Slowloris
    requestTimeout: 30000,    // 30s
    requestIdHeader: 'x-request-id',
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
    origin: true,
    credentials: true,
  });

  // Streaming de subidas de archivos (límite 50MB)
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
    },
  });

  // Registro de rutas (Health, Imágenes, Tablas)
  await registerGatewayRoutes(app);

  // Manejador Global de Errores RFC 7807
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; validation?: unknown }, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.status).send(error.toProblemDetails(request.url));
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

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      type: `https://httpstatuses.com/${statusCode}`,
      title: statusCode === 500 ? 'Internal Server Error' : error.name,
      status: statusCode,
      detail: statusCode === 500 ? 'Ha ocurrido un error inesperado en el servidor' : error.message,
      code: error.code || 'INTERNAL_ERROR',
      instance: request.url,
    });
  });

  return app;
}
