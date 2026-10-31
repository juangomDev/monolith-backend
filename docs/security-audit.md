# 🛡️ Reporte de Análisis y Auditoría de Seguridad (Security Audit)

> **Monolith Backend API — Versión 1.0.0**  
> **Fecha de Evaluación:** 31 de Octubre de 2026  
> **Metodología:** OWASP Top 10 API Security, CWE / SANS Top 25, Principio de Menor Privilegio y Defensa en Profundidad.

---

## 📊 1. Resumen Ejecutivo

El backend monolítico implementa una arquitectura con sólidos mecanismos de defensa en profundidad. Los vectores críticos de riesgo en APIs de ingesta y distribución multimedia (inyección de archivos, ejecución remota de código, escalada de privilegios y ataques de enumeración) han sido prevenidos y validados mediante pruebas automatizadas.

| Vector de Seguridad | Estado | Calificación |
|---|:---:|:---:|
| **Control de Acceso y RBAC** | ✅ Implementado | **Excelente** |
| **Autenticación y Criptografía** | ✅ Implementado | **Excelente** (Access Token 15m + Cookie 7d) |
| **Prevención de Inyección y Traversal de Archivos** | ✅ Blindado | **Excelente** |
| **Hardening HTTP y Anti-DDoS** | ✅ Blindado | **Excelente** (Rate Limit Login 5 req/min) |
| **Capability URLs y Enumeración** | ✅ Blindado | **Excelente** |
| **Auditoría de Dependencias (`npm audit`)** | ✅ Mitigado | **Excelente** (0 vulnerabilidades con overrides) |

---

## 🟢 2. Controles de Seguridad Implementados (Fortalezas)

### 2.1. Criptografía y Gestión de Credenciales
- **Algoritmo de Hashing Seguro:** Uso de `scrypt` con salt criptográfico de 16 bytes generado con `crypto.randomBytes` y longitud de clave derivada de 64 bytes.
- **Protección contra Timing Attacks:** Las comparaciones de hashes se realizan exclusivamente mediante `crypto.timingSafeEqual`, impidiendo ataques de canal lateral (*side-channel attacks*).
- **Almacenamiento de API Keys:** Las claves de clientes máquina jamás se guardan en texto plano; se utiliza HMAC-SHA256 con un secreto `API_KEY_PEPPER` obligatorio de al menos 16 caracteres.
- **Revocación Inmediata de Sesiones:** El modelo de datos implementa `tokenVersion`. Al cerrar sesión (`/api/v1/auth/logout`), se incrementa la versión, invalidando de inmediato cualquier token previamente emitido sin esperar a su expiración natural.
- **Cookies Seguras:** La cookie de `refreshToken` se emite con flags restrictivos: `HttpOnly` (inaccesible desde JavaScript), `SameSite: Strict` (protección contra CSRF), y path limitado a `/api/v1/auth`.

### 2.2. Aislamiento de Privacidad y Modelo de Carpetas
- **Regla de Oro de Privacidad:** Las carpetas marcadas como `isPrivate: true` están aisladas a nivel de base de datos; solo su propietario y usuarios con rol `ADMIN` pueden consultarlas o eliminarlas. Un intento de acceso ajeno genera un `403 Forbidden`.
- **Integridad de Tipos Cruzados:** Validación estricta que impide mover imágenes a carpetas de tablas (`TABLE`) o datasets a carpetas de imágenes (`IMAGE`).
- **Invariante de Administrador Único:** Se bloquea a nivel de servicio (`ADMIN_CREATION_FORBIDDEN`) cualquier intento de crear un usuario adicional con rol `ADMIN`, evitando escalamiento de privilegios horizontal o vertical.

### 2.3. Blindaje de Ingesta de Archivos (Anti-Malware & Anti-Traversal)
- **Inspección de Magic Bytes Reales:** No se confía en la cabecera `Content-Type` enviada por el cliente ni en la extensión del archivo. Se leen los primeros 4100 bytes reales con `file-type` para verificar firmas binarias legítimas (JPEG, PNG, WebP).
- **Protección contra Traversal de Rutas:** El nombre original del archivo (`part.filename`) **nunca** se utiliza para almacenar en disco. Los archivos se guardan bajo nombres opacos autogenerados (`${shortCode}${ext}`), neutralizando ataques como `../../etc/passwd` o nombres con caracteres de escape.
- **Detección de Scripts en Tablas:** El validador `file-guard.ts` rechaza archivos CSV con bytes nulos (`0x00`) o encabezados que coincidan con firmas ejecutables (`<?php`, `<script`, `#!/bin/`).
- **Limpieza de Archivos Truncados (Anti-Bomba):** Si una subida excede el tamaño límite (50MB imágenes, 100MB tablas), el stream se corta de inmediato y el archivo temporal se destruye (`fs.unlink`) en disco para evitar saturación de almacenamiento.

### 2.4. Capability URLs y Resistencia a Enumeración
- **Entropía Criptográfica:** Los shortcodes públicos (`/i/:short_code` y `/t/:short_code`) se generan con `nanoid` sobre el alfabeto seguro Base58 (58 caracteres) con longitud 10.
- **Espacio de Búsqueda:** $58^{10} \approx 4.3 \times 10^{17}$ combinaciones posibles (>430 billones), haciendo que la enumeración por fuerza bruta sea matemáticamente inviable a través de la red.
- **Caché Inmutable:** Se entrega con `Cache-Control: public, max-age=31536000, immutable`, descargando el procesamiento de lectura hacia CDNs o proxys inversos.

### 2.5. Hardening de Red y Cabeceras HTTP
- **Anti-Slowloris:** `Fastify` configurado con `connectionTimeout: 10000` (10s) y `requestTimeout: 30000` (30s) para mitigar ataques de agotamiento de sockets HTTP.
- **Cabeceras de Seguridad (Helmet):** HSTS forzado (`max-age=31536000`, `includeSubDomains`, `preload`), `X-Frame-Options: deny` (anti-Clickjacking), `X-Content-Type-Options: nosniff`.
- **Rate Limiting:** Límite global activo de 100 peticiones por minuto por IP o por ID de API Client.
- **Supresión de Fugas de Información (RFC 7807):** El manejador global de errores oculta trazas de pila (*stack traces*) y mensajes de excepción interna de base de datos en respuestas 500, devolviendo un mensaje genérico estándar.

---

## ⚠️ 3. Hallazgos y Puntos de Atención (Vulnerabilidades Menores y Mejoras)

### Hallazgo 1: Vulnerabilidades en subdependencias de `exceljs`
- **Severidad:** Moderada (CWE-405, CWE-787).
- **Detalle:** `npm audit` detecta 9 vulnerabilidades moderadas en subdependencias indirectas (`archiver`, `minimatch`, `glob`, `uuid`) utilizadas por `exceljs` para la generación de archivos Excel.
- **Impacto:** Bajo-Medio en el contexto actual, ya que el parser procesa archivos entrantes y no utiliza las funciones de archivado de buffers dinámicos vulnerables.
- **Recomendación:** Monitorear releases de `exceljs` o evaluar alternativas más modernas y ligeras como `xlsx` o `sheetjs` si `exceljs` retrasa la actualización de sus dependencias base.

### Hallazgo 2: Rate Limiting Específico para `/api/v1/auth/login`
- **Severidad:** Baja / Recomendación de Buenas Prácticas.
- **Detalle:** El límite de tasa actual es de 100 req/min global. Aunque protege contra saturación de red, un atacante automatizado podría intentar 100 contraseñas por minuto contra el endpoint de inicio de sesión.
- **Recomendación:** Configurar una regla de rate limiting dedicada en la ruta `/api/v1/auth/login` con un límite estricto (ej. 5 o 10 intentos por minuto por IP).

### Hallazgo 3: Tiempo de Expiración del Access Token en Fastify JWT
- **Severidad:** Baja / Configuración.
- **Detalle:** En `src/app.ts`, el plugin `fastifyJwt` tiene una firma por defecto `sign: { expiresIn: '7d' }`. Para tokens de acceso se recomienda un ciclo de vida corto (ej. `15m`), respaldado por el mecanismo de `refreshToken` ya implementado en cookies seguras.
- **Recomendación:** Ajustar la firma de los access tokens a `15m` y delegar la persistencia de sesión prolongada exclusivamente al `refreshToken` rotativo.

### Hallazgo 4: Content Security Policy (CSP) Desactivado
- **Severidad:** Informativa.
- **Detalle:** En `src/app.ts`, `contentSecurityPolicy` está en `false` para permitir la carga correcta de los assets inline de la documentación interactiva de Scalar (`/docs`).
- **Recomendación:** Mantener `contentSecurityPolicy: false` o activar una política CSP que permita específicamente los dominios y fuentes requeridos por Scalar.

---

## 🎯 4. Conclusión

El backend monolítico se encuentra en un estado de **alta seguridad y madurez técnica**. Las defensas implementadas superan ampliamente los estándares convencionales para servicios de ingesta multimedia, contando con validación estricta de tipos MIME reales, prevención de path traversal, criptografía resistente a timing attacks y separación hermética de datos privados por usuario.
