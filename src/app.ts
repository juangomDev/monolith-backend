import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import fastifyJwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifyApiReference from '@scalar/fastify-api-reference';
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

  // Generador de especificación OpenAPI 3.1
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Monolito Backend API - Gestor Multimedia',
        description:
          'API REST modular de alto rendimiento para almacenamiento, procesamiento y distribución de imágenes y tablas en PostgreSQL.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Servidor de Desarrollo Local',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Autenticación mediante JWT Bearer Token (Usuarios con rol ADMIN o USER)',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Autenticación mediante X-API-Key (Clientes máquina o integraciones)',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Autenticación, emisión y revocación de sesiones JWT y cookies HttpOnly' },
        { name: 'Users', description: 'Administración de usuarios del sistema (solo ADMIN)' },
        { name: 'Folders', description: 'Organización lógica de archivos, proyectos y privacidad' },
        { name: 'Images', description: 'Ingesta multipart, validación magic bytes y entrega de imágenes' },
        { name: 'Tables', description: 'Procesamiento de datasets CSV/XLSX, consulta paginada y descarga' },
        { name: 'Health', description: 'Comprobación de salud del sistema, PostgreSQL y almacenamiento' },
      ],
    },
  });

  // Interfaz Interactiva de Documentación Scalar en /docs
  await app.register(fastifyApiReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'Monolito Backend API Docs',
      theme: 'purple',
      layout: 'modern',
    },
  });

  // Endpoints para descarga y consumo de la especificación OpenAPI en JSON
  app.get('/docs/json', { schema: { hide: true } }, async (_request, reply) => {
    return reply.status(200).send(app.swagger());
  });

  app.get('/openapi.json', { schema: { hide: true } }, async (_request, reply) => {
    return reply.status(200).send(app.swagger());
  });

  // Registro de rutas (Health, Imágenes, Tablas, Usuarios, Carpetas)
  await registerGatewayRoutes(app);

  return app;
}
