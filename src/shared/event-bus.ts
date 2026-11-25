import { EventEmitter } from 'node:events';

export interface FormEntryCreatedEvent {
  formId: string;
  formSlug: string;
  formTitle: string;
  folderId: string;
  entryId: string;
  entryPayload: Record<string, any>;
  createdAt: Date;
}

export interface FormEntryResolvedEvent {
  formId: string;
  formSlug: string;
  formTitle: string;
  folderId: string;
  entryId: string;
  status: string;
  resolutionPayload?: Record<string, any>;
  resolvedById: string;
  resolvedAt: Date;
}

export interface FolderSharedEvent {
  folderId: string;
  folderName: string;
  targetUserId: string;
  permission: string;
  sharedById: string;
  sharedByRole: string;
}

export interface ResourceUploadedEvent {
  resourceType: 'IMAGE' | 'TABLE' | 'PDF';
  resourceId: string;
  resourceName: string;
  folderId: string;
  folderName?: string;
  folderOwnerId: string;
  uploadedById: string;
  uploadedByRole?: string;
}

export interface StorageQuotaWarningEvent {
  totalBytes: number;
  maxStorageBytes: number;
  usagePercent: number;
  message: string;
}

export interface AppEvents {
  'form.entry.created': FormEntryCreatedEvent;
  'form.entry.resolved': FormEntryResolvedEvent;
  'folder.shared': FolderSharedEvent;
  'resource.uploaded': ResourceUploadedEvent;
  'storage.quota.warning': StorageQuotaWarningEvent;
}

export class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Aumentamos el límite de listeners para admitir múltiples suscriptores
    this.setMaxListeners(50);
  }

  emitEvent<K extends keyof AppEvents>(eventName: K, payload: AppEvents[K]): boolean {
    return this.emit(eventName, payload);
  }

  onEvent<K extends keyof AppEvents>(eventName: K, listener: (payload: AppEvents[K]) => void | Promise<void>): this {
    return this.on(eventName, async (data: AppEvents[K]) => {
      try {
        await listener(data);
      } catch (err: any) {
        console.error(`[AppEventBus] Error procesando evento ${String(eventName)}:`, err?.message || err);
      }
    });
  }
}

export const eventBus = new AppEventBus();
