# 📋 Lista de Tareas Pragmática (Lean TODO) - Monolito Backend

> **Objetivo Real:** Recibir imágenes y tablas, guardarlas en disco, registrarlas en PostgreSQL (de Dokploy) y devolverlas por URL corta (`short_code`).  
> **Filosofía:** Cero sobreingeniería. Código directo, limpio y modular (Rutas + Servicios).

---

## 📌 Resumen de Fases

| Fase | Enfoque | Estado |
| :--- | :--- | :---: |
| **Fase 0** | Cimientos, Dependencias y Tipado | ✅ Completado |
| **Fase 1** | Conexión con PostgreSQL en Dokploy y Portero Mínimo | ⏳ Siguiente Paso |
| **Fase 2** | Módulo de Imágenes (Subida a disco, registro y URL corta) | ⏳ Pendiente |
| **Fase 3** | Módulo de Tablas (Subida CSV/XLSX, registro y descarga/consulta) | ⏳ Pendiente |
| **Fase 4** | Ajustes para Despliegue en Dokploy (Dockerfile, volumen y arranque) | ⏳ Pendiente |

---

## 🚀 Fase 0: Cimientos y Dependencias (Completado)
- [x] Configuración de `package.json`, `tsconfig.json` (NodeNext) y scripts de arranque.
- [x] Dependencias instaladas (Fastify, Prisma 6.4, Sharp, ExcelJS, Fast-CSV, Zod, NanoID).
- [x] Esquema Prisma inicial generado.
- [x] Compilación `npm run build` verificada (0 errores).

---

## 🛡️ Fase 1: Conexión con PostgreSQL (Dokploy) y Portero Mínimo
- [x] **1.1** Ajustar `prisma/schema.prisma` a los 3 modelos esenciales (`ApiClient`, `ImageRegistry`, `TableRegistry`) y regenerar cliente.
- [ ] **1.2** Configurar `DATABASE_URL` en `.env` con la cadena de conexión de Dokploy.
- [ ] **1.3** Ejecutar migración inicial contra Dokploy con `npx prisma migrate dev --name init`.
- [x] **1.4** Crear script simple de siembra (`prisma/seed.ts`) para generar una API Key de prueba (`mk_live_dev_test_api_key_12345`).
- [x] **1.5** Implementar `src/gateway/auth.ts`: Middleware/Hook simple para validar la cabecera `X-API-Key`.
- [x] **1.6** Implementar `src/gateway/health.ts`: Endpoint `GET /health` que verifique conexión a Postgres y escritura en `./storage`.

---

## 🖼️ Fase 2: Módulo de Imágenes
- [ ] **2.1** Configurar `POST /api/v1/images`:
  - Recibir `multipart/form-data`.
  - Generar `shortCode` (10 caracteres con `nanoid`).
  - Guardar archivo directamente en `./storage/images/[shortCode].[ext]`.
  - Insertar registro en `ImageRegistry` (nombre original, mime, tamaño, ruta).
  - Responder `{ shortCode, url }`.
- [ ] **2.2** Configurar `GET /i/:short_code`:
  - Buscar registro en base de datos.
  - Servir imagen desde disco con cabeceras `Content-Type` y caché inmutable.
- [ ] **2.3** Configurar `DELETE /api/v1/images/:id`:
  - Eliminar registro de PostgreSQL y borrar archivo físico de `./storage/images/`.

---

## 📊 Fase 3: Módulo de Tablas (CSV / Excel)
- [ ] **3.1** Configurar `POST /api/v1/tables`:
  - Recibir archivo `.csv` o `.xlsx`.
  - Generar `shortCode`.
  - Guardar archivo físico en `./storage/tables/[shortCode].[ext]`.
  - Extraer metadatos básicos (nombres de columnas y conteo de filas).
  - Insertar registro en `TableRegistry`.
  - Responder `{ shortCode, url, rowCount }`.
- [ ] **3.2** Configurar `GET /t/:short_code`:
  - Si incluye `?download=true`, descargar archivo original.
  - Si es consulta normal, devolver datos paginados (ej. primeras 100 filas).
- [ ] **3.3** Configurar `DELETE /api/v1/tables/:id`:
  - Eliminar registro de PostgreSQL y borrar archivo de `./storage/tables/`.

---

## 🚢 Fase 4: Despliegue en Dokploy
- [ ] **4.1** Asegurar que el `Dockerfile` ejecute `npx prisma migrate deploy && node dist/main.js`.
- [ ] **4.2** Verificar permisos del usuario `node` sobre el volumen montado en `/app/storage`.
- [ ] **4.3** Probar flujo completo de subida y lectura en el entorno local antes de subir a Dokploy.
