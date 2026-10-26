import type { FastifyPluginAsync } from 'fastify';
import { tablesService } from './tables.service.js';

export const tablesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /t/:short_code (Consulta paginada o descarga directa)
  fastify.get('/t/:short_code', async (request, reply) => {
    const { short_code } = request.params as { short_code: string };
    const table = await tablesService.getTableByShortCode(short_code);

    return reply.send({
      id: table.id,
      shortCode: table.shortCode,
      tableName: table.tableName,
      rowCount: table.rowCount,
      columns: table.columnsSchema,
    });
  });

  // POST /api/v1/tables
  fastify.post('/api/v1/tables', async (_request, reply) => {
    return reply.status(501).send({ message: 'Endpoint pendiente de implementación en Fase 3' });
  });

  // DELETE /api/v1/tables/:id
  fastify.delete('/api/v1/tables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await tablesService.deleteTable(id);
    return reply.status(204).send();
  });
};
