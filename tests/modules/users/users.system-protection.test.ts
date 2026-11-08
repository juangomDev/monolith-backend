import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { usersService, type CallerContext } from '../../../src/modules/users/users.service.js';
import { usersRepository } from '../../../src/modules/users/users.repository.js';
import { AppError } from '../../../src/shared/errors.js';

describe('Módulo Usuarios: Cuentas Estructurales y Protección de Sistema (14.7)', () => {
  const adminCaller: CallerContext = {
    id: '00000000-0000-4000-8000-000000000001',
    role: Role.ADMIN,
  };

  const managerCaller: CallerContext = {
    id: '00000000-0000-4000-8000-000000000002',
    role: Role.MANAGER,
  };

  const aiManagerId = '00000000-0000-4000-8000-000000000003';
  const adminId = '00000000-0000-4000-8000-000000000001';

  it('deleteUser: rechaza 400 CANNOT_DELETE_SYSTEM_USER si se intenta eliminar admin o ai_manager', async () => {
    // Mock findById para devolver ai_manager
    const origFindById = usersRepository.findById;
    usersRepository.findById = async (id: string) => {
      if (id === aiManagerId) {
        return {
          id: aiManagerId,
          username: 'ai_manager',
          passwordHash: 'hash',
          role: Role.MANAGER,
          isActive: true,
          tokenVersion: 0,
          createdById: null,
          createdAt: new Date(),
        };
      }
      return null;
    };

    try {
      await assert.rejects(
        async () => {
          await usersService.deleteUser(adminCaller, aiManagerId);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'CANNOT_DELETE_SYSTEM_USER');
          return true;
        }
      );
    } finally {
      usersRepository.findById = origFindById;
    }
  });

  it('updateUserStatus: rechaza 400 SYSTEM_USER_PROTECTED si se intenta desactivar ai_manager', async () => {
    const origFindById = usersRepository.findById;
    usersRepository.findById = async (id: string) => {
      if (id === aiManagerId) {
        return {
          id: aiManagerId,
          username: 'ai_manager',
          passwordHash: 'hash',
          role: Role.MANAGER,
          isActive: true,
          tokenVersion: 0,
          createdById: null,
          createdAt: new Date(),
        };
      }
      return null;
    };

    try {
      await assert.rejects(
        async () => {
          await usersService.updateUserStatus(adminCaller, aiManagerId, false);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'SYSTEM_USER_PROTECTED');
          return true;
        }
      );
    } finally {
      usersRepository.findById = origFindById;
    }
  });

  it('listUsers: un MANAGER recibe a sus colaboradores MÁS la cuenta estructural ai_manager', async () => {
    const origListAll = usersRepository.listAll;
    let receivedFilter: any = null;
    usersRepository.listAll = async (filter?: any) => {
      receivedFilter = filter;
      return [
        {
          id: 'collab-1',
          username: 'collab_one',
          role: Role.COLLABORATOR,
          tokenVersion: 0,
          isActive: true,
          createdById: managerCaller.id,
          createdAt: new Date(),
        },
        {
          id: aiManagerId,
          username: 'ai_manager',
          role: Role.MANAGER,
          tokenVersion: 0,
          isActive: true,
          createdById: null,
          createdAt: new Date(),
        },
      ];
    };

    try {
      const users = await usersService.listUsers(managerCaller);
      assert.strictEqual(users.length, 2);
      assert.strictEqual(receivedFilter?.createdById, managerCaller.id);
      const usernames = users.map((u) => u.username);
      assert.ok(usernames.includes('ai_manager'));
      assert.ok(usernames.includes('collab_one'));
    } finally {
      usersRepository.listAll = origListAll;
    }
  });
});

