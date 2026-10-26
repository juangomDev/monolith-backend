import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/shared/errors.js';

describe('Shared: AppError y ProblemDetails (RFC 7807)', () => {
  it('debe instanciarse correctamente con las propiedades esperadas', () => {
    const error = new AppError(404, 'Recurso no encontrado', 'NOT_FOUND');

    assert.ok(error instanceof Error);
    assert.ok(error instanceof AppError);
    assert.strictEqual(error.name, 'AppError');
    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.message, 'Recurso no encontrado');
    assert.strictEqual(error.detail, 'Recurso no encontrado');
    assert.strictEqual(error.code, 'NOT_FOUND');
  });

  it('debe usar INTERNAL_ERROR como código por defecto si no se especifica', () => {
    const error = new AppError(500, 'Error del servidor');
    assert.strictEqual(error.code, 'INTERNAL_ERROR');
  });

  it('toProblemDetails: debe formatear según RFC 7807', () => {
    const error = new AppError(401, 'No autorizado', 'UNAUTHORIZED');
    const details = error.toProblemDetails('/api/v1/images');

    assert.strictEqual(details.type, 'https://httpstatuses.com/401');
    assert.strictEqual(details.title, 'AppError');
    assert.strictEqual(details.status, 401);
    assert.strictEqual(details.detail, 'No autorizado');
    assert.strictEqual(details.code, 'UNAUTHORIZED');
    assert.strictEqual(details.instance, '/api/v1/images');
  });

  it('debe admitir invalidParams opcionales para errores de validación', () => {
    const params = [{ name: 'file', reason: 'Debe ser imagen' }];
    const error = new AppError(422, 'Entrada inválida', 'VALIDATION_ERROR', params);
    const details = error.toProblemDetails();

    assert.deepStrictEqual(details.invalidParams, params);
  });
});
