/**
 * Esquemas compartidos OpenAPI / JSON Schema para respuestas RFC 7807 (ProblemDetails)
 * y definición unificada de contratos para Fastify Swagger.
 */

export const problemDetailsSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri', example: 'https://httpstatuses.com/400' },
    title: { type: 'string', example: 'Bad Request' },
    status: { type: 'integer', example: 400 },
    detail: { type: 'string', example: 'Parámetros de entrada inválidos' },
    code: { type: 'string', example: 'BAD_REQUEST' },
    instance: { type: 'string', example: '/api/v1/auth/login' },
    invalidParams: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'username' },
          reason: { type: 'string', example: 'Debe tener al menos 3 caracteres' },
        },
        required: ['name', 'reason'],
      },
    },
  },
  required: ['type', 'title', 'status', 'detail', 'code'],
};

export function createErrorResponse(statusCode: number, description: string, defaultCode: string) {
  return {
    description,
    type: 'object',
    properties: {
      type: { type: 'string', example: `https://httpstatuses.com/${statusCode}` },
      title: { type: 'string', example: description },
      status: { type: 'integer', example: statusCode },
      detail: { type: 'string', example: description },
      code: { type: 'string', example: defaultCode },
      instance: { type: 'string', example: '/api/v1/resource' },
      invalidParams: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['name', 'reason'],
        },
      },
    },
    required: ['type', 'title', 'status', 'detail', 'code'],
  };
}

export const standardErrorResponses = {
  400: createErrorResponse(400, 'Petición inválida o validación fallida', 'BAD_REQUEST'),
  401: createErrorResponse(401, 'No autenticado o token/API Key inválido o revocado', 'UNAUTHORIZED'),
  403: createErrorResponse(403, 'Acceso prohibido o permisos insuficientes', 'FORBIDDEN'),
  404: createErrorResponse(404, 'Recurso no encontrado', 'NOT_FOUND'),
  413: createErrorResponse(413, 'Carga útil excede el tamaño límite permitido (50MB)', 'PAYLOAD_TOO_LARGE'),
  415: createErrorResponse(415, 'Tipo de medio no soportado o magic bytes falsificados', 'UNSUPPORTED_MEDIA_TYPE'),
  429: createErrorResponse(429, 'Demasiadas solicitudes (Rate Limit o protección anti-fuerza bruta)', 'RATE_LIMIT_EXCEEDED'),
};

export const securityBearerAuth: ReadonlyArray<{ [securityLabel: string]: readonly string[] }> = [
  { bearerAuth: [] },
];

export const securityDualAuth: ReadonlyArray<{ [securityLabel: string]: readonly string[] }> = [
  { bearerAuth: [] },
  { apiKeyAuth: [] },
];
