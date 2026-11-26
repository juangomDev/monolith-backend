import { AppError } from '../../shared/errors.js';
import { sanitizeFormulaCell } from '../tables/tables.parser.js';

export interface FieldDefinition {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required?: boolean;
  label?: string;
  options?: string[];
  itemsSchema?: FieldDefinition[];
  resolutionItemsSchema?: FieldDefinition[];
}

export type FieldsSchema =
  | FieldDefinition[]
  | Record<string, { type?: string; required?: boolean; label?: string; options?: string[]; itemsSchema?: any; resolutionItemsSchema?: any }>;

export function sanitizeDeepValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeFormulaCell(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDeepValue(item));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k.trim()] = sanitizeDeepValue(v);
    }
    return out;
  }
  return sanitizeFormulaCell(String(value));
}

export function normalizeFieldsSchema(schema: any): FieldDefinition[] {
  if (!schema) return [];
  if (Array.isArray(schema)) {
    return schema
      .map((field) => ({
        name: String(field.name || '').trim(),
        type: field.type || 'string',
        required: Boolean(field.required),
        label: field.label,
        options: Array.isArray(field.options) ? field.options : undefined,
        ...(field.itemsSchema ? { itemsSchema: normalizeFieldsSchema(field.itemsSchema) } : {}),
        ...(field.resolutionItemsSchema ? { resolutionItemsSchema: normalizeFieldsSchema(field.resolutionItemsSchema) } : {}),
      }))
      .filter((f) => f.name.length > 0);
  }
  if (typeof schema === 'object') {
    return Object.entries(schema)
      .map(([name, conf]: [string, any]) => ({
        name: name.trim(),
        type: conf?.type || 'string',
        required: Boolean(conf?.required),
        label: conf?.label,
        options: Array.isArray(conf?.options) ? conf.options : undefined,
        ...(conf?.itemsSchema ? { itemsSchema: normalizeFieldsSchema(conf.itemsSchema) } : {}),
        ...(conf?.resolutionItemsSchema ? { resolutionItemsSchema: normalizeFieldsSchema(conf.resolutionItemsSchema) } : {}),
      }))
      .filter((f) => f.name.length > 0);
  }
  return [];
}

export function extractFieldNames(schema: any): string[] {
  return normalizeFieldsSchema(schema).map((f) => f.name);
}

export function validatePayloadAgainstSchema(
  payload: any,
  schema: any,
  payloadName: string = 'entryPayload',
  preserveExtraKeys: boolean = false
): Record<string, any> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(400, `El ${payloadName} debe ser un objeto JSON válido`, 'INVALID_PAYLOAD');
  }

  const fields = normalizeFieldsSchema(schema);
  const sanitized: Record<string, any> = {};

  if (preserveExtraKeys) {
    for (const [k, v] of Object.entries(payload)) {
      sanitized[k.trim()] = sanitizeDeepValue(v);
    }
  }

  for (const field of fields) {
    const val = payload[field.name];

    if (field.type === 'array') {
      if (val === undefined || val === null || (Array.isArray(val) && val.length === 0)) {
        if (field.required) {
          throw new AppError(400, `Campo obligatorio faltante o vacío: '${field.name}' en ${payloadName}`, 'MISSING_FIELD');
        }
        sanitized[field.name] = [];
        continue;
      }
      if (!Array.isArray(val)) {
        throw new AppError(400, `El campo '${field.name}' debe ser una lista (array)`, 'INVALID_FIELD_TYPE');
      }
      if (field.itemsSchema && field.itemsSchema.length > 0) {
        sanitized[field.name] = val.map((item, idx) =>
          validatePayloadAgainstSchema(item, field.itemsSchema, `${field.name}[${idx}]`, true)
        );
      } else {
        sanitized[field.name] = val.map((item) => sanitizeDeepValue(item));
      }
      continue;
    }

    if (field.type === 'object') {
      if (val === undefined || val === null || val === '') {
        if (field.required) {
          throw new AppError(400, `Campo obligatorio faltante: '${field.name}' en ${payloadName}`, 'MISSING_FIELD');
        }
        sanitized[field.name] = null;
        continue;
      }
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw new AppError(400, `El campo '${field.name}' debe ser un objeto JSON`, 'INVALID_FIELD_TYPE');
      }
      sanitized[field.name] =
        field.itemsSchema && field.itemsSchema.length > 0
          ? validatePayloadAgainstSchema(val, field.itemsSchema, field.name, true)
          : sanitizeDeepValue(val);
      continue;
    }

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
      sanitized[field.name] = Array.isArray(val) || typeof val === 'object' ? sanitizeDeepValue(val) : sanitizeFormulaCell(val);
    }
  }

  return sanitized;
}

/**
 * Fusiona los datos enviados por el solicitante (entryPayload) con los datos respondidos por el analista (resolutionPayload),
 * combinando fila por fila cualquier campo de lista repetible (ej. `periodos` + `poblacion` y `censo` de cada período).
 */
export function mergeEntryAndResolutionPayload(
  entryPayload: Record<string, any> | null | undefined,
  resolutionPayload: Record<string, any> | null | undefined
): Record<string, any> {
  const ep = entryPayload && typeof entryPayload === 'object' ? entryPayload : {};
  const rp = resolutionPayload && typeof resolutionPayload === 'object' ? resolutionPayload : {};
  const merged: Record<string, any> = { ...ep };

  for (const [key, rVal] of Object.entries(rp)) {
    const eVal = ep[key];
    if (Array.isArray(eVal) && Array.isArray(rVal)) {
      const maxLen = Math.max(eVal.length, rVal.length);
      const mergedArr: any[] = [];
      for (let i = 0; i < maxLen; i++) {
        const eItem = eVal[i];
        const rItem = rVal[i];
        if (eItem && typeof eItem === 'object' && !Array.isArray(eItem) && rItem && typeof rItem === 'object' && !Array.isArray(rItem)) {
          mergedArr.push({ ...eItem, ...rItem });
        } else if (rItem !== undefined) {
          mergedArr.push(rItem);
        } else {
          mergedArr.push(eItem);
        }
      }
      merged[key] = mergedArr;
    } else if (rVal !== undefined) {
      merged[key] = rVal;
    }
  }

  return merged;
}

/**
 * Formatea un valor (incluyendo arrays de objetos como `periodos`) en una cadena legible para CSV o celdas planas.
 */
export function formatValueForFlatExport(val: any): any {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    return val
      .map((item, idx) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const pairs = Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          return `#${idx + 1} (${pairs})`;
        }
        return String(item);
      })
      .join(' | ');
  }
  if (typeof val === 'object') {
    return Object.entries(val)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return val;
}

export function buildEffectiveResolutionSchema(entrySchema: any, resolutionSchema: any): FieldDefinition[] {
  const resFields = normalizeFieldsSchema(resolutionSchema);
  const entryFields = normalizeFieldsSchema(entrySchema);
  const existingNames = new Set(resFields.map((f) => f.name));

  for (const ef of entryFields) {
    if (ef.type === 'array' && !existingNames.has(ef.name)) {
      resFields.push({
        name: ef.name,
        type: 'array',
        required: false,
        label: ef.label,
        itemsSchema: ef.resolutionItemsSchema,
      });
    }
  }
  return resFields;
}

export function assertCanResolveEntry(
  entry: { status: string; resolvedAt?: Date | null },
  newStatus: string,
  allowedStates: string[],
  resolutionPayload: any,
  resolutionFieldsSchema: any
): Record<string, any> {
  if (entry.status !== 'NEW' || (entry.resolvedAt !== null && entry.resolvedAt !== undefined)) {
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

