import type { FastifyServerOptions } from 'fastify';

export const loggerConfig: FastifyServerOptions['logger'] = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        path: request.routeOptions?.url || request.url,
        parameters: request.params,
        headers: {
          host: request.headers.host,
          'user-agent': request.headers['user-agent'],
          'x-request-id': request.headers['x-request-id'],
          'idempotency-key': request.headers['idempotency-key'],
        },
      };
    },
  },
};
