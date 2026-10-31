import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Role, type User } from '@prisma/client';
import { usersRepository, type UsersRepository } from './users.repository.js';
import { AppError } from '../../shared/errors.js';

const scryptAsync = promisify(crypto.scrypt);

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

    if (!username || !password) {
      throw new AppError(400, 'Nombre de usuario y contraseña requeridos', 'BAD_REQUEST');
    }

    const user = await this.repo.findByUsername(username.trim());
    if (!user) {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new AppError(401, 'Usuario inactivo o suspendido', 'ACCOUNT_INACTIVE');
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
  }

  async createUser(
    callerRole: string,
    input: { username?: string; password?: string; role?: string }
  ): Promise<Omit<User, 'passwordHash'>> {
    if (callerRole !== Role.ADMIN) {
      throw new AppError(403, 'Solo un administrador puede crear usuarios', 'FORBIDDEN');
    }

    if (input.role && input.role === Role.ADMIN) {
      throw new AppError(
        400,
        'No está permitido crear administradores adicionales. Solo existe un único ADMIN en el sistema.',
        'ADMIN_CREATION_FORBIDDEN'
      );
    }

    const username = input.username?.trim();
    if (!username || !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      throw new AppError(
        400,
        'El nombre de usuario debe ser alfanumérico (letras, números, _ o -) y tener entre 3 y 30 caracteres',
        'INVALID_USERNAME'
      );
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
      role: Role.USER,
      isActive: true,
    });

    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }
}

export const usersService = new UsersService();
