import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

const rateLimitPluginCallback: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Priorizar API Client si está autenticado, sino por IP
      const client = (request as unknown as { apiClient?: { id: string } }).apiClient;
      if (client?.id) {
        return client.id;
      }
      return request.ip;
    },
    errorResponseBuilder: (_request, context) => {
      return {
        type: 'https://httpstatuses.com/429',
        title: 'Too Many Requests',
        status: 429,
        detail: `Límite de tasa excedido. Intenta nuevamente en ${context.after}`,
        code: 'RATE_LIMIT_EXCEEDED',
      };
    },
  });
};

export const rateLimitPlugin = fp(rateLimitPluginCallback, {
  name: 'rate-limit-plugin',
});
