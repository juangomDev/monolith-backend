import ExcelJS from 'exceljs';
import * as csv from 'fast-csv';
import type { AuditLog } from '@prisma/client';

const FORMULA_TRIGGER_REGEX = /^[=+\-@\t\r]/;

export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return FORMULA_TRIGGER_REGEX.test(str) ? `'${str}` : str;
}

const AUDIT_EXPORT_COLUMNS = [
  'id',
  'createdAt',
  'actorId',
  'actorUsername',
  'action',
  'resourceType',
  'resourceId',
  'folderId',
  'ipAddress',
  'metadata',
];

export async function buildAuditLogsExport(
  logs: AuditLog[],
  format: 'csv' | 'xlsx'
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const rows = logs.map((log) => ({
    id: sanitizeSpreadsheetCell(log.id),
    createdAt: sanitizeSpreadsheetCell(
      log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt)
    ),
    actorId: sanitizeSpreadsheetCell(log.actorId ?? ''),
    actorUsername: sanitizeSpreadsheetCell(log.actorUsername),
    action: sanitizeSpreadsheetCell(log.action),
    resourceType: sanitizeSpreadsheetCell(log.resourceType),
    resourceId: sanitizeSpreadsheetCell(log.resourceId ?? ''),
    folderId: sanitizeSpreadsheetCell(log.folderId ?? ''),
    ipAddress: sanitizeSpreadsheetCell(log.ipAddress ?? ''),
    metadata: sanitizeSpreadsheetCell(log.metadata ?? ''),
  }));

  const timestamp = Date.now();

  if (format === 'csv') {
    const csvStr = await csv.writeToString(rows, { headers: AUDIT_EXPORT_COLUMNS });
    return {
      buffer: Buffer.from(csvStr, 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `audit_logs_${timestamp}.csv`,
    };
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Auditoria');

  worksheet.columns = AUDIT_EXPORT_COLUMNS.map((col) => ({
    header: col,
    key: col,
    width: col === 'metadata' ? 36 : col === 'createdAt' ? 24 : 18,
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  headerRow.commit();

  for (const row of rows) {
    worksheet.addRow(row);
  }

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(xlsxBuffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `audit_logs_${timestamp}.xlsx`,
  };
}
