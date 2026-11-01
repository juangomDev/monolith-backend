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
- `RATE_LIMIT_EXCEEDED`: Límite de peticiones excedido (máximo 5 intentos por minuto en `/login`).
- `MALICIOUS_PAYLOAD`: Detección de scripts incrustados o eventos maliciosos en archivos SVG.

---

## 6. 🖼️ Gestión Avanzada de Imágenes y Rendimiento (Fase 10)

### A. Reemplazo en Caliente de Archivos (`PUT /api/v1/images/:id`)
Permite sustituir físicamente el archivo de una imagen (ej. actualización de un logotipo corporativo o banner) **preservando el mismo `id`, `shortCode` y URL pública**.
- Todas las páginas, correos o sistemas externos que apunten a `http://localhost:3000/i/:shortCode` continuarán funcionando sin cambios de código.
- Se regenera automáticamente la miniatura WebP asociada.
- Para invalidar la caché HTTP inmutable del navegador del cliente, utiliza la propiedad devuelta `urlWithVersion`:
```typescript
const formData = new FormData();
formData.append('file', nuevoArchivoBinario);

const response = await fetch(`http://localhost:3000/api/v1/images/${imageId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
  body: formData,
});

const data = await response.json();
// data.urlWithVersion contiene "http://localhost:3000/i/codigo123?v=1730347300000"
```

### B. Renombrar Imagen (`PATCH /api/v1/images/:id`)
Modifica el nombre amigable `originalName` mostrado en las interfaces sin tocar el almacenamiento físico ni su identificador:
```typescript
const response = await fetch(`http://localhost:3000/api/v1/images/${imageId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ originalName: 'logo-vectorial-v2.png' }),
});
```

### C. Miniaturas Ultraligeras para Galerías (`variant=thumb`)
Para listados, grids y tarjetas del frontend, no descargues la imagen original de tamaño completo (que puede ser de varios megabytes o resolución 4K). En su lugar, consume la variante de miniatura WebP optimizada (320px de ancho):
```tsx
// Ejemplo en React / Vite:
<img 
  src={`${image.url}?variant=thumb`} 
  alt={image.originalName}
  width={320}
  loading="lazy"
  className="rounded-lg object-cover"
/>
```
- **Rendimiento:** Reduce el peso de transferencia en más de un 85% para un feed o galería de imágenes.
- **Caché:** Cuenta con cabeceras `Cache-Control: public, max-age=31536000, immutable`.

### D. Soporte de Gráficos Vectoriales (`.svg`)
- Se admiten archivos SVG (`image/svg+xml`) hasta 50MB.
- El backend implementa **desinfección anti-XSS**: rechaza cualquier archivo SVG que contenga etiquetas `<script>` o atributos ejecutables como `onload`, `onerror` o `onclick` con código `400 MALICIOUS_PAYLOAD`.
- Se entrega con la cabecera `Content-Security-Policy: default-src 'none'` en `/i/:short_code` para garantizar aislamiento en caso de ser abierto en una pestaña independiente.

### E. Paginación y Filtrado SQL (`GET /api/v1/images`)
```typescript
const query = new URLSearchParams({
  page: '1',
  limit: '24',
  folderId: currentFolderId || '',
});

const res = await fetch(`http://localhost:3000/api/v1/images?${query.toString()}`, {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
const { images, meta, total } = await res.json();
// meta: { page: 1, limit: 24, total: 100, totalPages: 5, hasNext: true }
```

---

## 7. 📊 Gestión Avanzada de Tablas y Doble Artefacto (Fase 11)

### A. Patrón de Doble Artefacto (Rendimiento Extremo de Lectura)
Al cargar un archivo Excel (`.xlsx`) o CSV (`.csv`):
1. **Archivo Original Intacto:** El backend preserva el binario original en disco sin alteraciones para descargas directas de alta fidelidad (`GET /t/:short_code?download=true`).
2. **Artefacto Pre-calculado `.data.json.gz`:** En la subida, se extraen celdas combinadas (`merges`), estilos de celda (color de fondo) y encabezados, comprimiéndose en un archivo `.data.json.gz` adyacente.

### B. Consumo Instantáneo en el Frontend (`GET /t/:short_code`)
Al consultar los datos para pintar la gráfica o tabla:
```typescript
// En React / Vue / Vanilla JS:
const res = await fetch(`http://localhost:3000/t/${shortCode}`);
const { columns, headers, merges, cellStyles, data, meta } = await res.json();

// Para cuadros estadísticos con colores y merges:
// merges: ['A1:B1'] -> Celdas combinadas nativas
// cellStyles['0']['monto']: { bg: '#10b981', bold: true, align: 'right' } -> Estilos extraídos
```
- **Tiempo de Respuesta:** Responde en ~2 ms con 0% de CPU en lecturas, ya que transmite directamente el flujo precalculado.
- **Paginación:** Si se especifican `?page=1&limit=50`, se entrega la porción solicitada con metadatos `{ page, limit, total, totalPages, hasNext }`.

### C. Descarga de Archivo Original (`?download=true`)
Para permitir al usuario final descargar el archivo Excel original intacto (conservando fórmulas y estilos nativos de Excel):
```tsx
<a 
  href={`http://localhost:3000/t/${shortCode}?download=true`} 
  className="btn btn-primary"
>
  Descargar Excel Original
</a>
```

### D. Paginación y Filtrado SQL de Datasets (`GET /api/v1/tables`)
```typescript
const query = new URLSearchParams({
  page: '1',
  limit: '20',
  folderId: currentFolderId || '',
});

const res = await fetch(`http://localhost:3000/api/v1/tables?${query.toString()}`, {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});
const { tables, total, page, limit, totalPages, meta } = await res.json();
```

### E. Protección Anti-IDOR y Eliminación en Cascada (`DELETE /api/v1/tables/:id`)
- Requiere autenticación Bearer JWT.
- Si el usuario no es el propietario de la carpeta ni `ADMIN`, el backend rechaza con `403 FORBIDDEN`.
- Al eliminar con éxito (`204 No Content`), el backend destruye automáticamente el registro en PostgreSQL, el archivo fuente original y el artefacto comprimido `.data.json.gz`.

---

## 8. 👥 Sistema Jerárquico de Roles y RBAC de Carpetas (Fase 12)

### A. Jerarquía Estricta de 3 Niveles (Sin Roles Legacy)
El sistema erradica el rol genérico `USER` y define 3 niveles jerárquicos claros:
- **`ADMIN` (Nivel 3):** Superusuario global del sistema. Gestiona todos los usuarios, carpetas y recursos sin restricciones.
- **`MANAGER` (Nivel 2):** Titular o Gestor. Es dueño de sus propias carpetas (`IMAGE` y `TABLE`), puede crear colaboradores y compartirles carpetas asignando permisos.
- **`COLLABORATOR` (Nivel 1):** Invitado o Asistente. Solo puede acceder a las carpetas que le hayan sido expresamente compartidas. No puede crear carpetas raíz ni gestionar usuarios.

**Regla de Creación y Jerarquía:** `peso(creador) > peso(nuevo_usuario)`:
- `ADMIN` puede crear `MANAGER` y `COLLABORATOR`.
- `MANAGER` solo puede crear `COLLABORATOR` (quedan vinculados a él mediante `createdById`).
- `COLLABORATOR` no puede crear usuarios (403 `FORBIDDEN`).

### B. Autogestión de Perfil y Cambio de Contraseña Propia
- **Consultar Perfil Activo (`GET /api/v1/auth/me`):**
  ```typescript
  const res = await fetch('http://localhost:3000/api/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const { user } = await res.json();
  // user: { id, username, role, isActive, createdById, createdAt }
  ```
- **Cambiar Contraseña Propia (`PATCH /api/v1/auth/password`):**
  ```typescript
  await fetch('http://localhost:3000/api/v1/auth/password', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      currentPassword: 'MiClaveActual123!',
      newPassword: 'MiNuevaClaveSegura2026!'
    })
  });
  // Invalida sesiones activas en otros dispositivos incrementando tokenVersion
  ```

### C. Gestión Jerárquica de Usuarios (`/api/v1/users`)
- **Crear Usuario (`POST /api/v1/users`):**
  - Invocado por `ADMIN` o `MANAGER`:
  ```typescript
  const res = await fetch('http://localhost:3000/api/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'nuevo_asistente',
      password: 'ClaveSegura123!',
      role: 'COLLABORATOR' // ADMIN puede enviar MANAGER o COLLABORATOR; MANAGER solo COLLABORATOR
    })
  });
  ```
- **Listar Usuarios (`GET /api/v1/users`):**
  - Si el solicitante es `ADMIN`, retorna todos los usuarios del sistema.
  - Si es `MANAGER`, retorna únicamente sus colaboradores creados (`createdById === manager.id`).
- **Activar / Suspender Usuario (`PATCH /api/v1/users/:id/status`):**
  - Payload: `{ "isActive": false }`. Al suspender, se invalida de inmediato el token del usuario en PostgreSQL.
- **Restablecer Contraseña por Superior (`PATCH /api/v1/users/:id/password`):**
  - Payload: `{ "newPassword": "NuevaClaveTemporal123!" }`.
- **Eliminar Usuario (`DELETE /api/v1/users/:id`):**
  - Destruye la cuenta y limpia archivos asociados en cascada.

### D. Compartición de Carpetas con Membresías Granulares (`/api/v1/folders/:id/shares`)
Permite al `MANAGER` dueño de la carpeta (o `ADMIN`) compartirla con colaboradores:
- **Asignar Colaborador (`POST /api/v1/folders/:id/shares`):**
  ```typescript
  await fetch(`http://localhost:3000/api/v1/folders/${folderId}/shares`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: collaboratorUserId,
      permission: 'EDIT' // 'READ' (solo ver/descargar) o 'EDIT' (ver, subir y modificar)
    })
  });
  ```
- **Listar Colaboradores de Carpeta (`GET /api/v1/folders/:id/shares`):**
  - Retorna `shares: [{ id, folderId, userId, permission, user: { id, username, role } }]`.
- **Modificar Permiso (`PATCH /api/v1/folders/:id/shares/:userId`):**
  - Payload: `{ "permission": "READ" }`.
- **Revocar Colaborador (`DELETE /api/v1/folders/:id/shares/:userId`):**
  - Expulsa al colaborador de la carpeta compartida.

### E. Reglas de Ingesta y Operación para Colaboradores
1. **Creación de Carpetas Raíz:** Bloqueada para `COLLABORATOR` (403 `FORBIDDEN`). Solo `MANAGER` y `ADMIN` pueden crear carpetas.
2. **Listado de Carpetas (`GET /api/v1/folders`):** Los colaboradores solo reciben las carpetas compartidas con ellos, incluyendo el campo `myPermission: 'READ' | 'EDIT'`.
3. **Subida de Imágenes y Tablas (`POST /api/v1/images`, `POST /api/v1/tables`):**
   - Para un `COLLABORATOR`, el campo `folderId` es obligatorio.
   - Si se envía sin `folderId` o hacia una carpeta donde solo tiene permiso `READ`, el backend rechaza con `403 FORBIDDEN`.
   - Con permiso `EDIT`, la subida y modificación se procesan con normalidad.

