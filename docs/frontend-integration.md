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

## 4. 📁 Carpetas, Edición y Reglas de Privacidad (Fase 13)

### A. Cero Archivos Huérfanos y Protección de 'General'
1. **Asignación Automática:**
   - Si al subir una imagen (`POST /api/v1/images`) o tabla (`POST /api/v1/tables`) no se envía `folderId`, el backend lo asigna automáticamente a la carpeta de sistema `'General'` del usuario.
2. **Inmutabilidad de 'General':**
   - **Prohibido Renombrar:** Cualquier intento de cambiar el nombre de la carpeta `'General'` vía `PATCH /api/v1/folders/:id` es rechazado con `400 BAD_REQUEST` (`"No se puede renombrar la carpeta del sistema 'General'"`).
   - **Prohibido Eliminar:** La eliminación vía `DELETE /api/v1/folders/:id` de la carpeta `'General'` está bloqueada con `400 BAD_REQUEST` (`"No se puede eliminar la carpeta del sistema 'General'"`).
   - *Nota:* Se permite modificar su `color` o `isPrivate` sin restricciones.

### B. Edición de Carpetas (`PATCH /api/v1/folders/:id`)
Permite al propietario de la carpeta o a un `ADMIN` actualizar sus metadatos:
- **Body:** Al menos uno de los siguientes campos:
  ```json
  {
    "name": "Nuevas Ilustraciones 2026",
    "color": "#6366f1",
    "isPrivate": true
  }
  ```
- **Control de Acceso:** Usuarios ajenos o colaboradores sin permisos reciben `403 FORBIDDEN`.
- **Respuesta 200:**
  ```json
  {
    "folder": {
      "id": "uuid",
      "name": "Nuevas Ilustraciones 2026",
      "type": "IMAGE",
      "color": "#6366f1",
      "isPrivate": true,
      "userId": "uuid-creador",
      "createdAt": "2026-11-01T...",
      "updatedAt": "2026-11-01T..."
    }
  }
  ```

### C. Listado, Búsqueda y Paginación (`GET /api/v1/folders`)
Soporta filtrado por tipo, búsqueda insensible a mayúsculas/minúsculas y paginación estructurada:
- **Query Params:**
  - `type`: `'IMAGE' | 'TABLE'` (opcional)
  - `search`: Texto a buscar en el nombre de la carpeta (opcional, insensible a mayúsculas)
  - `page`: Número de página `>= 1` (opcional)
  - `limit`: Cantidad por página `1..100` (opcional, por defecto 20 si se envía `page`)

```typescript
// Ejemplo de búsqueda paginada en React / Next.js / Vite:
const query = new URLSearchParams({
  type: 'IMAGE',
  search: 'diseño',
  page: '1',
  limit: '15'
});

const res = await fetch(`http://localhost:3000/api/v1/folders?${query.toString()}`, {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
const { folders, total, page, limit, totalPages, meta } = await res.json();
// meta: { page: 1, limit: 15, total: 3, totalPages: 1, hasNext: false }
```

### D. Eliminación en Cascada (`DELETE /api/v1/folders/:id`)
- Al eliminar una carpeta (salvo `'General'`), se destruyen en cascada todos sus registros asociados en PostgreSQL (imágenes o tablas) y sus archivos físicos/miniaturas/artefactos en disco.
- Requiere ser propietario o `ADMIN`.

### E. Reasignación de Recursos con RBAC Granular
Permite transferir una imagen o tabla a otra carpeta del mismo tipo:
- `PATCH /api/v1/images/:id/folder` con `{ "folderId": "uuid" }`
- `PATCH /api/v1/tables/:id/folder` con `{ "folderId": "uuid" }`
- **Reglas de Seguridad y Validación:**
  1. **Tipo Coincidente:** La carpeta destino debe ser del mismo tipo (`IMAGE` para imágenes, `TABLE` para tablas).
  2. **Validación RBAC en Destino:**
     - Si el solicitante es el dueño de la carpeta destino o `ADMIN`, la transferencia se autoriza inmediatamente.
     - Si es un `COLLABORATOR`, se verifica que la carpeta le haya sido compartida con permiso `EDIT`. Si solo posee `READ` o no es miembro, el backend rechaza con `403 FORBIDDEN`.
     - Si la carpeta destino es privada y no pertenece al usuario ni tiene rol superior, se rechaza con `403 FORBIDDEN`.

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

---

## 🤖 14. Integración del Chat Analítico y Widget Público (Fase 14)

### 14.1. Ficha Técnica de Tablas (`metadataCard`)
Cada tabla dispone de una tarjeta de metadatos autogenerada en la subida y enriquecible por el usuario:
```typescript
// PATCH /api/v1/tables/:id/metadata
const res = await api.patch(`/api/v1/tables/${tableId}/metadata`, {
  title: 'Censo Sudamérica 2024',
  description: 'Población oficial de países de América del Sur',
  tags: ['demografia', 'censo', 'latam'],
  unit: 'habitantes',
  columnsMeta: {
    Hombres: 'Población masculina',
    Mujeres: 'Población femenina',
    Total: 'Total de habitantes'
  },
  hasSummaryRows: true
});
```

### 14.2. Chat Analítico Interno (`POST /api/v1/chat/ask`)
Para usuarios autenticados dentro del gestor multimedia con control de acceso RBAC:
```typescript
const response = await fetch(`${API_URL}/api/v1/chat/ask`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    question: '¿Cuántos hombres hay en Brasil y qué porcentaje representan?',
  }),
});
const data = await response.json();
// data: { answer, foundInSystem, sources, chartData: { labels, values, percentages } }
```

### 14.3. Ejemplo de Widget Web Público para Sitios Externos
Para incrustar un asistente analítico en páginas web externas sin requerir login:
```html
<div id="analytics-widget">
  <div id="chat-messages"></div>
  <div id="chat-suggestions"></div>
  <input id="chat-input" placeholder="Pregunta sobre las tablas públicas..." />
  <button id="chat-btn">Consultar</button>
</div>

<script>
  const API_BASE = 'https://tu-backend.com';

  // 1. Cargar sugerencias automáticas
  fetch(`${API_BASE}/api/v1/public/chat/suggestions`)
    .then(r => r.json())
    .then(({ suggestions }) => {
      const container = document.getElementById('chat-suggestions');
      suggestions.forEach(q => {
        const btn = document.createElement('button');
        btn.innerText = q;
        btn.onclick = () => askQuestion(q);
        container.appendChild(btn);
      });
    });

  // 2. Enviar consulta al widget público
  async function askQuestion(question) {
    const res = await fetch(`${API_BASE}/api/v1/public/chat/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const result = await res.json();
    console.log(result.answer, result.chartData);
  }
</script>
```

### 14.4. Interruptor de Publicación para IA (`ai_manager` y Membresías de Carpetas)
A partir de la Fase 14.7, el Chat Web público (`POST /api/v1/public/chat/ask` y `GET /api/v1/public/chat/suggestions`) opera bajo un modelo de **publicación explícita mediante compartición**:
1. **Cuenta Estructural `ai_manager`:** El sistema inicializa automáticamente la cuenta fija de servicio `ai_manager` (con rol `MANAGER`). Esta cuenta no puede eliminarse ni desactivarse.
2. **Exposición en Selector de Usuarios:** Al listar usuarios con `GET /api/v1/users`, cualquier `MANAGER` o `ADMIN` verá a `ai_manager` en la lista para poder compartir carpetas.
3. **Interruptor de Publicación Instantáneo:**
   - **Publicar en Chat Web:** Comparte la carpeta con el usuario `ai_manager` (`POST /api/v1/folders/:id/shares` con `{ "userId": "<id_de_ai_manager>", "permission": "READ" }`). Sus tablas quedarán inmediatamente accesibles para responder preguntas en el widget público web.
   - **Despublicar del Chat Web:** Revoca el acceso a `ai_manager` (`DELETE /api/v1/folders/:id/shares/<id_de_ai_manager>`). Las tablas desaparecerán de inmediato de las respuestas del widget público.

---

## 15. Paridad en Tablas, Búsqueda Global y Operaciones en Lote (Fase 15)

### 15.1. Renombrado de Tablas (`PATCH /api/v1/tables/:id`)
Permite cambiar el nombre lógico del dataset sin alterar el archivo físico ni cambiar el `shortCode`.
```typescript
const res = await fetch(`${API_URL}/api/v1/tables/${tableId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ tableName: 'ventas_consolidadas_2026.csv' }),
});
const table = await res.json();
```

### 15.2. Reemplazo en Caliente de Tablas (`PUT /api/v1/tables/:id` - Hot-Swap)
Sobrescribe físicamente el archivo `.csv` o `.xlsx` conservando intactos el `id`, `shortCode`, `folderId` y URL pública (`/t/:short_code`). Regenera el artefacto `.data.json.gz`, actualiza estadísticas y limpia la caché del chat analítico.
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'nuevo_dataset.csv');

const res = await fetch(`${API_URL}/api/v1/tables/${tableId}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  body: formData,
});
const updated = await res.json();
// updated.urlWithVersion incluye timestamp ?v= para invalidar caché en el navegador
```

### 15.3. Búsqueda Filtrada SQL (`?search=`)
Permite filtrar imágenes por `originalName` o `shortCode`, y tablas por `tableName` o `shortCode` (búsqueda insensible a mayúsculas/minúsculas):
```typescript
// Buscar imágenes
const imagesRes = await fetch(`${API_URL}/api/v1/images?search=logo&page=1&limit=20`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});

// Buscar tablas
const tablesRes = await fetch(`${API_URL}/api/v1/tables?search=2026&folderId=${folderId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### 15.4. Operaciones en Lote (`Bulk Actions`)
Permite eliminar o mover de carpeta múltiples recursos en una sola petición (máximo 50 IDs por lote) con reporte resiliente:

#### Eliminación en Lote
```typescript
// Eliminar múltiples imágenes
const delImages = await fetch(`${API_URL}/api/v1/images/bulk-delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ ids: ['id-1', 'id-2'] }),
});
const delReport = await delImages.json();
// delReport: { totalRequested: 2, successful: ['id-1', 'id-2'], failed: [] }

// Eliminar múltiples tablas
const delTables = await fetch(`${API_URL}/api/v1/tables/bulk-delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ ids: ['id-1', 'id-2'] }),
});
```

#### Movimiento en Lote a otra Carpeta
```typescript
// Mover imágenes a una carpeta de tipo IMAGE
const moveImages = await fetch(`${API_URL}/api/v1/images/bulk-move`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({
    ids: ['id-1', 'id-2'],
    targetFolderId: 'uuid-carpeta-destino',
  }),
});

// Mover tablas a una carpeta de tipo TABLE
const moveTables = await fetch(`${API_URL}/api/v1/tables/bulk-move`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({
    ids: ['id-1', 'id-2'],
    targetFolderId: 'uuid-carpeta-destino',
  }),
});
```

---

## 16. Auditoría, Gestión de API Keys y Monitor de Almacenamiento (Fase 16)

### 16.1. Historial de Auditoría (`GET /api/v1/audit-logs`)
Permite consultar el registro cronológico inmutable de acciones críticas (subidas, eliminaciones, hot-swaps, compartición de carpetas y gestión de usuarios).
- `ADMIN`: Visualiza todos los eventos del sistema.
- `MANAGER`: Visualiza eventos ocurridos sobre sus carpetas propias y acciones ejecutadas por sus colaboradores vinculados.
- `COLLABORATOR`: Denegado con `403 FORBIDDEN`.

```typescript
// Consultar auditoría con filtros y paginación
const res = await fetch(`${API_URL}/api/v1/audit-logs?page=1&limit=20&action=TABLE_UPLOAD`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { logs, total, page, limit, totalPages } = await res.json();
// logs: [{ id, actorId, actorUsername, action, resourceType, resourceId, folderId, metadata, ipAddress, createdAt }]
```

### 16.2. Gestión Dinámica de API Keys (`/api/v1/api-keys` - Exclusivo ADMIN)
Permite al Administrador General crear, listar y revocar llaves de integración sin tocar la base de datos:

#### Crear API Key (Retorna el secreto plano por única vez)
```typescript
const res = await fetch(`${API_URL}/api/v1/api-keys`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  },
  body: JSON.stringify({
    name: 'Integración Webhook Dokploy',
    description: 'Servicio de sincronización continua',
    rateLimit: 120,
  }),
});
const newKey = await res.json();
// newKey: { id, name, keyPrefix, key: "mk_live_...", rateLimit, createdAt }
// IMPORTANTE: 'key' solo se entrega en la respuesta del POST de creación.
```

#### Listar API Keys Activas
```typescript
const listRes = await fetch(`${API_URL}/api/v1/api-keys`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const { keys } = await listRes.json();
// keys: [{ id, name, description, keyPrefix, rateLimit, isActive, lastUsedAt, createdAt }]
```

#### Revocar API Key
```typescript
await fetch(`${API_URL}/api/v1/api-keys/${keyId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${adminToken}` },
});
```

### 16.3. Monitor de Cuotas y Salud de Almacenamiento (`GET /api/v1/stats/storage`)
Expone métricas agregadas de imágenes y tablas en PostgreSQL, desglose de carpetas más pesadas y estado del disco físico:
- `ADMIN`: Acceso a métricas globales y salud del disco (`disk: { imagesBytes, tablesBytes, totalBytes }`), con indicador preventivo `warning: true` si se supera el umbral operativo.
- `MANAGER`: Acceso restringido a sus propias carpetas y datasets (campo `disk: null`).

```typescript
const statsRes = await fetch(`${API_URL}/api/v1/stats/storage`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const stats = await statsRes.json();
// stats: {
//   isAdmin: true,
//   database: { images: { count, sizeBytes }, tables: { count, sizeBytes }, totalCount, totalSizeBytes },
//   disk: { imagesBytes, tablesBytes, totalBytes, totalFilesCount },
//   topFolders: [{ id, name, type, totalBytes, itemsCount }],
//   warning: false,
//   warningMessage: null
// }
```

---

## 17. 📝 Módulo de Formularios Customizables, Tablas Abiertas y Resolución Única (Write-Once)

Este módulo desacopla la generación de PDFs del backend: `monolith-backend` administra esquemas dinámicos, tablas abiertas sincronizadas en formato comprimido `.data.json.gz`, inmutabilidad estricta Write-Once al responder y reenvío bajo demanda al servicio externo encargado de los PDFs.

### 17.1. Crear Formulario y Tabla Abierta (`POST /api/v1/forms`)
Permite a usuarios autorizados (`MANAGER`, `ADMIN` o `COLLABORATOR` con `EDIT`) crear un formulario en una carpeta:

```typescript
const res = await fetch(`${API_URL}/api/v1/forms`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    slug: 'contacto-ciudadano',
    title: 'Buzón de Sugerencias y Consultas',
    folderId: 'uuid-carpeta-tipo-table',
    entryFieldsSchema: [
      { name: 'nombre', type: 'string', required: true, label: 'Nombre Completo' },
      { name: 'correo', type: 'string', required: true, label: 'Correo' },
      { name: 'mensaje', type: 'string', required: true, label: 'Mensaje' }
    ],
    resolutionFieldsSchema: [
      { name: 'dictamen', type: 'string', required: true, label: 'Dictamen Oficial' },
      { name: 'numeroOficio', type: 'string', required: true, label: 'N° Oficio' }
    ],
    allowedResolutionStates: ['VALID', 'INVALID'],
    externalTargetUrl: 'https://servicio-externo-pdf.empresa.local/webhook/notificar'
  }),
});
const form = await res.json();
// form: { id, slug, title, linkedTableId, ... }
```

### 17.2. Endpoint 1: Envío Público de Datos (`POST /api/v1/public/forms/:slug/entries`)
Ruta pública rate-limited (60 req/min por IP) para recolectar respuestas desde formularios web:

```typescript
const submitRes = await fetch(`${API_URL}/api/v1/public/forms/contacto-ciudadano/entries`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nombre: 'Ana Perez',
    correo: 'ana@example.com',
    mensaje: 'Solicito copia del informe financiero'
  }),
});
const entry = await submitRes.json();
// entry: { id: "uuid-entrada", status: "NEW", createdAt: "2026-03-01T..." }
```
*Las columnas de respuesta exclusiva (`resolutionFieldsSchema`) quedan automáticamente en `null` tanto en la base de datos como en la tabla abierta vinculada `.data.json.gz`.*

### 17.3. Endpoint 2: Resolución Única Inmutable (`PATCH /api/v1/forms/entries/:id/resolve`)
Permite a los operadores completar los campos de resolución y sellar la fila a `VALID` o `INVALID`:

```typescript
const resolveRes = await fetch(`${API_URL}/api/v1/forms/entries/${entry.id}/resolve`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    status: 'VALID',
    resolutionPayload: {
      dictamen: 'Aprobado formalmente y remitido a finanzas',
      numeroOficio: 'OF-2026-0042'
    }
  }),
});
const resolved = await resolveRes.json();
// resolved: { id, status: "VALID", entryPayload, resolutionPayload, resolvedAt, ... }
```

> [!CAUTION]
> **Regla de Inmutabilidad (Write-Once):**
> Este endpoint solo puede invocarse **UNA SOLA VEZ por fila**. Cualquier llamada posterior sobre una fila ya resuelta retornará error `409 CONFLICT` con código `ENTRY_ALREADY_RESOLVED`.

### 17.4. Reenvío Bajo Demanda sin Archivos (`POST /api/v1/forms/entries/:id/dispatch`)
Si en el futuro se necesita volver a generar el PDF o reenviar la respuesta al sistema externo, este endpoint despacha el JSON sellado sin generar archivos ni usar almacenamiento en disco:

```typescript
const dispatchRes = await fetch(`${API_URL}/api/v1/forms/entries/${entry.id}/dispatch`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
});
const dispatchResult = await dispatchRes.json();
// dispatchResult: { dispatched: true, targetUrl: "...", entryId: "...", dispatchedAt: "..." }
```

### 17.5. Descarga Mensual y Tablas Abiertas (`GET /api/v1/forms/:id/export`)
Descarga todas las respuestas filtradas por mes y estado en Excel (`.xlsx`) o CSV (`.csv`):

```typescript
// Descarga el reporte consolidado de marzo 2026 en Excel
window.open(`${API_URL}/api/v1/forms/${form.id}/export?month=2026-03&format=xlsx`, '_blank');
```

---

## 18. 📑 Módulo de Archivos PDF y Doble Artefacto (`/p/:short_code`)

El backend proporciona soporte completo para documentos PDF de hasta 50MB mediante el **Patrón de Doble Artefacto**:
1. `${shortCode}.pdf`: Documento original sanitizado contra exploits JavaScript/Launch.
2. `${shortCode}.text.json.gz`: Extracción estructurada de texto por página comprimida en gzip (~95% de compresión), permitiendo lecturas ultra-rápidas (~2ms) y citas precisas en el Chat RAG.

### 18.1. Subida de Archivos PDF (`POST /api/v1/pdfs`)

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
if (selectedFolderId) {
  formData.append('folderId', selectedFolderId);
}

const response = await fetch(`${API_URL}/api/v1/pdfs`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  body: formData,
});

const pdf = await response.json();
// Retorna:
// {
//   id: "uuid-del-pdf",
//   shortCode: "aB3k9XyZ10",
//   originalName: "manual-operativo.pdf",
//   sizeBytes: 1542000,
//   pageCount: 14,
//   isScanned: false,
//   folderId: "uuid-carpeta-pdf",
//   metadataCard: { category: "GENERAL", summary: "...", keywords: [...] },
//   createdAt: "2026-03-01T..."
// }
```

### 18.2. Enlaces Públicos Inmutables (Capability URLs)

El shortcode de 10 caracteres Base58 es seguro e hiper-rápido:

```typescript
// 1. Visualización nativa en navegador (iframe o nueva pestaña)
const viewUrl = `${API_URL}/p/${pdf.shortCode}`;

// 2. Descarga directa forzada (attachment)
const downloadUrl = `${API_URL}/p/${pdf.shortCode}?download=true`;

// 3. Inspección del texto extraído en JSON sin descargar el binario
const textJsonUrl = `${API_URL}/p/${pdf.shortCode}?format=text`;

// 4. Obtener solo una página específica en JSON
const page2Url = `${API_URL}/p/${pdf.shortCode}?format=text&page=2`;
```

### 18.3. Reemplazo en Caliente (Hot-Swap) (`PUT /api/v1/pdfs/:id`)
Permite corregir o actualizar un documento PDF manteniendo exactamente el mismo `id`, `shortCode` y URL pública `/p/:short_code`:

```typescript
const updateData = new FormData();
updateData.append('file', newFileInput.files[0]);

const hotSwapRes = await fetch(`${API_URL}/api/v1/pdfs/${pdf.id}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  body: updateData,
});
const updatedPdf = await hotSwapRes.json();
```

### 18.4. Ficha Técnica y Metadatos (`PATCH /api/v1/pdfs/:id/metadata`)
Permite enriquecer los metadatos semánticos que el Chat RAG utiliza para indexar y responder:

```typescript
await fetch(`${API_URL}/api/v1/pdfs/${pdf.id}/metadata`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    category: 'Manuales',
    summary: 'Procedimiento de resolución de incidencias nivel 2',
    keywords: ['soporte', 'incidencias', 'sla'],
  }),
});
```

### 18.5. Chat RAG con Citas de Páginas
Cuando los usuarios realizan preguntas en el Chat interno o público (`/api/v1/chat/ask` o `/api/v1/public/chat/ask`), el motor cita automáticamente los PDFs relevantes y sus números de página:

```typescript
// En la respuesta de chat:
// response.sources = [
//   {
//     type: "PDF",
//     name: "manual-operativo.pdf",
//     url: "/p/aB3k9XyZ10",
//     pages: [2, 3]
//   }
// ]
```
El frontend puede renderizar directamente enlaces como:
`<a href="${source.url}#page=${source.pages[0]}" target="_blank">${source.name} (Pág. ${source.pages.join(', ')})</a>`

---

## 19. 🔔 Módulo de Notificaciones en Vivo (SSE), Bandeja In-App y Suscripciones a Tablas Abiertas

Permite al frontend mostrar una campana de notificaciones con conteo de no leídas, bandeja interactiva y recepción de alertas en tiempo real sin polling cuando se registran nuevas respuestas en los formularios a los que el usuario tiene acceso y está suscrito.

### 19.1. Conexión en Vivo mediante Server-Sent Events (SSE)

Para recibir alertas instantáneas sin recargar la página:

```typescript
// En React / Vue / Vanilla JS:
const eventSource = new EventSource(`${API_URL}/api/v1/notifications/stream?token=${accessToken}`);

// O si tu cliente HTTP soporta cabeceras en streaming (fetch-event-source):
import { fetchEventSource } from '@microsoft/fetch-event-source';

fetchEventSource(`${API_URL}/api/v1/notifications/stream`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  onmessage(event) {
    if (event.event === 'notification') {
      const notification = JSON.parse(event.data);
      console.log('Nueva alerta recibida:', notification);
      // Actualizar badge de la campana y mostrar toast en pantalla:
      // toast.info(notification.title, notification.message);
    }
  },
  onerror(err) {
    console.error('Error de conexión SSE:', err);
  },
});
```

### 19.2. Badge de No Leídas y Bandeja Paginada

```typescript
// 1. Obtener conteo para el badge numérico de la campana
const countRes = await fetch(`${API_URL}/api/v1/notifications/unread-count`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { unreadCount } = await countRes.json();

// 2. Abrir bandeja de notificaciones (primeras 20)
const listRes = await fetch(`${API_URL}/api/v1/notifications?page=1&limit=20&unreadOnly=false`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { data, meta } = await listRes.json();
// data: [ { id, title, message, type, resourceId, read, createdAt }, ... ]
```

### 19.3. Marcar como Leídas y Limpieza

```typescript
// Marcar una notificación específica al hacer clic
await fetch(`${API_URL}/api/v1/notifications/${notification.id}/read`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
});

// Botón "Marcar todas como leídas"
await fetch(`${API_URL}/api/v1/notifications/read-all`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
});

// Eliminar una notificación
await fetch(`${API_URL}/api/v1/notifications/${notification.id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### 19.4. Suscribirse a Alertas de una Tabla Abierta / Formulario

Permite que el operador o manager decida qué formularios desea monitorear activamente:

```typescript
// 1. Consultar si el usuario actual ya está suscrito
const subRes = await fetch(`${API_URL}/api/v1/forms/${formId}/subscription`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { subscribed, subscription } = await subRes.json();

// 2. Alternar o guardar suscripción (Activar alertas de nueva respuesta)
await fetch(`${API_URL}/api/v1/forms/${formId}/subscribe`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    notifyOnNewEntry: true,
    notifyOnResolution: false,
  }),
});

// 3. Silenciar alertas de este formulario
await fetch(`${API_URL}/api/v1/forms/${formId}/subscribe`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${accessToken}` },
});
```








