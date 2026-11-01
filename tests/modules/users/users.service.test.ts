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
          role: Role.MANAGER,
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
          role: Role.MANAGER,
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

  it('createUser: debe lanzar 403 si el rol del invocador es COLLABORATOR', async () => {
    const service = new UsersService({} as UsersRepository);

    await assert.rejects(
      async () => {
        await service.createUser(Role.COLLABORATOR, { username: 'nuevo', password: 'pass123' });
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

  it('createUser: debe crear usuario MANAGER exitosamente y retornar datos seguros sin hash', async () => {
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
    assert.strictEqual(result.role, Role.MANAGER);
    assert.strictEqual(result.isActive, true);
    assert.strictEqual((result as any).passwordHash, undefined);
    assert.strictEqual(createdPayload.role, Role.MANAGER);
    assert.ok(createdPayload.passwordHash.includes(':'));
  });

  it('getProfile: retorna datos del usuario sin passwordHash', async () => {
    const mockRepo = {
      findById: async (id: string) => ({
        id,
        username: 'perfil_usuario',
        passwordHash: 'secret:hash',
        role: Role.MANAGER,
        tokenVersion: 2,
        isActive: true,
        createdById: null,
        createdAt: new Date(),
      }),
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const profile = await service.getProfile('11111111-2222-3333-4444-555555555555');
    assert.strictEqual(profile.username, 'perfil_usuario');
    assert.strictEqual((profile as any).passwordHash, undefined);
  });

  it('changePassword: debe actualizar contraseña e incrementar tokenVersion', async () => {
    const oldHash = await hashPassword('claveVieja123');
    let updatedPayload: any = null;
    let incrementedId: string | null = null;

    const mockRepo = {
      findById: async (id: string) => ({
        id,
        username: 'user_cambio',
        passwordHash: oldHash,
        role: Role.MANAGER,
        tokenVersion: 0,
        isActive: true,
        createdAt: new Date(),
      }),
      update: async (id: string, data: any) => {
        updatedPayload = data;
        return {} as any;
      },
      incrementTokenVersion: async (id: string) => {
        incrementedId = id;
        return {} as any;
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    await service.changePassword('user-uuid-1', 'claveVieja123', 'claveNuevaSegura456');

    assert.ok(updatedPayload?.passwordHash);
    assert.strictEqual(incrementedId, 'user-uuid-1');
  });

  it('createUser: permite a un MANAGER crear un COLLABORATOR vinculando createdById', async () => {
    let createdPayload: any = null;
    const mockRepo = {
      findByUsername: async () => null,
      create: async (data: any) => {
        createdPayload = data;
        return {
          id: 'collab-uuid',
          username: data.username,
          passwordHash: data.passwordHash,
          role: data.role,
          isActive: true,
          createdById: data.createdById,
          createdAt: new Date(),
        };
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const result = await service.createUser(
      { id: 'manager-uuid', role: Role.MANAGER },
      { username: 'colaborador_test', password: 'passwordSeguro1' }
    );

    assert.strictEqual(result.role, Role.COLLABORATOR);
    assert.strictEqual(createdPayload.role, Role.COLLABORATOR);
    assert.strictEqual(createdPayload.createdById, 'manager-uuid');
  });

  it('createUser: rechaza si un MANAGER intenta crear otro MANAGER', async () => {
    const service = new UsersService({} as UsersRepository);
    await assert.rejects(
      async () => {
        await service.createUser(
          { id: 'manager-uuid', role: Role.MANAGER },
          { username: 'otro_manager', password: 'passwordSeguro1', role: Role.MANAGER }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual((err as AppError).status, 403);
        return true;
      }
    );
  });

  it('listUsers: MANAGER solo obtiene sus propios colaboradores creados', async () => {
    let capturedFilter: any = null;
    const mockRepo = {
      listAll: async (filter?: any) => {
        capturedFilter = filter;
        return [];
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    await service.listUsers({ id: 'manager-123', role: Role.MANAGER });

    assert.deepStrictEqual(capturedFilter, { createdById: 'manager-123' });
  });

  it('updateUserStatus: MANAGER suspende su colaborador e invalida su tokenVersion', async () => {
    let incrementedId: string | null = null;
    const mockRepo = {
      findById: async (id: string) => ({
        id,
        username: 'mi_colaborador',
        role: Role.COLLABORATOR,
        createdById: 'manager-1',
        isActive: true,
      }),
      update: async (id: string, data: any) => ({ id, ...data }),
      incrementTokenVersion: async (id: string) => {
        incrementedId = id;
        return {} as any;
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const updated = await service.updateUserStatus(
      { id: 'manager-1', role: Role.MANAGER },
      '11111111-2222-4333-8444-555555555555',
      false
    );

    assert.strictEqual(updated.isActive, false);
    assert.strictEqual(incrementedId, '11111111-2222-4333-8444-555555555555');
  });

  it('deleteUser: MANAGER elimina su propio colaborador exitosamente', async () => {
    let deletedId: string | null = null;
    const mockRepo = {
      findById: async (id: string) => ({
        id,
        username: 'colaborador_a_borrar',
        role: Role.COLLABORATOR,
        createdById: 'manager-1',
      }),
      deleteById: async (id: string) => {
        deletedId = id;
        return {} as any;
      },
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);
    const result = await service.deleteUser(
      { id: 'manager-1', role: Role.MANAGER },
      '11111111-2222-4333-8444-666666666666'
    );

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(deletedId, '11111111-2222-4333-8444-666666666666');
  });
});
