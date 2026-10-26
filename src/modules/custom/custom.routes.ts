import type { FastifyPluginAsync } from 'fastify';
import { actionRegistry, isActionAllowed } from './registry.js';
import { AppError } from '../../shared/errors.js';

export const customRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:action', async (request, reply) => {
    const { action } = request.params as { action: string };

    if (!isActionAllowed(action)) {
      throw new AppError(404, `Acción '${action}' no permitida o no registrada`, 'ACTION_NOT_FOUND');
    }

    const actionDef = actionRegistry[action];
    const parseResult = actionDef.schema.safeParse(request.body);

    if (!parseResult.success) {
      throw new AppError(
        422,
        'Cuerpo de la petición inválido para la acción',
        'UNPROCESSABLE_ENTITY',
        parseResult.error.issues.map((e) => ({
          name: e.path.join('.'),
          reason: e.message,
        }))
      );
    }

    const startTime = Date.now();
    const result = await actionDef.handler(parseResult.data);
    const durationMs = Date.now() - startTime;

    return reply.status(200).send({
      status: 'COMPLETED',
      durationMs,
      result,
    });
  });
};
