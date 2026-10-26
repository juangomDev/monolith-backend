import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateShortCode, withShortCodeRetry } from '../../src/shared/shortcode.js';

describe('Shared: shortcode generator', () => {
  it('debe generar un código de longitud exacta 10', () => {
    const code = generateShortCode();
    assert.strictEqual(code.length, 10);
  });

  it('debe contener solo caracteres del alfabeto seguro Base58 (sin 0, O, I, l)', () => {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{10}$/;
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      assert.match(code, base58Regex, `El código ${code} contiene caracteres no permitidos`);
    }
  });

  it('debe generar códigos con suficiente entropía y aleatoriedad', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateShortCode());
    }
    assert.strictEqual(codes.size, 100, 'Se detectaron colisiones en una muestra de 100 códigos');
  });

  it('withShortCodeRetry: debe retornar el resultado en el primer intento exitoso', async () => {
    let attempts = 0;
    const { result, code } = await withShortCodeRetry(async (c) => {
      attempts++;
      return `ok-${c}`;
    });

    assert.strictEqual(attempts, 1);
    assert.strictEqual(result, `ok-${code}`);
    assert.strictEqual(code.length, 10);
  });

  it('withShortCodeRetry: debe reintentar ante colisión única de Prisma P2002', async () => {
    let attempts = 0;
    const { result } = await withShortCodeRetry(async (c) => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Unique constraint failed') as Error & { code: string };
        error.code = 'P2002';
        throw error;
      }
      return `recovered-${c}`;
    }, 3);

    assert.strictEqual(attempts, 2);
    assert.ok(result.startsWith('recovered-'));
  });

  it('withShortCodeRetry: debe lanzar error si se supera el número máximo de reintentos', async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withShortCodeRetry(async () => {
          attempts++;
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }, 3);
      },
      (err: Error & { code?: string }) => {
        assert.strictEqual(attempts, 3);
        assert.strictEqual(err.code, 'P2002');
        return true;
      }
    );
  });

  it('withShortCodeRetry: debe propagar de inmediato errores que no sean P2002', async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withShortCodeRetry(async () => {
          attempts++;
          throw new Error('Database connection lost');
        }, 3);
      },
      /Database connection lost/
    );

    assert.strictEqual(attempts, 1);
  });
});
