import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(8080),
    HOST: z.string().default('0.0.0.0'),
    BASE_URL: z.string().url().default('http://localhost:8080'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    API_KEY_PEPPER: z.string().min(16, 'API_KEY_PEPPER must be at least 16 characters long'),
    STORAGE_DIR: z.string().default('./storage'),
    MAX_STORAGE_GB: z.coerce.number().default(50),
    JWT_SECRET: z
      .string()
      .min(16, 'JWT_SECRET must be at least 16 characters')
      .default('development_jwt_secret_must_be_long_and_safe_32_chars'),
    ADMIN_USERNAME: z.string().min(3).default('admin'),
    ADMIN_PASSWORD: z.string().min(6).default('AdminPass123!'),
    CORS_ALLOWED_ORIGINS: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (
        data.JWT_SECRET === 'development_jwt_secret_must_be_long_and_safe_32_chars' ||
        data.JWT_SECRET.toLowerCase().includes('development')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'En producción (NODE_ENV=production) se debe definir un JWT_SECRET robusto y no usar el valor por defecto',
          path: ['JWT_SECRET'],
        });
      }

      if (data.ADMIN_PASSWORD === 'AdminPass123!') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'En producción (NODE_ENV=production) se debe configurar un ADMIN_PASSWORD personalizado y no usar el valor por defecto',
          path: ['ADMIN_PASSWORD'],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(customEnv?: Record<string, unknown>): Env {
  const result = envSchema.safeParse(customEnv ?? process.env);
  if (!result.success) {
    if (!customEnv) {
      console.error('❌ Error de validación en variables de entorno:');
      console.error(JSON.stringify(result.error.format(), null, 2));
      process.exit(1);
    }
    throw new Error(
      `Error de validación en variables de entorno: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
    );
  }
  return result.data;
}

export const env = validateEnv();
