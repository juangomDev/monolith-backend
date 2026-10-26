import { customAlphabet } from 'nanoid';

// Alfabeto seguro para URLs sin caracteres ambiguos (0, O, I, l)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const nanoid = customAlphabet(ALPHABET, 10);

export function generateShortCode(): string {
  return nanoid();
}

/**
 * Ejecuta una operación de inserción con reintento automático ante colisión única de short_code
 */
export async function withShortCodeRetry<T>(
  operation: (code: string) => Promise<T>,
  maxAttempts = 3
): Promise<{ result: T; code: string }> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const code = generateShortCode();
    try {
      const result = await operation(code);
      return { result, code };
    } catch (err: unknown) {
      attempt++;
      // P2002 es el código de Prisma para Unique constraint violation
      const isUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';
      if (!isUniqueViolation || attempt >= maxAttempts) {
        throw err;
      }
    }
  }
  throw new Error('No se pudo generar un short_code único tras múltiples reintentos');
}
