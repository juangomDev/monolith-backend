import { FolderType, Role, FolderPermission } from '@prisma/client';
import type { FoldersRepository } from './folders.repository.js';
import type { FoldersSharesService } from './folders.shares.service.js';
import type { RequesterContext, FormattedFolder } from './folders.validation.js';
import { AppError } from '../../shared/errors.js';

export interface FolderTreeNode extends FormattedFolder {
  children: FolderTreeNode[];
}

export class FoldersHierarchyService {
  constructor(
    private readonly repo: FoldersRepository,
    private readonly sharesService: FoldersSharesService
  ) {}

  async validateAndResolveHierarchy(
    parentId: string | null | undefined,
    type: FolderType,
    requester: RequesterContext
  ): Promise<{ targetUserId: string }> {
    if (requester.role === Role.COLLABORATOR && !parentId) {
      throw new AppError(
        403,
        'Los colaboradores no tienen permiso para crear carpetas raíz. Solo pueden crear subcarpetas dentro de carpetas compartidas con permiso EDIT.',
        'FORBIDDEN'
      );
    }

    if (!parentId) {
      return { targetUserId: requester.id };
    }

    const parentAccess = await this.sharesService.assertFolderAccess(parentId, requester, FolderPermission.EDIT);
    const parentFolder = parentAccess.folder;

    // Calcular profundidad: Nivel 1 (parent.parentId === null) -> Nivel 2 -> Nivel 3 (máx 3 niveles)
    let depth = 1;
    let currParent: string | null = parentFolder.parentId;
    while (currParent) {
      depth++;
      if (depth >= 3) {
        throw new AppError(
          400,
          'La jerarquía de carpetas no puede superar 3 niveles de profundidad',
          'MAX_FOLDER_DEPTH_EXCEEDED'
        );
      }
      const ancestor = await this.repo.findFolderById(currParent);
      currParent = ancestor?.parentId ?? null;
    }

    // Coherencia de tipo si el padre no es contenedor
    if (parentFolder.type !== FolderType.CONTAINER && parentFolder.type !== type) {
      throw new AppError(
        400,
        `Una subcarpeta dentro de una carpeta ${parentFolder.type} debe ser de tipo ${parentFolder.type}`,
        'INVALID_FOLDER_TYPE'
      );
    }

    // Si el creador es colaborador, el dueño asignado a la subcarpeta es el Manager del árbol
    const targetUserId = requester.role === Role.COLLABORATOR ? parentFolder.userId : requester.id;
    return { targetUserId };
  }

  buildTree(folders: FormattedFolder[]): FolderTreeNode[] {
    const nodeMap = new Map<string, FolderTreeNode>();
    const roots: FolderTreeNode[] = [];

    for (const folder of folders) {
      nodeMap.set(folder.id, { ...folder, children: [] });
    }

    for (const folder of folders) {
      const node = nodeMap.get(folder.id)!;
      if (folder.parentId && nodeMap.has(folder.parentId)) {
        nodeMap.get(folder.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
