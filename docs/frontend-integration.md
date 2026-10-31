# 🌐 Guía de Integración Frontend: Monolito Backend API

Esta guía detalla cómo consumir, probar y sincronizar los contratos de la API del monolito backend desde la aplicación frontend ([gestor-multimedia](file:///c:/Users/Windows%2011/Documents/pro-n/gestor-multimedia)).

---

## 1. 📖 Documentación Interactiva y Sandbox (Scalar)

El backend expone una interfaz visual moderna impulsada por **Scalar**:

- **URL de la interfaz:** `http://localhost:3000/docs`
- **Especificación OpenAPI 3.1 cruda:** `http://localhost:3000/docs/json` o `http://localhost:3000/openapi.json`
- **Archivo estático en el repositorio:** `openapi.json` (generable con `npm run openapi:export`).

### Características del Sandbox para Desarrolladores Frontend:
1. **Pruebas en vivo:** Botón *"Test Request"* para ejecutar llamadas HTTP directamente desde el navegador.
2. **Generador de Snippets:** Código de ejemplo listo para copiar en **JavaScript Fetch**, **Axios**, React Query y cURL.
3. **Autenticación en la UI:**
   - Botón *"Authorize"*: Permite ingresar un Bearer Token (`Bearer eyJ...`) o la cabecera `X-API-Key`.

---

## 2. ⚡ Autogeneración de Tipos TypeScript en el Frontend

Para evitar escribir tipos a mano o desincronizarse con los modelos del backend, el frontend puede generar automáticamente sus tipos en TypeScript ejecutando en la raíz de `gestor-multimedia`:

```bash
# Opción A: Generar tipos directamente desde el servidor local en ejecución
npx openapi-typescript http://localhost:3000/docs/json -o src/types/api.ts

# Opción B: Generar tipos desde el archivo estático exportado
npx openapi-typescript ../monolith-backend/openapi.json -o src/types/api.ts
```

Esto generará automáticamente tipos completos para:
- `paths['/api/v1/auth/login']['post']['responses'][200]['content']['application/json']`
- `paths['/api/v1/folders']['get']['responses'][200]['content']['application/json']`
- `paths['/api/v1/images']['post']['responses'][201]['content']['application/json']`
- `paths['/api/v1/tables']['get']['responses'][200]['content']['application/json']`
- Tipos de error RFC 7807 (`ProblemDetails`).

---

## 3. 🔐 Estrategia de Autenticación y Manejo de Sesiones

El backend implementa autenticación dual con protección contra robo de credenciales y revocación instantánea:

### A. Inicio de Sesión (`POST /api/v1/auth/login`)
- **Body:** `{ "username": "admin", "password": "..." }`
- **Respuesta 200:**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "role": "ADMIN"
    }
  }
  ```
- **Cookie Automática:** El servidor emite una cookie segura `refreshToken` con flags:
  - `HttpOnly`: Invisible para JavaScript (inmune a ataques XSS).
  - `SameSite=Strict`: Inmune a ataques CSRF.
  - `Path=/api/v1/auth`: Solo se transmite a rutas de autenticación.

### B. Inclusión del Token en Peticiones
Para todos los endpoints protegidos (`/api/v1/folders`, `/api/v1/images`, `/api/v1/tables`, `/api/v1/users`):
```typescript
fetch('http://localhost:3000/api/v1/folders', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
  credentials: 'include', // Necesario para transportar cookies
});
```

### C. Refresco Silencioso de Token (`POST /api/v1/auth/refresh`)
Cuando el Access Token expira (o en la carga inicial de la aplicación):
```typescript
const res = await fetch('http://localhost:3000/api/v1/auth/refresh', {
  method: 'POST',
  credentials: 'include', // Envía la cookie refreshToken automáticamente
});
const data = await res.json();
// data.token contiene el nuevo Access Token
```

### D. Cierre de Sesión (`POST /api/v1/auth/logout`)
```typescript
await fetch('http://localhost:3000/api/v1/auth/logout', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
// Limpia la cookie en el navegador y revoca el token en PostgreSQL (tokenVersion++)
```

---

## 4. 📁 Carpetas y Reglas de Privacidad

1. **Cero Archivos Huérfanos:**
   - Si al subir una imagen (`POST /api/v1/images`) o tabla (`POST /api/v1/tables`) no se envía `folderId`, el backend lo asigna automáticamente a la carpeta `'General'` del usuario.
2. **Carpetas Privadas (`isPrivate: true`):**
   - Solo el creador y el usuario con rol `ADMIN` pueden ver la carpeta y sus archivos asociados.
   - Cualquier intento de acceso o movimiento no autorizado responderá `403 FORBIDDEN`.
3. **Eliminación en Cascada (`DELETE /api/v1/folders/:id`):**
   - Al eliminar una carpeta, se borran automáticamente sus registros en base de datos y todos los archivos físicos en disco.
4. **Reasignación de Archivos:**
   - `PATCH /api/v1/images/:id/folder` con `{ "folderId": "uuid" }` (debe ser carpeta tipo `IMAGE`).
   - `PATCH /api/v1/tables/:id/folder` con `{ "folderId": "uuid" }` (debe ser carpeta tipo `TABLE`).

---

## 5. 🛑 Estandarización de Errores RFC 7807 (`ProblemDetails`)

Todos los errores del backend devuelven un formato estructurado y predecible:

```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Bad Request",
  "status": 400,
  "detail": "El nombre debe tener al menos 2 caracteres",
  "code": "BAD_REQUEST",
  "instance": "/api/v1/folders",
  "invalidParams": [
    {
      "name": "name",
      "reason": "El nombre debe tener al menos 2 caracteres"
    }
  ]
}
```

### Catálogo de Códigos de Error Frecuentes:
- `BAD_REQUEST`: Error en parámetros de entrada o validación de formulario.
- `UNAUTHORIZED`: Token ausente, expirado, malformado o revocado.
- `FORBIDDEN`: Permiso insuficiente (ej. intentar ver una carpeta privada ajena).
- `NOT_FOUND`: Carpeta, imagen o tabla no encontrada.
- `INVALID_FOLDER_TYPE`: Intento de mover una imagen a una carpeta de tablas o viceversa.
- `UNSUPPORTED_MEDIA_TYPE`: Archivo no admitido o magic bytes binarios falsificados.
- `RATE_LIMIT_EXCEEDED`: Límite de peticiones excedido (máximo 5 intentos por minuto en `/login`).
