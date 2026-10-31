import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, parseAllowedOrigins } from '../../src/gateway/cors.js';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import fs from 'node:fs/promises';

describe('Gateway: CORS Dinámico y Hardening de Orígenes', () => {
  describe('Pruebas Unitarias: isAllowedOrigin y parseAllowedOrigins', () => {
    it('parseAllowedOrigins: parsea lista separada por comas y descarta vacíos', () => {
      const list = parseAllowedOrigins('https://app.miempresa.com, https://admin.miempresa.com , ');
      assert.deepStrictEqual(list, ['https://app.miempresa.com', 'https://admin.miempresa.com']);
    });

    it('parseAllowedOrigins: devuelve arreglo vacío si no hay valor', () => {
      assert.deepStrictEqual(parseAllowedOrigins(''), []);
      assert.deepStrictEqual(parseAllowedOrigins(undefined), []);
    });

    it('debe permitir peticiones sin cabecera origin (curl, server-to-server)', () => {
      assert.strictEqual(isAllowedOrigin(undefined), true);
    });

    it('debe permitir orígenes de desarrollo local (localhost y 127.0.0.1 con cualquier puerto)', () => {
      assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
      assert.strictEqual(isAllowedOrigin('http://localhost:3000'), true);
      assert.strictEqual(isAllowedOrigin('http://127.0.0.1:8080'), true);
      assert.strictEqual(isAllowedOrigin('https://localhost:8443'), true);
    });

    it('debe permitir dominios dinámicos de prueba de Dokploy (*.sslip.io)', () => {
      assert.strictEqual(isAllowedOrigin('https://sub.preview.sslip.io'), true);
      assert.strictEqual(isAllowedOrigin('http://app-192-168-1-10.sslip.io:8080'), true);
      assert.strictEqual(isAllowedOrigin('https://dokploy.sslip.io'), true);
    });

    it('debe rechazar dominios externos no autorizados y ataques de suplantación', () => {
      assert.strictEqual(isAllowedOrigin('https://evil-hacker.com'), false);
      assert.strictEqual(isAllowedOrigin('https://sslip.io.attacker.com'), false);
      assert.strictEqual(isAllowedOrigin('https://fake-sslip.io.ru'), false);
      assert.strictEqual(isAllowedOrigin('http://notlocalhost:3000'), false);
    });

    it('debe permitir orígenes explícitos configurados en lista adicional', () => {
      const allowed = ['https://mi-produccion.com'];
      assert.strictEqual(isAllowedOrigin('https://mi-produccion.com', allowed), true);
      assert.strictEqual(isAllowedOrigin('https://otro.com', allowed), false);
    });
  });

  describe('Pruebas de Integración HTTP: Cabeceras CORS', () => {
    const originalQueryRaw = prisma.$queryRaw;

    afterEach(() => {
      (prisma as any).$queryRaw = originalQueryRaw;
      mock.reset();
    });

    it('debe reflejar Access-Control-Allow-Origin y credenciales para localhost', async () => {
      (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
      mock.method(fs, 'access', async () => undefined);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:5173',
        },
      });

      assert.strictEqual(response.headers['access-control-allow-origin'], 'http://localhost:5173');
      assert.strictEqual(response.headers['access-control-allow-credentials'], 'true');
    });

    it('debe reflejar Access-Control-Allow-Origin para subdominios .sslip.io de Dokploy', async () => {
      (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
      mock.method(fs, 'access', async () => undefined);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://preview-deploy.192.168.1.1.sslip.io',
        },
      });

      assert.strictEqual(
        response.headers['access-control-allow-origin'],
        'https://preview-deploy.192.168.1.1.sslip.io'
      );
      assert.strictEqual(response.headers['access-control-allow-credentials'], 'true');
    });

    it('NO debe reflejar Access-Control-Allow-Origin ante un origen no autorizado', async () => {
      (prisma as any).$queryRaw = async () => [{ '?column?': 1 }];
      mock.method(fs, 'access', async () => undefined);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://malicious-website.com',
        },
      });

      assert.strictEqual(
        response.headers['access-control-allow-origin'],
        undefined,
        'No debe enviar Access-Control-Allow-Origin a sitios no autorizados'
      );
    });

    it('preflight OPTIONS: no otorga cabeceras CORS a orígenes no autorizados', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: 'https://evil.com',
          'access-control-request-method': 'POST',
        },
      });

      assert.strictEqual(
        response.headers['access-control-allow-origin'],
        undefined,
        'Preflight no debe autorizar orígenes no permitidos'
      );
    });
  });
});
