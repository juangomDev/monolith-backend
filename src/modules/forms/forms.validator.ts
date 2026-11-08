import { AppError } from '../../shared/errors.js';
import { sanitizeFormulaCell } from '../tables/tables.parser.js';

export interface FieldDefinition {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
  label?: string;
  options?: string[];
}

export type FieldsSchema = FieldDefinition[] | Record<string, { type?: string; required?: boolean; options?: string[] }>;

export function normalizeFieldsSchema(schema: any): FieldDefinition[] {
  if (!schema) return [];
  if (Array.isArray(schema)) {
    return schema.map((field) => ({
      name: String(field.name || '').trim(),
      type: field.type || 'string',
      required: Boolean(field.required),
      label: field.label,
      options: Array.isArray(field.options) ? field.options : undefined,
    })).filter((f) => f.name.length > 0);
  }
  if (typeof schema === 'object') {
    return Object.entries(schema).map(([name, conf]: [string, any]) => ({
      name: name.trim(),
      type: conf?.type || 'string',
      required: Boolean(conf?.required),
      label: conf?.label,
      options: Array.isArray(conf?.options) ? conf.options : undefined,
    })).filter((f) => f.name.length > 0);
  }
  return [];
}

export function extractFieldNames(schema: any): string[] {
  return normalizeFieldsSchema(schema).map((f) => f.name);
}

export function validatePayloadAgainstSchema(
  payload: any,
  schema: any,
  payloadName: string = 'entryPayload'
): Record<string, any> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(400, `El ${payloadName} debe ser un objeto JSON válido`, 'INVALID_PAYLOAD');
  }

  const fields = normalizeFieldsSchema(schema);
  const sanitized: Record<string, any> = {};

  for (const field of fields) {
    const val = payload[field.name];

    if (val === undefined || val === null || val === '') {
      if (field.required) {
        throw new AppError(400, `Campo obligatorio faltante: '${field.name}' en ${payloadName}`, 'MISSING_FIELD');
      }
      sanitized[field.name] = null;
      continue;
    }

    if (field.type === 'number') {
      const num = Number(val);
      if (isNaN(num)) {
        throw new AppError(400, `El campo '${field.name}' debe ser numérico`, 'INVALID_FIELD_TYPE');
      }
      sanitized[field.name] = num;
    } else if (field.type === 'boolean') {
      if (typeof val !== 'boolean') {
        throw new AppError(400, `El campo '${field.name}' debe ser booleano`, 'INVALID_FIELD_TYPE');
      }
      sanitized[field.name] = val;
    } else if (field.type === 'date') {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        throw new AppError(400, `El campo '${field.name}' debe ser una fecha válida`, 'INVALID_FIELD_TYPE');
      }
      sanitized[field.name] = date.toISOString();
    } else {
      sanitized[field.name] = sanitizeFormulaCell(val);
    }
  }

  return sanitized;
}

export function assertCanResolveEntry(
  entry: { status: string; resolvedAt?: Date | null },
  newStatus: string,
  allowedStates: string[],
  resolutionPayload: any,
  resolutionFieldsSchema: any
): Record<string, any> {
  if (entry.status !== 'NEW' || entry.resolvedAt !== null && entry.resolvedAt !== undefined) {
    throw new AppError(
      409,
      'La entrada del formulario ya ha sido respondida previamente y no puede ser modificada (Write-Once)',
      'ENTRY_ALREADY_RESOLVED'
    );
  }

  const validStates = Array.isArray(allowedStates) && allowedStates.length > 0 ? allowedStates : ['VALID', 'INVALID'];
  if (!validStates.includes(newStatus) || newStatus === 'NEW') {
    throw new AppError(
      400,
      `El estado '${newStatus}' no es un estado de resolución válido. Permitidos: ${validStates.join(', ')}`,
      'INVALID_STATUS'
    );
  }

  return validatePayloadAgainstSchema(resolutionPayload, resolutionFieldsSchema, 'resolutionPayload');
}

