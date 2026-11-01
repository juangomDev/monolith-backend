import { prisma } from '../config/db.js';
import { Role, FolderPermission } from '@prisma/client';
import { hashPassword } from '../modules/users/users.service.js';
import crypto from 'node:crypto';

export interface InMemoryDb {
  users: any[];
  folders: any[];
  folderMembers: any[];
  images: any[];
  tables: any[];
}

export async function setupInMemoryE2EDb(): Promise<{ state: InMemoryDb; teardown: () => void }> {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const adminHash = await hashPassword(adminPass);
  const adminId = '00000000-0000-4000-8000-000000000001';

  const state: InMemoryDb = {
    users: [{ id: adminId, username: adminUser, passwordHash: adminHash, role: Role.ADMIN, tokenVersion: 0, isActive: true, createdById: null, createdAt: new Date() }],
    folders: [], folderMembers: [], images: [], tables: [],
  };

  const orig = {
    user: { ...prisma.user }, folder: { ...prisma.folder }, folderMember: { ...prisma.folderMember },
    imageRegistry: { ...prisma.imageRegistry }, tableRegistry: { ...prisma.tableRegistry },
  };

  (prisma.user as any).findUnique = async ({ where }: any) =>
    state.users.find((u) => (where.id && u.id === where.id) || (where.username && u.username === where.username)) || null;
  (prisma.user as any).findFirst = async ({ where }: any) =>
    state.users.find((u) => (!where?.role || u.role === where.role) && (where?.isActive === undefined || u.isActive === where.isActive)) || null;
  (prisma.user as any).findMany = async ({ where }: any) =>
    state.users.filter((u) => (!where?.createdById || u.createdById === where.createdById) && (!where?.role || u.role === where.role));
  (prisma.user as any).create = async ({ data }: any) => {
    const user = { id: data.id || crypto.randomUUID(), username: data.username, passwordHash: data.passwordHash, role: data.role || Role.MANAGER, isActive: data.isActive ?? true, tokenVersion: 0, createdById: data.createdById || null, createdAt: new Date() };
    state.users.push(user);
    return user;
  };
  (prisma.user as any).update = async ({ where, data }: any) => {
    const user = state.users.find((u) => u.id === where.id);
    if (!user) throw new Error('User not found');
    if (data.tokenVersion?.increment) user.tokenVersion += data.tokenVersion.increment;
    else if (data.tokenVersion !== undefined) user.tokenVersion = data.tokenVersion;
    if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
    if (data.isActive !== undefined) user.isActive = data.isActive;
    return { ...user };
  };
  (prisma.user as any).delete = async ({ where }: any) => {
    const idx = state.users.findIndex((u) => u.id === where.id);
    return idx >= 0 ? state.users.splice(idx, 1)[0] : null;
  };

  function fmtFolder(f: any, filterUserId?: string) {
    const u = state.users.find((usr) => usr.id === f.userId);
    const member = filterUserId ? state.folderMembers.find((m) => m.folderId === f.id && m.userId === filterUserId) : undefined;
    return {
      ...f,
      _count: { images: state.images.filter((i) => i.folderId === f.id).length, tables: state.tables.filter((t) => t.folderId === f.id).length },
      user: { id: u?.id || f.userId, username: u?.username || 'user' },
      members: member ? [{ permission: member.permission }] : [],
    };
  }

  (prisma.folder as any).findUnique = async ({ where, include }: any) => {
    const f = state.folders.find((x) => x.id === where.id);
    if (!f) return null;
    const res = fmtFolder(f);
    if (include?.images) res.images = state.images.filter((i) => i.folderId === f.id);
    if (include?.tables) res.tables = state.tables.filter((t) => t.folderId === f.id);
    return res;
  };
  (prisma.folder as any).findFirst = async ({ where }: any) =>
    state.folders.find((f) => (!where?.userId || f.userId === where.userId) && (!where?.type || f.type === where.type) && (!where?.name || f.name === where.name)) || null;
  (prisma.folder as any).findMany = async ({ where, skip, take }: any) => {
    let list = state.folders.filter((f) => {
      if (where?.type && f.type !== where.type) return false;
      if (where?.name?.contains && !f.name.toLowerCase().includes(where.name.contains.toLowerCase())) return false;
      if (where?.members?.some?.userId) return state.folderMembers.some((m) => m.folderId === f.id && m.userId === where.members.some.userId);
      if (where?.OR) {
        return where.OR.some((c: any) => (!c.isPrivate && !f.isPrivate) || (c.userId && f.userId === c.userId) || (c.members?.some?.userId && state.folderMembers.some((m) => m.folderId === f.id && m.userId === c.members.some.userId)));
      }
      return true;
    });
    if (skip) list = list.slice(skip);
    if (take) list = list.slice(0, take);
    return list.map((f) => fmtFolder(f, where?.members?.where?.userId));
  };
  (prisma.folder as any).count = async () => state.folders.length;
  (prisma.folder as any).create = async ({ data }: any) => {
    const f = { id: data.id || crypto.randomUUID(), name: data.name, type: data.type, color: data.color || null, isPrivate: data.isPrivate ?? false, userId: data.userId, createdAt: new Date(), updatedAt: new Date() };
    state.folders.push(f);
    return f;
  };
  (prisma.folder as any).update = async ({ where, data }: any) => {
    const f = state.folders.find((x) => x.id === where.id);
    if (!f) throw new Error('Folder not found');
    if (data.name !== undefined) f.name = data.name;
    if (data.color !== undefined) f.color = data.color;
    if (data.isPrivate !== undefined) f.isPrivate = data.isPrivate;
    f.updatedAt = new Date();
    return fmtFolder(f);
  };
  (prisma.folder as any).delete = async ({ where }: any) => {
    const idx = state.folders.findIndex((x) => x.id === where.id);
    return idx >= 0 ? state.folders.splice(idx, 1)[0] : null;
  };

  (prisma.folderMember as any).findUnique = async ({ where }: any) =>
    state.folderMembers.find((m) => m.folderId === where.folderId_userId.folderId && m.userId === where.folderId_userId.userId) || null;
  (prisma.folderMember as any).findMany = async ({ where }: any) =>
    state.folderMembers.filter((m) => m.folderId === where.folderId).map((m) => {
      const u = state.users.find((usr) => usr.id === m.userId);
      return { ...m, user: { id: u?.id, username: u?.username, role: u?.role } };
    });
  (prisma.folderMember as any).upsert = async ({ where, create, update }: any) => {
    const { folderId, userId } = where.folderId_userId;
    let m = state.folderMembers.find((x) => x.folderId === folderId && x.userId === userId);
    if (m) m.permission = update.permission;
    else {
      m = { id: crypto.randomUUID(), folderId, userId, permission: create.permission || FolderPermission.READ, createdAt: new Date() };
      state.folderMembers.push(m);
    }
    return { ...m };
  };
  (prisma.folderMember as any).delete = async ({ where }: any) => {
    const idx = state.folderMembers.findIndex((m) => m.folderId === where.folderId_userId.folderId && m.userId === where.folderId_userId.userId);
    return idx >= 0 ? state.folderMembers.splice(idx, 1)[0] : null;
  };

  (prisma.imageRegistry as any).findUnique = async ({ where }: any) => {
    const img = state.images.find((i) => (where.id && i.id === where.id) || (where.shortCode && i.shortCode === where.shortCode));
    return img ? { ...img, folder: state.folders.find((x) => x.id === img.folderId) || null } : null;
  };
  (prisma.imageRegistry as any).findMany = async ({ where }: any) => state.images.filter((i) => !where?.folderId || i.folderId === where.folderId);
  (prisma.imageRegistry as any).count = async () => state.images.length;
  (prisma.imageRegistry as any).create = async ({ data }: any) => {
    const img = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
    state.images.push(img);
    return img;
  };
  (prisma.imageRegistry as any).update = async ({ where, data }: any) => {
    const img = state.images.find((i) => i.id === where.id);
    if (!img) throw new Error('Image not found');
    Object.assign(img, data, { updatedAt: new Date() });
    return { ...img };
  };
  (prisma.imageRegistry as any).delete = async ({ where }: any) => {
    const idx = state.images.findIndex((i) => i.id === where.id);
    return idx >= 0 ? state.images.splice(idx, 1)[0] : null;
  };

  (prisma.tableRegistry as any).findUnique = async ({ where }: any) => {
    const tbl = state.tables.find((t) => (where.id && t.id === where.id) || (where.shortCode && t.shortCode === where.shortCode));
    return tbl ? { ...tbl, folder: state.folders.find((x) => x.id === tbl.folderId) || null } : null;
  };
  (prisma.tableRegistry as any).findMany = async ({ where }: any) => state.tables.filter((t) => !where?.folderId || t.folderId === where.folderId);
  (prisma.tableRegistry as any).count = async () => state.tables.length;
  (prisma.tableRegistry as any).create = async ({ data }: any) => {
    const tbl = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
    state.tables.push(tbl);
    return tbl;
  };
  (prisma.tableRegistry as any).update = async ({ where, data }: any) => {
    const tbl = state.tables.find((t) => t.id === where.id);
    if (!tbl) throw new Error('Table not found');
    Object.assign(tbl, data, { updatedAt: new Date() });
    return { ...tbl };
  };
  (prisma.tableRegistry as any).delete = async ({ where }: any) => {
    const idx = state.tables.findIndex((t) => t.id === where.id);
    return idx >= 0 ? state.tables.splice(idx, 1)[0] : null;
  };

  const origQueryRaw = prisma.$queryRaw;
  (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];

  const teardown = () => {
    Object.assign(prisma.user, orig.user);
    Object.assign(prisma.folder, orig.folder);
    Object.assign(prisma.folderMember, orig.folderMember);
    Object.assign(prisma.imageRegistry, orig.imageRegistry);
    Object.assign(prisma.tableRegistry, orig.tableRegistry);
    (prisma as any).$queryRaw = origQueryRaw;
  };

  return { state, teardown };
}
