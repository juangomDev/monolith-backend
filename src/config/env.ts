import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  BASE_URL: z.string().url().default('http://localhost:8080'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_KEY_PEPPER: z.string().min(16, 'API_KEY_PEPPER must be at least 16 characters long'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_STORAGE_GB: z.coerce.number().default(50),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('development_jwt_secret_must_be_long_and_safe_32_chars'),
  ADMIN_USERNAME: z.string().min(3).default('admin'),
  ADMIN_PASSWORD: z.string().min(6).default('AdminPass123!'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Error de validación en variables de entorno:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
