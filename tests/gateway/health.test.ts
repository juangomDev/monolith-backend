import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import fs from 'node:fs/promises';

describe('Gateway: Endpoint de Salud (/health)', () => {
  const originalQueryRaw = prisma.$queryRaw;

  afterEach(() => {
    (prisma as any).$queryRaw = originalQueryRaw;
    mock.reset();
  });

  it('GET /health: responde 200 OK cuando la base de datos y el almacenamiento están operativos', async () => {
    (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
    mock.method(fs, 'access', async () => undefined);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.db, 'up');
    assert.strictEqual(body.storage, 'writable');
    assert.ok(body.timestamp);
  });

  it('GET /health: responde 503 con db down si la consulta a la base de datos falla', async () => {
    (prisma as any).$queryRaw = async () => {
      throw new Error('Connection refused');
    };
    mock.method(fs, 'access', async () => undefined);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.status, 'degraded');
    assert.strictEqual(body.db, 'down');
  });

  it('GET /health: responde 503 con storage unwritable si el disco no tiene permisos de escritura', async () => {
    (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
    mock.method(fs, 'access', async () => {
      throw new Error('EACCES: permission denied');
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.status, 'degraded');
    assert.strictEqual(body.storage, 'unwritable');
  });
});
