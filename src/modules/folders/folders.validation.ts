import { z } from 'zod';
import { FolderType, Role } from '@prisma/client';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createFolderSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(60, 'El nombre no puede exceder 60 caracteres'),
  type: z.enum(['CONTAINER', 'IMAGE', 'TABLE', 'PDF']),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'El color debe ser un código hexadecimal válido (ej. #3b82f6)').optional().nullable(),
  isPrivate: z.boolean().optional().default(false),
  parentId: z.string().uuid('El parentId debe ser un UUID válido').optional().nullable(),
});

export const updateFolderSchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(60, 'El nombre no puede exceder 60 caracteres').optional(),
    color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'El color debe ser un código hexadecimal válido (ej. #3b82f6)').optional().nullable(),
    isPrivate: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0 && (data.name !== undefined || data.color !== undefined || data.isPrivate !== undefined),
    'Debe especificar al menos un campo para actualizar (name, color o isPrivate)'
  );

export const moveResourceSchema = z.object({
  folderId: z.string().uuid('El folderId debe ser un UUID válido'),
});

export interface RequesterContext {
  id: string;
  role: Role;
}

export interface FormattedFolder {
  id: string;
  name: string;
  type: FolderType;
  color: string | null;
  isPrivate: boolean;
  isSystem?: boolean;
  parentId?: string | null;
  itemCount: number;
  userId: string;
  owner?: { id: string; username: string };
  myPermission?: string;
  createdAt: Date;
}

export interface ListFoldersQueryOptions {
  type?: FolderType;
  parentId?: string | null;
  search?: string;
  page?: number;
  limit?: number;
}
