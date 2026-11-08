import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFieldsSchema,
  extractFieldNames,
  validatePayloadAgainstSchema,
  assertCanResolveEntry,
} from '../../../src/modules/forms/forms.validator.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Formularios: Validador de Esquema Dual e Inmutabilidad (Write-Once)', () => {
  const sampleEntrySchema = [
    { name: 'fullName', type: 'string', required: true, label: 'Nombre Completo' },
    { name: 'email', type: 'string', required: true, label: 'Correo' },
    { name: 'age', type: 'number', required: false, label: 'Edad' },
    { name: 'isSubscribed', type: 'boolean', required: false, label: 'Suscrito' },
    { name: 'requestDate', type: 'date', required: false, label: 'Fecha Solicitud' },
  ];

  const sampleResolutionSchema = [
    { name: 'officialResponse', type: 'string', required: true, label: 'Respuesta Oficial' },
    { name: 'resolutionCode', type: 'string', required: true, label: 'Código Dictamen' },
    { name: 'score', type: 'number', required: false, label: 'Puntaje' },
  ];

  it('normalizeFieldsSchema: procesa arreglos y objetos de definición', () => {
    const list = normalizeFieldsSchema(sampleEntrySchema);
    assert.equal(list.length, 5);
    assert.equal(list[0].name, 'fullName');
    assert.equal(list[0].required, true);

    const fromObj = normalizeFieldsSchema({
      nombre: { type: 'string', required: true },
      telefono: { type: 'string', required: false },
    });
    assert.equal(fromObj.length, 2);
    assert.equal(fromObj[0].name, 'nombre');
  });

  it('extractFieldNames: extrae arreglo plano de nombres de columnas', () => {
    const names = extractFieldNames(sampleEntrySchema);
    assert.deepEqual(names, ['fullName', 'email', 'age', 'isSubscribed', 'requestDate']);
  });

  it('validatePayloadAgainstSchema: valida exitosamente payload completo y sanitiza fórmulas', () => {
    const payload = {
      fullName: '=SUM(A1:A10)', // Intento de inyección de fórmula
      email: 'juan@test.com',
      age: 30,
      isSubscribed: true,
      requestDate: '2026-03-01T12:00:00.000Z',
    };

    const validated = validatePayloadAgainstSchema(payload, sampleEntrySchema);
    assert.equal(validated.fullName, "'=SUM(A1:A10)"); // Sanitizado con comilla simple
    assert.equal(validated.email, 'juan@test.com');
    assert.equal(validated.age, 30);
    assert.equal(validated.isSubscribed, true);
    assert.equal(validated.requestDate, '2026-03-01T12:00:00.000Z');
  });

  it('validatePayloadAgainstSchema: lanza 400 MISSING_FIELD ante campo obligatorio faltante', () => {
    const payload = { fullName: 'Pedro' }; // Falta 'email'
    assert.throws(
      () => validatePayloadAgainstSchema(payload, sampleEntrySchema),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'MISSING_FIELD'
    );
  });

  it('validatePayloadAgainstSchema: lanza 400 INVALID_FIELD_TYPE ante tipo erróneo', () => {
    const payload = { fullName: 'Pedro', email: 'p@test.com', age: 'no-es-numero' };
    assert.throws(
      () => validatePayloadAgainstSchema(payload, sampleEntrySchema),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_FIELD_TYPE'
    );
  });

  it('assertCanResolveEntry: permite resolver una entrada en estado NEW', () => {
    const entry = { status: 'NEW', resolvedAt: null };
    const resolutionPayload = { officialResponse: 'Aprobado formalmente', resolutionCode: 'OF-2026-001' };

    const validated = assertCanResolveEntry(
      entry,
      'VALID',
      ['VALID', 'INVALID'],
      resolutionPayload,
      sampleResolutionSchema
    );

    assert.equal(validated.officialResponse, 'Aprobado formalmente');
    assert.equal(validated.resolutionCode, 'OF-2026-001');
  });

  it('assertCanResolveEntry: rechaza con 409 ENTRY_ALREADY_RESOLVED si la entrada ya fue resuelta (Write-Once)', () => {
    const entry = { status: 'VALID', resolvedAt: new Date() };
    const resolutionPayload = { officialResponse: 'Nuevo intento' };

    assert.throws(
      () => assertCanResolveEntry(entry, 'VALID', ['VALID', 'INVALID'], resolutionPayload, sampleResolutionSchema),
      (err: any) => err instanceof AppError && err.status === 409 && err.code === 'ENTRY_ALREADY_RESOLVED'
    );
  });

  it('assertCanResolveEntry: rechaza con 400 INVALID_STATUS ante estado no permitido o intento de volver a NEW', () => {
    const entry = { status: 'NEW', resolvedAt: null };
    const resolutionPayload = { officialResponse: 'OK', resolutionCode: 'C-1' };

    assert.throws(
      () => assertCanResolveEntry(entry, 'PENDING', ['VALID', 'INVALID'], resolutionPayload, sampleResolutionSchema),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_STATUS'
    );

    assert.throws(
      () => assertCanResolveEntry(entry, 'NEW', ['VALID', 'INVALID'], resolutionPayload, sampleResolutionSchema),
      (err: any) => err instanceof AppError && err.status === 400 && err.code === 'INVALID_STATUS'
    );
  });
});

