import { env } from '../config/env.js';

/**
 * Expresión regular para entornos locales de desarrollo (localhost o 127.0.0.1 con cualquier puerto)
 */
export const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Expresión regular para subdominios dinámicos de prueba de Dokploy (*.sslip.io con cualquier puerto)
 */
export const DOKPLOY_SSLIP_REGEX = /^https?:\/\/([a-zA-Z0-9-]+\.)*sslip\.io(:\d+)?$/;

/**
 * Parsea una lista de orígenes separados por comas
 */
export function parseAllowedOrigins(originsString?: string): string[] {
  if (!originsString) return [];
  return originsString
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Valida si un origen HTTP está autorizado según las reglas de seguridad
 */
export function isAllowedOrigin(origin: string | undefined, extraAllowedOrigins: string[] = []): boolean {
  // Peticiones sin cabecera Origin (p. ej. curl, healthchecks internos o mismo origen)
  if (!origin) {
    return true;
  }

  // 1. Entornos locales de desarrollo
  if (LOCAL_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  // 2. Subdominios dinámicos de Dokploy (*.sslip.io)
  if (DOKPLOY_SSLIP_REGEX.test(origin)) {
    return true;
  }

  // 3. Orígenes adicionales configurados explícitamente en variables de entorno
  if (extraAllowedOrigins.includes(origin)) {
    return true;
  }

  return false;
}

/**
 * Función delegada para @fastify/cors
 */
export function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow: boolean) => void
): void {
  const configuredOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const allowed = isAllowedOrigin(origin, configuredOrigins);
  callback(null, allowed);
}
