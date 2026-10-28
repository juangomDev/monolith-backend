import { PrismaClient, Role } from '@prisma/client';
import crypto from 'node:crypto';
import { hashPassword } from '../src/modules/users/users.service.js';

const prisma = new PrismaClient();

async function main() {
  const pepper = process.env.API_KEY_PEPPER || 'development_secret_pepper_32_characters_long';
  const rawKey = 'mk_live_dev_test_api_key_12345';
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHmac('sha256', pepper).update(rawKey).digest('hex');

  console.log('🌱 Sembrando datos iniciales en la base de datos...');

  // 1. Cliente API de prueba
  const client = await prisma.apiClient.upsert({
    where: { keyHash },
    update: { isActive: true },
    create: {
      name: 'Cliente de Desarrollo / Pruebas',
      keyPrefix,
      keyHash,
      rateLimit: 100,
      isActive: true,
    },
  });

  console.log('✅ Cliente API listo:');
  console.log(`   ID: ${client.id}`);
  console.log(`   Nombre: ${client.name}`);
  console.log(`   API Key (X-API-Key): 👉 ${rawKey}`);

  // 2. Único Administrador del sistema
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';

  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (!existingAdmin) {
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log('✅ Cuenta Administrador creada:');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Rol: ${admin.role}`);
  } else {
    console.log(`ℹ️ Administrador '${adminUsername}' ya existe en la base de datos.`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
