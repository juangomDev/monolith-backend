import { prisma } from '../config/db.js';
import { pathToFileURL } from 'node:url';

export interface RawSqlClient {
  $executeRawUnsafe: (query: string) => Promise<unknown>;
  $disconnect: () => Promise<void>;
}

/**
 * Migra de forma segura cualquier valor legacy 'USER' en el enum Role de PostgreSQL
 * hacia 'MANAGER' antes de ejecutar `prisma db push --accept-data-loss`.
 * Evita que PostgreSQL falle al eliminar la variante 'USER' del enum Role en Dokploy.
 */
export async function migrateLegacyUserRoles(client: RawSqlClient = prisma): Promise<void> {
  try {
    await client.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';`);
    await client.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COLLABORATOR';`);
    await client.$executeRawUnsafe(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MANAGER'::"Role";`);
    await client.$executeRawUnsafe(`UPDATE "users" SET "role" = 'MANAGER'::"Role" WHERE "role"::text = 'USER';`);
    console.log('[DB Pre-Push] Verificación y migración de roles legacy (USER -> MANAGER) completada.');
  } catch {
    // Si la tabla "users" o el tipo "Role" aún no existen (base de datos limpia),
    // ignoramos silenciosamente para que `prisma db push` cree el esquema desde cero.
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  migrateLegacyUserRoles();
}

