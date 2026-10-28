import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  UsersService,
} from '../../../src/modules/users/users.service.js';
import type { UsersRepository } from '../../../src/modules/users/users.repository.js';
import { Role, type User } from '@prisma/client';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Usuarios: UsersService y Hashing scrypt', () => {
  it('hashPassword y verifyPassword: debe hashear y verificar contraseñas correctamente', async () => {
    const rawPass = 'SuperPassword123!';
    const hash = await hashPassword(rawPass);

    assert.strictEqual(typeof hash, 'string');
    assert.ok(hash.includes(':'), 'El hash debe contener salt y key separados por dos puntos');

    const isValid = await verifyPassword(rawPass, hash);
    assert.strictEqual(isValid, true);

    const isInvalid = await verifyPassword('WrongPassword123!', hash);
    assert.strictEqual(isInvalid, false);
  });

  it('hashPassword: debe generar hashes distintos para la misma contraseña debido al salt aleatorio', async () => {
    const rawPass = 'Secret12345';
    const hash1 = await hashPassword(rawPass);
    const hash2 = await hashPassword(rawPass);

    assert.notStrictEqual(hash1, hash2);
    assert.strictEqual(await verifyPassword(rawPass, hash1), true);
    assert.strictEqual(await verifyPassword(rawPass, hash2), true);
  });

  it('verifyPassword: debe retornar false si el hash almacenado está malformado', async () => {
    assert.strictEqual(await verifyPassword('pass', 'hash-invalido-sin-salt'), false);
    assert.strictEqual(await verifyPassword('pass', ''), false);
  });

  it('login: debe lanzar 400 si faltan credenciales', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.login({ username: '', password: '' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'BAD_REQUEST');
        return true;
      }
    );
  });

  it('login: debe lanzar 401 si el usuario no existe', async () => {
    const mockRepo = {
      findByUsername: async () => null,
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    await assert.rejects(
      async () => {
        await service.login({ username: 'inexistente', password: 'password123' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
  });

  it('login: debe lanzar 401 si el usuario está inactivo', async () => {
    const hash = await hashPassword('password123');
    const mockRepo = {
      findByUsername: async () =>
        ({
          id: '11111111-1111-1111-1111-111111111111',
          username: 'inactivo',
          passwordHash: hash,
          role: Role.USER,
          isActive: false,
          createdAt: new Date(),
        }) as User,
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    await assert.rejects(
      async () => {
        await service.login({ username: 'inactivo', password: 'password123' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'ACCOUNT_INACTIVE');
        return true;
      }
    );
  });

  it('login: debe lanzar 401 si la contraseña es errónea', async () => {
    const hash = await hashPassword('correctPassword');
    const mockRepo = {
      findByUsername: async () =>
        ({
          id: '22222222-2222-2222-2222-222222222222',
          username: 'usuario1',
          passwordHash: hash,
          role: Role.USER,
          isActive: true,
          createdAt: new Date(),
        }) as User,
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    await assert.rejects(
      async () => {
        await service.login({ username: 'usuario1', password: 'wrongPassword' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
  });

  it('login: debe autenticar exitosamente y retornar la sesión del usuario', async () => {
    const rawPass = 'goodPassword123';
    const hash = await hashPassword(rawPass);
    const mockUser: User = {
      id: '33333333-3333-3333-3333-333333333333',
      username: 'admin',
      passwordHash: hash,
      role: Role.ADMIN,
      isActive: true,
      createdAt: new Date(),
    };

    const mockRepo = {
      findByUsername: async () => mockUser,
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const session = await service.login({ username: 'admin', password: rawPass });

    assert.strictEqual(session.id, mockUser.id);
    assert.strictEqual(session.username, 'admin');
    assert.strictEqual(session.role, Role.ADMIN);
  });

  it('createUser: debe lanzar 403 si el rol del invocador no es ADMIN', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.createUser(Role.USER, { username: 'nuevo', password: 'pass123' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('createUser: debe rechazar con 400 el intento de crear otro ADMIN', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.createUser(Role.ADMIN, {
          username: 'nuevo_admin',
          password: 'pass123456',
          role: 'ADMIN',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'ADMIN_CREATION_FORBIDDEN');
        return true;
      }
    );
  });

  it('createUser: debe validar el formato de username (3-30 alfanumérico)', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.createUser(Role.ADMIN, { username: 'a', password: 'pass123456' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_USERNAME');
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await service.createUser(Role.ADMIN, { username: 'usuario con espacios', password: 'pass123456' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_USERNAME');
        return true;
      }
    );
  });

  it('createUser: debe validar longitud mínima de contraseña (6 caracteres)', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.createUser(Role.ADMIN, { username: 'operador1', password: '123' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_PASSWORD');
        return true;
      }
    );
  });

  it('createUser: debe lanzar 409 si el username ya existe', async () => {
    const mockRepo = {
      findByUsername: async () => ({ id: 'existing-id' } as User),
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    await assert.rejects(
      async () => {
        await service.createUser(Role.ADMIN, { username: 'usuario_duplicado', password: 'pass123456' });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'USERNAME_ALREADY_EXISTS');
        return true;
      }
    );
  });

  it('createUser: debe crear usuario USER exitosamente y retornar datos seguros sin hash', async () => {
    let createdPayload: any = null;
    const mockRepo = {
      findByUsername: async () => null,
      create: async (data: any) => {
        createdPayload = data;
        return {
          id: '55555555-5555-5555-5555-555555555555',
          username: data.username,
          passwordHash: data.passwordHash,
          role: data.role,
          isActive: data.isActive,
          createdAt: new Date(),
        };
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const result = await service.createUser(Role.ADMIN, {
      username: 'nuevo_analista',
      password: 'passwordValido123',
    });

    assert.strictEqual(result.id, '55555555-5555-5555-5555-555555555555');
    assert.strictEqual(result.username, 'nuevo_analista');
    assert.strictEqual(result.role, Role.USER);
    assert.strictEqual(result.isActive, true);
    assert.strictEqual((result as any).passwordHash, undefined);
    assert.strictEqual(createdPayload.role, Role.USER);
    assert.ok(createdPayload.passwordHash.includes(':'));
  });
});
