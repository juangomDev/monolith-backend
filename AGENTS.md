# 📜 Reglas del Proyecto y Guía para Agentes IA (AGENTS.md)

Este repositorio contiene las reglas fundamentales e inviolables para el desarrollo del backend monolítico. **Todo agente IA o desarrollador DEBE respetar estrictamente estas directrices.**

---

## 🛑 REGLAS DE ORO: INMUTABILIDAD Y COBERTURA DE PRUEBAS

### 1. Inmutabilidad de las Pruebas (Frozen Test Contracts)
1. **Las pruebas son la especificación de verdad:** Una vez que una prueba unitaria o de integración es creada y aprobada, queda **CONGELADA E INMUTABLE**.
2. **Prohibición estricta de modificación:** Está **ESTRICTAMENTE PROHIBIDO**:
   - Modificar las aserciones (`assert`, `expect`) para que un test pase.
   - Relajar condiciones, tolerancias o tipos esperados.
   - Comentar tests, eliminarlos o marcarlos con `.skip` o `.todo`.
   - Modificar mocks para falsear el cumplimiento del contrato.
3. **El código se adapta a la prueba, NUNCA la prueba al código:**
   - Si un test falla tras un cambio en la aplicación, **el error está en el código de producción**, jamás en el test.
   - El agente debe investigar, depurar y refactorizar el código de la aplicación hasta que todas las pruebas pasen al 100%.
4. **Única excepción:**
   - La única situación en la que un test puede ser modificado es si el usuario humano **ordena explícitamente y por escrito un cambio de requerimiento de negocio**. Sin esa orden directa, los tests son intocables.

### 2. Cobertura Obligatoria por Cada Nueva Función (No Feature Without Tests)
1. **Pruebas obligatorias por funcionalidad:** Para cada nueva función, servicio, utilidad o ruta/endpoint que se implemente, **es estrictamente obligatorio agregar simultáneamente sus respectivas pruebas unitarias e integradas**.
2. **Cobertura de éxito y error:** Las pruebas de cada nueva función deben verificar tanto el flujo exitoso como los casos límite y manejo de errores (ej. 400, 401, 404, 413, etc.).
3. **Criterio de finalización (Definition of Done):** Ninguna tarea o fase se considera terminada ni aprobada si carece de sus correspondientes pruebas en `tests/`.
4. **Congelación inmediata:** En cuanto las pruebas de la nueva función sean implementadas y aprobadas, pasan inmediatamente a estar congeladas e inmutables bajo la Regla 1.

---

## 🏛️ ARQUITECTURA Y FILOSOFÍA DE DESARROLLO

### 1. Patrón Canónico de Capas (Rutas -> Servicios -> Repositorios)
Todo nuevo módulo (ej. `src/modules/users/`) DEBE seguir estrictamente esta división de responsabilidades:
- `*.repository.ts`: Capa de datos pura con Prisma Client. No debe contener lógica HTTP ni validaciones de negocio complejas.
- `*.service.ts`: Lógica de negocio, validaciones, procesamiento de archivos, hashing de contraseñas, llamadas a repositorios y lanzamiento de `AppError`.
- `*.routes.ts`: Enrutador Fastify, definición de esquemas de entrada, hooks `preHandler` de autenticación/autorización y despacho de respuestas HTTP.
- `tests/modules/[modulo]/`: Pruebas unitarias e integradas obligatorias (`*.service.test.ts`, `*.routes.test.ts`).

### 2. Estándares Técnicos Invariables
- **ESM Nativo (`NodeNext`):** Es **estrictamente obligatorio** incluir la extensión `.js` en todos los imports relativos de TypeScript (ej. `import { db } from './db.js'`).
- **Manejo de Errores RFC 7807:** Todas las excepciones controladas deben lanzar `AppError(status, mensaje, codigo)`. Fastify las captura automáticamente y responde con `ProblemDetails`.
- **Validación Estricta:** Validar entradas con esquemas Zod o comprobaciones explícitas antes de procesar cualquier dato del cliente.
- **Cero sobreingeniería:** Mantener el código directo y legible. Evitar abstracciones innecesarias, patrones Enterprise vacíos o código muerto.

### 3. Modelo de Seguridad y Visibilidad de Recursos
- **Ingesta y Mutación Privadas:** La carga (`POST`) y eliminación (`DELETE`) son siempre privadas y requieren autenticación válida mediante Bearer token JWT (`ADMIN` o `USER`).
- **Entrega Pública por Diseño (`GET /i/:short_code` y `GET /t/:short_code`):**
  - La visualización es pública para permitir incrustar imágenes directamente en etiquetas HTML `<img src="...">`, correos o aplicaciones sin lidiar con cabeceras Bearer.
  - La seguridad se garantiza por **opacidad criptográfica (Capability URLs)**: se generan shortcodes de 10 caracteres Base58 (nanoid, >43 billones de combinaciones) no enumerables ni adivinables por fuerza bruta.
  - Se acompaña de cabeceras de caché inmutable (`Cache-Control: public, max-age=31536000, immutable`).

---

## 🧪 PROTOCOLO DE VALIDACIÓN OBLIGATORIA

Antes de dar por completada cualquier tarea o fase:
1. `npm test`: Todos los tests unitarios e integrados deben pasar con 0 fallos.
2. `npm run build`: La compilación con `tsc` debe finalizar con código de salida 0 y 0 errores de tipado.
