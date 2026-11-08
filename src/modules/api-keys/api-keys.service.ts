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

  async listApiKeys(caller: RequesterContext) {
    this.assertAdmin(caller);
    const keys = await apiKeysRepository.findAll();
    return { keys };
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

