# 🧭 Catálogo Maestro de Endpoints y Rutas (API Reference)

> **Monolith Backend API — Especificación OpenAPI 3.1 & Arquitectura de Servicios**  
> Documentación interactiva en vivo: `http://localhost:3000/docs` (Scalar UI)  
> Especificación en crudo: `http://localhost:3000/openapi.json`

---

## 📌 1. Tabla Resumen de Rutas en Orden Lógico

| # | Método | Ruta | Módulo | Autenticación | Rol Mínimo | Descripción |
|---|:---:|---|:---:|:---:|:---:|---|
| **1** | `GET` | `/health` | Gateway | Pública | Anónimo | Chequeo de salud del backend, PostgreSQL y Storage. |
| **2** | `GET` | `/docs` | Docs | Pública | Anónimo | Interfaz interactiva de documentación Scalar. |
| **3** | `GET` | `/openapi.json` | Docs | Pública | Anónimo | Especificación OpenAPI 3.1 en formato JSON crudo. |
| **4** | `POST` | `/api/v1/auth/login` | Auth | Pública | Anónimo | Autenticación de credenciales; emite access y refresh tokens. |
| **5** | `POST` | `/api/v1/auth/refresh` | Auth | Pública / Cookie | Anónimo | Renueva el access token mediante cookie `refreshToken` o body. |
| **6** | `POST` | `/api/v1/auth/logout` | Auth | Bearer JWT | `COLLABORATOR` | Invalida los refresh tokens del usuario y limpia cookies. |
| **7** | `GET` | `/api/v1/auth/me` | Auth | Bearer JWT | `COLLABORATOR` | Retorna los datos de sesión activa del usuario autenticado. |
| **8** | `PATCH` | `/api/v1/auth/password` | Auth | Bearer JWT | `COLLABORATOR` | Permite al usuario cambiar su propia contraseña. |
| **9** | `POST` | `/api/v1/users` | Users | Bearer JWT | `MANAGER` | Registro de nuevos usuarios respetando jerarquía (`ADMIN > MANAGER > COLLABORATOR`). |
| **10** | `GET` | `/api/v1/users` | Users | Bearer JWT | `MANAGER` | Listado de usuarios (`ADMIN` ve todos; `MANAGER` sus colaboradores + `ai_manager`). |
| **11** | `PATCH` | `/api/v1/users/:id/status` | Users | Bearer JWT | `MANAGER` | Activa o suspende una cuenta de usuario (protege cuentas del sistema). |
| **12** | `PATCH` | `/api/v1/users/:id/password` | Users | Bearer JWT | `MANAGER` | Restablecimiento forzado de contraseña por superior jerárquico. |
| **13** | `DELETE` | `/api/v1/users/:id` | Users | Bearer JWT | `MANAGER` | Eliminación de usuario y limpieza en cascada de sus archivos. |
| **14** | `GET` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `COLLABORATOR` | Lista carpetas visibles con conteo y permiso (`?type=&search=&parentId=&page=&limit=`). |
| **15** | `GET` | `/api/v1/folders/tree` | Folders | Dual (JWT / Key) | `COLLABORATOR` | Retorna el árbol jerárquico anidado de todas las carpetas visibles. |
| **16** | `POST` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `COLLABORATOR`* | Crea una carpeta o subcarpeta (`CONTAINER`, `IMAGE`, `TABLE`, `PDF`). |
| **17** | `PATCH` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `MANAGER`* | Actualiza propiedades (nombre, color o privacidad) de la carpeta. |
| **18** | `GET` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `COLLABORATOR`* | Detalle de carpeta (evalúa membresía o privacidad). |
| **19** | `DELETE` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `MANAGER`* | Eliminación en cascada física y lógica de la carpeta y archivos. |
| **20** | `POST` | `/api/v1/folders/:id/shares` | Folders | Dual (JWT / Key) | `MANAGER`* | Comparte carpeta asignando colaborador con permiso `READ` o `EDIT`. |
| **21** | `GET` | `/api/v1/folders/:id/shares` | Folders | Dual (JWT / Key) | `MANAGER`* | Lista colaboradores y niveles de acceso a la carpeta. |
| **22** | `PATCH` | `/api/v1/folders/:id/shares/:userId` | Folders | Dual (JWT / Key) | `MANAGER`* | Modifica nivel de permiso (`READ` <-> `EDIT`) del colaborador. |
| **23** | `DELETE` | `/api/v1/folders/:id/shares/:userId` | Folders | Dual (JWT / Key) | `MANAGER`* | Revoca acceso y expulsa al colaborador de la carpeta. |
| **23** | `GET` | `/api/v1/images` | Images | Dual (JWT / Key) | `COLLABORATOR` | Listado paginado y filtrado de imágenes (`?page=&limit=&folderId=&search=`). |
| **24** | `POST` | `/api/v1/images` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Carga multipart de imagen (requiere permiso `EDIT` si es colaborador). |
| **25** | `PATCH` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Renombra `originalName` validando permiso de edición. |
| **26** | `PUT` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Reemplazo en caliente de binario preservando shortCode y URL pública. |
| **27** | `DELETE` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Destrucción física y lógica de imagen y su miniatura WebP. |
| **28** | `PATCH` | `/api/v1/images/:id/folder` | Folders | Dual (JWT / Key) | `COLLABORATOR`* | Reasigna una imagen a otra carpeta de tipo `IMAGE`. |
| **29** | `POST` | `/api/v1/images/bulk-delete` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Eliminación masiva en lote de imágenes (máx. 50 IDs). |
| **30** | `POST` | `/api/v1/images/bulk-move` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Movimiento masivo en lote de imágenes a otra carpeta de tipo `IMAGE`. |
| **31** | `GET` | `/i/:short_code` | Images | Pública | Anónimo | Entrega pública con capability URL (`?variant=thumb` o `original`). |
| **32** | `GET` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `COLLABORATOR` | Listado de datasets tabulares registrados (`?page=&limit=&folderId=&search=`). |
| **33** | `POST` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Carga multipart de dataset (requiere permiso `EDIT` si es colaborador). |
| **34** | `PATCH` | `/api/v1/tables/:id` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Renombra `tableName` validando permiso de edición. |
| **35** | `PUT` | `/api/v1/tables/:id` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Reemplazo en caliente (Hot-Swap) preservando shortCode, folderId y URL pública. |
| **36** | `DELETE` | `/api/v1/tables/:id` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Destrucción física y lógica del dataset y archivo origen. |
| **37** | `PATCH` | `/api/v1/tables/:id/folder` | Folders | Dual (JWT / Key) | `COLLABORATOR`* | Reasigna un dataset a otra carpeta de tipo `TABLE`. |
| **38** | `POST` | `/api/v1/tables/bulk-delete` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Eliminación masiva en lote de datasets tabulares (máx. 50 IDs). |
| **39** | `POST` | `/api/v1/tables/bulk-move` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Movimiento masivo en lote de tablas a otra carpeta de tipo `TABLE`. |
| **40** | `GET` | `/t/:short_code` | Tables | Pública | Anónimo | Consulta paginada (`?page=&limit=`) o descarga (`?download=true`). |
| **41** | `PATCH` | `/api/v1/tables/:id/metadata` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Actualiza la Ficha Técnica (`metadataCard`) de la tabla. |
| **42** | `POST` | `/api/v1/chat/ask` | Chat | Dual (JWT / Key) | `COLLABORATOR` | Consulta analítica interna con control RBAC sobre tablas permitidas. |
| **43** | `POST` | `/api/v1/public/chat/ask` | Public Chat | Pública (Rate Limit) | Anónimo | Widget público para páginas web externas (restringido a bóveda de `ai_manager`). |
| **44** | `GET` | `/api/v1/public/chat/suggestions` | Public Chat | Pública (Rate Limit) | Anónimo | Sugerencias de preguntas dinámicas basadas en bóveda de `ai_manager`. |
| **45** | `GET` | `/api/v1/audit-logs` | Audit | Dual (JWT / Key) | `MANAGER`* | Consultar historial de auditoría (`ADMIN` global, `MANAGER` carpetas/colaboradores). |
| **46** | `POST` | `/api/v1/api-keys` | ApiKeys | Dual (JWT / Key) | `ADMIN` | Crear una nueva API Key de integración (retorna secreto plano una sola vez). |
| **47** | `GET` | `/api/v1/api-keys` | ApiKeys | Dual (JWT / Key) | `ADMIN` | Listar API Keys autorizadas (oculta secretos criptográficos). |
| **48** | `DELETE` | `/api/v1/api-keys/:id` | ApiKeys | Dual (JWT / Key) | `ADMIN` | Revocar y destruir una API Key inmediatamente. |
| **49** | `GET` | `/api/v1/stats/storage` | Stats | Dual (JWT / Key) | `MANAGER`* | Métricas de cuota, salud de disco físico (`ADMIN`) y desglose de carpetas. |
| **50** | `POST` | `/api/v1/public/forms/:slug/entries` | Forms | Pública (Rate Limit) | Anónimo | Envío público de datos de formulario (Endpoint 1: status NEW). |
| **51** | `POST` | `/api/v1/forms` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Crea formulario customizable y genera tabla abierta vinculada. |
| **52** | `GET` | `/api/v1/forms` | Forms | Dual (JWT / Key) | `COLLABORATOR` | Lista formularios accesibles con conteo de respuestas y tabla. |
| **53** | `GET` | `/api/v1/forms/:id` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Obtiene el detalle de un formulario por ID o slug. |
| **54** | `PATCH` | `/api/v1/forms/entries/:id/resolve` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Resolución inmutable Write-Once (Endpoint 2: sella a VALID o INVALID). |
| **55** | `POST` | `/api/v1/forms/entries/:id/dispatch` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Reenvío bajo demanda de datos sellados hacia el sistema externo de PDFs. |
| **56** | `GET` | `/api/v1/forms/:id/entries` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Lista las entradas de un formulario (`?month=YYYY-MM&status=`). |
| **57** | `GET` | `/api/v1/forms/:id/export` | Forms | Dual (JWT / Key) | `COLLABORATOR`* | Exporta respuestas a Excel (.xlsx) o CSV (.csv) con filtro mensual. |
| **58** | `GET` | `/p/:short_code` | Pdfs | Pública (Capability URL) | Anónimo | Entrega pública inmutable de PDF (`inline`, `?download=true` o texto `?format=text`). |
| **59** | `GET` | `/api/v1/pdfs` | Pdfs | Dual (JWT / Key) | `COLLABORATOR` | Listar catálogo de PDFs con filtros (`folderId`, `search`), paginación y metadataCard. |
| **60** | `POST` | `/api/v1/pdfs` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Subida multipart de PDF, validación de exploits, extracción de texto y doble artefacto. |
| **61** | `PATCH` | `/api/v1/pdfs/:id` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Renombrar nombre original del archivo PDF (`originalName`). |
| **62** | `PUT` | `/api/v1/pdfs/:id` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Reemplazo en Caliente (Hot-Swap) de PDF conservando ID, shortCode y URL pública. |
| **63** | `PATCH` | `/api/v1/pdfs/:id/metadata` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Actualizar ficha técnica (`metadataCard`: category, summary, keywords, custom). |
| **64** | `DELETE` | `/api/v1/pdfs/:id` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Eliminación de PDF en base de datos y borrado físico de sus 2 artefactos en disco. |
| **65** | `PATCH` | `/api/v1/pdfs/:id/folder` | Pdfs | Dual (JWT / Key) | `COLLABORATOR`* | Mover documento PDF a otra carpeta verificando que sea de tipo `PDF`. |
| **66** | `GET` | `/api/v1/notifications` | Notifications | Dual (JWT / Key) | Autenticado | Listado paginado de notificaciones del usuario (`?page=&limit=&unreadOnly=`). |
| **67** | `GET` | `/api/v1/notifications/unread-count` | Notifications | Dual (JWT / Key) | Autenticado | Conteo rápido de notificaciones pendientes (badge de campana). |
| **68** | `PATCH` | `/api/v1/notifications/:id/read` | Notifications | Dual (JWT / Key) | Autenticado | Marcar una notificación individual como leída. |
| **69** | `PATCH` | `/api/v1/notifications/read-all` | Notifications | Dual (JWT / Key) | Autenticado | Marcar todas las notificaciones de la bandeja como leídas. |
| **70** | `DELETE` | `/api/v1/notifications/:id` | Notifications | Dual (JWT / Key) | Autenticado | Eliminar una notificación de la bandeja. |
| **71** | `GET` | `/api/v1/notifications/stream` | Notifications | Dual (JWT / Key) | Autenticado | Conexión Server-Sent Events (SSE) para recepción de alertas en vivo. |
| **72** | `POST` | `/api/v1/forms/:id/subscribe` | Notifications | Dual (JWT / Key) | `COLLABORATOR`* | Suscribirse o actualizar alertas de nuevas respuestas/resoluciones de un formulario. |
| **73** | `DELETE` | `/api/v1/forms/:id/subscribe` | Notifications | Dual (JWT / Key) | `COLLABORATOR`* | Cancelar suscripción a las alertas de un formulario. |
| **74** | `GET` | `/api/v1/forms/:id/subscription` | Notifications | Dual (JWT / Key) | `COLLABORATOR`* | Consultar el estado de suscripción del usuario en un formulario. |

*\*Nota: Los endpoints marcados con `*` verifican propiedad y permisos RBAC: un `COLLABORATOR` requiere membresía explícita con permiso `EDIT` para mutar o subir archivos; un `MANAGER` opera sobre recursos propios o compartidos; un `ADMIN` tiene acceso irrestricto.*

---

## 🔒 2. Mecanismos de Autenticación y Headers

### A. Bearer Token JWT (Usuarios Humanos)
Utilizado principalmente por el frontend (`gestor-multimedia`).
```http
Authorization: Bearer <access_token>
```

### B. Machine-to-Machine API Key (Servicios y Agentes)
Utilizado por integraciones directas, scripts o agentes automatizados. Otorga privilegios operativos de `ADMIN`.
```http
X-API-Key: <api_key_secreta>
```

### C. Manejo de Errores RFC 7807 (Problem Details)
Todas las respuestas de error siguen de manera estricta el estándar `application/problem+json`:
```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "El archivo excede el tamaño máximo permitido de 50MB",
  "code": "BAD_REQUEST",
  "instance": "/api/v1/images",
  "timestamp": "2026-10-31T04:20:00.000Z"
}
```

---

## 📖 3. Detalle Exhaustivo de Endpoints

### 3.1. Gateway, Salud y Documentación

#### `GET /health`
Verifica el estado operativo del servidor y sus dependencias críticas.
- **Autenticación:** Pública.
- **Respuesta 200 OK:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-31T04:20:00.000Z",
    "uptime": 12450.8,
    "services": {
      "database": "up",
      "storage": "up"
    }
  }
  ```
- **Respuesta 503 Service Unavailable:** Si PostgreSQL no responde o storage está inaccesible.

#### `GET /docs`
Renderiza la interfaz de usuario interactiva moderna de **Scalar**.
- **Autenticación:** Pública.
- **Respuesta 200 OK:** `text/html`.

#### `GET /openapi.json` (y `/docs/json`)
Retorna la especificación completa del contrato de API en formato OpenAPI 3.1.
- **Autenticación:** Pública.
- **Respuesta 200 OK:** `application/json`.

---

### 3.2. Módulo de Autenticación (`/api/v1/auth`)

#### `POST /api/v1/auth/login`
Autentica credenciales de usuario. Si es exitoso, emite `accessToken` (15 min) y establece una cookie HTTP-Only segura con el `refreshToken` (7 días).
- **Autenticación:** Pública.
- **Body:**
  ```json
  {
    "username": "usuario_ejemplo",
    "password": "Password123!"
  }
  ```
- **Respuesta 200 OK:**
  - **Headers:** `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "d8e3b7...",
    "user": {
      "id": "11111111-1111-1111-1111-111111111111",
      "username": "usuario_ejemplo",
      "role": "USER"
    }
  }
  ```
- **Errores:** `400 Bad Request` (campos faltantes), `401 Unauthorized` (credenciales inválidas).

#### `POST /api/v1/auth/refresh`
Renueva el par de tokens. Extrae el `refreshToken` automáticamente de la cookie HttpOnly o del cuerpo de la petición.
- **Autenticación:** Pública (requiere token de refresco).
- **Body (Opcional si se envía cookie):**
  ```json
  {
    "refreshToken": "d8e3b7..."
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "f9a2c1..."
  }
  ```
- **Errores:** `401 Unauthorized` (token expirado, revocado o inválido).

#### `POST /api/v1/auth/logout`
Invalida la sesión actual, revoca el refresh token en base de datos incrementando `tokenVersion` y borra la cookie en el navegador.
- **Autenticación:** `Bearer JWT`.
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Sesión cerrada exitosamente"
  }
  ```
- **Errores:** `401 Unauthorized`.

#### `GET /api/v1/auth/me`
Retorna la información de perfil y sesión activa del usuario autenticado.
- **Autenticación:** `Bearer JWT`.
- **Respuesta 200 OK:**
  ```json
  {
    "user": {
      "id": "11111111-2222-4333-8444-555555555555",
      "username": "gestor_principal",
      "role": "MANAGER",
      "isActive": true,
      "createdById": null,
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```
- **Errores:** `401 Unauthorized`.

#### `PATCH /api/v1/auth/password`
Permite a cualquier usuario autenticado actualizar su contraseña tras validar su contraseña actual. Invalida automáticamente las sesiones previas en otros dispositivos incrementando `tokenVersion`.
- **Autenticación:** `Bearer JWT`.
- **Body:**
  ```json
  {
    "currentPassword": "ClaveActual123!",
    "newPassword": "NuevaClaveSuperSegura2026!"
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Contraseña actualizada exitosamente"
  }
  ```
- **Errores:** `400 Bad Request`, `401 Unauthorized` (si la contraseña actual es errónea).

---

### 3.3. Módulo de Usuarios (`/api/v1/users`)

#### `POST /api/v1/users`
Crea una nueva cuenta de usuario respetando la jerarquía estricta de 3 niveles (`peso(creador) > peso(nuevo_usuario)`).
- **Autenticación:** `Bearer JWT` (Rol `ADMIN` o `MANAGER`).
- **Reglas de Jerarquía:**
  - `ADMIN` puede crear `MANAGER` o `COLLABORATOR`. No se pueden crear administradores adicionales.
  - `MANAGER` solo puede crear `COLLABORATOR` (se vincula automáticamente con `createdById = manager.id`).
  - `COLLABORATOR` recibe `403 FORBIDDEN`.
- **Body:**
  ```json
  {
    "username": "nuevo_colaborador",
    "password": "PasswordFuerte2026!",
    "role": "COLLABORATOR"
  }
  ```
- **Respuesta 201 Created:**
  ```json
  {
    "user": {
      "id": "22222222-2222-4222-8222-222222222222",
      "username": "nuevo_colaborador",
      "role": "COLLABORATOR",
      "isActive": true,
      "createdById": "11111111-2222-4333-8444-555555555555",
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```
- **Errores:** `400 Bad Request` (datos inválidos o intento de crear ADMIN), `401 Unauthorized`, `403 Forbidden` (rol insuficiente), `409 Conflict` (username ya existe).

#### `GET /api/v1/users`
Lista usuarios registrados según el rango jerárquico del solicitante.
- **Autenticación:** `Bearer JWT` (Rol `ADMIN` o `MANAGER`).
- **Comportamiento:**
  - `ADMIN` lista todos los usuarios del sistema.
  - `MANAGER` lista únicamente a sus colaboradores vinculados (`createdById === manager.id`).
- **Respuesta 200 OK:**
  ```json
  {
    "users": [
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "username": "nuevo_colaborador",
        "role": "COLLABORATOR",
        "isActive": true,
        "createdById": "11111111-2222-4333-8444-555555555555",
        "createdAt": "2026-10-31T04:20:00.000Z"
      }
    ]
  }
  ```
- **Errores:** `401 Unauthorized`, `403 Forbidden`.

#### `PATCH /api/v1/users/:id/status`
Activa o suspende (`isActive: false`) una cuenta de usuario. Si se suspende, se invalida de inmediato su `tokenVersion` en PostgreSQL cerrando sus sesiones activas.
- **Autenticación:** `Bearer JWT` (`ADMIN` o `MANAGER` sobre sus colaboradores). Prohibido auto-suspenderse.
- **Body:** `{ "isActive": false }`.
- **Respuesta 200 OK:** `{ "user": { ... } }`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `PATCH /api/v1/users/:id/password`
Restablece forzosamente la contraseña de un usuario por su superior jerárquico. Invalida todas las sesiones previas del usuario afectado.
- **Autenticación:** `Bearer JWT` (`ADMIN` o `MANAGER` sobre sus colaboradores).
- **Body:** `{ "newPassword": "NuevaClaveTemporal123!" }`.
- **Respuesta 200 OK:** `{ "message": "Contraseña restablecida exitosamente" }`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `DELETE /api/v1/users/:id`
Elimina definitivamente un usuario y destruye en cascada sus archivos en disco (`./storage`).
- **Autenticación:** `Bearer JWT` (`ADMIN` o `MANAGER` sobre sus colaboradores). Prohibido eliminar al `ADMIN` o auto-eliminarse.
- **Respuesta 200 OK:** `{ "deleted": true }`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### 3.4. Módulo de Carpetas (`/api/v1/folders`)

#### `GET /api/v1/folders`
Lista las carpetas según las reglas de visibilidad (usuarios ven carpetas públicas y sus privadas; `ADMIN` ve todas). Soporta filtrado por tipo, búsqueda por texto, filtro por carpeta padre y paginación SQL opcional.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Query Params:**
  - `type` (Opcional): `CONTAINER`, `IMAGE`, `TABLE` o `PDF`.
  - `parentId` (Opcional): UUID de la carpeta contenedora / superior.
  - `search` (Opcional): Búsqueda por nombre de carpeta (insensible a mayúsculas).
  - `page` (Opcional): Número de página (ej. `1`).
  - `limit` (Opcional): Cantidad por página (ej. `20`).
- **Respuesta 200 OK (con paginación):**
  ```json
  {
    "folders": [
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "name": "General",
        "type": "IMAGE",
        "color": "#64748b",
        "isPrivate": false,
        "isSystem": false,
        "parentId": null,
        "itemCount": 42,
        "userId": "11111111-1111-1111-1111-111111111111",
        "owner": {
          "id": "11111111-1111-1111-1111-111111111111",
          "username": "admin"
        },
        "myPermission": "EDIT",
        "createdAt": "2026-10-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
  ```
- **Nota Retrocompatible:** Si no se envían `page` ni `limit`, devuelve `{ folders: [...], total: N }` completo.

#### `GET /api/v1/folders/tree`
Retorna el árbol jerárquico anidado de todas las carpetas a las que el usuario tiene acceso (Nivel 1 -> Nivel 2 -> Nivel 3).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Respuesta 200 OK:**
  ```json
  {
    "tree": [
      {
        "id": "c1111111-1111-4111-8111-111111111111",
        "name": "juan",
        "type": "CONTAINER",
        "parentId": null,
        "isSystem": false,
        "children": [
          {
            "id": "d2222222-2222-4222-8222-222222222222",
            "name": "marketing",
            "type": "IMAGE",
            "parentId": "c1111111-1111-4111-8111-111111111111",
            "children": []
          }
        ]
      },
      {
        "id": "f4444444-4444-4444-8444-444444444444",
        "name": "shared",
        "type": "CONTAINER",
        "parentId": null,
        "isSystem": true,
        "children": []
      }
    ],
    "total": 3
  }
  ```

#### `POST /api/v1/folders`
Crea una nueva carpeta o subcarpeta dentro de la jerarquía. 
- `MANAGER` y `ADMIN` pueden crear carpetas contenedoras raíz (`parentId: null`).
- `COLLABORATOR` no puede crear carpetas raíz (`403 FORBIDDEN`), solo subcarpetas especificando un `parentId` válido sobre el que posea permiso `EDIT`.
- **Regla de profundidad:** Máximo 3 niveles (Raíz Manager N1 -> Subcarpeta N2 -> Subcarpeta N3). Nivel 4 arroja `400 MAX_FOLDER_DEPTH_EXCEEDED`.
- **Regla de tipos:** Subcarpetas bajo un padre tipado (`IMAGE`, `TABLE`, `PDF`) deben mantener el mismo tipo (`parent.type === child.type`).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Body:**
  ```json
  {
    "name": "Campañas 2026",
    "type": "IMAGE",
    "parentId": "c1111111-1111-4111-8111-111111111111",
    "color": "#3b82f6",
    "isPrivate": false
  }
  ```
    "name": "Reportes Mensuales",
    "type": "TABLE",
    "color": "#10b981",
    "isPrivate": true
  }
  ```
- **Respuesta 201 Created:**
  ```json
  {
    "folder": {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "Reportes Mensuales",
      "type": "TABLE",
      "color": "#10b981",
      "isPrivate": true,
      "itemCount": 0,
      "userId": "11111111-1111-1111-1111-111111111111",
      "myPermission": "EDIT",
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```

#### `PATCH /api/v1/folders/:id`
Actualiza parcialmente las propiedades de una carpeta (renombrar, cambiar color identificador o alternar visibilidad privada).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la carpeta).
- **Permisos:** Exclusivo del propietario de la carpeta o `ADMIN` (`403 FORBIDDEN` a colaboradores o terceros).
- **Restricción:** No se permite cambiar el nombre de la carpeta default `General`.
- **Body:**
  ```json
  {
    "name": "Reportes Fiscales 2026",
    "color": "#3b82f6",
    "isPrivate": false
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "folder": {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "Reportes Fiscales 2026",
      "type": "TABLE",
      "color": "#3b82f6",
      "isPrivate": false,
      "itemCount": 15,
      "userId": "11111111-1111-1111-1111-111111111111",
      "myPermission": "EDIT",
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```
- **Errores:** `400 Bad Request` (body vacío, color inválido o intento de renombrar carpeta General), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `GET /api/v1/folders/:id`
Obtiene los detalles de una carpeta.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la carpeta).
- **Respuesta 200 OK:** Objeto `{ folder: { ... } }`.
- **Errores:** `401 Unauthorized`, `403 Forbidden` (carpeta privada ajena), `404 Not Found`.

#### `DELETE /api/v1/folders/:id`
Elimina la carpeta y destruye en cascada todos los archivos físicos y registros asociados. No se permite eliminar la carpeta default `General`.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la carpeta).
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Carpeta y archivos asociados eliminados exitosamente",
    "deletedCount": 5
  }
  ```
- **Errores:** `400 Bad Request` (intento de borrar carpeta General del sistema), `403 Forbidden`, `404 Not Found`.

#### `POST /api/v1/folders/:id/shares`
Comparte una carpeta asignando acceso a un colaborador con permiso `READ` o `EDIT`. Exclusivo del `MANAGER` propietario de la carpeta o `ADMIN`.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la carpeta).
- **Body:**
  ```json
  {
    "userId": "22222222-2222-4222-8222-222222222222",
    "permission": "EDIT"
  }
  ```
- **Respuesta 201 Created:**
  ```json
  {
    "share": {
      "id": "share-uuid",
      "folderId": "44444444-4444-4444-4444-444444444444",
      "userId": "22222222-2222-4222-8222-222222222222",
      "permission": "EDIT",
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `GET /api/v1/folders/:id/shares`
Lista los miembros o colaboradores que tienen acceso a la carpeta y su nivel de permiso.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la carpeta).
- **Respuesta 200 OK:**
  ```json
  {
    "shares": [
      {
        "id": "share-uuid",
        "folderId": "44444444-4444-4444-4444-444444444444",
        "userId": "22222222-2222-4222-8222-222222222222",
        "permission": "EDIT",
        "createdAt": "2026-10-31T04:20:00.000Z",
        "user": {
          "id": "22222222-2222-4222-8222-222222222222",
          "username": "nuevo_colaborador",
          "role": "COLLABORATOR"
        }
      }
    ]
  }
  ```
- **Errores:** `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `PATCH /api/v1/folders/:id/shares/:userId`
Actualiza el nivel de permiso (`READ` o `EDIT`) otorgado a un colaborador en la carpeta.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Body:** `{ "permission": "READ" }`.
- **Respuesta 200 OK:** `{ "share": { ... } }`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `DELETE /api/v1/folders/:id/shares/:userId`
Revoca el acceso del colaborador a la carpeta compartida (expulsión de membresía).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Respuesta 200 OK:** `{ "revoked": true }`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `PATCH /api/v1/images/:id/folder`
Mueve una imagen a otra carpeta existente de tipo `IMAGE`.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Body:**
  ```json
  {
    "folderId": "33333333-3333-3333-3333-333333333333"
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "image": {
      "id": "55555555-5555-5555-5555-555555555555",
      "shortCode": "img1234567",
      "folderId": "33333333-3333-3333-3333-333333333333",
      "originalName": "foto.png",
      "mimeType": "image/png",
      "sizeBytes": 204800
    }
  }
  ```
- **Errores:** `400 Bad Request` (carpeta incompatible o no de tipo IMAGE), `403 Forbidden`, `404 Not Found`.

#### `PATCH /api/v1/tables/:id/folder`
Mueve un dataset tabular a otra carpeta existente de tipo `TABLE`.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Body:**
  ```json
  {
    "folderId": "44444444-4444-4444-4444-444444444444"
  }
  ```
- **Respuesta 200 OK:** Objeto `{ table: { ... } }`.
- **Errores:** `400 Bad Request` (carpeta incompatible o no de tipo TABLE), `403 Forbidden`, `404 Not Found`.

---

### 3.5. Módulo de Imágenes (`/api/v1/images` e `/i/:short_code`)

#### `GET /api/v1/images`
Lista imágenes registradas en el sistema accesibles para el solicitante, con soporte de paginación y filtrado por carpeta.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Query Parameters:**
  - `page` (opcional, entero, defecto 1): Número de página.
  - `limit` (opcional, entero, defecto 50, máx 100): Cantidad por página.
  - `folderId` (opcional, string UUID): Filtra imágenes contenidas en una carpeta específica.
- **Respuesta 200 OK:**
  ```json
  {
    "images": [
      {
        "id": "55555555-5555-5555-5555-555555555555",
        "shortCode": "img1234567",
        "url": "http://localhost:3000/i/img1234567",
        "urlWithVersion": "http://localhost:3000/i/img1234567?v=1730347200000",
        "originalName": "banner.jpg",
        "mimeType": "image/jpeg",
        "sizeBytes": 524288,
        "width": 1920,
        "height": 1080,
        "folderId": "33333333-3333-3333-3333-333333333333",
        "createdAt": "2026-10-31T04:20:00.000Z",
        "updatedAt": "2026-10-31T04:20:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1,
    "meta": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
  ```

#### `POST /api/v1/images`
Sube y procesa una imagen mediante `multipart/form-data`. Valida magic bytes (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`), extrae dimensiones (`width`, `height`) y autogenera miniaturas WebP (`320px`). En archivos `.svg`, ejecuta validación anti-XSS estricta bloqueando tags `<script>` y handlers de eventos.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Content-Type:** `multipart/form-data`
- **Campos del Formulario:**
  - `file`: Archivo binario (Obligatorio, máx. 50MB).
  - `folderId`: UUID de la carpeta destino (Opcional; si se omite, se asigna a la carpeta predeterminada del usuario).
- **Respuesta 201 Created:**
  ```json
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "shortCode": "img1234567",
    "url": "http://localhost:3000/i/img1234567",
    "urlWithVersion": "http://localhost:3000/i/img1234567?v=1730347200000",
    "originalName": "banner.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 524288,
    "width": 1920,
    "height": 1080,
    "folderId": "33333333-3333-3333-3333-333333333333",
    "createdAt": "2026-10-31T04:20:00.000Z",
    "updatedAt": "2026-10-31T04:20:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request` (archivo corrupto o SVG malicioso), `413 Payload Too Large` (> 50MB), `415 Unsupported Media Type`.

#### `PATCH /api/v1/images/:id`
Renombra el nombre original (`originalName`) de una imagen sin alterar el archivo físico, su `shortCode` ni su URL pública.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Control de Acceso Anti-IDOR:** Solo el propietario de la carpeta o un `ADMIN` pueden renombrar la imagen.
- **Body JSON:**
  ```json
  {
    "originalName": "nuevo-logo-oficial.png"
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "shortCode": "img1234567",
    "url": "http://localhost:3000/i/img1234567",
    "urlWithVersion": "http://localhost:3000/i/img1234567?v=1730347250000",
    "originalName": "nuevo-logo-oficial.png",
    "mimeType": "image/png",
    "sizeBytes": 524288,
    "width": 1920,
    "height": 1080,
    "folderId": "33333333-3333-3333-3333-333333333333",
    "createdAt": "2026-10-31T04:20:00.000Z",
    "updatedAt": "2026-10-31T04:25:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request` (nombre vacío o >255 caracteres), `403 Forbidden` (no propietario), `404 Not Found`.

#### `PUT /api/v1/images/:id`
**Reemplazo en caliente de imagen (Hot-Swap)**: Sustituye físicamente el binario en disco por uno nuevo (JPEG, PNG, WebP, SVG) preservando el **mismo** `id`, `shortCode` y URL pública. Regenera automáticamente la miniatura WebP asociada y actualiza metadatos (`sizeBytes`, `mimeType`, `width`, `height`, `updatedAt`).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Control de Acceso Anti-IDOR:** Solo el propietario de la carpeta o un `ADMIN` pueden reemplazar la imagen.
- **Content-Type:** `multipart/form-data`
- **Campos del Formulario:**
  - `file`: Archivo binario de reemplazo (Obligatorio, máx. 50MB).
- **Respuesta 200 OK:**
  ```json
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "shortCode": "img1234567",
    "url": "http://localhost:3000/i/img1234567",
    "urlWithVersion": "http://localhost:3000/i/img1234567?v=1730347300000",
    "originalName": "nuevo-banner.webp",
    "mimeType": "image/webp",
    "sizeBytes": 104850,
    "width": 1920,
    "height": 1080,
    "folderId": "33333333-3333-3333-3333-333333333333",
    "createdAt": "2026-10-31T04:20:00.000Z",
    "updatedAt": "2026-10-31T04:30:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request`, `403 Forbidden` (no propietario), `404 Not Found`, `413 Payload Too Large`, `415 Unsupported Media Type`.

#### `DELETE /api/v1/images/:id`
Elimina físicamente el archivo original del disco, su miniatura generada y su registro en la base de datos.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Control de Acceso Anti-IDOR:** Solo el propietario de la carpeta o un `ADMIN` pueden eliminar la imagen.
- **Parámetros URL:** `id` (UUID de la imagen).
- **Respuesta 204 No Content:** Eliminación exitosa sin cuerpo.
- **Errores:** `400 Bad Request` (UUID inválido), `403 Forbidden`, `404 Not Found`.

#### `GET /i/:short_code` (Pública por Diseño)
Entrega binaria de la imagen mediante capability URL opaca no enumerable. Apta para `<img src="...">`. Admite variantes y cache-busting.
- **Autenticación:** Ninguna (Pública).
- **Query Parameters:**
  - `variant` (opcional): `'thumb'` (sirve miniatura WebP optimizada de 320px) u `'original'` (por defecto).
  - `v` (opcional): Timestamp de versión para invalidación instantánea de caché en CDNs o navegadores tras un reemplazo en caliente.
- **Headers de Respuesta:**
  - `Content-Type: image/jpeg` (o `image/webp` para miniaturas, o el MIME correspondiente).
  - `Cache-Control: public, max-age=31536000, immutable`.
  - `Content-Security-Policy: default-src 'none'` (si se sirve un archivo SVG, aislando scripts).
- **Errores:** `404 Not Found` (código inexistente o archivo físico ausente).

---

### 3.6. Módulo de Tablas y Datasets (`/api/v1/tables` y `/t/:short_code`)

#### `GET /api/v1/tables`
Lista los datasets tabulares registrados en el sistema con paginación y filtrado SQL a nivel de base de datos.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Query Params:**
  - `page` (Opcional): Número de página (Default: `1`).
  - `limit` (Opcional): Datasets por página (Default: `50`, máx. `100`).
  - `folderId` (Opcional): UUID de la carpeta contenedora para filtrado directo.
- **Respuesta 200 OK:**
  ```json
  {
    "tables": [
      {
        "id": "66666666-6666-6666-6666-666666666666",
        "shortCode": "tab1234567",
        "tableName": "ventas_octubre.csv",
        "columns": ["id", "producto", "monto", "fecha"],
        "rowCount": 1500,
        "sizeBytes": 1048576,
        "folderId": "44444444-4444-4444-4444-444444444444",
        "url": "http://localhost:3000/t/tab1234567",
        "urlWithVersion": "http://localhost:3000/t/tab1234567?v=1740000000000",
        "createdAt": "2026-10-31T04:20:00.000Z",
        "updatedAt": "2026-10-31T04:20:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1,
    "meta": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
  ```

#### `POST /api/v1/tables`
Sube y procesa un dataset tabular estructurado (`.csv` o `.xlsx`). Aplica el **Patrón de Doble Artefacto**: almacena el archivo fuente intacto para descargas y genera un artefacto pre-calculado `.data.json.gz` con colores, encabezados y celdas combinadas para consultas instantáneas.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Content-Type:** `multipart/form-data`
- **Campos del Formulario:**
  - `file`: Archivo CSV o Excel (Obligatorio, máx. 100MB).
  - `folderId`: UUID de la carpeta destino (Opcional; si se omite, se asigna a `General`).
- **Respuesta 201 Created:**
  ```json
  {
    "id": "66666666-6666-6666-6666-666666666666",
    "shortCode": "tab1234567",
    "tableName": "ventas_octubre.csv",
    "rowCount": 1500,
    "columns": ["id", "producto", "monto", "fecha"],
    "sizeBytes": 1048576,
    "folderId": "44444444-4444-4444-4444-444444444444",
    "url": "http://localhost:3000/t/tab1234567",
    "urlWithVersion": "http://localhost:3000/t/tab1234567?v=1740000000000",
    "createdAt": "2026-10-31T04:20:00.000Z",
    "updatedAt": "2026-10-31T04:20:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request` (archivo corrupto), `413 Payload Too Large` (> 100MB), `415 Unsupported Media Type`.

#### `DELETE /api/v1/tables/:id`
Elimina física y lógicamente el dataset. Destruye en disco tanto el archivo original como el artefacto comprimido `.data.json.gz`.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Control de Acceso Anti-IDOR:** Solo el propietario de la carpeta contenedora o un `ADMIN` pueden eliminar la tabla.
- **Parámetros URL:** `id` (UUID de la tabla).
- **Respuesta 204 No Content:** Eliminación exitosa sin cuerpo.
- **Errores:** `400 Bad Request` (UUID inválido), `401 Unauthorized`, `403 Forbidden` (no propietario ni ADMIN), `404 Not Found`.

#### `GET /t/:short_code` (Pública por Diseño)
Entrega de datos tabulares enriquecidos o descarga binaria del archivo original del dataset.
- **Autenticación:** Ninguna (Pública).
- **Parámetros URL:** `short_code` (Código Base58 opaco de 10 caracteres).
- **Query Params:**
  - `page`: Número de página (Default: `1`).
  - `limit`: Filas por página (Default: `100`, máx. `500`).
  - `download`: Si es `'true'`, responde con stream binario para descarga del archivo original (`.xlsx` o `.csv`) con cabecera `Content-Disposition`.
  - `raw`: Si es `'true'` o si se envía con `Accept-Encoding: gzip` sin paginación, sirve directamente el stream precalculado ultra-rápido (2 ms) con cabecera `Content-Encoding: gzip`.
- **Respuesta 200 OK (Modo JSON Enriquecido):**
  ```json
  {
    "id": "66666666-6666-6666-6666-666666666666",
    "shortCode": "tab1234567",
    "tableName": "ventas_octubre.xlsx",
    "columns": ["id", "producto", "monto", "fecha"],
    "headers": [["id", "producto", "monto", "fecha"]],
    "merges": ["A1:B1"],
    "cellStyles": {
      "0": {
        "monto": { "bg": "#10b981", "bold": true, "align": "right" }
      }
    },
    "data": [
      { "id": 1, "producto": "Laptop Pro", "monto": 1200.50, "fecha": "2026-10-15" }
    ],
    "meta": {
      "page": 1,
      "limit": 100,
      "total": 1500,
      "totalPages": 15,
      "hasNext": true
    }
  }
  ```
- **Errores:** `404 Not Found`.

#### `PATCH /api/v1/tables/:id/metadata`
Actualiza y enriquece la Ficha Técnica (`metadataCard`) de un dataset.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Control de Acceso Anti-IDOR:** Requiere rol `ADMIN`, propietario de la carpeta (`MANAGER`), o colaborador con permiso `EDIT` sobre la carpeta contenedora.
- **Parámetros URL:** `id` (UUID de la tabla).
- **Cuerpo JSON:**
  ```json
  {
    "title": "Censo Sudamérica 2024",
    "description": "Estadísticas demográficas oficiales de países de América del Sur",
    "tags": ["demografia", "censo", "latam"],
    "unit": "habitantes",
    "columnsMeta": {
      "Hombres": "Población masculina censada",
      "Mujeres": "Población femenina censada",
      "Total": "Total de población"
    },
    "hasSummaryRows": true
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "id": "66666666-6666-6666-6666-666666666666",
    "shortCode": "tab1234567",
    "metadataCard": {
      "title": "Censo Sudamérica 2024",
      "description": "Estadísticas demográficas oficiales de países de América del Sur",
      "tags": ["demografia", "censo", "latam"],
      "unit": "habitantes",
      "entities": ["Brasil", "Argentina", "Chile", "Colombia"],
      "columnsMeta": {
        "Hombres": "Población masculina censada",
        "Mujeres": "Población femenina censada",
        "Total": "Total de población"
      },
      "hasSummaryRows": true
    }
  }
  ```
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

---

### Módulo de Chat Analítico y RAG Tabular (`/api/v1/chat` y `/api/v1/public/chat`)

#### `POST /api/v1/chat/ask`
Consulta analítica privada sobre tablas registradas con evaluación estricta de permisos jerárquicos RBAC.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Visibilidad:** `ADMIN` consulta todas las tablas; `MANAGER` tablas propias, públicas y compartidas; `COLLABORATOR` únicamente carpetas compartidas.
- **Cuerpo JSON:**
  ```json
  {
    "question": "¿Cuántos hombres y mujeres hay en Brasil y qué porcentaje representan?",
    "folderId": "uuid-opcional",
    "shortCode": "short-opcional"
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "answer": "En Brasil se registran 104.000.000 de hombres (48,82%) y 109.000.000 de mujeres (51,18%), para un total censado de 213.000.000 habitantes.",
    "foundInSystem": true,
    "sources": [
      {
        "tableId": "66666666-6666-6666-6666-666666666666",
        "tableName": "censo_latam.csv",
        "shortCode": "tab1234567",
        "title": "Censo Sudamérica 2024"
      }
    ],
    "chartData": {
      "labels": ["Hombres", "Mujeres"],
      "values": [104000000, 109000000],
      "percentages": [48.82, 51.18]
    }
  }
  ```
- **Cortocircuito Anti-Alucinaciones:** Si los datos no existen en el sistema, responde en 2 ms con:
  ```json
  {
    "answer": "La información solicitada no existe en los archivos registrados en este sistema.",
    "foundInSystem": false,
    "sources": [],
    "chartData": null
  }
  ```
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`.

#### `POST /api/v1/public/chat/ask` (Pública por Diseño / Widget Web)
Endpoint sin autenticación con Rate Limiting estricto (30 req/min por IP) para widgets embebidos en páginas web externas. Restringido EXCLUSIVAMENTE a tablas dentro de carpetas públicas (`folder.isPrivate === false`).
- **Autenticación:** Ninguna (Pública).
- **Cuerpo JSON:**
  ```json
  {
    "question": "¿Cuál es la tasa de aprobación escolar en 2024?",
    "folderId": "uuid-opcional",
    "shortCode": "short-opcional"
  }
  ```
- **Respuesta 200 OK:** Misma estructura `ChatAnswer` que `/api/v1/chat/ask`.
- **Errores:** `400 Bad Request`, `429 Too Many Requests`.

#### `GET /api/v1/public/chat/suggestions` (Pública por Diseño)
Sugerencias dinámicas de preguntas basadas en las Fichas Técnicas de las tablas públicas disponibles.
- **Autenticación:** Ninguna (Pública con Rate Limiting: 30 req/min por IP).
- **Query Params:** `folderId` (UUID opcional para limitar sugerencias a una carpeta).
- **Respuesta 200 OK:**
  ```json
  {
    "suggestions": [
      "¿Cuál es el valor de Hombres para Brasil en Censo Sudamérica 2024?",
      "¿Qué información hay sobre Argentina en Censo Sudamérica 2024?"
    ]
  }
  ```
- **Errores:** `429 Too Many Requests`.

---

### 3.8. Módulo de Formularios Customizables, Tablas Abiertas y Resolución Única (Write-Once)

#### `POST /api/v1/public/forms/:slug/entries` (Pública con Rate Limiting - Endpoint 1)
Envío público de formularios web. Guarda `entryPayload` en estado `"NEW"`, dejando vacías las columnas de respuesta exclusiva en la base de datos y en la tabla abierta vinculada `.data.json.gz`.
- **Autenticación:** Ninguna (Pública, 60 req/min por IP).
- **Parámetros URL:** `slug` (identificador único del formulario).
- **Cuerpo JSON:** Diccionario dinámico acorde al `entryFieldsSchema`.
- **Respuesta 201 Created:**
  ```json
  {
    "id": "uuid-de-la-entrada",
    "status": "NEW",
    "createdAt": "2026-03-01T14:00:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request` (campos requeridos faltantes o tipo inválido), `404 Not Found`, `429 Too Many Requests`.

#### `POST /api/v1/forms` (Protegida)
Crea una definición de formulario y genera automáticamente un `TableRegistry` vinculado (`.data.json.gz`) que sincroniza en tiempo real las respuestas entrantes y las resoluciones.
- **Autenticación:** Bearer JWT o X-API-Key (`COLLABORATOR` con `EDIT` en `folderId`, `MANAGER` o `ADMIN`).
- **Cuerpo JSON:**
  ```json
  {
    "slug": "consulta-ciudadana",
    "title": "Formulario de Consulta Ciudadana",
    "folderId": "uuid-de-carpeta-tipo-table",
    "entryFieldsSchema": [
      { "name": "nombre", "type": "string", "required": true, "label": "Nombre Completo" },
      { "name": "correo", "type": "string", "required": true, "label": "Correo Electrónico" },
      { "name": "mensaje", "type": "string", "required": true, "label": "Mensaje o Solicitud" }
    ],
    "resolutionFieldsSchema": [
      { "name": "dictamen", "type": "string", "required": true, "label": "Dictamen Oficial" },
      { "name": "codigoOficio", "type": "string", "required": true, "label": "Nro. de Oficio" }
    ],
    "allowedResolutionStates": ["VALID", "INVALID"],
    "externalTargetUrl": "https://servicio-externo.gob/api/v1/generar-documento"
  }
  ```
- **Respuesta 201 Created:** Formulario creado con su `linkedTableId`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (slug duplicado).

#### `GET /api/v1/forms` y `GET /api/v1/forms/:id` (Protegida)
Consulta el catálogo de formularios accesibles con sus esquemas, tabla abierta asociada y conteo de respuestas.

#### `PATCH /api/v1/forms/entries/:id/resolve` (Protegida - Endpoint 2: Regla Write-Once)
Completa los campos de `resolutionFieldsSchema` y transiciona el estado de `"NEW"` a `"VALID"` o `"INVALID"`.
- **Inmutabilidad Absoluta (Write-Once):** Solo puede ejecutarse **UNA SOLA VEZ por fila**. Cualquier intento posterior de volver a resolver una fila ya sellada se rechaza con `409 CONFLICT` (`ENTRY_ALREADY_RESOLVED`).
- **Despacho Externo:** Si el formulario tiene `externalTargetUrl`, reenvía automáticamente el JSON unificado de la fila al sistema externo sin generar PDFs localmente.
- **Respuesta 200 OK:** Registro actualizado con `status`, `resolvedAt` y `resolvedById`.
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`.

#### `POST /api/v1/forms/entries/:id/dispatch` (Protegida)
Reenvío bajo demanda de los datos sellados de una fila ya resuelta hacia `externalTargetUrl` tantas veces como se requiera en el futuro, con **0 archivos PDF guardados en disco** y sin modificar la base de datos.
- **Respuesta 200 OK:** `{ "dispatched": true, "targetUrl": "...", "entryId": "...", "dispatchedAt": "..." }`.

#### `GET /api/v1/forms/:id/entries` y `GET /api/v1/forms/:id/export` (Protegida)
- `GET /api/v1/forms/:id/entries?month=YYYY-MM&status=VALID`: Consulta paginada filtrada.
- `GET /api/v1/forms/:id/export?month=YYYY-MM&status=&format=xlsx|csv`: Descarga consolidada de respuestas del mes en formato Excel o CSV.

---

### 3.9 Módulo de Archivos PDF, Patrón de Doble Artefacto y Capability URL Pública (`/p/:short_code`)

El módulo de PDFs gestiona almacenamiento de documentos de hasta 50MB, escaneo activo de seguridad contra payloads maliciosos (`/JavaScript`, `/JS`, `/Launch`, `/SubmitForm`, `/ImportData`), extracción automática de texto estructurado por página (`unpdf`), y el patrón de **Doble Artefacto** (`${shortCode}.pdf` y `${shortCode}.text.json.gz`). Además, alimenta directamente el motor de Chat RAG con respuestas citadas por página (`pages: [1, 2]`).

#### `GET /p/:short_code` (Pública - Capability URL Opaque Base58)
Entrega inmutable del documento PDF con cabecera `Cache-Control: public, max-age=31536000, immutable` y `Content-Security-Policy: sandbox`.
- **Query Params opcionales:**
  - `download=true`: Fuerza descarga con `Content-Disposition: attachment`.
  - `format=text`: En lugar del binario, entrega el JSON de texto comprimido (`.text.json.gz`) descomprimido al vuelo (~2ms).
  - `page=N`: Con `format=text`, filtra y entrega únicamente la página especificada.
- **Respuesta 200 OK:** Stream binario `application/pdf` o JSON `application/json`.
- **Errores:** `404 Not Found`.

#### `POST /api/v1/pdfs` (Protegida - Subida Multipart)
Carga un documento PDF en memoria, valida magic bytes `%PDF-` y escanea el búfer contra scripts o exploits maliciosos. Extrae texto por páginas, detecta si es escaneado (`isScanned: true` si < 20 caracteres), genera su `metadataCard` y persiste los 2 artefactos en disco.
- **Form-Data:** `file` (Buffer PDF), opcional `folderId` (UUID de carpeta tipo `PDF`).
- **Respuesta 201 Created:** Registro completo `PdfRegistry` con su shortCode y metadatos.
- **Errores:** `400 Bad Request` (payload malicioso / no es PDF), `413 Payload Too Large` (> 50MB).

#### `GET /api/v1/pdfs` (Protegida - Catálogo de Documentos)
Consulta paginada de PDFs con soporte para búsqueda textual en nombre y metadatos (`?search=`), filtrado por carpeta (`?folderId=`) y paginación (`?page=1&limit=50`).
- **Respuesta 200 OK:** `{ "data": [...], "meta": { "total": N, "page": 1, "limit": 50, "totalPages": N } }`.

#### `PATCH /api/v1/pdfs/:id` (Protegida - Renombrar)
Modifica el campo `originalName` del documento PDF sin alterar sus artefactos en disco ni su `shortCode`.
- **Cuerpo JSON:** `{ "originalName": "nuevo-nombre.pdf" }`.

#### `PUT /api/v1/pdfs/:id` (Protegida - Reemplazo en Caliente / Hot-Swap)
Permite sustituir el archivo físico del PDF por una versión corregida o actualizada preservando exactamente el mismo `id`, `shortCode` y URL pública `/p/:short_code`. Actualiza `sizeBytes`, `pageCount`, re-extrae el texto y actualiza el artefacto `.text.json.gz`.
- **Form-Data:** `file` (Buffer PDF).
- **Respuesta 200 OK:** Registro actualizado.

#### `PATCH /api/v1/pdfs/:id/metadata` (Protegida - Ficha Técnica)
Permite al usuario enriquecer o sobreescribir la ficha técnica (`metadataCard`) del PDF con categoría, resumen, palabras clave o atributos personalizados.
- **Cuerpo JSON:**
  ```json
  {
    "category": "Contratos",
    "summary": "Acuerdo de confidencialidad y servicios 2026",
    "keywords": ["acuerdo", "legal", "firmado"],
    "custom": { "version": "1.2", "firmado": true }
  }
  ```
- **Respuesta 200 OK:** Registro actualizado.

#### `DELETE /api/v1/pdfs/:id` (Protegida - Eliminación Física Completa)
Elimina el registro en PostgreSQL / Prisma y borra físicamente de `./storage/pdfs/` tanto el archivo `${shortCode}.pdf` como el artefacto `${shortCode}.text.json.gz`.
- **Respuesta 200 OK:** `{ "success": true, "deletedId": "...", "freedBytes": N }`.

#### `PATCH /api/v1/pdfs/:id/folder` (Protegida - Mover PDF)
Mueve el PDF a otra carpeta del sistema, validando estrictamente que la carpeta destino sea de tipo `FolderType.PDF`.
- **Cuerpo JSON:** `{ "targetFolderId": "uuid-carpeta-pdf" }`.
- **Respuesta 200 OK:** Registro actualizado.

---

### 3.10 Módulo de Notificaciones en Vivo, Eventos Desacoplados y Suscripciones (SSE)

El módulo de notificaciones opera mediante un bus de eventos en memoria (`AppEventBus`), desacoplando por completo los formularios y mutaciones de tablas del sistema de alertas.

#### `GET /api/v1/notifications` (Protegida)
Consulta la bandeja de notificaciones del usuario autenticado de forma paginada (`?page=1&limit=20`), con soporte para filtro de solo alertas no leídas (`?unreadOnly=true`).
- **Respuesta 200 OK:** `{ "data": [...], "meta": { "total": N, "page": 1, "limit": 20, "totalPages": N } }`.

#### `GET /api/v1/notifications/unread-count` (Protegida)
Retorna rápidamente la cantidad de alertas no leídas del usuario para alimentar el badge numérico de la campana en el frontend.
- **Respuesta 200 OK:** `{ "unreadCount": 3 }`.

#### `PATCH /api/v1/notifications/:id/read` (Protegida)
Marca una notificación específica del usuario como leída (`read: true`).
- **Respuesta 200 OK:** Registro de la notificación actualizado.

#### `PATCH /api/v1/notifications/read-all` (Protegida)
Marca todas las notificaciones pendientes del usuario como leídas.
- **Respuesta 200 OK:** `{ "updatedCount": 5 }`.

#### `DELETE /api/v1/notifications/:id` (Protegida)
Elimina una notificación de la bandeja personal del usuario.
- **Respuesta 200 OK:** `{ "success": true }`.

#### `GET /api/v1/notifications/stream` (Protegida - Server-Sent Events SSE)
Establece una conexión persistente unidireccional de baja latencia (`text/event-stream`) con reconexión automática y heartbeats de keep-alive cada 25 segundos. Empuja eventos `event: notification` en tiempo real a los clientes conectados tan pronto se registran nuevas respuestas o resoluciones.

#### `POST /api/v1/forms/:id/subscribe` (Protegida)
Suscribe al usuario autenticado a las alertas de un formulario específico (validando que tenga al menos acceso `READ` en la carpeta donde reside).
- **Cuerpo JSON:** `{ "notifyOnNewEntry": true, "notifyOnResolution": false }`.
- **Respuesta 200 OK:** Objeto `FormSubscription`.

#### `DELETE /api/v1/forms/:id/subscribe` (Protegida)
Cancela la suscripción a las alertas del formulario.
- **Respuesta 200 OK:** `{ "success": true }`.

#### `GET /api/v1/forms/:id/subscription` (Protegida)
Consulta si el usuario actual está suscrito al formulario y sus preferencias de alerta activas.
- **Respuesta 200 OK:** `{ "subscribed": true, "subscription": { ... } }`.

---

## 🛠️ 4. Generación de Tipos TypeScript para el Frontend

Para sincronizar automáticamente los tipos TypeScript en el frontend (`gestor-multimedia`), ejecuta desde su directorio:

```bash
npx openapi-typescript ../monolith-backend/openapi.json -o src/types/api.ts
```

Esto generará definiciones tipadas al 100% para cada ruta, parámetro, cuerpo y respuesta HTTP.
