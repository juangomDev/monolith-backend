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
| **Fase 6** | Sistema de Carpetas y Proyectos Compartidos en PostgreSQL | ✅ Completado |
| **Fase 7** | Blindaje de Seguridad y Hardening Defensivo | ✅ Completado |
| **Fase 8** | Documentación Interactiva y Contratos OpenAPI con Scalar | ✅ Completado |

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
- [x] **2.4** Configurar `GET /api/v1/images` (Listado de imágenes guardadas):
  - [x] **2.4.1** En `images.repository.ts`: Método `findAll()` para listar registros ordenados descendentemente por `createdAt`.
  - [x] **2.4.2** En `images.service.ts`: Método `listImages()` con formato de respuesta `{ images: [...] }` incluyendo URL corta pública.
  - [x] **2.4.3** En `images.routes.ts`: Endpoint `GET /api/v1/images` protegido con `authenticateUserOrApiKey`.
  - [x] **2.4.4** En `images.service.test.ts` e `images.routes.test.ts`: Pruebas obligatorias unitarias y de integración para listado y control de acceso.

---

## 🧪 Blindaje de Calidad: Pruebas Unitarias Inmutables (Frozen Test Contracts)
- [x] **T.1** Definición de reglas inviolables en `AGENTS.md` y `.agents/rules/testing-rules.md`.
- [x] **T.2** Configuración del runner nativo Node 22 (`tsx --env-file=.env --test`) en `package.json`.
- [x] **T.3** Pruebas de utilidades: `shortcode.test.ts` (7 tests) y `errors.test.ts` (4 tests).
- [x] **T.4** Pruebas de portero y seguridad: `auth.test.ts` (6 tests) y `health.test.ts` (3 tests).
- [x] **T.5** Pruebas de imágenes: `images.service.test.ts` (8 tests) y `images.routes.test.ts` (7 tests).
- [x] **T.6** Pruebas de tablas: `tables.parser.test.ts` (6 tests), `tables.service.test.ts` (8 tests), `tables.routes.test.ts` (8 tests).
- [x] **T.7** Verificación global base: 85/85 tests pasando con 0 fallos y `npm run build` con código 0.
- [x] **T.8** Nuevas pruebas para listados de imágenes y tablas con 100% de éxito (93/93 tests) sin alterar los tests congelados existentes.

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
- [x] **3.4** Configurar `GET /api/v1/tables` (Listado de datasets registrados):
  - [x] **3.4.1** En `tables.repository.ts`: Método `findAll()` para listar registros ordenados descendentemente por `createdAt`.
  - [x] **3.4.2** En `tables.service.ts`: Método `listTables()` con formato de respuesta `{ tables: [...] }` incluyendo URL pública, columnas y rowCount.
  - [x] **3.4.3** En `tables.routes.ts`: Endpoint `GET /api/v1/tables` protegido con `authenticateUserOrApiKey`.
  - [x] **3.4.4** En `tables.service.test.ts` y `tables.routes.test.ts`: Pruebas obligatorias unitarias y de integración para listado y control de acceso.

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

---

## 📁 Fase 6: Sistema de Carpetas, Privacidad y Organización Lógica en PostgreSQL (Completado)

> **Objetivos de Negocio Validados:**
> 1. **Cero Archivos Huérfanos:** Ningún archivo (imagen o tabla) puede existir fuera de una carpeta. Si no se especifica carpeta al subir, se asigna automáticamente a la carpeta por defecto (`'General'`) del usuario.
> 2. **Carpetas Privadas vs Compartidas:** Una carpeta puede configurarse como privada (`isPrivate: true`). Solo su creador puede ver y gestionar sus carpetas privadas y archivos contenidos, mientras que el `ADMIN` mantiene visibilidad y control total de todo el sistema.
> 3. **Eliminación en Cascada:** Al eliminar una carpeta, se eliminan en cascada sus registros en PostgreSQL y se borran físicamente todos sus archivos asociados en almacenamiento de disco.
>
> **Regla Inviolable:** No romper retrocompatibilidad ni modificar los 134 tests congelados existentes (Preservación estricta de Frozen Test Contracts).

- [x] **6.1 Modelo de Datos en Prisma (`prisma/schema.prisma`)**
  - [x] `6.1.1` Definir enum `FolderType`: `IMAGE`, `TABLE`.
  - [x] `6.1.2` Crear modelo `Folder`:
    - `id` (UUID, primary key)
    - `name` (String, max 60 caracteres)
    - `type` (`FolderType`)
    - `color` (String opcional hex, ej. `#3b82f6`)
    - `isPrivate` (Boolean `@default(false)` `@map("is_private")`)
    - `userId` (UUID `@map("user_id")`, FK con relación `user` a `User`, `onDelete: Cascade`)
    - `createdAt` (DateTime `@default(now())`)
    - Relaciones con `ImageRegistry[]` y `TableRegistry[]`.
    - Índices: `@@index([type])`, `@@index([userId])`, `@@index([isPrivate])`.
    - Mapeo a tabla física `folders` (`@@map("folders")`).
  - [x] `6.1.3` Agregar columna de carpeta `folderId String? @map("folder_id") @db.Uuid` en `ImageRegistry` con relación `folder` y política `onDelete: Cascade`.
  - [x] `6.1.4` Agregar columna de carpeta `folderId String? @map("folder_id") @db.Uuid` en `TableRegistry` con relación `folder` y política `onDelete: Cascade`.
  - [x] `6.1.5` Ejecutar `npx prisma generate` para sincronizar los tipos tipados en `@prisma/client`.

- [x] **6.2 Repositorio de Datos (`src/modules/folders/folders.repository.ts`)**
  - [x] `6.2.1` `createFolder(data: { name, type, color?, isPrivate?, userId })`: Insertar nueva carpeta en PostgreSQL.
  - [x] `6.2.2` `findFolders(filter: { type?, userId?, isAdmin: boolean })`: Listar carpetas aplicando el filtro de privacidad (`isPrivate = false OR userId = currentUserId`, o todas si es `ADMIN`) con conteo agregado `_count`.
  - [x] `6.2.3` `findFolderById(id: string)`: Obtener detalles de una carpeta específica con su propietario.
  - [x] `6.2.4` `findOrCreateDefaultFolder(userId: string, type: FolderType)`: Obtener o crear carpeta `'General'` para garantizar que ningún archivo quede huérfano.
  - [x] `6.2.5` `deleteFolderWithFiles(id: string)`: Obtener rutas físicas de todos los archivos asociados y eliminar la carpeta en cascada en DB.
  - [x] `6.2.6` `moveImageToFolder(imageId: string, folderId: string)`: Actualizar `folder_id` en `ImageRegistry`.
  - [x] `6.2.7` `moveTableToFolder(tableId: string, folderId: string)`: Actualizar `folder_id` en `TableRegistry`.

- [x] **6.3 Servicio de Negocio y Reglas de Privacidad (`src/modules/folders/folders.service.ts`)**
  - [x] `6.3.1` Validar esquemas con Zod:
    - Nombre: string limpio de entre 2 y 60 caracteres.
    - Tipo: `IMAGE` o `TABLE`.
    - Color: hex opcional de 3 o 6 dígitos (ej. `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`).
    - `isPrivate`: booleano opcional (por defecto `false`).
  - [x] `6.3.2` Control de permisos y excepciones RFC 7807 (`AppError`):
    - `404 NOT_FOUND` si la carpeta o archivo no existe.
    - `403 FORBIDDEN` si un usuario normal intenta acceder, modificar o eliminar una carpeta privada perteneciente a otro usuario.
    - `400 INVALID_FOLDER_TYPE` si se intenta mover una imagen a una carpeta de tablas o una tabla a una carpeta de imágenes.
    - `400 BAD_REQUEST` si se intenta desvincular un archivo sin carpeta (`folderId: null` rechazado para impedir archivos huérfanos).
  - [x] `6.3.3` Eliminación en cascada física: Al borrar una carpeta, eliminar en disco todos los archivos de imágenes y tablas asociados con `fs.unlink`.
  - [x] `6.3.4` Formateo de respuesta: Retornar carpetas con `itemCount` unificado y bandera `isPrivate`.

- [x] **6.4 Rutas HTTP Fastify (`src/modules/folders/folders.routes.ts`) y Gateway**
  - [x] `6.4.1` Autenticación unificada: Proteger todos los endpoints con `authenticateUserOrApiKey`.
  - [x] `6.4.2` `GET /api/v1/folders`: Listado de carpetas respetando privacidad según el rol (`ADMIN` ve todas, `USER` solo públicas y propias), con soporte de filtro `?type=IMAGE|TABLE`.
  - [x] `6.4.3` `POST /api/v1/folders`: Crear nueva carpeta asignando `userId` y `isPrivate` del creador (`201 Created`).
  - [x] `6.4.4` `DELETE /api/v1/folders/:id`: Eliminar carpeta en cascada (físico y lógico) verificando permisos de propietario o `ADMIN`.
  - [x] `6.4.5` `PATCH /api/v1/images/:id/folder`: Reasignar imagen a otra carpeta `{ folderId: string }` validando compatibilidad y permisos.
  - [x] `6.4.6` `PATCH /api/v1/tables/:id/folder`: Reasignar tabla a otra carpeta `{ folderId: string }` validando compatibilidad y permisos.
  - [x] `6.4.7` Registrar `foldersRoutes` en `src/gateway/router.ts`.
  - [x] `6.4.8` Subidas y Listados Retrocompatibles:
    - En `images.service.ts` y `tables.service.ts`: auto-asignar a carpeta `'General'` si la subida no incluye `folderId`.
    - En `listImages()` y `listTables()`: exponer `folderId` y filtrar archivos según la privacidad de su carpeta contenedora.

- [x] **6.5 Blindaje con Pruebas Automatizadas (Frozen Test Contracts)**
  - [x] `6.5.1` Crear `tests/modules/folders/folders.service.test.ts`:
    - Validación de esquemas y nombres.
    - Creación y listado de carpetas públicas y privadas.
    - Verificación de que `ADMIN` ve carpetas privadas de terceros y que `USER` no.
    - Rechazo de tipo cruzado (400 `INVALID_FOLDER_TYPE`).
    - Eliminación en cascada borrando archivos físicos con `fs.unlink`.
    - Auto-asignación a carpeta por defecto `'General'`.
  - [x] `6.5.2` Crear `tests/modules/folders/folders.routes.test.ts`:
    - Rechazo 401 si no hay autenticación.
    - CRUD de carpetas públicas y privadas.
    - Rechazo 403 al intentar borrar carpeta privada ajena.
    - Acceso permitido total para `ADMIN`.
    - Endpoints PATCH de reasignación.
  - [x] `6.5.3` Validación del Protocolo Obligatorio:
    - Ejecutar `npm test`: Verificar que los 134 tests congelados previos continúen pasando con 0 fallos junto a la nueva suite (169 tests en total, 0 fallos).
    - Ejecutar `npm run build`: Verificar compilación TypeScript limpia (`tsc`) con código 0.
  - [x] `6.5.4` Congelar los nuevos tests de carpetas como contratos inmutables.

---

## 🛡️ Fase 7: Blindaje de Seguridad y Hardening Defensivo (Completado)

> **Objetivo:** Cerrar brechas de fuerza bruta, restringir CORS para Dokploy/pruebas, validar magic bytes reales y blindar credenciales contra XSS/CSRF elevando la suite a 134 pruebas congeladas.

- [x] **7.1 Activación y Configuración de Rate Limiting (`@fastify/rate-limit`)**
  - [x] `7.1.1` Registrar `rateLimitPlugin` en `src/app.ts` para protección global contra saturación y DDoS (100 req/min por IP o ApiClient).
  - [x] `7.1.2` Implementar limitación estricta anti-fuerza bruta específica en la ruta `POST /api/v1/auth/login` (máximo 5 intentos por minuto por IP/usuario) respondiendo RFC 7807 `429 Too Many Requests`.
  - [x] `7.1.3` Agregar pruebas unitarias e integradas para verificar el bloqueo de peticiones tras superar el umbral en `tests/gateway/rate-limit.test.ts`.

- [x] **7.2 Hardening de CORS Dinámico para Dokploy (`.sslip.io`) y Desarrollo Local**
  - [x] `7.2.1` Sustituir `origin: true` en `src/app.ts` por validador dinámico con RegEx que permita:
    - Entornos locales: `http://localhost:*` y `http://127.0.0.1:*`.
    - Dominios dinámicos de Dokploy: patrón `/^https?:\/\/([a-zA-Z0-9-]+\.)*sslip\.io(:\d+)?$/`.
    - Dominios estables de producción definidos en variable de entorno `CORS_ALLOWED_ORIGINS`.
    - Rechazar orígenes no autorizados sin reflejar cabeceras permisivas.
  - [x] `7.2.2` Crear pruebas de integración en `tests/gateway/cors.test.ts` verificando aceptación de `.sslip.io` y rechazo de dominios arbitrarios.

- [x] **7.3 Estrategia Defensiva Anti-XSS, Anti-CSRF y Revocación de Tokens (`tokenVersion`)**
  - [x] `7.3.1` Instalar `@fastify/cookie` para gestión segura de cookies con firma criptográfica.
  - [x] `7.3.2` Agregar columna `tokenVersion Int @default(0) @map("token_version")` al modelo `User` en `prisma/schema.prisma` para revocación instantánea en PostgreSQL.
  - [x] `7.3.3` Incluir `tokenVersion` en el payload del JWT y verificar en `authenticateJwt` (`src/gateway/auth.ts`) que coincida con la base de datos, rechazando con `401 SESSION_REVOKED` si no coincide.
  - [x] `7.3.4` Configurar endpoint `POST /api/v1/auth/refresh` que emita un nuevo Access Token de corta duración leyendo un Refresh Token persistido en cookie `HttpOnly; Secure; SameSite=Strict`.
  - [x] `7.3.5` Implementar endpoint `POST /api/v1/auth/logout`:
    - Incrementar `tokenVersion` en PostgreSQL para invalidar de inmediato todos los tokens emitidos anteriormente para ese usuario.
    - Limpiar la cookie de refresco en el navegador (`Set-Cookie: refreshToken=; Max-Age=0`).
  - [x] `7.3.6` Mantener retrocompatibilidad para que los clientes actuales puedan seguir usando `Authorization: Bearer <token>` sin romper los contratos existentes.
  - [x] `7.3.7` Pruebas unitarias e integradas del ciclo login -> refresh -> logout -> verificación de token revocado en `tests/modules/users/auth-refresh.test.ts`.

- [x] **7.4 Validación de Magic Bytes en Subidas de Archivos (`src/gateway/file-guard.ts`)**
  - [x] `7.4.1` Conectar `validateMagicBytes` en `images.service.ts` antes de persistir la imagen en disco, analizando los primeros 4100 bytes del stream con `file-type` contra `['image/jpeg', 'image/png', 'image/webp']`.
  - [x] `7.4.2` Conectar validación estructural o magic bytes en `tables.service.ts` para confirmar archivos `.csv` y `.xlsx` legítimos (evitando inyecciones de scripts disfrazados).
  - [x] `7.4.3` Responder `415 UNSUPPORTED_MEDIA_TYPE` si el contenido binario no coincide con la extensión declarada.
  - [x] `7.4.4` Pruebas automatizadas con archivos simulados válidos y binarios falsificados en `tests/gateway/file-guard.test.ts`.

- [x] **7.5 Cabeceras de Seguridad HTTP con `@fastify/helmet`**
  - [x] `7.5.1` Instalar y registrar `@fastify/helmet` en `src/app.ts`.
  - [x] `7.5.2` Configurar `X-Content-Type-Options: nosniff` (crucial para entrega segura de imágenes en `/i/:short_code` y tablas en `/t/:short_code` impidiendo ejecución de scripts MIME-sniffed).
  - [x] `7.5.3` Configurar `X-Frame-Options: DENY`, Referrer Policy y HSTS para transporte cifrado.
  - [x] `7.5.4` Pruebas de verificación de cabeceras de respuesta en `tests/gateway/helmet.test.ts`.

- [x] **7.6 Validación Estricta de Variables de Entorno en Producción**
  - [x] `7.6.1` En `src/config/env.ts`, impedir en `NODE_ENV=production` el uso de secretos por defecto para `JWT_SECRET` y `ADMIN_PASSWORD`.
  - [x] `7.6.2` Pruebas unitarias en `tests/config/env.test.ts` que aseguren el fallo de arranque si se despliega en producción con credenciales débiles.

---

## 📖 Fase 8: Documentación Interactiva y Contratos OpenAPI con Scalar (Completado)

> **Objetivos Clave:**
> 1. **Sandbox Interactivo y Documentación Viva:** Exponer una interfaz moderna en `/docs` con `@scalar/fastify-api-reference` para que cualquier desarrollador (especialmente del frontend) pueda explorar contratos, ver ejemplos de peticiones/respuestas y probar llamadas HTTP en vivo con tokens JWT o X-API-Key.
> 2. **Autogeneración de Tipos TypeScript para el Frontend:** Exponer la especificación OpenAPI 3.1 en `/docs/json` permitiendo al equipo de frontend generar automáticamente interfaces y clientes fuertemente tipados con `openapi-typescript`.
> 3. **Estandarización de Contratos RFC 7807:** Documentar todos los esquemas de éxito (`200`, `201`) y modelos de error controlados (`400`, `401`, `403`, `404`, `413`, `415`, `429`).
> 4. **Inmutabilidad y Cero Rompimiento:** No alterar ninguno de los 169 contratos de prueba congelados existentes.

- [x] **8.1 Dependencias y Configuración Base del Generador OpenAPI (`@fastify/swagger`)**
  - [x] `8.1.1` Instalar `@fastify/swagger` y `@scalar/fastify-api-reference` como dependencias de producción.
  - [x] `8.1.2` Configurar `@fastify/swagger` en `src/app.ts` con especificación OpenAPI 3.1:
    - Información del API: título (`Monolito Backend API - Gestor Multimedia`), versión (`1.0.0`), descripción de arquitectura y capacidad URLs.
    - Servidores: entornos local (`http://localhost:3000`) y Dokploy producción (`https://*.sslip.io`).
    - Esquemas de seguridad: `bearerAuth` (HTTP Bearer JWT) y `apiKeyAuth` (`X-API-Key`).
    - Etiquetas temáticas (`tags`): `Auth`, `Users`, `Folders`, `Images`, `Tables`, `Health`.

- [x] **8.2 Integración y Renderizado de UI con Scalar (`@scalar/fastify-api-reference`)**
  - [x] `8.2.1` Registrar `@scalar/fastify-api-reference` en `src/app.ts` sirviendo la interfaz visual en `/docs`.
  - [x] `8.2.2` Configurar cliente API integrado, buscador rápido, tema visual y generador de snippets en JavaScript (Fetch, Axios) y cURL.
  - [x] `8.2.3` Exponer el endpoint de especificación cruda en `GET /docs/json` para consumo por herramientas externas y el frontend.
  - [x] `8.2.4` Compatibilidad CSP con `@fastify/helmet`: Ajustar la política de seguridad de contenido para permitir los scripts CDN, estilos y Web Workers necesarios para el renderizado de la UI de Scalar sin degradar la seguridad del resto de la API.

- [x] **8.3 Documentación de Contratos por Módulo (Fastify Route Schemas)**
  - [x] `8.3.1` **Módulo Usuarios y Autenticación (`src/modules/users/users.routes.ts`)**:
    - `POST /api/v1/auth/login`: Esquema de entrada (`username`, `password`), respuestas 200 con token JWT, y errores 400/401 RFC 7807.
    - `POST /api/v1/auth/refresh`: Lectura de cookie `refreshToken`, respuesta 200 con nuevo access token, 401 sesión revocada.
    - `POST /api/v1/auth/logout`: Revocación de sesión e invalidación de cookie.
    - `POST /api/v1/users`: Requisito de rol `ADMIN`, creación de usuarios normales, respuestas 201 y 400/403/409.
  - [x] `8.3.2` **Módulo Carpetas (`src/modules/folders/folders.routes.ts`)**:
    - `GET /api/v1/folders`: Query opcional `?type=IMAGE|TABLE`, respuesta 200 con listado y conteo de archivos respetando privacidad.
    - `POST /api/v1/folders`: Creación de carpeta (nombre, tipo, color hex, isPrivate), respuestas 201 y 400.
    - `GET /api/v1/folders/:id`: Detalle de carpeta, respuestas 200, 403 (privada ajena) y 404.
    - `DELETE /api/v1/folders/:id`: Eliminación en cascada física y lógica, respuestas 200, 403 y 404.
    - `PATCH /api/v1/images/:id/folder` y `PATCH /api/v1/tables/:id/folder`: Reasignación de recursos validando tipo y permisos.
  - [x] `8.3.3` **Módulo Imágenes (`src/modules/images/images.routes.ts`)**:
    - `POST /api/v1/images`: Carga `multipart/form-data` con `folderId` opcional, validación de magic bytes, respuestas 201 (`shortCode`, `url`), 400, 413 y 415.
    - `GET /api/v1/images`: Listado paginado de imágenes con filtrado de privacidad.
    - `GET /i/:short_code`: Capacidad URL pública con cabeceras de caché inmutable (`max-age=31536000`), respuestas 200 (binario) y 404.
    - `DELETE /api/v1/images/:id`: Eliminación lógica y física de imagen en disco.
  - [x] `8.3.4` **Módulo Tablas (`src/modules/tables/tables.routes.ts`)**:
    - `POST /api/v1/tables`: Carga `multipart/form-data` de archivos CSV/XLSX con `folderId`, respuestas 201, 400 y 415.
    - `GET /api/v1/tables`: Listado de datasets registrados y privacidad.
    - `GET /t/:short_code`: Descarga directa (`?download=true`) o consulta JSON estructurada de filas.
    - `DELETE /api/v1/tables/:id`: Eliminación lógica y física de tabla en disco.
  - [x] `8.3.5` **Módulo Gateway y Salud (`src/gateway/health.ts`)**:
    - `GET /health`: Estado de conexión a base de datos PostgreSQL y volumen físico `./storage`.

- [x] **8.4 Estandarización de Esquemas Comunes RFC 7807 (`src/shared/schemas.ts`)**
  - [x] `8.4.1` Crear esquemas compartidos reutilizables para `ProblemDetails` (`type`, `title`, `status`, `detail`, `code`, `invalidParams`).
  - [x] `8.4.2` Definir respuestas de error estándar (400, 401, 403, 404, 413, 415, 429) vinculadas a los esquemas de Fastify.

- [x] **8.5 Herramientas y Guía de Integración para el Frontend (`gestor-multimedia`)**
  - [x] `8.5.1` Agregar script `"openapi:export": "tsx --env-file=.env src/scripts/export-openapi.ts"` en `package.json` para generar archivo estático `openapi.json` versionable.
  - [x] `8.5.2` Crear documento de integración rápida `docs/frontend-integration.md` con ejemplos de consumo, sincronización de tipos y configuración del cliente API en React / Vite.

- [x] **8.6 Blindaje con Pruebas Automatizadas (Frozen Test Contracts)**
  - [x] `8.6.1` Crear `tests/gateway/docs.test.ts`:
    - `GET /docs/json`: Debe responder 200 con especificación OpenAPI 3.1 válida conteniendo título, servidores, seguridad y rutas registradas.
    - `GET /docs`: Debe responder 200 con HTML válido del visor Scalar y configuración de cliente activa.
    - Verificación de cabeceras de seguridad compatibles con CSP de Helmet en la ruta `/docs`.
  - [x] `8.6.2` Validación del Protocolo Obligatorio:
    - Ejecutar `npm test`: Verificar que los 169 tests congelados previos continúen pasando con 0 fallos + los nuevos tests de documentación (172 tests en total, 0 fallos).
    - Ejecutar `npm run build`: Verificar compilación TypeScript limpia (`tsc`) con código 0.
  - [x] `8.6.3` Congelar los nuevos tests de documentación como contratos inmutables.

