import { Role, type Prisma } from '@prisma/client';

/**
 * Genera condiciones Prisma OR para membresías directas y heredadas
 * dentro de la jerarquía máxima de 3 niveles (carpeta -> padre -> abuelo).
 */
export function buildFolderMemberOrConditions(userId: string): Prisma.FolderWhereInput[] {
  return [
    { members: { some: { userId } } },
    { parent: { members: { some: { userId } } } },
    { parent: { parent: { members: { some: { userId } } } } },
  ];
}

/**
 * Genera la condición Prisma sobre la relación `folder` para listados de recursos
 * (imágenes, tablas, PDFs, formularios), respetando visibilidad por rol y herencia de 3 niveles.
 */
export function buildResourceFolderVisibilityWhere(options: {
  userId?: string;
  isAdmin?: boolean;
  role?: Role;
  allowUnassigned?: boolean;
}): Record<string, any> | null {
  if (options.isAdmin) {
    return null;
  }

  const userId = options.userId;

  if (options.role === Role.COLLABORATOR && userId) {
    return {
      folder: {
        OR: [{ isSystem: true }, ...buildFolderMemberOrConditions(userId)],
      },
    };
  }

  const orConditions: Record<string, any>[] = [];
  if (options.allowUnassigned !== false) {
    orConditions.push({ folderId: null });
  }
  orConditions.push({ folder: { isPrivate: false } });

  if (userId) {
    orConditions.push({ folder: { userId } });
    orConditions.push({ folder: { isSystem: true } });
    for (const memberCond of buildFolderMemberOrConditions(userId)) {
      orConditions.push({ folder: memberCond });
    }
  }

  return { OR: orConditions };
}
