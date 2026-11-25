import crypto from 'node:crypto';
import { Role } from '@prisma/client';
import { apiKeysRepository } from './api-keys.repository.js';
import { hashApiKey } from '../../gateway/auth.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { auditService } from '../audit/audit.service.js';
import type { RequesterContext } from '../folders/folders.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateApiKeyInput {
  name: string;
  description?: string;
  rateLimit?: number;
}

export interface UpdateApiKeyInput {
  name?: string;
  description?: string | null;
  rateLimit?: number;
  isActive?: boolean;
}

export class ApiKeysService {
  private assertAdmin(caller: RequesterContext) {
    if (caller.role !== Role.ADMIN) {
      throw new AppError(403, 'Solo el Administrador General puede gestionar API Keys', 'FORBIDDEN');
    }
  }

  async createApiKey(caller: RequesterContext, input: CreateApiKeyInput) {
    this.assertAdmin(caller);

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) {
      throw new AppError(400, 'El nombre de la API Key debe tener entre 1 y 100 caracteres', 'INVALID_NAME');
    }

    const randomSuffix = crypto.randomBytes(24).toString('base64url');
    const fullKey = `mk_live_${randomSuffix}`;
    const keyPrefix = fullKey.substring(0, 16);
    const keyHash = hashApiKey(fullKey, env.API_KEY_PEPPER);

    const client = await apiKeysRepository.create({
      name,
      description: input.description?.trim() || null,
      keyPrefix,
      keyHash,
      rateLimit: input.rateLimit && input.rateLimit > 0 ? input.rateLimit : 100,
    });

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: 'admin',
      action: 'API_KEY_CREATE',
      resourceType: 'API_KEY',
      resourceId: client.id,
      metadata: { name: client.name, keyPrefix },
    });

    return {
      id: client.id,
      name: client.name,
      description: client.description,
      keyPrefix: client.keyPrefix,
      key: fullKey,
      rateLimit: client.rateLimit,
      isActive: client.isActive,
      createdAt: client.createdAt,
    };
  }

  async listApiKeys(caller: RequesterContext, options?: { page?: number; limit?: number }) {
    this.assertAdmin(caller);

    const hasPagination = options?.page !== undefined || options?.limit !== undefined;
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;

    const keys = hasPagination
      ? await apiKeysRepository.findAll({ page, limit })
      : await apiKeysRepository.findAll();

    let total = keys.length;
    if (hasPagination) {
      try {
        total = await apiKeysRepository.count();
      } catch {
        total = keys.length;
      }
    }

    const effectiveLimit = hasPagination ? limit : (total > 0 ? total : 50);
    const totalPages = Math.ceil(total / effectiveLimit) || 1;

    return {
      keys,
      total,
      page,
      limit: effectiveLimit,
      totalPages,
      meta: { page, limit: effectiveLimit, total, totalPages, hasNext: page < totalPages },
    };
  }

  async updateApiKey(caller: RequesterContext, id: string, input: UpdateApiKeyInput) {
    this.assertAdmin(caller);

    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la API Key debe ser un UUID válido', 'INVALID_ID');
    }

    if (!input || typeof input !== 'object') {
      throw new AppError(400, 'Cuerpo de actualización inválido', 'BAD_REQUEST');
    }

    const updateData: Record<string, any> = {};

    if (input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 100) {
        throw new AppError(400, 'El nombre de la API Key debe tener entre 1 y 100 caracteres', 'INVALID_NAME');
      }
      updateData.name = name;
    }

    if (input.description !== undefined) {
      if (input.description === null) {
        updateData.description = null;
      } else if (typeof input.description === 'string') {
        const desc = input.description.trim();
        if (desc.length > 255) {
          throw new AppError(400, 'La descripción no puede superar los 255 caracteres', 'BAD_REQUEST');
        }
        updateData.description = desc || null;
      } else {
        throw new AppError(400, 'Descripción inválida', 'BAD_REQUEST');
      }
    }

    if (input.rateLimit !== undefined) {
      if (typeof input.rateLimit !== 'number' || !Number.isInteger(input.rateLimit) || input.rateLimit < 1) {
        throw new AppError(400, 'rateLimit debe ser un entero positivo', 'INVALID_RATE_LIMIT');
      }
      updateData.rateLimit = input.rateLimit;
    }

    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') {
        throw new AppError(400, 'isActive debe ser booleano', 'BAD_REQUEST');
      }
      updateData.isActive = input.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, 'Debe proporcionar al menos un campo válido para actualizar', 'BAD_REQUEST');
    }

    const existing = await apiKeysRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'API Key no encontrada', 'NOT_FOUND');
    }

    const updated = await apiKeysRepository.update(id, updateData);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: 'admin',
      action: 'API_KEY_UPDATE',
      resourceType: 'API_KEY',
      resourceId: id,
      metadata: { ...updateData, keyPrefix: existing.keyPrefix },
    });

    return updated;
  }

  async revokeApiKey(caller: RequesterContext, id: string) {
    this.assertAdmin(caller);

    if (!UUID_REGEX.test(id)) {
      throw new AppError(400, 'El ID de la API Key debe ser un UUID válido', 'INVALID_ID');
    }

    const existing = await apiKeysRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'API Key no encontrada', 'NOT_FOUND');
    }

    await apiKeysRepository.deleteById(id);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: 'admin',
      action: 'API_KEY_REVOKE',
      resourceType: 'API_KEY',
      resourceId: id,
      metadata: { name: existing.name, keyPrefix: existing.keyPrefix },
    });

    return { revoked: true };
  }
}

export const apiKeysService = new ApiKeysService();
