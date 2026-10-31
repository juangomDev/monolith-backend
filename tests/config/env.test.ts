import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../../src/config/env.js';

describe('Config: Validación Estricta de Variables de Entorno (env.ts)', () => {
  const baseValidDevEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/testdb',
    API_KEY_PEPPER: 'development_pepper_at_least_16_chars_long',
  };

  it('debe validar exitosamente la configuración en entorno de desarrollo con valores por defecto', () => {
    const config = validateEnv(baseValidDevEnv);
    assert.strictEqual(config.NODE_ENV, 'development');
    assert.strictEqual(config.PORT, 8080);
    assert.strictEqual(config.ADMIN_USERNAME, 'admin');
    assert.strictEqual(config.ADMIN_PASSWORD, 'AdminPass123!');
  });

  it('debe validar exitosamente en producción cuando se definen secretos robustos personalizados', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-host:5432/proddb',
      API_KEY_PEPPER: 'super_secure_production_pepper_32_bytes_len',
      JWT_SECRET: 'production_super_secure_jwt_secret_token_987654321_abc',
      ADMIN_USERNAME: 'superadmin',
      ADMIN_PASSWORD: 'ProductionSecurePassword2026!#',
    };

    const config = validateEnv(validProdEnv);
    assert.strictEqual(config.NODE_ENV, 'production');
    assert.strictEqual(config.ADMIN_USERNAME, 'superadmin');
    assert.strictEqual(config.JWT_SECRET, 'production_super_secure_jwt_secret_token_987654321_abc');
  });

  it('debe fallar en producción si JWT_SECRET usa el valor de desarrollo por defecto', () => {
    const invalidProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-host:5432/proddb',
      API_KEY_PEPPER: 'super_secure_production_pepper_32_bytes_len',
      JWT_SECRET: 'development_jwt_secret_must_be_long_and_safe_32_chars',
      ADMIN_PASSWORD: 'ProductionSecurePassword2026!',
    };

    assert.throws(
      () => validateEnv(invalidProdEnv),
      (err: Error) => {
        assert.ok(err.message.includes('se debe definir un JWT_SECRET robusto'));
        return true;
      }
    );
  });

  it('debe fallar en producción si ADMIN_PASSWORD usa la contraseña débil por defecto', () => {
    const invalidProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-host:5432/proddb',
      API_KEY_PEPPER: 'super_secure_production_pepper_32_bytes_len',
      JWT_SECRET: 'production_super_secure_jwt_secret_token_987654321_abc',
      ADMIN_PASSWORD: 'AdminPass123!',
    };

    assert.throws(
      () => validateEnv(invalidProdEnv),
      (err: Error) => {
        assert.ok(err.message.includes('se debe configurar un ADMIN_PASSWORD personalizado'));
        return true;
      }
    );
  });

  it('debe fallar si DATABASE_URL no está presente', () => {
    const missingDbEnv = {
      NODE_ENV: 'development',
      API_KEY_PEPPER: 'development_pepper_at_least_16_chars_long',
    };

    assert.throws(
      () => validateEnv(missingDbEnv),
      (err: Error) => {
        assert.ok(err.message.includes('DATABASE_URL'));
        return true;
      }
    );
  });

  it('debe fallar si API_KEY_PEPPER tiene menos de 16 caracteres', () => {
    const shortPepperEnv = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/testdb',
      API_KEY_PEPPER: 'short',
    };

    assert.throws(
      () => validateEnv(shortPepperEnv),
      (err: Error) => {
        assert.ok(err.message.includes('API_KEY_PEPPER must be at least 16 characters long'));
        return true;
      }
    );
  });
});
