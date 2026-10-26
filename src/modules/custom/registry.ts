import { z } from 'zod';
import { crossReportInputSchema, executeCrossReport } from './actions/cross-report.action.js';
import { bulkExportInputSchema, executeBulkExport } from './actions/bulk-export.action.js';

export interface ActionDefinition<T = unknown, R = unknown> {
  schema: z.ZodSchema<T>;
  handler: (payload: T) => Promise<R>;
}

export const actionRegistry: Record<string, ActionDefinition<any, any>> = {
  'cross-report': {
    schema: crossReportInputSchema,
    handler: executeCrossReport,
  },
  'bulk-export': {
    schema: bulkExportInputSchema,
    handler: executeBulkExport,
  },
};

export function isActionAllowed(actionName: string): boolean {
  return Object.prototype.hasOwnProperty.call(actionRegistry, actionName);
}
