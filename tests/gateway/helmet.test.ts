import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import fs from 'node:fs/promises';

describe('Gateway: Cabeceras de Seguridad HTTP (Helmet)', () => {
  const originalQueryRaw = prisma.$queryRaw;

  afterEach(() => {
    (prisma as any).$queryRaw = originalQueryRaw;
    mock.reset();
  });

  it('debe incluir cabeceras de seguridad fundamentales en las respuestas HTTP', async () => {
    (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
    mock.method(fs, 'access', async () => undefined);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 200);

    // X-Content-Type-Options: nosniff para prevenir MIME-sniffing
    assert.strictEqual(
      response.headers['x-content-type-options'],
      'nosniff',
      'Debe incluir X-Content-Type-Options: nosniff'
    );

    // X-Frame-Options: DENY para mitigar ataques de clickjacking
    assert.strictEqual(
      response.headers['x-frame-options'],
      'DENY',
      'Debe incluir X-Frame-Options: DENY'
    );

    // Cross-Origin-Resource-Policy: cross-origin para permitir visualización de imágenes públicas
    assert.strictEqual(
      response.headers['cross-origin-resource-policy'],
      'cross-origin',
      'Debe permitir cross-origin resource policy para entrega pública de imágenes y tablas'
    );

    // Referrer-Policy
    assert.strictEqual(
      response.headers['referrer-policy'],
      'strict-origin-when-cross-origin',
      'Debe incluir Referrer-Policy seguro'
    );
  });
});
