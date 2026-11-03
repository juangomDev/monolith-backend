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
| **Fase 9** | Endurecimiento de Seguridad Inmediato y Monitoreo Proactivo | ✅ Completado |
| **Fase 10** | Evolución Integral del Módulo de Imágenes (Sharp, Miniaturas y Hot-Swap) | ✅ Completado |
| **Fase 11** | Evolución Integral del Módulo de Tablas y Modularización Arquitectónica | ✅ Completado |
| **Fase 12** | Sistema Jerárquico de Roles (ADMIN, MANAGER, COLLABORATOR) y RBAC de Carpetas | ✅ Completado |
| **Fase 13** | Evolución Integral del Módulo de Carpetas (Edición, Protección de General y RBAC de Reasignación) | ✅ Completado |
| **Fase 14** | Módulo de Chat Analítico sobre Tablas (RAG Tabular con Ficha Técnica, Gemini API y Widget Público) | ✅ Completado |
| **Fase 15** | Paridad Total en Tablas (Hot-Swap, Renombrado), Búsqueda Global y Operaciones en Lote | ⏳ Pendiente |
| **Fase 16** | Auditoría de Acciones (`AuditLog`), Gestión Dinámica de API Keys y Monitor de Almacenamiento | ⏳ Pendiente |
| **Fase 17** | Módulo de Formularios Customizables, Tablas Vivas y Resolución Única (Write-Once) | ⏳ Pendiente |
| **Fase 18** | Módulo de Archivos PDF, Patrón de Doble Artefacto (.text.json.gz), Link Corto (/p/:short_code) e Integración con Chat RAG | ⏳ Pendiente |

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

---

## 🛡️ FASE 9: Endurecimiento de Seguridad Inmediato y Monitoreo de Riesgos a Futuro

### 🎯 Objetivos de la Fase
> 1. **Acción Inmediata:** Implementar las recomendaciones clave de seguridad identificadas en la auditoría sin incurrir en sobreingeniería.
> 2. **Riesgos a Futuro:** Establecer la matriz de riesgos latentes, sus gatillos de activación y sus soluciones pragmáticas correspondientes.
> 3. **Regla de Monitoreo Proactivo:** Crear una regla de cumplimiento que evalúe y alerte sobre estos vectores de riesgo tras cada gran actualización o lote de cambios importantes.

- [x] **9.1 Recomendaciones Clave de Acción Inmediata (Sin Sobreingeniería)**
  - [x] `9.1.1` **Rate Limiting Estricto en Login (`POST /api/v1/auth/login`)**:
    - Configurar límite de 5 intentos por minuto por combinación de IP/usuario para neutralizar ataques de fuerza bruta en contraseñas.
    - Agregar prueba automatizada que verifique la respuesta `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`) a partir del 6º intento.
  - [x] `9.1.2` **Ajuste de Ciclo de Vida del Access Token (15 minutos)**:
    - Reducir la expiración del `accessToken` de `7d` a `15m` en `fastifyJwt` (`src/app.ts`), delegando la persistencia de sesión prolongada exclusivamente al `refreshToken` rotativo en cookie `HttpOnly`.
    - Actualizar documentación de esquemas y descripción de rutas con la nueva vigencia de 15 minutos.
  - [x] `9.1.3` **Mitigación de Vulnerabilidades en Subdependencias (`exceljs`)**:
    - Declarar `overrides` en `package.json` para las dependencias transitivas afectadas (`minimatch`, `uuid`).
    - Ejecutar `npm install` y verificar reducción de vulnerabilidades en `npm audit` manteniendo 100% de tests pasando (0 vulnerabilidades).
  - [x] `9.1.4` **Automatización de Sincronización de Tipos con el Frontend**:
    - Configurar script de exportación y guía de sincronización de tipos para `gestor-multimedia` mediante `openapi-typescript`.
    - Regenerar `openapi.json` actualizado.

- [ ] **9.2 Matriz de Riesgos a Futuro (Gatillos Operativos y Solución Pragmática)**
  - [ ] `9.2.1` **Riesgo 1: Saturación del Almacenamiento Local (`./storage`)**:
    - *Gatillo:* Almacenamiento > 80% del disco o despliegue multi-contenedor con balanceo de carga.
    - *Solución:* Migración a S3 compatible (Cloudflare R2 o MinIO local) mediante interfaz desacoplada de almacenamiento.
  - [ ] `9.2.2` **Riesgo 2: Bloqueo del Event Loop por Datasets Masivos**:
    - *Gatillo:* Ingesta frecuente de archivos CSV/Excel superiores a 30-50MB (>100.000 filas).
    - *Solución:* Procesamiento por chunks en streaming o delegación a `worker_threads` nativos de Node.js.
  - [ ] `9.2.3` **Riesgo 3: Sobrecarga de Base de Datos en Rutas Públicas (`/i/:short_code`, `/t/:short_code`)**:
    - *Gatillo:* Tráfico masivo concurrente a recursos embebidos públicamente.
    - *Solución:* Activación de CDN (Cloudflare / Nginx Reverse Proxy Cache) respaldado por la cabecera `Cache-Control: immutable` ya existente.
  - [ ] `9.2.4` **Riesgo 4: Agotamiento de Conexiones a PostgreSQL (Pool Exhaustion)**:
    - *Gatillo:* Errores `P2024` o `connection limit reached` bajo alta concurrencia.
    - *Solución:* Ajuste de `connection_limit` en `DATABASE_URL` y/o despliegue de PgBouncer.
  - [ ] `9.2.5` **Riesgo 5: Inyección de Fórmulas en CSV/Excel (CSV Formula Injection)**:
    - *Gatillo:* Descargas de datasets creados por usuarios que puedan contener fórmulas dinámicas maliciosas (`=`, `+`, `-`, `@`).
    - *Solución:* Sanitizado de caracteres de comando al generar la descarga binaria.

- [x] **9.3 Regla de Monitoreo Proactivo de Seguridad y Arquitectura**
  - [x] `9.3.1` Crear `.agents/rules/security-and-architecture-guard.md` con checklist de validación post-actualización.
  - [x] `9.3.2` Integrar la directiva en `AGENTS.md` para obligar a todo agente a evaluar el semáforo de seguridad tras cada lote de cambios importantes.
  - [x] `9.3.3` Validar `npm test` (0 fallos) y `npm run build` (código 0).

---

## 🖼️ FASE 10: Evolución Integral del Módulo de Imágenes (Completado)

### 🎯 Objetivos de la Fase
> 1. **Regla de Documentación Obligatoria:** Establecer contractualmente que ninguna funcionalidad se aprueba sin su documentación y esquemas OpenAPI sincronizados simultáneamente.
> 2. **Procesamiento y Rendimiento Multimedia (`sharp`):** Extraer dimensiones (`width`, `height`), autogenerar miniaturas WebP (`320px`) y servir variantes ligeras en `/i/:short_code?variant=thumb`.
> 3. **Mutación Completa y Reemplazo en Caliente:** Permitir renombrar el `originalName` (`PATCH /api/v1/images/:id`) y reemplazar el archivo binario físico (`PUT /api/v1/images/:id`) preservando intactos el `shortCode` y la URL pública para actualizar logos o recursos en vivo.
> 4. **Seguridad y Control de Acceso (Anti-IDOR):** Garantizar que solo el propietario o `ADMIN` puedan modificar, renombrar, reemplazar o eliminar una imagen.
> 5. **Paginación y Filtrado SQL:** Trasladar la paginación y filtros de carpetas a nivel de PostgreSQL con Prisma.

- [x] **10.1 Regla de Documentación y Modelo de Datos**
  - [x] `10.1.1` **Regla 3 en `AGENTS.md`**: Formalizar la documentación y OpenAPI al mismo nivel de obligatoriedad e inmutabilidad que las pruebas.
  - [x] `10.1.2` **Modelo Prisma**: Agregar `width Int?`, `height Int?` y `updatedAt DateTime @updatedAt` en `ImageRegistry` en `prisma/schema.prisma`.
  - [x] `10.1.3` Ejecutar `npx prisma generate` y sincronizar esquema en PostgreSQL.

- [x] **10.2 Procesamiento Multimedia con Sharp (Miniaturas, Metadatos y Soporte .svg)**
  - [x] `10.2.1` **Soporte SVG y Validación Anti-XSS**:
    - Agregar `image/svg+xml` y extensión `.svg` en `file-guard.ts` y `images.service.ts`.
    - Validación segura de SVG: verificar estructura XML/SVG, ausencia de bytes nulos y bloqueo de scripts incrustados (`<script`, `javascript:`, `onload=`, `onerror=`).
    - Configurar cabeceras de entrega segura para SVG en `/i/:short_code` (`Content-Security-Policy: default-src 'none'`).
  - [x] `10.2.2` Integrar `sharp` en `images.service.ts` para extraer dimensiones (`width`, `height`) de forma automática en la subida (JPEG, PNG, WebP y SVG).
  - [x] `10.2.3` Crear pipeline para autogenerar miniatura WebP optimizada (320px de ancho) en `./storage/images/thumbs/${shortCode}.webp` (incluyendo renderizado de SVG a WebP).
  - [x] `10.2.4` Soporte de variantes en la Capability URL: `GET /i/:short_code?variant=thumb` (entrega rápida de miniatura con caché inmutable) y `GET /i/:short_code?variant=original`.
  - [x] `10.2.5` Limpieza física del archivo de miniatura en disco al eliminar o reemplazar la imagen.

- [x] **10.3 Mutación y Reemplazo en Caliente (Hot-Swap)**
  - [x] `10.3.1` **Renombrar Imagen (`PATCH /api/v1/images/:id`)**:
    - Validar entrada con esquema Zod `{ originalName: string }` (1-255 caracteres, sanitización).
    - Verificar propiedad (solo dueño de carpeta o `ADMIN`).
    - Actualizar registro y responder 200 con el modelo actualizado.
  - [x] `10.3.2` **Reemplazo en Caliente del Archivo (`PUT /api/v1/images/:id`)**:
    - Aceptar nuevo archivo vía `multipart/form-data` (JPEG, PNG, WebP o SVG).
    - Validar magic bytes / sanitización SVG y límite de 50MB.
    - Conservar el **mismo** `shortCode`, `id` y `folderId`.
    - Sobrescribir de forma segura el archivo en disco (`./storage/images/${shortCode}${ext}`).
    - Regenerar la miniatura WebP asociada.
    - Actualizar `sizeBytes`, `mimeType`, `width`, `height` y `updatedAt` en PostgreSQL.
    - Soporte de cache-busting opcional (`?v=...`) en URLs para clientes que requieran invalidación inmediata de CDN.

- [x] **10.4 Seguridad de Acceso y Filtrado SQL**
  - [x] `10.4.1` **Blindaje Anti-IDOR en Eliminación y Modificación**:
    - Modificar `DELETE /api/v1/images/:id`, `PATCH /api/v1/images/:id` y `PUT /api/v1/images/:id` para comprobar `image.folder.userId === requester.id` o rol `ADMIN` (403 Forbidden si no corresponde).
  - [x] `10.4.2` **Paginación y Filtrado SQL**:
    - Añadir en `imagesRepository.findAll`: parámetros `page`, `limit`, `folderId` y filtro de privacidad directamente en la cláusula `WHERE` de Prisma.
    - Responder con metadatos `{ images: [...], meta: { page, limit, total, totalPages, hasNext }, total }`.

- [x] **10.5 Documentación Simultánea de Contratos (Regla 3)**
  - [x] `10.5.1` Actualizar esquemas OpenAPI de Fastify en `images.routes.ts` con las nuevas rutas (`PATCH`, `PUT`), parámetros query (`page`, `limit`, `folderId`, `variant`) y respuestas 200/403.
  - [x] `10.5.2` Actualizar `ENDPOINTS.md` y `RUTAS.md` con las nuevas operaciones de imágenes.
  - [x] `10.5.3` Regenerar `openapi.json` con `npm run openapi:export`.
  - [x] `10.5.4` Documentar ejemplos de reemplazo de imagen y renombrado en `docs/frontend-integration.md`.

- [x] **10.6 Cobertura de Pruebas Automatizadas y Congelación**
  - [x] `10.6.1` Pruebas unitarias en `images.service.test.ts`:
    - Extracción de dimensiones con `sharp` y creación de miniatura WebP.
    - Renombrado exitoso y validación de nombres vacíos.
    - Reemplazo en caliente de binario preservando `shortCode`.
    - Rechazo con 403 al intentar modificar o eliminar imágenes ajenas.
  - [x] `10.6.2` Pruebas de integración en `images.routes.test.ts`:
    - `PATCH /api/v1/images/:id`: 200 con nuevo nombre, 403 usuario ajeno, 404.
    - `PUT /api/v1/images/:id`: 200 con archivo reemplazado conservando shortCode.
    - `GET /i/:short_code?variant=thumb`: 200 sirviendo miniatura WebP.
    - `DELETE /api/v1/images/:id`: 403 si el usuario no es propietario.
  - [x] `10.6.3` Protocolo Obligatorio: `npm test` (100% pasando), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 📊 FASE 11: Evolución Integral del Módulo de Tablas y Modularización Arquitectónica

### 🎯 Objetivos de la Fase
> 1. **Patrón de Doble Artefacto en Tablas (Pre-cálculo para Visualización Rápida):** Generar `.data.json.gz` en la subida para servir cuadros estadísticos formateados con colores y encabezados multinivel en 2 ms, conservando el `.xlsx` original intacto para descargas de alta fidelidad.
> 2. **Seguridad y Control de Acceso (Anti-IDOR y Fórmulas):** Exigir `requester` en `DELETE /api/v1/tables/:id` para que solo el propietario o ADMIN puedan borrar datasets, y neutralizar la inyección de fórmulas CSV (`=`, `+`, `-`, `@`).
> 3. **Paginación y Filtrado SQL Directo en Prisma:** Migrar el listado de tablas a filtrado y paginación a nivel de PostgreSQL con `page`, `limit` y `folderId`.
> 4. **Modularización de Esquemas y Satélites (Etapa 1 de Refactorización):** Extraer los esquemas OpenAPI de las rutas que superan el umbral (`tables.schemas.ts`, `folders.schemas.ts`, `users.schemas.ts`) e I/O de disco (`images.storage.ts`).
> 5. **Inmutabilidad Absoluta de Contratos (Reglas 1, 2 y 3):** Preservar el 100% de los 197 tests existentes y documentar simultáneamente en OpenAPI.

- [x] **11.1 Desacoplamiento de Esquemas OpenAPI (Etapa 1 de Refactorización Modular)**
  - [x] `11.1.1` **Módulo Tablas (`src/modules/tables/tables.schemas.ts`)**: Extraer y centralizar esquemas OpenAPI 3.1 para `POST /api/v1/tables`, `GET /api/v1/tables`, `GET /t/:short_code`, `DELETE /api/v1/tables/:id`. Refactorizar `tables.routes.ts` reduciendo de 252 a 90 líneas.
  - [x] `11.1.2` **Módulo Carpetas (`src/modules/folders/folders.schemas.ts`)**: Extraer esquemas OpenAPI 3.1 de `folders.routes.ts` reduciendo de 342 a 105 líneas.
  - [x] `11.1.3` **Módulo Usuarios (`src/modules/users/users.schemas.ts`)**: Extraer esquemas OpenAPI 3.1 de `users.routes.ts` reduciendo de 326 a 192 líneas.
  - [x] `11.1.4` **Módulo Imágenes (`src/modules/images/images.storage.ts`)**: Extraer manipulación de disco reduciendo `images.service.ts` de 383 a 297 líneas.
  - [x] `11.1.5` **Verificación de Pruebas**: Confirmar 0 roturas en los 197 tests congelados y compilación limpia (`tsc`).

- [x] **11.2 Patrón de Doble Artefacto en Tablas (Pre-cálculo para Visualización Rápida y Formato Rico)**
  - [x] `11.2.1` **Extractor Enriquecido en `tables.parser.ts`**: Extraer con `exceljs` celdas combinadas (`merges`), encabezados multinivel y colores de fondo (`cell.fill`) para cuadros estadísticos formateados.
  - [x] `11.2.2` **Generación y Compresión del Artefacto (`.data.json.gz`)**: En la subida (`saveTable`), comprimir el JSON precalculado con `zlib.createGzip()` y almacenarlo en `./storage/tables/${shortCode}.data.json.gz`.
  - [x] `11.2.3` **Entrega Instantánea (2 ms) en `GET /t/:short_code`**: Transmitir directamente `${shortCode}.data.json.gz` con cabeceras `Content-Type: application/json` y `Content-Encoding: gzip` (0% CPU en lecturas).
  - [x] `11.2.4` **Descarga de Alta Fidelidad (`GET /t/:short_code?download=true`)**: Stream directo del `.xlsx` o `.csv` original intacto conservando fórmulas, macroestructura y estilos nativos.
  - [x] `11.2.5` **Limpieza Integral en Cascada**: Actualizar `deleteTable` y la eliminación de carpetas para destruir tanto el archivo fuente como el `.data.json.gz` asociado con `fs.unlink`.

- [x] **11.3 Hardening de Seguridad Anti-IDOR y Sanitización de Fórmulas**
  - [x] `11.3.1` **Blindaje Anti-IDOR en Eliminación (`DELETE /api/v1/tables/:id`)**: Requerir `requester?: RequesterContext` comprobando que solo el propietario de la carpeta contenedora o un `ADMIN` puedan eliminar la tabla (403 Forbidden para terceros).
  - [x] `11.3.2` **Protección contra CSV Formula Injection**: Sanitizar o escapar caracteres dinámicos de comando (`=`, `+`, `-`, `@`) en descargas y exportaciones de datasets.

- [x] **11.4 Paginación y Filtrado SQL Directo en PostgreSQL**
  - [x] `11.4.1` Actualizar `tablesRepository.findAll` para aceptar `page`, `limit`, `folderId`, `userId` e `isAdmin`, aplicando filtrado de privacidad y paginación `take`/`skip` directo en Prisma.
  - [x] `11.4.2` Actualizar `tablesService.listTables` para retornar metadatos completos `{ tables: [...], total, page, limit, totalPages, meta: { ... } }`.

- [x] **11.5 Documentación Simultánea y Sincronización de Contratos (Regla 3)**
  - [x] `11.5.1` Actualizar esquemas OpenAPI con los nuevos metadatos de respuesta, parámetros de paginación y cabeceras.
  - [x] `11.5.2` Regenerar `openapi.json` con `npm run openapi:export`.
  - [x] `11.5.3` Actualizar `ENDPOINTS.md`, `RUTAS.md` y `docs/frontend-integration.md`.

- [x] **11.6 Cobertura de Pruebas Automatizadas y Congelación (Reglas 1 y 2)**
  - [x] `11.6.1` Pruebas unitarias en `tables.service.test.ts` y `tables.parser.test.ts` para el doble artefacto, anti-IDOR y paginación.
  - [x] `11.6.2` Pruebas de integración en `tables.routes.test.ts`.
  - [x] `11.6.3` Protocolo Obligatorio: `npm test` (100% pasando: 207 tests, 0 fallos), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 👥 FASE 12: Sistema Jerárquico de Roles (ADMIN, MANAGER, COLLABORATOR) y RBAC de Carpetas

### 🎯 Objetivos de la Fase
> 1. **Jerarquía Estricta de 3 Niveles (Sin Roles Legacy):** Definir `ADMIN` (3), `MANAGER` (2) y `COLLABORATOR` (1). Regla de creación y gestión: `peso(creador) > peso(nuevo_usuario)`. Se erradica el rol `USER` para no dejar código legacy.
> 2. **Autogestión de Perfil de Usuario:** Implementar `GET /api/v1/auth/me` para consulta de sesión activa y `PATCH /api/v1/auth/password` para cambio seguro de contraseña propia.
> 3. **Gestión Jerárquica de Usuarios:** ADMIN gestiona todo el sistema; MANAGER crea y gestiona exclusivamente sus colaboradores (`createdById`); COLLABORATOR no puede crear ni gestionar usuarios.
> 4. **Compartición de Carpetas con Permisos Granulares (RBAC):** Modelo `FolderMember` con permisos `READ` (solo visualización/descarga) y `EDIT` (lectura, subida y modificación de archivos).
> 5. **Guards de Seguridad Puros:** `canManageUserRole` para validar jerarquía de creación y `assertFolderAccess` para validar acceso a carpetas y archivos.
> 6. **Modernización Autorizada de Tests:** Actualizar las referencias de `Role.USER` a `Role.MANAGER` en la suite de pruebas bajo la orden directa y escrita del usuario (excepción expresa a la Regla 1 para alineación arquitectónica sin deuda técnica).
> 7. **Arquitectura Modular (< 300 LOC):** Mantener cada archivo de producción estrictamente por debajo de 300 LOC extrayendo lógica satélite en `folders.shares.service.ts` y esquemas en `*.schemas.ts`.

- [x] **12.1 Modelo de Datos Prisma y Soporte Jerárquico**
  - [x] `12.1.1` Actualizar `enum Role` en `prisma/schema.prisma` estrictamente con `ADMIN`, `MANAGER` y `COLLABORATOR` (eliminando rol legacy `USER`).
  - [x] `12.1.2` Agregar en `model User` el campo `createdById String?` con relación autorreferencial `createdBy` / `createdUsers`.
  - [x] `12.1.3` Crear `enum FolderPermission { READ, EDIT }` y `model FolderMember` con índice único compuesto `[folderId, userId]`.
  - [x] `12.1.4` Ejecutar `npx prisma generate` y aplicar cambios en PostgreSQL.
  - [x] `12.1.5` **Ajuste de Tests Existentes (Excepción Autorizada)**: Migrar las referencias de `Role.USER` a `Role.MANAGER` en `tests/` para reflejar la nueva especificación sin dejar código legacy.

- [x] **12.2 Autogestión de Perfil y Sesión de Usuario**
  - [x] `12.2.1` **Endpoint `GET /api/v1/auth/me`**: Retornar sesión del usuario autenticado (`id`, `username`, `role`, `isActive`, `createdAt`).
  - [x] `12.2.2` **Endpoint `PATCH /api/v1/auth/password`**: Permitir a cualquier usuario cambiar su propia contraseña validando `currentPassword` e incrementando `tokenVersion` en PostgreSQL para invalidar sesiones en otros dispositivos.

- [x] **12.3 Gestión Jerárquica de Usuarios (`Guard 1: canManageUserRole`)**
  - [x] `12.3.1` **Creación Jerárquica (`POST /api/v1/users`)**:
    - ADMIN puede crear `MANAGER` y `COLLABORATOR`.
    - MANAGER solo puede crear `COLLABORATOR` (vinculando automáticamente `createdById = manager.id`).
    - COLLABORATOR recibe 403 Forbidden al intentar crear usuarios.
  - [x] `12.3.2` **Listado de Usuarios (`GET /api/v1/users`)**:
    - ADMIN lista todos los usuarios del sistema.
    - MANAGER lista únicamente a sus colaboradores vinculados (`createdById === manager.id`).
    - COLLABORATOR recibe 403 Forbidden.
  - [x] `12.3.3` **Suspensión / Activación (`PATCH /api/v1/users/:id/status`)**:
    - ADMIN puede suspender/activar a cualquier usuario (excepto a sí mismo).
    - MANAGER puede suspender/activar a sus propios colaboradores.
    - Al suspender (`isActive = false`), incremento inmediato de `tokenVersion`.
  - [x] `12.3.4` **Restablecimiento de Contraseña por Superior (`PATCH /api/v1/users/:id/password`)**:
    - ADMIN o MANAGER (sobre sus colaboradores) asignan nueva clave e incrementan `tokenVersion`.
  - [x] `12.3.5` **Eliminación Segura de Usuarios (`DELETE /api/v1/users/:id`)**:
    - ADMIN elimina managers o colaboradores (con limpieza en cascada de archivos físicos en `./storage`).
    - MANAGER elimina a sus propios colaboradores. Prohibido eliminar al ADMIN o auto-eliminarse.

- [x] **12.4 Compartición de Carpetas y Membresías (`Guard 2: assertFolderAccess`)**
  - [x] `12.4.1` Crear módulo satélite `src/modules/folders/folders.shares.service.ts` para mantener `folders.service.ts` estrictamente < 300 LOC.
  - [x] `12.4.2` **Asignar Colaborador (`POST /api/v1/folders/:id/shares`)**: Exclusivo del MANAGER de la carpeta o ADMIN. Asigna `userId` con permiso `READ` o `EDIT`.
  - [x] `12.4.3` **Listar Colaboradores (`GET /api/v1/folders/:id/shares`)**: Lista qué usuarios tienen acceso a la carpeta y su nivel de permiso.
  - [x] `12.4.4` **Modificar Permiso (`PATCH /api/v1/folders/:id/shares/:userId`)**: Actualiza entre `READ` y `EDIT`.
  - [x] `12.4.5` **Revocar Colaborador (`DELETE /api/v1/folders/:id/shares/:userId`)**: Expulsa al usuario de la carpeta compartida.

- [x] **12.5 Enlace de Permisos en Ingesta y Mutación de Archivos**
  - [x] `12.5.1` **Listado de Carpetas (`GET /api/v1/folders`)**:
    - ADMIN ve todas las carpetas.
    - MANAGER ve sus carpetas propias y las que le hayan compartido.
    - COLLABORATOR solo ve carpetas compartidas con él (con metadato `myPermission: 'READ' | 'EDIT'`).
  - [x] `12.5.2` **Subida de Archivos (`POST /api/v1/images`, `POST /api/v1/tables`)**:
    - COLLABORATOR requiere obligatoriamente `folderId` donde tenga permiso `EDIT` (403 si es `READ` o sin carpeta).
  - [x] `12.5.3` **Mutación de Archivos (`PATCH`, `PUT`)**: Permitida si el usuario tiene permiso `EDIT` sobre la carpeta contenedora o es ADMIN.
  - [x] `12.5.4` **Eliminación de Carpetas (`DELETE /api/v1/folders/:id`)**: Exclusivo del MANAGER dueño de la carpeta o ADMIN.

- [x] **12.6 Documentación Simultánea, OpenAPI y Guía Frontend (Regla 3)**
  - [x] `12.6.1` Actualizar esquemas OpenAPI 3.1 en `users.schemas.ts` y `folders.schemas.ts`.
  - [x] `12.6.2` Regenerar especificación `openapi.json` con `npm run openapi:export`.
  - [x] `12.6.3` Sincronizar catálogos en `ENDPOINTS.md`, `RUTAS.md` y documentar la guía de roles en `docs/frontend-integration.md`.

- [x] **12.7 Cobertura de Pruebas Automatizadas y Protocolo Obligatorio (Reglas 1 y 2)**
  - [x] `12.7.1` Tests unitarios de jerarquía de creación y control de perfil en `tests/modules/users/users.service.test.ts`.
  - [x] `12.7.2` Tests unitarios de compartición y membresías en `tests/modules/folders/folders.shares.service.test.ts`.
  - [x] `12.7.3` Tests de integración en `tests/modules/users/users.routes.test.ts` y `tests/modules/folders/folders.routes.test.ts`.
  - [x] `12.7.4` Protocolo Obligatorio: `npm test` (0 fallos: 235 tests pasando), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).


---

## 📁 FASE 13: Evolución Integral del Módulo de Carpetas (Edición, Protección de General y RBAC de Reasignación)

### 🎯 Objetivos de la Fase
> 1. **Mutación y Actualización Parcial (`PATCH /api/v1/folders/:id`):** Permitir renombrar (`name`), cambiar color (`color`) o alternar visibilidad (`isPrivate`) de una carpeta existente validando titularidad o rol `ADMIN` (impidiendo renombrar la carpeta del sistema `General`).
> 2. **Protección Defensiva de la Carpeta del Sistema (`General`):** Blindar `DELETE /api/v1/folders/:id` para rechazar con `400 BAD_REQUEST` cualquier intento de eliminación de la carpeta predeterminada del sistema, garantizando siempre una carpeta raíz válida para subidas de archivos.
> 3. **Alineación Total de RBAC en Reasignación de Recursos (`PATCH /api/v1/:resource/:id/folder`):** Integrar `foldersSharesService.assertFolderAccess(folderId, requester, FolderPermission.EDIT)` en `moveImageToFolder` y `moveTableToFolder` para que los colaboradores con permiso `EDIT` puedan reasignar archivos entre carpetas autorizadas sin ser bloqueados.
> 4. **Paginación y Filtrado SQL Opcional (`GET /api/v1/folders`):** Añadir soporte para `page`, `limit` y búsqueda por texto `search` opcionales en el listado de carpetas, manteniendo retrocompatibilidad total (array completo si no se envían parámetros).
> 5. **Modularidad y Límites Arquitectónicos (< 300 LOC):** Mantener todos los archivos del módulo estrictamente por debajo de 300 LOC.
> 6. **Inmutabilidad y Documentación Simultánea (Reglas 1, 2 y 3):** Preservar el 100% de las 235 pruebas congeladas existentes, incorporar nuevas pruebas unitarias e integradas, y actualizar OpenAPI 3.1, `openapi.json`, `ENDPOINTS.md`, `RUTAS.md` y `docs/frontend-integration.md`.

- [x] **13.1 Capa de Datos y Repositorio (`src/modules/folders/folders.repository.ts`)**
  - [x] `13.1.1` Implementar método `updateFolder(id: string, data: { name?: string; color?: string | null; isPrivate?: boolean })` para actualizar propiedades de la carpeta en PostgreSQL.
  - [x] `13.1.2` Actualizar `findFolders` para admitir búsqueda por texto `search?: string` (coincidencia insensible a mayúsculas en `name`) y paginación opcional `page?: number`, `limit?: number`.
  - [x] `13.1.3` Implementar método `countFolders(filter)` para cálculo de metadatos de paginación si se especifican `page` o `limit`.

- [x] **13.2 Capa de Negocio y Reglas de Seguridad (`src/modules/folders/folders.service.ts`)**
  - [x] `13.2.1` Definir esquema Zod `updateFolderSchema`:
    - `name`: string opcional limpio (2-60 caracteres).
    - `color`: string opcional hex (`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`) o `null`.
    - `isPrivate`: booleano opcional.
    - Rechazar cuerpo vacío con al menos un campo a modificar.
  - [x] `13.2.2` Implementar `updateFolder(id: string, rawInput: unknown, requester: RequesterContext)`:
    - Validar formato de UUID.
    - Verificar existencia de la carpeta (`404 NOT_FOUND`).
    - Validar titularidad: solo el propietario (`folder.userId === requester.id`) o `ADMIN` pueden editarla (`403 FORBIDDEN` a colaboradores u otros usuarios).
    - Bloqueo de sistema: rechazar con `400 BAD_REQUEST` cualquier intento de modificar el nombre si la carpeta es la default `'General'`.
    - Actualizar en base de datos y devolver carpeta formateada con `myPermission`.
  - [x] `13.2.3` Blindar `deleteFolder(id: string, requester: RequesterContext)`:
    - Rechazar explícitamente con `400 BAD_REQUEST` (`CANNOT_DELETE_DEFAULT_FOLDER`) si `folder.name === 'General'`.
  - [x] `13.2.4` Conectar guardia de permisos RBAC en reasignación:
    - En `moveImageToFolder`: sustituir la verificación básica de privacidad por `await foldersSharesService.assertFolderAccess(folderId, requester, FolderPermission.EDIT)`.
    - En `moveTableToFolder`: sustituir la verificación básica de privacidad por `await foldersSharesService.assertFolderAccess(folderId, requester, FolderPermission.EDIT)`.
  - [x] `13.2.5` Soportar paginación y búsqueda en `listFolders`:
    - Si se reciben `page` o `limit`, retornar `{ folders, total, page, limit, totalPages, meta: { ... } }`.
    - Si no se reciben parámetros de paginación, mantener `{ folders, total }` garantizando 100% de retrocompatibilidad con los tests existentes.

- [x] **13.3 Esquemas OpenAPI y Rutas HTTP Fastify (`src/modules/folders/`)**
  - [x] `13.3.1` En `folders.schemas.ts`:
    - Definir `updateFolderRouteSchema` para `PATCH /api/v1/folders/:id` con esquemas de entrada, respuestas 200, 400, 401, 403 y 404 RFC 7807.
    - Actualizar `listFoldersRouteSchema` incorporando query params opcionales `page`, `limit` y `search`.
  - [x] `13.3.2` En `folders.routes.ts`:
    - Registrar ruta `PATCH /api/v1/folders/:id` protegida con `authenticateUserOrApiKey`.
    - Actualizar `GET /api/v1/folders` extrayendo `page`, `limit` y `search` del query string.

- [x] **13.4 Documentación Simultánea y Sincronización de Contratos (Regla 3)**
  - [x] `13.4.1` Actualizar catálogos en `ENDPOINTS.md` y `RUTAS.md` con el nuevo endpoint `PATCH /api/v1/folders/:id`, parámetros de búsqueda/paginación y regla de protección de `General`.
  - [x] `13.4.2` Actualizar `docs/frontend-integration.md` con ejemplos de renombrado/edición de carpetas y consumo con filtros.
  - [x] `13.4.3` Regenerar `openapi.json` con `npm run openapi:export`.

- [x] **13.5 Cobertura de Pruebas Automatizadas y Protocolo Obligatorio (Reglas 1 y 2)**
  - [x] `13.5.1` Pruebas unitarias en `tests/modules/folders/folders.service.test.ts`:
    - `updateFolder`: actualización exitosa de nombre, color y privacidad por el dueño o ADMIN.
    - `updateFolder`: rechazo 403 a usuarios ajenos o colaboradores.
    - `updateFolder`: rechazo 400 si se intenta renombrar la carpeta `General`.
    - `updateFolder`: rechazo 400 con cuerpo vacío o colores hex inválidos.
    - `deleteFolder`: rechazo 400 al intentar eliminar la carpeta `General`.
    - `moveImageToFolder` / `moveTableToFolder`: verificación de que colaboradores con permiso `EDIT` pueden mover archivos a la carpeta compartida, y rechazo 403 si solo tienen `READ`.
  - [x] `13.5.2` Pruebas de integración HTTP en `tests/modules/folders/folders.routes.test.ts`:
    - `PATCH /api/v1/folders/:id`: 200 al editar datos, 400 con body inválido, 403 usuario no autorizado, 404 no encontrado.
  - [x] `13.5.3` Protocolo Obligatorio:
    - Ejecutar `npm test` verificando 0 fallos preservando los 235 tests congelados previos (246 tests en total).
    - Ejecutar `npm run build` verificando compilación TypeScript limpia (`tsc`) con código 0.
    - Ejecutar `npm audit` confirmando 0 vulnerabilidades.
    - Verificar que todos los archivos del repositorio permanezcan estrictamente `< 300 LOC`.

---

## 🤖 FASE 14: Módulo de Chat Analítico sobre Tablas (RAG Tabular con Ficha Técnica, Gemini API y Widget Público)

### 🎯 Objetivos de la Fase
> 1. **Ficha Técnica de Tablas (`metadataCard` en `TableRegistry`):** Incorporar una tarjeta de metadatos por tabla que se autogenere en la subida (`entities`, `columnsMeta`, `hasSummaryRows`) y pueda enriquecerse manualmente vía `PATCH /api/v1/tables/:id/metadata` (`title`, `description`, `tags`, `unit`, `columnsMeta`).
> 2. **Motor Analítico Determinista (`chat.engine.ts`):** Filtrar tablas por Ficha Técnica en 1 ms (sin abrir archivos irrelevantes), normalizar búsquedas con sinónimos demográficos, aplanar encabezados multinivel (`merges` + `headers` + `columnsMeta`) y pre-calcular sumas, promedios y porcentajes exactos en TypeScript sobre los artefactos `.data.json.gz`.
> 3. **Conector IA Cloud Inteligente (`chat.provider.ts`):** Conectar con Google AI Studio (`gemini-2.5-flash` con rotación automática a `gemini-2.5-flash-lite` ante código 429 para alcanzar 3.000+ consultas gratuitas/día), caché LRU/TTL en memoria (5 min) para preguntas repetidas y Fallback Determinista Local en TypeScript si no hay `AI_API_KEY` o la red falla.
> 4. **Cero Alucinaciones (Grounded Truth):** Si la entidad o tema consultado no existe en las Fichas Técnicas ni en los archivos permitidos, responder inmediatamente con `foundInSystem: false`, `sources: []` y `"La información solicitada no existe en los archivos registrados en este sistema."` sin gastar llamadas a la API externa.
> 5. **Doble Contexto de Seguridad (Interno RBAC vs. Público Web Externa):**
>    - `POST /api/v1/chat/ask`: Protegido con `authenticateUserOrApiKey` respetando estrictamente el RBAC de Fase 12/13 (`ADMIN`, `MANAGER`, `COLLABORATOR`).
>    - `POST /api/v1/public/chat/ask` y `GET /api/v1/public/chat/suggestions`: Endpoints públicos con Rate Limiting para incrustar en páginas web externas, restringidos EXCLUSIVAMENTE a tablas dentro de carpetas públicas (`folder.isPrivate === false`).
> 6. **Límites Arquitectónicos e Inmutabilidad (Reglas 1, 2 y 3):** Mantener todos los archivos `< 300 LOC`, preservar intactos los 246 tests congelados existentes y sincronizar OpenAPI 3.1, `openapi.json`, `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.

- [x] **14.1 Modelo de Datos y Ficha Técnica en Tablas (`prisma/schema.prisma` y `src/modules/tables/`)**
  - [x] `14.1.1` Agregar columna `metadataCard Json? @map("metadata_card")` en `TableRegistry` dentro de `prisma/schema.prisma` y ejecutar `npx prisma generate`.
  - [x] `14.1.2` En `tables.parser.ts`: Autogenerar la `metadataCard` inicial durante la subida extrayendo entidades únicas de texto (`entities`), diccionario base de columnas (`columnsMeta` cruzado con `merges`/`headers`) y detección de fila de totales (`hasSummaryRows`).
  - [x] `14.1.3` Implementar `PATCH /api/v1/tables/:id/metadata` (en `tables.routes.ts`, `tables.schemas.ts`, `tables.service.ts` y `tables.repository.ts`) validando permisos RBAC (`ADMIN`, `MANAGER` propietario o `COLLABORATOR` con permiso `EDIT` sobre la carpeta) para enriquecer `title`, `description`, `tags`, `unit`, `columnsMeta` y `hasSummaryRows`.

- [x] **14.2 Motor Analítico Local y Pre-Calculadora (`src/modules/chat/chat.engine.ts`)**
  - [x] `14.2.1` Implementar normalizador de texto (eliminación de tildes/diacríticos, minúsculas) y diccionario de sinónimos estadísticos/demográficos (`hombre/hombres <-> masculino/varones`, `mujer/mujeres <-> femenino`, `personas/habitantes <-> poblacion/total`).
  - [x] `14.2.2` Implementar buscador rápido sobre `metadataCard` (`title`, `description`, `tags`, `entities`, `columnsMeta`) para descartar tablas irrelevantes antes de tocar disco.
  - [x] `14.2.3` Implementar extractor de filas sobre `./storage/tables/${shortCode}.data.json.gz` con aplanado de encabezados (`Header Flattening`) combinando `headers`, `merges` y `columnsMeta`.
  - [x] `14.2.4` Implementar `Math Scratchpad` en TypeScript: cálculo determinista de totales, promedios y distribución porcentual (`%`) de las filas filtradas (respetando `hasSummaryRows` para no duplicar totales) y generación de `chartData: { labels, values, percentages }`.

- [x] **14.3 Proveedor de IA en la Nube con Rotación, Caché y Fallback (`src/modules/chat/chat.provider.ts`)**
  - [x] `14.3.1` Declarar variables opcionales en `src/config/env.ts`: `AI_BASE_URL` (default compatible con Google AI Studio OpenAI endpoint), `AI_API_KEY`, `AI_MODEL` (default `gemini-2.5-flash`) y `AI_FALLBACK_MODEL` (default `gemini-2.5-flash-lite`).
  - [x] `14.3.2` Implementar caché en memoria con TTL de 5 minutos indexada por hash de `(normalizedQuestion + tableIds + updatedAt)` para ahorrar cuota en preguntas repetidas.
  - [x] `14.3.3` Implementar cliente HTTP (`fetch` nativo con timeout de 10s) con System Prompt estricto Anti-Alucinaciones y rotación automática de `gemini-2.5-flash` a `gemini-2.5-flash-lite` si recibe estado `429`.
  - [x] `14.3.4` Implementar sintetizador determinista en TypeScript (Fallback Local) que redacte la respuesta en español usando los cálculos de `chat.engine.ts` y la `metadataCard` cuando `AI_API_KEY` no esté definida o los proveedores externos fallen.

- [x] **14.4 Servicio de Orquestación, Seguridad RBAC y Rutas (`src/modules/chat/`)**
  - [x] `14.4.1` Crear `src/modules/chat/chat.service.ts`:
    - `askInternal(input, requester)`: Filtrar tablas accesibles según RBAC (`ADMIN` todas; `MANAGER` propias, públicas y compartidas; `COLLABORATOR` solo carpetas compartidas).
    - `askPublic(input)`: Filtrar EXCLUSIVAMENTE tablas en carpetas públicas (`folder.isPrivate === false`), soportando filtros opcionales `folderId` o `shortCode`.
    - `getPublicSuggestions(folderId?)`: Generar preguntas sugeridas dinámicas basadas en las `metadataCard` de las tablas públicas.
    - Cortocircuito Anti-Alucinaciones: Si `chat.engine.ts` no halla datos en las tablas permitidas, retornar inmediatamente `foundInSystem: false`, `sources: []` y `"La información solicitada no existe en los archivos registrados en este sistema."`.
  - [x] `14.4.2` Crear `src/modules/chat/chat.schemas.ts`: Esquemas OpenAPI 3.1 completos para `POST /api/v1/chat/ask`, `POST /api/v1/public/chat/ask` y `GET /api/v1/public/chat/suggestions`.
  - [x] `14.4.3` Crear `src/modules/chat/chat.routes.ts` y registrar en `src/gateway/router.ts`:
    - `POST /api/v1/chat/ask` con `authenticateUserOrApiKey`.
    - `POST /api/v1/public/chat/ask` y `GET /api/v1/public/chat/suggestions` públicos con Rate Limit específico (30 req/min por IP).

- [x] **14.5 Documentación Simultánea y Guía de Widget Web (Regla 3)**
  - [x] `14.5.1` Actualizar `RUTAS.md` y `ENDPOINTS.md` con los 4 nuevos endpoints (`PATCH /api/v1/tables/:id/metadata`, `POST /api/v1/chat/ask`, `POST /api/v1/public/chat/ask`, `GET /api/v1/public/chat/suggestions`).
  - [x] `14.5.2` Actualizar `docs/frontend-integration.md` documentando la Ficha Técnica de tablas, el consumo del chat interno, el ejemplo de integración del widget público para páginas web externas y la configuración de `AI_API_KEY` de Google AI Studio.
  - [x] `14.5.3` Regenerar `openapi.json` con `npm run openapi:export`.

- [x] **14.6 Cobertura de Pruebas Automatizadas y Protocolo Obligatorio (Reglas 1 y 2)**
  - [x] `14.6.1` Pruebas unitarias en `tests/modules/chat/chat.engine.test.ts` y `tests/modules/chat/chat.service.test.ts`:
    - Autogeneración y actualización de `metadataCard` con control de acceso RBAC.
    - Cálculo exacto de conteos y porcentajes (ej. población de Brasil entre hombres y mujeres) desde `.data.json.gz`.
    - Rechazo inmediato (`foundInSystem: false`) cuando se consulta por un país o dato inexistente en el sistema.
    - Rotación de modelo ante error 429, funcionamiento del caché en memoria y Fallback Determinista sin API Key.
  - [x] `14.6.2` Pruebas de integración HTTP en `tests/modules/chat/chat.routes.test.ts`:
    - Aislamiento estricto en `/api/v1/public/chat/ask`: responde sobre tablas en carpetas públicas (`isPrivate: false`), pero jamás filtra ni lee tablas de carpetas privadas (`isPrivate: true`).
    - Respeto de permisos RBAC para `MANAGER` y `COLLABORATOR` en `/api/v1/chat/ask`.
  - [x] `14.6.3` Protocolo Obligatorio:
    - Verificar que todos los archivos del repositorio se mantengan `< 300 LOC`.
    - Ejecutar `npm test` (0 fallos, 282 tests aprobados), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 📊 FASE 15: Paridad Total en Tablas (Hot-Swap, Renombrado), Búsqueda Global y Operaciones en Lote

### 🎯 Objetivos de la Fase

> 1. **Reemplazo en Caliente Seguro de Tablas (`PUT /api/v1/tables/:id` - Hot-Swap):** Sustituir físicamente un archivo `.xlsx` o `.csv` conservando intactos su `id`, `shortCode`, `folderId` y URL pública (`/t/:short_code`). El reemplazo se ejecuta mediante archivo temporal (`temp_${shortCode}_...` -> rename atómico) para garantizar cero corrupción en caso de error, regenerando automáticamente el artefacto `.data.json.gz`, actualizando la `metadataCard`, sanitizando fórmulas CSV e invalidando la caché del Chat (`chatCache.clear()`).
> 
> 2. **Renombrado de Tablas (`PATCH /api/v1/tables/:id`):** Permitir modificar `tableName` sin tocar el almacenamiento físico ni cambiar el `shortCode`, igualando las capacidades del módulo de imágenes.
> 
> 3. **Buscador Filtrado SQL (`?search=`):** Añadir búsqueda insensible a mayúsculas/minúsculas en `GET /api/v1/images` (por `originalName` y `shortCode`) y en `GET /api/v1/tables` (por `tableName` y `shortCode`).
> 
> 4. **Operaciones Masivas en Lote (`Bulk Actions`):** Permitir eliminar o mover de carpeta múltiples imágenes o tablas en una sola petición (`POST /api/v1/images/bulk-delete`, `POST /api/v1/images/bulk-move`, `POST /api/v1/tables/bulk-delete`, `POST /api/v1/tables/bulk-move`) respetando el RBAC de cada carpeta y retornando reportes de ejecución resilientes (`{ totalRequested, successful, failed }`).
> 
> 5. **Límites Arquitectónicos e Inmutabilidad (Reglas 1, 2 y 3):** Mantener todos los archivos `< 300 LOC` mediante servicios satélites (`tables.mutation.service.ts`, `images.bulk.service.ts` y `tables.bulk.service.ts`), preservar el 100% de los tests congelados previos (282 tests) y sincronizar OpenAPI 3.1, `openapi.json`, `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.

- [ ] **15.1 Mutación y Reemplazo en Caliente en Módulo de Tablas (`src/modules/tables/`)**
  - [ ] `15.1.1` **Crear Servicio Satélite de Mutación (`src/modules/tables/tables.mutation.service.ts`)**:
    - Centralizar renombrado y reemplazo en caliente en un servicio satélite dedicado para mantener `tables.service.ts` (299 LOC) estrictamente por debajo de 300 líneas.
  - [ ] `15.1.2` **Renombrar Tabla (`PATCH /api/v1/tables/:id`)**:
    - Validar con Zod `{ tableName: string }` (1-255 caracteres, sanitizado sin espacios redundantes).
    - Validar permisos RBAC con `foldersSharesService.assertFolderAccess` (`EDIT`, propietario o `ADMIN`).
    - Actualizar `tableName` y `updatedAt` en PostgreSQL y retornar el modelo con `urlWithVersion` (`?v=`).
  - [ ] `15.1.3` **Reemplazo en Caliente de Dataset (`PUT /api/v1/tables/:id` - Hot-Swap)**:
    - Aceptar nuevo archivo `.csv` o `.xlsx` vía `multipart/form-data` (máx. 100MB).
    - Guardar primero en archivo temporal (`temp_${shortCode}_${Date.now()}.${ext}`) para resiliencia atómica; si falla validación o parseo, eliminar temporal sin tocar el archivo original.
    - Validar estructura, magic bytes y sanitizar contra CSV Formula Injection (`=`, `+`, `-`, `@`).
    - Conservar el **mismo** `id`, `shortCode` y `folderId`.
    - Sobrescribir de forma segura el archivo fuente en `./storage/tables/` mediante rename y regenerar el artefacto comprimido `${shortCode}.data.json.gz`.
    - Actualizar `columnsSchema`, `rowCount`, `sizeBytes`, `metadataCard` (conservando campos enriquecidos manualmente como `title`, `description`, `tags`) y `updatedAt` en PostgreSQL.
    - Invalidar entradas asociadas en la caché en memoria del módulo de Chat (`chatCache.clear()` o invalidación por clave).
  - [ ] `15.1.4` **Rutas Fastify y Esquemas OpenAPI**:
    - Agregar esquemas Zod en `tables.schemas.ts` y registrar `PATCH /api/v1/tables/:id` y `PUT /api/v1/tables/:id` en `tables.routes.ts` con middleware `authenticateUserOrApiKey`.

- [ ] **15.2 Búsqueda por Texto (`?search=`) en Imágenes y Tablas**
  - [ ] `15.2.1` Actualizar `imagesRepository.findAll` e `images.schemas.ts` para admitir query param opcional `search?: string` filtrando con `contains` (`mode: 'insensitive'`) sobre `originalName` y `shortCode`.
  - [ ] `15.2.2` Actualizar `tablesRepository.findAll` y `tables.schemas.ts` para admitir query param opcional `search?: string` filtrando con `contains` (`mode: 'insensitive'`) sobre `tableName` y `shortCode`.

- [ ] **15.3 Operaciones en Lote (`Bulk Delete` y `Bulk Move`)**
  - [ ] `15.3.1` **Crear Servicios Satélites de Operaciones Masivas**:
    - Implementar `src/modules/images/images.bulk.service.ts` y `src/modules/tables/tables.bulk.service.ts` para aislar la lógica en lote y blindar `images.service.ts` (296 LOC) y `tables.service.ts` (299 LOC) `< 300 LOC`.
  - [ ] `15.3.2` **Implementar `POST /api/v1/images/bulk-delete` y `POST /api/v1/tables/bulk-delete`**:
    - Body: `{ ids: string[] }` (máx. 50 IDs por petición).
    - Verificar permisos de edición/propiedad sobre cada recurso individual con RBAC (`ADMIN`, propietario o colaborador con `EDIT`).
    - Borrado seguro en base de datos y limpieza física completa en disco: archivo original, miniaturas WebP (`.webp`) y artefactos (`.data.json.gz`) usando `Promise.allSettled`.
    - Respuesta con balance resiliente: `{ totalRequested, successful: string[], failed: { id: string, reason: string }[] }`.
  - [ ] `15.3.3` **Implementar `POST /api/v1/images/bulk-move` y `POST /api/v1/tables/bulk-move`**:
    - Body: `{ ids: string[], targetFolderId: string }` (máx. 50 IDs).
    - Verificar coincidencia de tipo (`FolderType.IMAGE` o `FolderType.TABLE`).
    - Validar permisos `EDIT` tanto en la carpeta origen de cada recurso como en la carpeta destino (`targetFolderId`).
    - Mover recursos en PostgreSQL y retornar reporte de ejecución `{ totalRequested, successful: string[], failed: { id: string, reason: string }[] }`.
  - [ ] `15.3.4` **Esquemas OpenAPI y Rutas en Fastify**:
    - Registrar las 4 nuevas rutas en `images.routes.ts` y `tables.routes.ts` con protección `authenticateUserOrApiKey`.

- [ ] **15.4 Documentación y Pruebas Automatizadas (Reglas 1, 2 y 3)**
  - [ ] `15.4.1` Crear pruebas unitarias e integradas para `PATCH /api/v1/tables/:id`, `PUT /api/v1/tables/:id`, `?search=` y endpoints `bulk-*` (incluyendo rechazos `403 FORBIDDEN` cuando un colaborador solo tiene `READ`).
  - [ ] `15.4.2` Actualizar `RUTAS.md`, `ENDPOINTS.md`, `docs/frontend-integration.md` y regenerar `openapi.json` con `npm run openapi:export`.
  - [ ] `15.4.3` Verificar `< 300 LOC` en todos los archivos, `npm test` (100% pasando, 0 fallos), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 🛡️ FASE 16: Auditoría de Acciones (`AuditLog`), Gestión Dinámica de API Keys y Monitor de Almacenamiento

### 🎯 Objetivos de la Fase

> 1. **Trazabilidad y Auditoría (`AuditLog`):** Registrar quién (`userId`), cuándo y desde qué IP ejecutó acciones críticas (subidas, borrados, reemplazos hot-swap, cambios de permisos `FolderMember` y gestión de usuarios) de forma no bloqueante (`fire-and-forget`) con consulta filtrada y paginada para `ADMIN` y `MANAGER`.
> 
> 2. **Gestión Dinámica de `ApiClient` (`/api/v1/api-keys`):** Permitir al `ADMIN` crear, listar y revocar llaves `X-API-Key` desde la interfaz sin tocar la base de datos manualmente.
> 
> 3. **Monitor de Cuotas y Salud de Disco (`GET /api/v1/stats/storage`):** Exponer métricas en tiempo real del peso ocupado en `./storage/images` y `./storage/tables`, conteo de archivos y desglose por carpeta/usuario, cubriendo el gatillo del Riesgo 1 de la Fase 9.2 con alertas preventivas.
> 
> 4. **Límites Arquitectónicos e Inmutabilidad (Reglas 1, 2 y 3):** Mantener todos los archivos `< 300 LOC`, preservar el 100% de los tests congelados previos y sincronizar OpenAPI 3.1, `openapi.json`, `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.

- [ ] **16.1 Historial de Auditoría (`src/modules/audit/`)**
  - [ ] `16.1.1` **Modelo `AuditLog` en `prisma/schema.prisma`**:
    - Definir modelo `AuditLog`: `id`, `actorId`, `actorUsername`, `action`, `resourceType`, `resourceId`, `folderId?`, `metadata Json?`, `ipAddress?`, `createdAt`.
    - Índices de alto rendimiento: `@@index([actorId])`, `@@index([folderId])`, `@@index([resourceType, resourceId])`, `@@index([createdAt(sort: Desc)])`.
    - Ejecutar migración o `npx prisma generate`.
  - [ ] `16.1.2` **Servicio No Bloqueante (`src/modules/audit/audit.service.ts`)**:
    - Implementar método `recordLog(...)` no bloqueante (`fire-and-forget`) para que jamás incremente la latencia de las peticiones HTTP principales ni interrumpa transacciones exitosas.
    - Integrar llamadas a `recordLog` en mutaciones clave: usuarios (`USER_CREATE`, `USER_ROLE_CHANGE`), carpetas (`FOLDER_SHARE`, `FOLDER_REVOKE`), imágenes (`IMAGE_UPLOAD`, `IMAGE_DELETE`, `IMAGE_HOTSWAP`, `IMAGE_RENAME`, `IMAGE_BULK_DELETE`, `IMAGE_BULK_MOVE`) y tablas (`TABLE_UPLOAD`, `TABLE_DELETE`, `TABLE_HOTSWAP`, `TABLE_RENAME`, `TABLE_BULK_DELETE`, `TABLE_BULK_MOVE`).
  - [ ] `16.1.3` **Endpoint `GET /api/v1/audit-logs`**:
    - Query params: `page`, `limit`, `action`, `resourceType`, `folderId`.
    - Control de Acceso RBAC:
      - `ADMIN`: visualiza todos los eventos del sistema.
      - `MANAGER`: visualiza eventos ocurridos sobre sus carpetas propias y acciones ejecutadas por sus colaboradores vinculados (`createdById`).
      - `COLLABORATOR`: denegado con `403 FORBIDDEN`.

- [ ] **16.2 Administración Dinámica de API Keys (`src/modules/api-keys/`)**
  - [ ] `16.2.1` **Crear API Key (`POST /api/v1/api-keys`) - Exclusivo `ADMIN`**:
    - Recibe `{ name: string, description?: string }`.
    - Genera llave criptográfica con prefijo `mk_live_` + nanoid(32), almacena el hash seguro en `ApiClient` y retorna el secreto en texto plano por única vez (`201 Created`).
  - [ ] `16.2.2` **Listar y Revocar API Keys (`GET /api/v1/api-keys` y `DELETE /api/v1/api-keys/:id`) - Exclusivo `ADMIN`**:
    - `GET /api/v1/api-keys`: lista llaves ocultando el secreto (mostrando `id`, `name`, `description`, prefijo `mk_live_...`, `createdAt`, `lastUsedAt`, `isActive`).
    - `DELETE /api/v1/api-keys/:id`: revocación/eliminación inmediata de la llave.

- [ ] **16.3 Estadísticas y Monitoreo de Almacenamiento (`GET /api/v1/stats/storage`)**
  - [ ] `16.3.1` **Cálculo Agregado en Base de Datos y Disco Físico**:
    - Consultas agregadas en PostgreSQL (`SUM(sizeBytes)`, `COUNT(*)`) para `ImageRegistry` y `TableRegistry`.
    - Verificación física del volumen `./storage` (espacio consumido por `./storage/images` incluyendo miniaturas WebP y `./storage/tables` incluyendo `.data.json.gz`).
    - Desglose por carpetas más pesadas.
  - [ ] `16.3.2` **Exponer `GET /api/v1/stats/storage` (Protegido `ADMIN` y `MANAGER`)**:
    - `ADMIN`: estadísticas globales del sistema y estado de salud de disco.
    - `MANAGER`: estadísticas restringidas a sus carpetas y recursos propios.
    - Alerta preventiva (`warning: true`, mensaje de alerta) si el espacio en disco físico o cuota estimada supera el umbral configurado (ej. 80%).

- [ ] **16.4 Documentación y Pruebas Automatizadas (Reglas 1, 2 y 3)**
  - [ ] `16.4.1` Crear suites de pruebas en `tests/modules/audit/`, `tests/modules/api-keys/` y `tests/modules/stats/`.
  - [ ] `16.4.2` Actualizar `RUTAS.md`, `ENDPOINTS.md`, `docs/frontend-integration.md` y regenerar `openapi.json`.
  - [ ] `16.4.3` Verificar `< 300 LOC` por archivo, `npm test` (100% pasando), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 📝 FASE 17: Módulo de Formularios Customizables, Tablas Vivas y Resolución Única (Write-Once)

### 🎯 Objetivos de la Fase

> 1. **Desacoplamiento Total de PDFs (Backend Ciego a PDFs):** `monolith-backend` NO genera ni almacena archivos PDF ni conoce cómo se construyen. Su única responsabilidad al respecto es enviar el JSON estructurado de la fila (`entryPayload` + `resolutionPayload`) al sistema externo encargado de las respuestas/PDFs.
> 
> 2. **Esquema Dual de Columnas Customizable por Formulario:** Cada formulario (`FormDefinition`) define dos grupos de columnas para su tabla vinculada (`TableRegistry`):
>    - `entryFieldsSchema`: Campos que llena el usuario al enviar el formulario (ej. nombre, correo, consulta).
>    - `resolutionFieldsSchema`: Campos exclusivos de respuesta que nacen vacíos (`null`) y solo se completan al responder al usuario (ej. dictamen, texto de respuesta, código de oficio).
> 
> 3. **Dos Endpoints de Escritura con Regla de Inmutabilidad (Write-Once):**
>    - **Endpoint 1 (Crear Entrada - `POST /api/v1/public/forms/:slug/entries`):** Guarda los datos iniciales del usuario, asigna `status = "NEW"` y deja vacías las columnas de respuesta en la base de datos y en la tabla `.data.json.gz`.
>    - **Endpoint 2 (Completar Respuesta Una Sola Vez - `PATCH /api/v1/forms/entries/:id/resolve`):** Completa los campos de `resolutionFieldsSchema` y cambia el `status` de `"NEW"` a `"VALID"` o `"INVALID"` (según el enum/configuración del formulario), sellando `resolvedAt`. **Solo puede ejecutarse una única vez por fila:** cualquier intento posterior de volver a llamar a este endpoint sobre una fila que ya no esté en `"NEW"` se rechaza con `409 CONFLICT` (`ENTRY_ALREADY_RESOLVED`).
> 
> 4. **Re-envío Bajo Demanda sin Guardar Archivos (`POST /api/v1/forms/entries/:id/dispatch`):** Si se requiere volver a generar el documento de una fila ya respondida N veces en el futuro, este endpoint de solo lectura reenvía los datos sellados de esa fila al sistema externo sin alterar la base de datos ni usar disco.
> 
> 5. **Sincronización con Tablas Vivas y Descarga Mensual:** Todas las filas (con sus columnas de entrada y de respuesta) se sincronizan en el `.data.json.gz` de su `TableRegistry` y pueden descargarse en `.xlsx` o `.csv` filtradas por mes (`?month=YYYY-MM`) o estado (`?status=NEW|VALID|INVALID`).
> 
> 6. **Límites Arquitectónicos e Inmutabilidad (Reglas 1, 2 y 3):** Mantener todos los archivos `< 300 LOC`, preservar el 100% de los tests congelados previos y documentar en OpenAPI 3.1, `openapi.json`, `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.

- [ ] **17.1 Modelo de Datos en Prisma (`prisma/schema.prisma`)**
  - [ ] `17.1.1` Crear modelo `FormDefinition` (`id`, `slug`, `title`, `entryFieldsSchema Json`, `resolutionFieldsSchema Json`, `allowedResolutionStates String[]` por defecto `["VALID", "INVALID"]`, `autoResolveWithAi Boolean @default(false)`, `externalTargetUrl String?`, `folderId`, `linkedTableId?`).
  - [ ] `17.1.2` Crear modelo `FormEntry` (`id`, `formId`, `entryPayload Json`, `status String @default("NEW")`, `resolutionPayload Json?`, `resolvedById String?`, `resolvedAt DateTime?`, `createdAt DateTime @default(now())`).
  - [ ] `17.1.3` Ejecutar `npx prisma generate` y sincronizar esquema en PostgreSQL.

- [ ] **17.2 Validador de Esquema Dual e Inmutabilidad Write-Once (`src/modules/forms/forms.validator.ts`)**
  - [ ] `17.2.1` Implementar validación dinámica de `entryPayload` contra `entryFieldsSchema` para la creación de entradas.
  - [ ] `17.2.2` Implementar guardia `assertCanResolveEntry(entry, newStatus, allowedStates, resolutionPayload, resolutionFieldsSchema)`:
    - Si `entry.status !== 'NEW'` o `entry.resolvedAt !== null`, lanzar error RFC 7807 `409 CONFLICT` (`ENTRY_ALREADY_RESOLVED`).
    - Verificar que `newStatus` pertenezca a `allowedResolutionStates` (ej. `"VALID"` o `"INVALID"`, impidiendo quedarse en `"NEW"` o pasar a un estado inexistente con `400 BAD_REQUEST`).
    - Validar `resolutionPayload` contra `resolutionFieldsSchema`.

- [ ] **17.3 Sincronizador de Tabla Viva y Exportador Mensual (`src/modules/forms/forms.table-sync.ts`)**
  - [ ] `17.3.1` Al crear el formulario, crear su `TableRegistry` con las columnas combinadas (`[...entryColumns, 'status', ...resolutionColumns, 'createdAt', 'resolvedAt']`).
  - [ ] `17.3.2` Actualizar el artefacto `.data.json.gz` tanto al crear una entrada en el Endpoint 1 (con las columnas de respuesta en `null`) como al sellar la respuesta en el Endpoint 2.
  - [ ] `17.3.3` Implementar `GET /api/v1/forms/:id/export?month=YYYY-MM&status=&format=xlsx|csv` para exportar las filas a Excel o CSV.

- [ ] **17.4 Endpoints de Ciclo de Vida y Envío de Datos al Sistema Externo (`src/modules/forms/forms.service.ts` y `forms.routes.ts`)**
  - [ ] `17.4.1` `POST /api/v1/forms` y `GET /api/v1/forms`: Crear y listar formularios customizables respetando el RBAC de carpetas.
  - [ ] `17.4.2` **Endpoint 1 — Crear Entrada (`POST /api/v1/public/forms/:slug/entries`)**: Ruta pública con Rate Limit. Guarda `entryPayload` con `status: "NEW"` y sincroniza la tabla viva. (Si `autoResolveWithAi` está activo y `chatService.askPublic()` encuentra respuesta exacta, puede ejecutar automáticamente el paso de resolución y envío).
  - [ ] `17.4.3` **Endpoint 2 — Completar Respuesta Única (`PATCH /api/v1/forms/entries/:id/resolve`)**: Ruta protegida (`ADMIN`, `MANAGER` o `COLLABORATOR` con permiso `EDIT`). Valida que la fila esté en `"NEW"`, sella por única vez `status` (`VALID` | `INVALID`), `resolutionPayload` y `resolvedAt`, actualiza el `.data.json.gz` y envía los datos unificados de la fila al sistema externo (`externalTargetUrl`).
  - [ ] `17.4.4` **Reenvío / Consulta para Sistema Externo (`POST /api/v1/forms/entries/:id/dispatch` y `GET /api/v1/forms/:id/entries`)**: Permite listar las entradas (filtradas por mes y estado) y volver a disparar el envío del JSON de cualquier fila ya resuelta hacia el sistema encargado de los PDFs cuantas veces se necesite sin tocar el disco ni permitir reeditar la fila.

- [ ] **17.5 Documentación y Pruebas Automatizadas (Reglas 1, 2 y 3)**
  - [ ] `17.5.1` Crear suites de pruebas en `tests/modules/forms/` verificando:
    - Creación de entrada en `POST /api/v1/public/forms/:slug/entries` naciendo en estado `NEW` con campos de respuesta vacíos.
    - Resolución exitosa en `PATCH /api/v1/forms/entries/:id/resolve` pasando de `NEW` a `VALID` o `INVALID`, completando las columnas de respuesta en la tabla y enviando el JSON al sistema externo.
    - Rechazo estricto con `409 CONFLICT` (`ENTRY_ALREADY_RESOLVED`) al intentar llamar por segunda vez a `PATCH .../resolve` sobre una entrada que ya fue respondida (`VALID` o `INVALID`).
    - Reenvío repetible en `POST .../dispatch` entregando los mismos datos al sistema externo con 0 archivos creados en `./storage`.
  - [ ] `17.5.2` Actualizar esquemas OpenAPI 3.1, regenerar `openapi.json` y actualizar `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.
  - [ ] `17.5.3` Verificar `< 300 LOC` en todos los archivos, `npm test` (0 fallos), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 📄 FASE 18: Módulo de Archivos PDF, Patrón de Doble Artefacto (.text.json.gz), Link Corto (/p/:short_code) e Integración con Chat RAG

### 🎯 Objetivos de la Fase

> 1. **Alojamiento y Capability URL Pública (`/p/:short_code`):** Subir, organizar en carpetas (`FolderType.PDF`), reemplazar en caliente (`PUT` Hot-Swap) y servir documentos PDF mediante enlaces cortos opacos: visualización directa en navegador (`inline`), descarga forzada (`?download=true`) y lectura instantánea del texto extraído (`?format=text`).
> 
> 2. **Patrón de Doble Artefacto en PDFs (0% CPU en Lecturas y RAG):** Al subir un PDF, guardar el binario original intacto en `./storage/pdfs/${shortCode}.pdf` y extraer en ese único momento su texto por página usando `unpdf`, comprimiéndolo en `./storage/pdfs/${shortCode}.text.json.gz` junto con su `pageCount` y su Ficha Técnica (`metadataCard`).
> 
> 3. **Blindaje de Seguridad (`file-guard.ts`):** Validar magic bytes reales (`%PDF-`, hex `25 50 44 46 2D`) y escaneo anti-scripts bloqueando con `400 MALICIOUS_PAYLOAD` cualquier PDF que contenga acciones ejecutables incrustadas (`/JavaScript`, `/JS`, `/Launch`, `/SubmitForm`).
> 
> 4. **Sinergia Total con el Chat Analítico (Fase 14 - RAG Documental + Tabular):** Conectar `chat.engine.ts` para que el Chat (interno con RBAC y público para web externa) consulte simultáneamente Tablas (`.data.json.gz`) y PDFs (`.text.json.gz`), respondiendo preguntas conceptuales o metodológicas y citando el documento y el número de página exacto (`pages: [4, 5]`).
> 
> 5. **Límites Arquitectónicos e Inmutabilidad (Reglas 1, 2 y 3):** Mantener todos los archivos estrictamente `< 300 LOC`, preservar intactos el 100% de los tests congelados previos y documentar simultáneamente en OpenAPI 3.1, `openapi.json`, `RUTAS.md`, `ENDPOINTS.md` y `docs/frontend-integration.md`.

- [ ] **18.1 Modelo de Datos en Prisma y Soporte de Carpetas (`prisma/schema.prisma`)**
  - [ ] `18.1.1` Ampliar enum `FolderType` a `IMAGE`, `TABLE`, `PDF`.
  - [ ] `18.1.2` Crear modelo `PdfRegistry` (`@@map("pdf_registry")`):
    - `id` (UUID, PK), `shortCode` (String único, 10 chars Base58).
    - `originalName` (String), `storagePath` (String), `textArtifactPath` (String).
    - `sizeBytes` (Int), `pageCount` (Int), `isScanned` (Boolean `@default(false)` para identificar PDFs de solo imagen sin texto seleccionable).
    - `metadataCard` (Json? `@map("metadata_card")`: `title`, `description`, `tags`, `keywords`, `summary`).
    - `folderId` (UUID, FK a `Folder` con `onDelete: Cascade`).
    - `createdAt` y `updatedAt`.
  - [ ] `18.1.3` Instalar dependencia ligera `unpdf` (extracción de texto por página en TypeScript puro sin binarios pesados de sistema) y ejecutar `npx prisma generate`.

- [ ] **18.2 Seguridad de Archivos y Extractor de Doble Artefacto (`src/gateway/file-guard.ts` y `src/modules/pdfs/pdfs.parser.ts`)**
  - [ ] `18.2.1` En `src/gateway/file-guard.ts`: Añadir validador de magic bytes para `application/pdf` (`%PDF-`) e inspector de buffer que rechace con `400 MALICIOUS_PAYLOAD` diccionarios PDF peligrosos (`/JS`, `/JavaScript`, `/Launch`).
  - [ ] `18.2.2` Crear `src/modules/pdfs/pdfs.parser.ts`:
    - Extraer el texto página por página (`pages: [{ pageNumber: 1, text: "..." }, ...]`) y el conteo total `pageCount`.
    - Si el texto total extraído es vacío (< 20 caracteres), marcar `isScanned: true` sin fallar la subida.
    - Autogenerar la `metadataCard` inicial extrayendo título del documento, palabras clave más frecuentes (`keywords`) y vista previa de las primeras páginas.
    - Comprimir la estructura con `zlib.gzipSync` y guardarla en `./storage/pdfs/${shortCode}.text.json.gz`.

- [ ] **18.3 Repositorio, Almacenamiento y Servicio de PDFs (`src/modules/pdfs/`)**
  - [ ] `18.3.1` Crear `src/modules/pdfs/pdfs.storage.ts` y `pdfs.repository.ts` siguiendo el patrón modular `< 300 LOC`: guardado/borrado de `.pdf` + `.text.json.gz`, paginación SQL (`page`, `limit`, `folderId`, `search`) y filtros de privacidad/RBAC.
  - [ ] `18.3.2` Crear `src/modules/pdfs/pdfs.service.ts`:
    - `uploadPdf`: Auto-asignación a carpeta 'General' (tipo PDF) si no se envía `folderId`, o verificación de permiso `EDIT` si es `COLLABORATOR`.
    - `renamePdf` (`PATCH /api/v1/pdfs/:id`): Modificar `originalName` validando acceso RBAC.
    - `replacePdf` (`PUT /api/v1/pdfs/:id` - Hot-Swap): Reemplazar el archivo `.pdf` físico y regenerar su `.text.json.gz` conservando el mismo `id`, `shortCode` y URL pública con `?v=timestamp`.
    - `updateMetadataCard` (`PATCH /api/v1/pdfs/:id/metadata`): Enriquecer `title`, `description` y `tags` para el buscador y el Chat.
    - `deletePdf` (`DELETE /api/v1/pdfs/:id`): Eliminar registro en BD y destruir en disco tanto el `.pdf` como el `.text.json.gz`.
  - [ ] `18.3.3` En `folders.movement.service.ts` y `folders.service.ts`: Habilitar movimiento de PDFs entre carpetas de tipo PDF respetando RBAC (`EDIT`) y la eliminación física en disco ante borrado de carpeta o usuario.

- [ ] **18.4 Rutas HTTP y Capability URL Pública (`src/modules/pdfs/pdfs.routes.ts` y `pdfs.schemas.ts`)**
  - [ ] `18.4.1` Endpoints protegidos con `authenticateUserOrApiKey`:
    - `GET /api/v1/pdfs` (`?page=&limit=&folderId=&search=`)
    - `POST /api/v1/pdfs` (`multipart/form-data`, máx. 50MB)
    - `PATCH /api/v1/pdfs/:id` (renombrar)
    - `PUT /api/v1/pdfs/:id` (reemplazo en caliente Hot-Swap)
    - `PATCH /api/v1/pdfs/:id/metadata` (editar Ficha Técnica)
    - `DELETE /api/v1/pdfs/:id`
  - [ ] `18.4.2` Endpoint Público de Entrega `GET /p/:short_code`:
    - Por defecto: sirve el stream binario con `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."`, `Cache-Control: public, max-age=31536000, immutable` y `Content-Security-Policy: sandbox`.
    - Con `?download=true`: fuerza descarga con `Content-Disposition: attachment`.
    - Con `?format=text` (y `?page=N` opcional): transmite en ~2 ms el contenido de `${shortCode}.text.json.gz`.

- [ ] **18.5 Conexión con el Motor de Chat Analítico (`src/modules/chat/chat.engine.ts`)**
  - [ ] `18.5.1` Ampliar el buscador de Fichas Técnicas de `chat.engine.ts` para consultar también registros de `PdfRegistry` accesibles según el contexto (RBAC en `/api/v1/chat/ask` o solo carpetas públicas `isPrivate: false` en `/api/v1/public/chat/ask`).
  - [ ] `18.5.2` Cuando una pregunta coincida con un PDF, descomprimir en memoria su `.text.json.gz`, seleccionar los fragmentos/páginas más relevantes para la consulta y enviarlos al proveedor LLM indicando el número de página (`[Página X]`).
  - [ ] `18.5.3` Incluir en el arreglo `sources` de la respuesta del Chat el tipo de fuente (`type: 'TABLE' | 'PDF'`), `shortCode`, `url` (`/p/:short_code`) y las páginas citadas (`pages: number[]`).

- [ ] **18.6 Documentación Simultánea y Pruebas Automatizadas (Reglas 1, 2 y 3)**
  - [ ] `18.6.1` Crear suites de pruebas en `tests/modules/pdfs/` (`pdfs.parser.test.ts`, `pdfs.service.test.ts`, `pdfs.routes.test.ts`):
    - Subida de PDF válido, generación de `.text.json.gz` y conteo de páginas.
    - Rechazo con `400 MALICIOUS_PAYLOAD` ante PDF con `/JavaScript` inyectado y `415` ante magic bytes falsos.
    - Hot-Swap (`PUT`), renombrado (`PATCH`), entrega en `/p/:short_code` (inline, `?download=true`, `?format=text`) y borrado físico en cascada.
    - Consulta desde el Chat respondiendo con el contenido del PDF y citando la página correspondiente.
  - [ ] `18.6.2` Actualizar `RUTAS.md`, `ENDPOINTS.md`, `docs/frontend-integration.md` y regenerar `openapi.json` con `npm run openapi:export`.
  - [ ] `18.6.3` Verificar `< 300 LOC` en todos los archivos, `npm test` (0 fallos), `npm run build` (código 0) y `npm audit` (0 vulnerabilidades).

---

## 🏛️ Backlog de Alertas de Refactorización y Deuda Técnica (Umbrales de Arquitectura)

> **Regla de Referencia:** [`.agents/rules/modular-refactoring-evolution.md`](.agents/rules/modular-refactoring-evolution.md)  
> **Umbrales:** Etapa 1 (>300 LOC / I/O técnico) · Etapa 2 (>450 LOC / >6 métodos) · Etapa 3 (Clean Arch / Puertos) · Etapa 4 (Workers asíncronos >25-30MB).

### 🟢 Refactorizaciones Modulares Completadas (Etapa 1: Umbral < 300 LOC)
- [x] **Refactorización de `src/modules/folders/folders.service.ts` (341 LOC -> 267 LOC)**:
  - **Resolución:** Métodos `moveImageToFolder` y `moveTableToFolder` extraídos a `src/modules/folders/folders.movement.service.ts` (115 LOC) y delegados desde `folders.service.ts` con 100% de compatibilidad hacia atrás.

### 🟡 Tareas Futuras de Endurecimiento y Seguridad (Post-Lanzamiento)
- [ ] **Endurecimiento Preventivo de CORS para subdominios públicos (*.sslip.io)**:
  - **Causa:** Permitir `*.sslip.io` con `credentials: true` es útil para prototipado rápido en Dokploy, pero en producción un dominio libre podría permitir peticiones cruzadas.
  - **Solución futura:** Restringir `DOKPLOY_SSLIP_REGEX` en `src/gateway/cors.ts` para que opere exclusivamente cuando `process.env.NODE_ENV !== 'production'` o comparar contra el subdominio específico asignado al contenedor.

### 📊 Estado de Módulos (Semáforo Saludable: 0 archivos > 300 LOC en todo el repositorio)
- [x] **`src/modules/tables/tables.service.ts`**: 299 líneas (Blindado: nuevos métodos delegados a `tables.mutation.service.ts` y `tables.bulk.service.ts`).
- [x] **`src/modules/images/images.service.ts`**: 296 líneas (Blindado: nuevos métodos delegados a `images.bulk.service.ts`).
- [x] **`src/modules/users/users.schemas.ts`**: 294 líneas.
- [x] **`src/modules/tables/tables.parser.ts`**: 286 líneas.
- [x] **`src/scripts/smoke-test.ts`**: 272 líneas.
- [x] **`src/modules/folders/folders.service.ts`**: 267 líneas (Reducido desde 341 LOC).
- [x] **`src/modules/chat/chat.engine.ts`**: 263 líneas.
- [x] **`src/modules/folders/folders.schemas.ts`**: 257 líneas.
- [x] **`src/modules/tables/tables.schemas.ts`**: 248 líneas.
- [x] **`src/modules/folders/folders.repository.ts`**: 246 líneas.
- [x] **`src/modules/images/images.schemas.ts`**: 245 líneas.
- [x] **`src/modules/users/users.service.ts`**: 241 líneas.
- [x] **`src/modules/folders/folders.shares.routes.ts`**: 226 líneas.
- [x] **`src/modules/chat/chat.service.ts`**: 219 líneas.
- [x] **`src/modules/users/users.routes.ts`**: 210 líneas.
- [x] **`src/modules/chat/chat.provider.ts`**: 171 líneas.
- [x] **`src/app.ts`**: 169 líneas.
- [x] **`src/modules/tables/tables.metadata.service.ts`**: 154 líneas.
- [x] **`src/modules/images/images.routes.ts`**: 145 líneas.
- [x] **`src/modules/tables/tables.routes.ts`**: 139 líneas.
- [x] **`src/modules/folders/folders.routes.ts`**: 129 líneas.
- [x] **`src/modules/tables/tables.repository.ts`**: 123 líneas.
- [x] **`src/modules/chat/chat.schemas.ts`**: 118 líneas.
- [x] **`src/modules/folders/folders.movement.service.ts`**: 115 líneas.
- [x] **`src/modules/folders/folders.shares.service.ts`**: 107 líneas.
- [x] **`src/modules/users/users.repository.ts`**: 99 líneas.
- [x] **`src/modules/chat/chat.routes.ts`**: 65 líneas.






