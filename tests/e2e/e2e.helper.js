import { prisma } from '../../src/config/db.js';
import { Role, FolderPermission } from '@prisma/client';
import { hashPassword } from '../../src/modules/users/users.service.js';
import crypto from 'node:crypto';
export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
export const SAMPLE_CSV = 'id,nombre,valor\n1,Producto Alpha,100\n2,Producto Beta,200\n';
export function buildMultipart(filename, content, mimetype, fields) {
    const boundary = `----WebKitFormBoundary${crypto.randomBytes(8).toString('hex')}`;
    const parts = [];
    if (fields) {
        for (const [key, val] of Object.entries(fields)) {
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
        }
    }
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`);
    parts.push(typeof content === 'string' ? Buffer.from(content) : content);
    parts.push(`\r\n--${boundary}--\r\n`);
    return {
        payload: Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p))),
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
}
export async function setupInMemoryE2EDb() {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    const adminHash = await hashPassword(adminPass);
    const adminId = '00000000-0000-4000-8000-000000000001';
    const state = {
        users: [{ id: adminId, username: adminUser, passwordHash: adminHash, role: Role.ADMIN, tokenVersion: 0, isActive: true, createdById: null, createdAt: new Date() }],
        folders: [], folderMembers: [], images: [], tables: [],
    };
    const orig = {
        user: { ...prisma.user }, folder: { ...prisma.folder }, folderMember: { ...prisma.folderMember },
        imageRegistry: { ...prisma.imageRegistry }, tableRegistry: { ...prisma.tableRegistry },
    };
    prisma.user.findUnique = async ({ where }) => state.users.find((u) => (where.id && u.id === where.id) || (where.username && u.username === where.username)) || null;
    prisma.user.findFirst = async ({ where }) => state.users.find((u) => (!where?.role || u.role === where.role) && (where?.isActive === undefined || u.isActive === where.isActive)) || null;
    prisma.user.findMany = async ({ where }) => state.users.filter((u) => (!where?.createdById || u.createdById === where.createdById) && (!where?.role || u.role === where.role));
    prisma.user.create = async ({ data }) => {
        const user = { id: data.id || crypto.randomUUID(), username: data.username, passwordHash: data.passwordHash, role: data.role || Role.MANAGER, isActive: data.isActive ?? true, tokenVersion: 0, createdById: data.createdById || null, createdAt: new Date() };
        state.users.push(user);
        return user;
    };
    prisma.user.update = async ({ where, data }) => {
        const user = state.users.find((u) => u.id === where.id);
        if (!user)
            throw new Error('User not found');
        if (data.tokenVersion?.increment)
            user.tokenVersion += data.tokenVersion.increment;
        else if (data.tokenVersion !== undefined)
            user.tokenVersion = data.tokenVersion;
        if (data.passwordHash !== undefined)
            user.passwordHash = data.passwordHash;
        if (data.isActive !== undefined)
            user.isActive = data.isActive;
        return { ...user };
    };
    prisma.user.delete = async ({ where }) => {
        const idx = state.users.findIndex((u) => u.id === where.id);
        return idx >= 0 ? state.users.splice(idx, 1)[0] : null;
    };
    function fmtFolder(f, filterUserId) {
        const u = state.users.find((usr) => usr.id === f.userId);
        const member = filterUserId ? state.folderMembers.find((m) => m.folderId === f.id && m.userId === filterUserId) : undefined;
        return {
            ...f,
            _count: { images: state.images.filter((i) => i.folderId === f.id).length, tables: state.tables.filter((t) => t.folderId === f.id).length },
            user: { id: u?.id || f.userId, username: u?.username || 'user' },
            members: member ? [{ permission: member.permission }] : [],
        };
    }
    prisma.folder.findUnique = async ({ where, include }) => {
        const f = state.folders.find((x) => x.id === where.id);
        if (!f)
            return null;
        const res = fmtFolder(f);
        if (include?.images)
            res.images = state.images.filter((i) => i.folderId === f.id);
        if (include?.tables)
            res.tables = state.tables.filter((t) => t.folderId === f.id);
        return res;
    };
    prisma.folder.findFirst = async ({ where }) => state.folders.find((f) => (!where?.userId || f.userId === where.userId) && (!where?.type || f.type === where.type) && (!where?.name || f.name === where.name)) || null;
    prisma.folder.findMany = async ({ where, skip, take }) => {
        let list = state.folders.filter((f) => {
            if (where?.type && f.type !== where.type)
                return false;
            if (where?.name?.contains && !f.name.toLowerCase().includes(where.name.contains.toLowerCase()))
                return false;
            if (where?.members?.some?.userId)
                return state.folderMembers.some((m) => m.folderId === f.id && m.userId === where.members.some.userId);
            if (where?.OR) {
                return where.OR.some((c) => (!c.isPrivate && !f.isPrivate) || (c.userId && f.userId === c.userId) || (c.members?.some?.userId && state.folderMembers.some((m) => m.folderId === f.id && m.userId === c.members.some.userId)));
            }
            return true;
        });
        if (skip)
            list = list.slice(skip);
        if (take)
            list = list.slice(0, take);
        return list.map((f) => fmtFolder(f, where?.members?.where?.userId));
    };
    prisma.folder.count = async () => state.folders.length;
    prisma.folder.create = async ({ data }) => {
        const f = { id: data.id || crypto.randomUUID(), name: data.name, type: data.type, color: data.color || null, isPrivate: data.isPrivate ?? false, userId: data.userId, createdAt: new Date(), updatedAt: new Date() };
        state.folders.push(f);
        return f;
    };
    prisma.folder.update = async ({ where, data }) => {
        const f = state.folders.find((x) => x.id === where.id);
        if (!f)
            throw new Error('Folder not found');
        if (data.name !== undefined)
            f.name = data.name;
        if (data.color !== undefined)
            f.color = data.color;
        if (data.isPrivate !== undefined)
            f.isPrivate = data.isPrivate;
        f.updatedAt = new Date();
        return fmtFolder(f);
    };
    prisma.folder.delete = async ({ where }) => {
        const idx = state.folders.findIndex((x) => x.id === where.id);
        return idx >= 0 ? state.folders.splice(idx, 1)[0] : null;
    };
    prisma.folderMember.findUnique = async ({ where }) => state.folderMembers.find((m) => m.folderId === where.folderId_userId.folderId && m.userId === where.folderId_userId.userId) || null;
    prisma.folderMember.findMany = async ({ where }) => state.folderMembers.filter((m) => m.folderId === where.folderId).map((m) => {
        const u = state.users.find((usr) => usr.id === m.userId);
        return { ...m, user: { id: u?.id, username: u?.username, role: u?.role } };
    });
    prisma.folderMember.upsert = async ({ where, create, update }) => {
        const { folderId, userId } = where.folderId_userId;
        let m = state.folderMembers.find((x) => x.folderId === folderId && x.userId === userId);
        if (m)
            m.permission = update.permission;
        else {
            m = { id: crypto.randomUUID(), folderId, userId, permission: create.permission || FolderPermission.READ, createdAt: new Date() };
            state.folderMembers.push(m);
        }
        return { ...m };
    };
    prisma.folderMember.delete = async ({ where }) => {
        const idx = state.folderMembers.findIndex((m) => m.folderId === where.folderId_userId.folderId && m.userId === where.folderId_userId.userId);
        return idx >= 0 ? state.folderMembers.splice(idx, 1)[0] : null;
    };
    prisma.imageRegistry.findUnique = async ({ where }) => {
        const img = state.images.find((i) => (where.id && i.id === where.id) || (where.shortCode && i.shortCode === where.shortCode));
        return img ? { ...img, folder: state.folders.find((x) => x.id === img.folderId) || null } : null;
    };
    prisma.imageRegistry.findMany = async ({ where }) => state.images.filter((i) => !where?.folderId || i.folderId === where.folderId);
    prisma.imageRegistry.count = async () => state.images.length;
    prisma.imageRegistry.create = async ({ data }) => {
        const img = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        state.images.push(img);
        return img;
    };
    prisma.imageRegistry.update = async ({ where, data }) => {
        const img = state.images.find((i) => i.id === where.id);
        if (!img)
            throw new Error('Image not found');
        Object.assign(img, data, { updatedAt: new Date() });
        return { ...img };
    };
    prisma.imageRegistry.delete = async ({ where }) => {
        const idx = state.images.findIndex((i) => i.id === where.id);
        return idx >= 0 ? state.images.splice(idx, 1)[0] : null;
    };
    prisma.tableRegistry.findUnique = async ({ where }) => {
        const tbl = state.tables.find((t) => (where.id && t.id === where.id) || (where.shortCode && t.shortCode === where.shortCode));
        return tbl ? { ...tbl, folder: state.folders.find((x) => x.id === tbl.folderId) || null } : null;
    };
    prisma.tableRegistry.findMany = async ({ where }) => state.tables.filter((t) => !where?.folderId || t.folderId === where.folderId);
    prisma.tableRegistry.count = async () => state.tables.length;
    prisma.tableRegistry.create = async ({ data }) => {
        const tbl = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        state.tables.push(tbl);
        return tbl;
    };
    prisma.tableRegistry.update = async ({ where, data }) => {
        const tbl = state.tables.find((t) => t.id === where.id);
        if (!tbl)
            throw new Error('Table not found');
        Object.assign(tbl, data, { updatedAt: new Date() });
        return { ...tbl };
    };
    prisma.tableRegistry.delete = async ({ where }) => {
        const idx = state.tables.findIndex((t) => t.id === where.id);
        return idx >= 0 ? state.tables.splice(idx, 1)[0] : null;
    };
    const origQueryRaw = prisma.$queryRaw;
    prisma.$queryRaw = async () => [{ '?column?': 1 }];
    const teardown = () => {
        Object.assign(prisma.user, orig.user);
        Object.assign(prisma.folder, orig.folder);
        Object.assign(prisma.folderMember, orig.folderMember);
        Object.assign(prisma.imageRegistry, orig.imageRegistry);
        Object.assign(prisma.tableRegistry, orig.tableRegistry);
        prisma.$queryRaw = origQueryRaw;
    };
    return { state, teardown };
}
//# sourceMappingURL=e2e.helper.js.map