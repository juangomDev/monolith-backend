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
| **10** | `GET` | `/api/v1/users` | Users | Bearer JWT | `MANAGER` | Listado de usuarios (`ADMIN` ve todos; `MANAGER` solo sus colaboradores). |
| **11** | `PATCH` | `/api/v1/users/:id/status` | Users | Bearer JWT | `MANAGER` | Activa o suspende una cuenta de usuario e invalida sus sesiones. |
| **12** | `PATCH` | `/api/v1/users/:id/password` | Users | Bearer JWT | `MANAGER` | Restablecimiento forzado de contraseña por superior jerárquico. |
| **13** | `DELETE` | `/api/v1/users/:id` | Users | Bearer JWT | `MANAGER` | Eliminación de usuario y limpieza en cascada de sus archivos. |
| **14** | `GET` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `COLLABORATOR` | Lista carpetas visibles con conteo y permiso del usuario (`?type=`). |
| **15** | `POST` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `MANAGER` | Crea una carpeta (tipo `IMAGE` o `TABLE`, pública o privada). |
| **16** | `GET` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `COLLABORATOR`* | Detalle de carpeta (evalúa membresía o privacidad). |
| **17** | `DELETE` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `MANAGER`* | Eliminación en cascada física y lógica de la carpeta y archivos. |
| **18** | `POST` | `/api/v1/folders/:id/shares` | Folders | Dual (JWT / Key) | `MANAGER`* | Comparte carpeta asignando colaborador con permiso `READ` o `EDIT`. |
| **19** | `GET` | `/api/v1/folders/:id/shares` | Folders | Dual (JWT / Key) | `MANAGER`* | Lista colaboradores y niveles de acceso a la carpeta. |
| **20** | `PATCH` | `/api/v1/folders/:id/shares/:userId` | Folders | Dual (JWT / Key) | `MANAGER`* | Modifica nivel de permiso (`READ` <-> `EDIT`) del colaborador. |
| **21** | `DELETE` | `/api/v1/folders/:id/shares/:userId` | Folders | Dual (JWT / Key) | `MANAGER`* | Revoca acceso y expulsa al colaborador de la carpeta. |
| **22** | `GET` | `/api/v1/images` | Images | Dual (JWT / Key) | `COLLABORATOR` | Listado paginado y filtrado de imágenes (`?page=&limit=&folderId=`). |
| **23** | `POST` | `/api/v1/images` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Carga multipart de imagen (requiere permiso `EDIT` si es colaborador). |
| **24** | `PATCH` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Renombra `originalName` validando permiso de edición. |
| **25** | `PUT` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Reemplazo en caliente de binario preservando shortCode y URL pública. |
| **26** | `DELETE` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `COLLABORATOR`* | Destrucción física y lógica de imagen y su miniatura WebP. |
| **27** | `PATCH` | `/api/v1/images/:id/folder` | Folders | Dual (JWT / Key) | `MANAGER`* | Reasigna una imagen a otra carpeta de tipo `IMAGE`. |
| **28** | `GET` | `/i/:short_code` | Images | Pública | Anónimo | Entrega pública con capability URL (`?variant=thumb` o `original`). |
| **29** | `GET` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `COLLABORATOR` | Listado de datasets tabulares registrados. |
| **30** | `POST` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Carga multipart de dataset (requiere permiso `EDIT` si es colaborador). |
| **31** | `DELETE` | `/api/v1/tables/:id` | Tables | Dual (JWT / Key) | `COLLABORATOR`* | Destrucción física y lógica del dataset y archivo origen. |
| **32** | `PATCH` | `/api/v1/tables/:id/folder` | Folders | Dual (JWT / Key) | `MANAGER`* | Reasigna un dataset a otra carpeta de tipo `TABLE`. |
| **33** | `GET` | `/t/:short_code` | Tables | Pública | Anónimo | Consulta paginada (`?page=&limit=`) o descarga (`?download=true`). |

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
Lista las carpetas según las reglas de visibilidad (usuarios ven carpetas públicas y sus privadas; `ADMIN` ve todas).
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Query Params:**
  - `type` (Opcional): `IMAGE` o `TABLE`.
- **Respuesta 200 OK:**
  ```json
  {
    "folders": [
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "name": "General",
        "type": "IMAGE",
        "color": "#64748b",
        "isPrivate": false,
        "itemCount": 42,
        "userId": "11111111-1111-1111-1111-111111111111",
        "owner": {
          "id": "11111111-1111-1111-1111-111111111111",
          "username": "admin"
        },
        "createdAt": "2026-10-01T00:00:00.000Z"
      }
    ],
    "total": 1
  }
  ```

#### `POST /api/v1/folders`
Crea una nueva carpeta organizada por tipo de contenido.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Body:**
  ```json
  {
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
      "createdAt": "2026-10-31T04:20:00.000Z"
    }
  }
  ```

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

---

## 🛠️ 4. Generación de Tipos TypeScript para el Frontend

Para sincronizar automáticamente los tipos TypeScript en el frontend (`gestor-multimedia`), ejecuta desde su directorio:

```bash
npx openapi-typescript ../monolith-backend/openapi.json -o src/types/api.ts
```

Esto generará definiciones tipadas al 100% para cada ruta, parámetro, cuerpo y respuesta HTTP.
