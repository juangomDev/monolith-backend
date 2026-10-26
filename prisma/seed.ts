import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const pepper = process.env.API_KEY_PEPPER || 'development_secret_pepper_32_characters_long';
  const rawKey = 'mk_live_dev_test_api_key_12345';
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHmac('sha256', pepper).update(rawKey).digest('hex');

  console.log('🌱 Sembrando cliente de prueba en la base de datos...');

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

  console.log('✅ Cliente listo:');
  console.log(`   ID: ${client.id}`);
  console.log(`   Nombre: ${client.name}`);
  console.log(`   API Key de Prueba (para la cabecera X-API-Key):`);
  console.log(`   👉 ${rawKey}`);
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
