import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Role, type User } from '@prisma/client';
import { usersRepository, type UsersRepository } from './users.repository.js';
import { AppError } from '../../shared/errors.js';
import { auditService } from '../audit/audit.service.js';

const scryptAsync = promisify(crypto.scrypt);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export interface UserSessionPayload {
  id: string;
  username: string;
  role: Role;
  tokenVersion?: number;
}

export interface CallerContext {
  id: string;
  role: Role;
}

export class UsersService {
  constructor(private readonly repo: UsersRepository = usersRepository) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  async logout(userId: string): Promise<void> {
    await this.repo.incrementTokenVersion(userId);
  }

  async login(credentials: { username?: string; password?: string }): Promise<UserSessionPayload> {
    const { username, password } = credentials;
    if (!username || !password) throw new AppError(400, 'Nombre de usuario y contraseña requeridos', 'BAD_REQUEST');

    const user = await this.repo.findByUsername(username.trim());
    if (!user) throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    if (!user.isActive) throw new AppError(401, 'Usuario inactivo o suspendido', 'ACCOUNT_INACTIVE');

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
  }

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.repo.findById(userId);
    if (!user) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND');
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async changePassword(userId: string, currentPassword?: string, newPassword?: string): Promise<void> {
    if (!currentPassword || !newPassword) throw new AppError(400, 'Contraseña actual y nueva contraseña requeridas', 'BAD_REQUEST');
    if (newPassword.length < 6) throw new AppError(400, 'La nueva contraseña debe tener al menos 6 caracteres', 'INVALID_PASSWORD');

    const user = await this.repo.findById(userId);
    if (!user) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND');

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) throw new AppError(400, 'La contraseña actual no coincide', 'INVALID_CREDENTIALS');

    const passwordHash = await hashPassword(newPassword);
    await this.repo.update(userId, { passwordHash });
    await this.repo.incrementTokenVersion(userId);
  }

  async createUser(
    caller: CallerContext | Role | string,
    input: { username?: string; password?: string; role?: Role | string }
  ): Promise<Omit<User, 'passwordHash'>> {
    const callerRole: Role = typeof caller === 'object' ? caller.role : (caller as Role);
    const callerId: string | undefined = typeof caller === 'object' ? caller.id : undefined;

    if (callerRole === Role.COLLABORATOR) {
      throw new AppError(403, 'Los colaboradores no tienen permiso para crear usuarios', 'FORBIDDEN');
    }
    if (callerRole !== Role.ADMIN && callerRole !== Role.MANAGER) {
      throw new AppError(403, 'Solo un administrador o gestor puede crear usuarios', 'FORBIDDEN');
    }

    if (input.role && input.role === Role.ADMIN) {
      throw new AppError(400, 'No está permitido crear administradores adicionales. Solo existe un único ADMIN en el sistema.', 'ADMIN_CREATION_FORBIDDEN');
    }

    let targetRole: Role = Role.MANAGER;
    if (callerRole === Role.ADMIN) {
      targetRole = input.role === Role.COLLABORATOR ? Role.COLLABORATOR : Role.MANAGER;
    } else if (callerRole === Role.MANAGER) {
      if (input.role && input.role !== Role.COLLABORATOR) {
        throw new AppError(403, 'Un gestor solo puede crear usuarios con rol COLLABORATOR', 'FORBIDDEN');
      }
      targetRole = Role.COLLABORATOR;
    }

    const username = input.username?.trim();
    if (!username || !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      throw new AppError(400, 'El nombre de usuario debe ser alfanumérico (letras, números, _ o -) y tener entre 3 y 30 caracteres', 'INVALID_USERNAME');
    }

    const password = input.password;
    if (!password || password.length < 6) {
      throw new AppError(400, 'La contraseña debe tener al menos 6 caracteres', 'INVALID_PASSWORD');
    }

    const existingUser = await this.repo.findByUsername(username);
    if (existingUser) {
      throw new AppError(409, `El usuario '${username}' ya está registrado`, 'USERNAME_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(password);
    const newUser = await this.repo.create({
      username,
      passwordHash,
      role: targetRole,
      isActive: true,
      createdById: callerId,
    });

    auditService.recordLog({
      actorId: callerId,
      actorUsername: callerRole || 'system',
      action: 'USER_CREATE',
      resourceType: 'USER',
      resourceId: newUser.id,
      metadata: { username: newUser.username, role: newUser.role },
    });

    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }

  async listUsers(caller: CallerContext): Promise<Omit<User, 'passwordHash'>[]> {
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para listar usuarios', 'FORBIDDEN');
    }
    if (caller.role === Role.ADMIN) {
      return this.repo.listAll();
    }
    return this.repo.listAll({ createdById: caller.id });
  }

  async updateUserStatus(caller: CallerContext, targetUserId: string, isActive: boolean): Promise<Omit<User, 'passwordHash'>> {
    if (!UUID_REGEX.test(targetUserId)) throw new AppError(400, 'ID de usuario inválido', 'INVALID_ID');
    if (caller.id === targetUserId) throw new AppError(400, 'No puedes modificar el estado de tu propia cuenta', 'CANNOT_MODIFY_SELF');

    const targetUser = await this.repo.findById(targetUserId);
    if (!targetUser) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND');
    if (targetUser.role === Role.ADMIN) throw new AppError(403, 'No se puede modificar el estado del Administrador General', 'FORBIDDEN');
    if (!isActive && targetUser.username === 'ai_manager') {
      throw new AppError(400, 'No se puede desactivar la cuenta estructural de servicio de IA', 'SYSTEM_USER_PROTECTED');
    }

    if (caller.role === Role.MANAGER && targetUser.createdById !== caller.id) {
      throw new AppError(403, 'No tienes permiso para modificar este colaborador', 'FORBIDDEN');
    }
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para modificar usuarios', 'FORBIDDEN');
    }

    const updated = await this.repo.update(targetUserId, { isActive });
    if (!isActive) {
      await this.repo.incrementTokenVersion(targetUserId);
    }
    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'USER_STATUS_CHANGE',
      resourceType: 'USER',
      resourceId: targetUserId,
      metadata: { isActive },
    });
    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  async resetUserPassword(caller: CallerContext, targetUserId: string, newPassword?: string): Promise<void> {
    if (!UUID_REGEX.test(targetUserId)) throw new AppError(400, 'ID de usuario inválido', 'INVALID_ID');
    if (!newPassword || newPassword.length < 6) throw new AppError(400, 'La nueva contraseña debe tener al menos 6 caracteres', 'INVALID_PASSWORD');

    const targetUser = await this.repo.findById(targetUserId);
    if (!targetUser) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND');
    if (targetUser.role === Role.ADMIN && caller.id !== targetUser.id) {
      throw new AppError(403, 'No se puede restablecer la contraseña del Administrador General', 'FORBIDDEN');
    }

    if (caller.role === Role.MANAGER && targetUser.createdById !== caller.id) {
      throw new AppError(403, 'No tienes permiso para restablecer la contraseña de este colaborador', 'FORBIDDEN');
    }
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para restablecer contraseñas', 'FORBIDDEN');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.repo.update(targetUserId, { passwordHash });
    await this.repo.incrementTokenVersion(targetUserId);
  }

  async deleteUser(caller: CallerContext, targetUserId: string): Promise<{ deleted: boolean }> {
    if (!UUID_REGEX.test(targetUserId)) throw new AppError(400, 'ID de usuario inválido', 'INVALID_ID');
    if (caller.id === targetUserId) throw new AppError(400, 'No puedes eliminar tu propia cuenta', 'CANNOT_MODIFY_SELF');

    const targetUser = await this.repo.findById(targetUserId);
    if (!targetUser) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND');
    if (targetUser.role === Role.ADMIN) throw new AppError(403, 'No se puede eliminar al Administrador General', 'FORBIDDEN');
    if (targetUser.username === 'ai_manager' || targetUser.username === 'admin') {
      throw new AppError(400, 'No se pueden eliminar las cuentas estructurales del sistema', 'CANNOT_DELETE_SYSTEM_USER');
    }

    if (caller.role === Role.MANAGER && targetUser.createdById !== caller.id) {
      throw new AppError(403, 'No tienes permiso para eliminar este colaborador', 'FORBIDDEN');
    }
    if (caller.role === Role.COLLABORATOR) {
      throw new AppError(403, 'No tienes permiso para eliminar usuarios', 'FORBIDDEN');
    }

    const storagePaths = (await this.repo.getUserStoragePaths?.(targetUserId)) ?? [];
    await this.repo.deleteById(targetUserId);

    auditService.recordLog({
      actorId: caller.id,
      actorUsername: caller.role,
      action: 'USER_DELETE',
      resourceType: 'USER',
      resourceId: targetUserId,
      metadata: { targetUsername: targetUser.username },
    });

    if (storagePaths.length > 0) {
      await Promise.allSettled(
        storagePaths.flatMap((filePath) => {
          const paths = [filePath];
          const parsed = path.parse(filePath);
          if (filePath.includes('tables')) {
            paths.push(path.join(parsed.dir, `${parsed.name}.data.json.gz`));
          } else if (filePath.includes('images')) {
            paths.push(path.join(parsed.dir, 'thumbs', `${parsed.name}.webp`));
          }
          return paths.map((p) => fs.unlink(p).catch(() => {}));
        })
      );
    }

    return { deleted: true };
  }
}

export const usersService = new UsersService();
