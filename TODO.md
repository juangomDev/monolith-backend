# 📋 Lista de Tareas Pragmática (Lean TODO) - Monolito Backend

> **Objetivo Real:** Recibir imágenes y tablas, guardarlas en disco, registrarlas en PostgreSQL (de Dokploy) y devolverlas por URL corta (`short_code`).  
> **Filosofía:** Cero sobreingeniería. Código directo, limpio y modular (Rutas + Servicios).

---

## 📌 Resumen de Fases

| Fase | Enfoque | Estado |
| :--- | :--- | :---: |
| **Fase 0** | Cimientos, Dependencias y Tipado | ✅ Completado |
| **Fase 1** | Conexión con PostgreSQL en Dokploy y Portero Mínimo | ✅ Completado |
| **Fase 2** | Módulo de Imágenes (Subida a disco, registro y URL corta) | ✅ Completado |
| **Fase 3** | Módulo de Tablas (Subida CSV/XLSX, registro y descarga/consulta) | ✅ Completado |
| **Fase 4** | Ajustes para Despliegue en Dokploy (Dockerfile, volumen y arranque) | ✅ Completado |
| **Fase 5** | Seguridad y Control de Acceso (Solo personas autorizadas) | ✅ Completado |

---

## 🚀 Fase 0: Cimientos y Dependencias (Completado)
- [x] Configuración de `package.json`, `tsconfig.json` (NodeNext) y scripts de arranque.
- [x] Dependencias instaladas (Fastify, Prisma 6.4, Sharp, ExcelJS, Fast-CSV, Zod, NanoID).
- [x] Esquema Prisma inicial generado.
- [x] Compilación `npm run build` verificada (0 errores).

---

## 🛡️ Fase 1: Conexión con PostgreSQL (Dokploy) y Portero Mínimo
- [x] **1.1** Ajustar `prisma/schema.prisma` a los 3 modelos esenciales (`ApiClient`, `ImageRegistry`, `TableRegistry`) y regenerar cliente.
- [x] **1.2** Configurar `DATABASE_URL` en `.env` con la cadena de conexión de Dokploy.
- [x] **1.3** Ejecutar migración inicial contra Dokploy con `npx prisma migrate dev --name init`.
- [x] **1.4** Crear script simple de siembra (`prisma/seed.ts`) para generar una API Key de prueba (`mk_live_dev_test_api_key_12345`).
- [x] **1.5** Implementar `src/gateway/auth.ts`: Middleware/Hook simple para validar la cabecera `X-API-Key`.
- [x] **1.6** Implementar `src/gateway/health.ts`: Endpoint `GET /health` que verifique conexión a Postgres y escritura en `./storage`.

---

## 🖼️ Fase 2: Módulo de Imágenes
- [x] **2.1** Configurar `POST /api/v1/images`:
  - Recibir `multipart/form-data`.
  - Generar `shortCode` (10 caracteres con `nanoid`).
  - Guardar archivo directamente en `./storage/images/[shortCode].[ext]`.
  - Insertar registro en `ImageRegistry` (nombre original, mime, tamaño, ruta).
  - Responder `{ shortCode, url }`.
- [x] **2.2** Configurar `GET /i/:short_code`:
  - Buscar registro en base de datos.
  - Servir imagen desde disco con cabeceras `Content-Type` y caché inmutable.
- [x] **2.3** Configurar `DELETE /api/v1/images/:id`:
  - Eliminar registro de PostgreSQL y borrar archivo físico de `./storage/images/`.

---

## 🧪 Blindaje de Calidad: Pruebas Unitarias Inmutables (Frozen Test Contracts)
- [x] **T.1** Definición de reglas inviolables en `AGENTS.md` y `.agents/rules/testing-rules.md`.
- [x] **T.2** Configuración del runner nativo Node 22 (`tsx --env-file=.env --test`) en `package.json`.
- [x] **T.3** Pruebas de utilidades: `shortcode.test.ts` (7 tests) y `errors.test.ts` (4 tests).
- [x] **T.4** Pruebas de portero y seguridad: `auth.test.ts` (6 tests) y `health.test.ts` (3 tests).
- [x] **T.5** Pruebas de imágenes: `images.service.test.ts` (8 tests) y `images.routes.test.ts` (7 tests).
- [x] **T.6** Pruebas de tablas: `tables.parser.test.ts` (6 tests), `tables.service.test.ts` (8 tests), `tables.routes.test.ts` (8 tests).
- [x] **T.7** Verificación global: 85/85 tests pasando con 0 fallos y `npm run build` con código 0.

---

## 📊 Fase 3: Módulo de Tablas (CSV / Excel)
- [x] **3.1** Configurar `POST /api/v1/tables`:
  - Recibir archivo `.csv` o `.xlsx`.
  - Generar `shortCode`.
  - Guardar archivo físico en `./storage/tables/[shortCode].[ext]`.
  - Extraer metadatos básicos (nombres de columnas y conteo de filas).
  - Insertar registro en `TableRegistry`.
  - Responder `{ shortCode, url, rowCount }`.
- [x] **3.2** Configurar `GET /t/:short_code`:
  - Si incluye `?download=true`, descargar archivo original.
  - Si es consulta normal, devolver datos paginados (ej. primeras 100 filas).
- [x] **3.3** Configurar `DELETE /api/v1/tables/:id`:
  - Eliminar registro de PostgreSQL y borrar archivo de `./storage/tables/`.

---

## 🚢 Fase 4: Despliegue en Dokploy
- [x] **4.1** Asegurar que el `Dockerfile` ejecute `npx prisma migrate deploy && node dist/main.js`.
- [x] **4.2** Verificar permisos del usuario `node` sobre el volumen montado en `/app/storage`.
- [x] **4.3** Probar flujo completo de subida y lectura en el entorno local antes de subir a Dokploy.

---

## 🔒 Fase 5: Seguridad, Usuarios y Control de Acceso (Opción B: JWT + Roles con Username)
- [x] **5.1** Automatización de Esquema Prisma en Dokploy (`package.json`):
  - Ajustar script `"start": "npx prisma db push && node dist/main.js"` para sincronizar automáticamente cualquier cambio en `schema.prisma` al reiniciar el contenedor en Dokploy.
  - Asegurar que `prisma` esté en `dependencies` para que `prisma db push` esté disponible en producción.
- [x] **5.2** Modelo de Datos para Usuarios (`prisma/schema.prisma`):
  - Crear modelo `User`:
    - `id` (UUID)
    - `username` (único, alfanumérico sin espacios)
    - `passwordHash` (scrypt / Argon2 seguro mediante Node `crypto`)
    - `role` (`ADMIN` | `USER`)
    - `isActive` (boolean, default: true)
    - `createdAt` (timestamp)
  - Sembrar cuenta inicial del **único Admin** en `prisma/seed.ts` leyendo `ADMIN_USERNAME` y `ADMIN_PASSWORD` de `.env` (fallback dev: `admin` / `AdminPass123!`).
- [x] **5.3** Módulo de Usuarios y Autenticación (`src/modules/users/`):
  - Ubicación de archivos:
    - `src/modules/users/users.repository.ts`: Consultas Prisma para `User`.
    - `src/modules/users/users.service.ts`: Lógica de autenticación, hash de contraseñas y validación de único Admin.
    - `src/modules/users/users.routes.ts`: Endpoints `POST /api/v1/auth/login` y `POST /api/v1/users`.
  - Configuración de `@fastify/jwt` con variable secreta `JWT_SECRET`.
  - `POST /api/v1/auth/login`: Recibe `{ username, password }` y devuelve `{ token, user: { id, username, role } }`.
- [x] **5.4** Gestión de Usuarios por el Admin (`src/modules/users/users.routes.ts`):
  - `POST /api/v1/users`:
    - Solo accesible con token de rol `ADMIN`.
    - Permite crear nuevos usuarios normales (`USER`) con su `username` y `password` inicial.
    - Bloquea cualquier intento de crear otro `ADMIN` (solo puede haber uno).
- [x] **5.5** Blindaje de Subida de Archivos con Middleware de Autorización (`src/gateway/`):
  - En `src/gateway/auth.ts`: Hook `authenticateUser` y verificador `requireRole(['ADMIN', 'USER'])`.
  - Proteger `POST /api/v1/images` y `POST /api/v1/tables` para que solo personas logueadas con rol válido puedan subir.
  - Responder `401 UNAUTHORIZED` si no envían token o es inválido, y `403 FORBIDDEN` si el rol no tiene permiso.
- [x] **5.6** Pruebas Unitarias e Integradas Obligatorias (Frozen Test Contracts):
  - `tests/modules/users/users.service.test.ts`: Login con username, verificación de password, bloqueo de segundo Admin.
  - `tests/modules/users/users.routes.test.ts`: Pruebas de rutas HTTP para login y creación de usuarios.
  - Pruebas de subida en imágenes y tablas validando el acceso exclusivo con JWT de usuario autorizado.


