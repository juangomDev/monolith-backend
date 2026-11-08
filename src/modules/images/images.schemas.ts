import type { FastifyRequest, FastifySchema } from 'fastify';
import { z } from 'zod';
import { Role } from '@prisma/client';
import {
  standardErrorResponses,
  securityDualAuth,
} from '../../shared/schemas.js';
import type { RequesterContext } from '../folders/folders.service.js';

export const passValidator = () => () => true;

export const renameImageBodySchema = z.object({
  originalName: z.string().trim().min(1, 'El nombre original es requerido').max(255, 'Máximo 255 caracteres'),
});

export const imageItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    shortCode: { type: 'string', example: 'abc1234567' },
    originalName: { type: 'string', example: 'foto_paisaje.png' },
    mimeType: { type: 'string', example: 'image/png' },
    sizeBytes: { type: 'integer', example: 204850 },
    width: { type: 'integer', nullable: true, example: 1920 },
    height: { type: 'integer', nullable: true, example: 1080 },
    folderId: { type: 'string', format: 'uuid', nullable: true },
    url: { type: 'string', format: 'uri', example: 'http://localhost:3000/i/abc1234567' },
    urlWithVersion: { type: 'string', format: 'uri', example: 'http://localhost:3000/i/abc1234567?v=1730335800000' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shortCode', 'originalName', 'mimeType', 'sizeBytes', 'url'],
};

export const getPublicImageSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Entrega pública de imagen por shortCode (Capability URL)',
  description:
    'Sirve la imagen binaria directamente desde disco con cabeceras de caché inmutable (Cache-Control: public, max-age=31536000, immutable). Admite query ?variant=thumb para recibir una miniatura WebP ultraligera de 320px.',
  params: {
    type: 'object',
    required: ['short_code'],
    properties: {
      short_code: {
        type: 'string',
        minLength: 8,
        maxLength: 14,
        example: 'abc1234567',
        description: 'Código Base58 opaco de 10 caracteres',
      },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      variant: {
        type: 'string',
        enum: ['thumb', 'original'],
        default: 'original',
        description: 'Variante de imagen a servir: thumb (miniatura WebP 320px) u original',
      },
    },
  },
  response: {
    200: {
      description: 'Archivo binario de imagen (original o miniatura WebP)',
      content: {
        'image/*': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
    404: standardErrorResponses[404],
  },
};

export const listImagesRouteSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Listar imágenes registradas',
  description:
    'Retorna el listado paginado de imágenes respetando las reglas de privacidad de las carpetas. Permite filtrar por carpeta con ?folderId=.',
  security: securityDualAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1, description: 'Número de página a consultar' },
      limit: { type: 'integer', default: 50, maximum: 100, description: 'Cantidad de registros por página' },
      folderId: { type: 'string', format: 'uuid', description: 'UUID de carpeta para filtrar' },
      search: { type: 'string', description: 'Buscar por nombre original o shortCode' },
    },
  },
  response: {
    200: {
      description: 'Listado de imágenes obtenido exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: {
        images: {
          type: 'array',
          items: imageItemSchema,
        },
        total: { type: 'integer', example: 1 },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
          },
        },
      },
      required: ['images', 'total'],
    },
    401: standardErrorResponses[401],
  },
};

export const uploadImageRouteSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Subir y procesar nueva imagen',
  description:
    'Ingesta de imagen multipart/form-data. Valida magic bytes (JPEG, PNG, WebP y SVG) e inspecta límites de 50MB. Extrae dimensiones y genera miniatura WebP automática.',
  security: securityDualAuth,
  consumes: ['multipart/form-data'],
  response: {
    201: {
      description: 'Imagen subida y registrada exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: imageItemSchema.properties,
      required: ['id', 'shortCode', 'url', 'originalName', 'mimeType', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

export const renameImageRouteSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Renombrar imagen',
  description: 'Actualiza el nombre original visible de la imagen sin alterar el archivo físico en disco ni el shortCode.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la imagen a renombrar' },
    },
  },
  body: {
    type: 'object',
    required: ['originalName'],
    properties: {
      originalName: { type: 'string', minLength: 1, maxLength: 255, example: 'nuevo_nombre.png' },
    },
  },
  response: {
    200: {
      description: 'Imagen renombrada exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: imageItemSchema.properties,
      required: ['id', 'shortCode', 'originalName', 'mimeType', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export const replaceImageRouteSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Reemplazar archivo binario de imagen (Hot-Swap)',
  description:
    'Sobrescribe el archivo binario físico en disco manteniendo el mismo shortCode y URL pública. Regenera la miniatura WebP y actualiza dimensiones en PostgreSQL.',
  security: securityDualAuth,
  consumes: ['multipart/form-data'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la imagen a actualizar' },
    },
  },
  response: {
    200: {
      description: 'Archivo de imagen reemplazado exitosamente',
      type: 'object',
      additionalProperties: true,
      properties: imageItemSchema.properties,
      required: ['id', 'shortCode', 'originalName', 'mimeType', 'sizeBytes'],
    },
    400: standardErrorResponses[400],
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
    413: standardErrorResponses[413],
    415: standardErrorResponses[415],
  },
};

export const deleteImageRouteSchema: FastifySchema = {
  tags: ['Images'],
  summary: 'Eliminar imagen física y lógicamente',
  description: 'Elimina el registro de la imagen en base de datos PostgreSQL y destruye su archivo binario y miniatura en disco. Requiere ser propietario o ADMIN.',
  security: securityDualAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID de la imagen a eliminar' },
    },
  },
  response: {
    204: {
      description: 'Imagen eliminada exitosamente (sin contenido)',
      type: 'null',
    },
    401: standardErrorResponses[401],
    403: standardErrorResponses[403],
    404: standardErrorResponses[404],
  },
};

export function extractRequester(request: FastifyRequest): RequesterContext {
  if (request.user) {
    return { id: request.user.id, role: request.user.role };
  }

  // Clientes autenticados mediante X-API-Key operan con permisos administrativos
  return {
    id: request.apiClient?.id ?? '00000000-0000-0000-0000-000000000000',
    role: Role.ADMIN,
  };
}
