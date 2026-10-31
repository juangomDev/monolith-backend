import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';

describe('Gateway: Documentación Interactiva y OpenAPI (Scalar)', () => {
  it('GET /docs/json: retorna 200 con especificación OpenAPI 3.1 válida y completa', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });

    assert.strictEqual(response.statusCode, 200);
    const spec = JSON.parse(response.body);

    // Verificación de cabeceras y versión OpenAPI
    assert.strictEqual(spec.openapi, '3.1.0');
    assert.strictEqual(spec.info.title, 'Monolito Backend API - Gestor Multimedia');
    assert.strictEqual(spec.info.version, '1.0.0');

    // Verificación de esquemas de seguridad
    assert.ok(spec.components?.securitySchemes?.bearerAuth, 'Debe incluir esquema bearerAuth');
    assert.ok(spec.components?.securitySchemes?.apiKeyAuth, 'Debe incluir esquema apiKeyAuth');

    // Verificación de presencia de rutas críticas
    const paths = Object.keys(spec.paths || {});
    assert.ok(paths.includes('/health'), 'Debe documentar /health');
    assert.ok(paths.includes('/api/v1/auth/login'), 'Debe documentar /api/v1/auth/login');
    assert.ok(paths.includes('/api/v1/auth/refresh'), 'Debe documentar /api/v1/auth/refresh');
    assert.ok(paths.includes('/api/v1/auth/logout'), 'Debe documentar /api/v1/auth/logout');
    assert.ok(paths.includes('/api/v1/users'), 'Debe documentar /api/v1/users');
    assert.ok(paths.includes('/api/v1/folders'), 'Debe documentar /api/v1/folders');
    assert.ok(paths.includes('/api/v1/folders/{id}'), 'Debe documentar /api/v1/folders/{id}');
    assert.ok(paths.includes('/api/v1/images'), 'Debe documentar /api/v1/images');
    assert.ok(paths.includes('/i/{short_code}'), 'Debe documentar /i/{short_code}');
    assert.ok(paths.includes('/api/v1/tables'), 'Debe documentar /api/v1/tables');
    assert.ok(paths.includes('/t/{short_code}'), 'Debe documentar /t/{short_code}');
  });

  it('GET /openapi.json: es accesible como alias estándar de la especificación', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });

    assert.strictEqual(response.statusCode, 200);
    const spec = JSON.parse(response.body);
    assert.strictEqual(spec.openapi, '3.1.0');
    assert.strictEqual(spec.info.title, 'Monolito Backend API - Gestor Multimedia');
  });

  it('GET /docs: responde 200 y sirve la interfaz web de Scalar', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    // En redirecciones automáticas (/docs -> /docs/) o respuesta directa
    assert.ok(
      response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302,
      `Código de estado esperado para UI: ${response.statusCode}`
    );

    // Si responde directamente 200 o tras redirección
    const finalResponse =
      response.statusCode === 200
        ? response
        : await app.inject({
            method: 'GET',
            url: response.headers.location || '/docs/',
          });

    assert.strictEqual(finalResponse.statusCode, 200);
    assert.ok(
      finalResponse.headers['content-type']?.includes('text/html'),
      'Debe servir contenido text/html'
    );
    assert.ok(
      finalResponse.body.includes('scalar') || finalResponse.body.includes('api-reference'),
      'El HTML debe contener los assets de Scalar'
    );
  });
});
