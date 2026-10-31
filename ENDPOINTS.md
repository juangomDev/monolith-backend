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
| **6** | `POST` | `/api/v1/auth/logout` | Auth | Bearer JWT | `USER` | Invalida los refresh tokens del usuario y limpia cookies. |
| **7** | `POST` | `/api/v1/users` | Users | Bearer JWT | `ADMIN` | Registro de nuevos usuarios con rol `ADMIN` o `USER`. |
| **8** | `GET` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `USER` | Lista carpetas visibles con conteo de elementos (`?type=`). |
| **9** | `POST` | `/api/v1/folders` | Folders | Dual (JWT / Key) | `USER` | Crea una carpeta (tipo `IMAGE` o `TABLE`, pública o privada). |
| **10** | `GET` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `USER`* | Detalle de carpeta (evalúa propiedad si es privada). |
| **11** | `DELETE` | `/api/v1/folders/:id` | Folders | Dual (JWT / Key) | `USER`* | Eliminación en cascada física y lógica de la carpeta y archivos. |
| **12** | `GET` | `/api/v1/images` | Images | Dual (JWT / Key) | `USER` | Listado de imágenes accesibles según permisos de carpeta. |
| **13** | `POST` | `/api/v1/images` | Images | Dual (JWT / Key) | `USER` | Carga multipart de imagen (valida magic bytes, máx 50MB). |
| **14** | `DELETE` | `/api/v1/images/:id` | Images | Dual (JWT / Key) | `USER`* | Destrucción física y lógica de imagen y miniaturas. |
| **15** | `PATCH` | `/api/v1/images/:id/folder` | Folders | Dual (JWT / Key) | `USER`* | Reasigna una imagen a otra carpeta de tipo `IMAGE`. |
| **16** | `GET` | `/i/:short_code` | Images | Pública | Anónimo | Entrega pública con capability URL y `Cache-Control: immutable`. |
| **17** | `GET` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `USER` | Listado de datasets tabulares registrados. |
| **18** | `POST` | `/api/v1/tables` | Tables | Dual (JWT / Key) | `USER` | Carga multipart de dataset (CSV o Excel, máx 100MB). |
| **19** | `DELETE` | `/api/v1/tables/:id` | Tables | Dual (JWT / Key) | `USER`* | Destrucción física y lógica del dataset y archivo origen. |
| **20** | `PATCH` | `/api/v1/tables/:id/folder` | Folders | Dual (JWT / Key) | `USER`* | Reasigna un dataset a otra carpeta de tipo `TABLE`. |
| **21** | `GET` | `/t/:short_code` | Tables | Pública | Anónimo | Consulta paginada (`?page=&limit=`) o descarga (`?download=true`). |

*\*Nota: Los endpoints marcados con `USER*` verifican propiedad: un usuario común solo puede operar sobre recursos propios o en carpetas públicas; un `ADMIN` tiene acceso irrestricto.*

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
Invalida la sesión actual, revoca el refresh token en base de datos y borra la cookie en el navegador.
- **Autenticación:** `Bearer JWT`.
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Sesión cerrada exitosamente"
  }
  ```
- **Errores:** `401 Unauthorized`.

---

### 3.3. Módulo de Usuarios (`/api/v1/users`)

#### `POST /api/v1/users`
Crea una nueva cuenta de usuario en el sistema.
- **Autenticación:** `Bearer JWT` (Exclusivo rol `ADMIN`).
- **Body:**
  ```json
  {
    "username": "nuevo_editor",
    "password": "PasswordFuerte2026!",
    "role": "USER"
  }
  ```
- **Respuesta 201 Created:**
  ```json
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "username": "nuevo_editor",
    "role": "USER",
    "createdAt": "2026-10-31T04:20:00.000Z"
  }
  ```
- **Errores:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden` (si no es admin), `409 Conflict` (username ya existe).

---

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
Lista imágenes registradas en el sistema accesibles para el solicitante.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Respuesta 200 OK:**
  ```json
  {
    "images": [
      {
        "id": "55555555-5555-5555-5555-555555555555",
        "shortCode": "img1234567",
        "url": "http://localhost:3000/i/img1234567",
        "originalName": "banner.jpg",
        "mimeType": "image/jpeg",
        "sizeBytes": 524288,
        "width": 1920,
        "height": 1080,
        "folderId": "33333333-3333-3333-3333-333333333333",
        "createdAt": "2026-10-31T04:20:00.000Z"
      }
    ],
    "total": 1
  }
  ```

#### `POST /api/v1/images`
Sube y procesa una imagen mediante `multipart/form-data`. Valida magic bytes (JPEG, PNG, WebP) y genera miniaturas automáticas.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Content-Type:** `multipart/form-data`
- **Campos del Formulario:**
  - `file`: Archivo binario (Obligatorio, máx. 50MB).
  - `folderId`: UUID de la carpeta destino (Opcional; si se omite, se asigna a `General`).
- **Respuesta 201 Created:**
  ```json
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "shortCode": "img1234567",
    "url": "http://localhost:3000/i/img1234567",
    "originalName": "banner.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 524288,
    "folderId": "33333333-3333-3333-3333-333333333333"
  }
  ```
- **Errores:** `400 Bad Request` (formato inválido o corrupto), `413 Payload Too Large` (> 50MB).

#### `DELETE /api/v1/images/:id`
Elimina físicamente el archivo del disco y su registro en la base de datos.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la imagen).
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Imagen eliminada exitosamente"
  }
  ```
- **Errores:** `403 Forbidden`, `404 Not Found`.

#### `GET /i/:short_code` (Pública por Diseño)
Entrega binaria de la imagen mediante capability URL opaca no enumerable. Apta para `<img src="...">`.
- **Autenticación:** Ninguna (Pública).
- **Headers de Respuesta:**
  - `Content-Type: image/jpeg` (o el MIME respectivo).
  - `Cache-Control: public, max-age=31536000, immutable`.
- **Errores:** `404 Not Found` (código inexistente).

---

### 3.6. Módulo de Tablas y Datasets (`/api/v1/tables` y `/t/:short_code`)

#### `GET /api/v1/tables`
Lista los datasets tabulares registrados en el sistema.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
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
        "createdAt": "2026-10-31T04:20:00.000Z"
      }
    ],
    "total": 1
  }
  ```

#### `POST /api/v1/tables`
Sube y procesa un dataset tabular estructurado (`.csv`, `.xlsx`, `.xls`). Parsea columnas y almacena filas optimizadas.
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
    "sizeBytes": 1048576,
    "url": "http://localhost:3000/t/tab1234567"
  }
  ```
- **Errores:** `400 Bad Request` (archivo corrupto o formato no soportado), `413 Payload Too Large` (> 100MB).

#### `DELETE /api/v1/tables/:id`
Elimina físicamente el archivo del disco y todas las filas de la tabla en base de datos.
- **Autenticación:** Dual (`Bearer JWT` o `X-API-Key`).
- **Parámetros URL:** `id` (UUID de la tabla).
- **Respuesta 200 OK:**
  ```json
  {
    "message": "Tabla eliminada exitosamente"
  }
  ```
- **Errores:** `403 Forbidden`, `404 Not Found`.

#### `GET /t/:short_code` (Pública por Diseño)
Consulta JSON paginada o descarga binaria del archivo original del dataset.
- **Autenticación:** Ninguna (Pública).
- **Parámetros URL:** `short_code` (Código Base58 opaco de 10 caracteres).
- **Query Params:**
  - `page`: Número de página (Default: `1`).
  - `limit`: Filas por página (Default: `100`, máx. `500`).
  - `download`: Si es `'true'`, responde con stream binario para descarga del archivo original con cabecera `Content-Disposition`.
- **Respuesta 200 OK (Modo JSON):**
  ```json
  {
    "id": "66666666-6666-6666-6666-666666666666",
    "shortCode": "tab1234567",
    "tableName": "ventas_octubre.csv",
    "columns": ["id", "producto", "monto", "fecha"],
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
