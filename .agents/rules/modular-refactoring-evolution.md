# 🏛️ Regla de Evolución Modular y Umbrales de Refactorización Progresiva

## Contexto y Filosofía
En este backend (`Fastify + Prisma + TypeScript + Node.js 22`), la evolución del código ante el crecimiento de un módulo **NUNCA debe ser una reescritura masiva de golpe**, sino un desacoplamiento progresivo por etapas según dónde se concentre el peso.

Esta regla es de cumplimiento estricto para todo agente IA o desarrollador. Aplica cada vez que un archivo o módulo aumente de tamaño o complejidad.

---

## 📐 Matriz de Umbrales y Gatillos de Refactorización

| Etapa | Umbral de Activación (Gatillo) | Acción Arquitectónica | Criterio de Pruebas |
| :--- | :--- | :--- | :--- |
| **Etapa 1: Capas Modulares** | `routes.ts` o `service.ts` > **300 LOC**, o mezcla de I/O técnico (`sharp`, `exceljs`, `fs/promises`). | Extraer a archivos satélite: `*.schemas.ts`, `*.processor.ts`, `*.storage.ts` o `*.parser.ts`. | **0 cambios en firmas públicas y tests.** |
| **Etapa 2: Casos de Uso / CQRS** | `service.ts` > **450 LOC** o acumula **>6 métodos de mutación/consulta complejos**. | Romper el servicio en `use-cases/` individuales (≤80 LOC c/u). Mantener el servicio como Fachada delegada. | **Preservar interfaz pública del Service para 0 roturas en tests.** |
| **Etapa 3: Clean Architecture** | Necesidad de soportar múltiples adaptadores (ej. disco local + S3/MinIO) o entidades con reglas ricas independientes de Prisma. | Crear Puertos (`domain/ports/`), Adaptadores (`infrastructure/`) y Casos de Uso (`application/`). | **Contratos formales de interfaces.** |
| **Etapa 4: Workers Asíncronos** | Datasets de tablas > **30 MB** (>100k filas), imágenes > **25 MB**, o latencia > **1.5s** bloqueando el Event Loop. | Encolar trabajo pesado en segundo plano (`worker_threads` o cola) respondiendo `202 Accepted`. | **Tests de concurrencia y streaming.** |

---

## 🚨 Protocolo de Alerta y Registro Automático en `TODO.md`

Cuando el agente modifique o cree código y detecte que un archivo ha cruzado alguno de los umbrales establecidos, **el agente NO debe guardar silencio ni postergarlo**:

### 1. Notificación Inmediata en el Chat
Debe emitir obligatoriamente en su respuesta el bloque de alerta estructurado:
```markdown
> ### ⚠️ ALERTA DE REFACTORIZACIÓN MODULAR (Etapa [1 | 2 | 3 | 4])
> * **Archivo afectado:** `src/modules/...` ([XXX] líneas)
> * **Umbral superado:** [Excedió las 300/450 líneas | Concentración de I/O técnico | Bloqueo potencial del Event Loop]
> * **Causa del crecimiento:** [Describir qué lógica está engordando el archivo: schemas OpenAPI, manejo de fs, acumulación de métodos...]
> * **Acción desacoplada sugerida:** [Proponer la extracción puntual: ej. extraer `*.storage.ts` o `use-cases/`]
> * **Garantía de tests:** [Confirmar cómo la extracción preservará intactos los tests congelados bajo AGENTS.md]
```

### 2. Registro Automático en `TODO.md` (Persistencia del Backlog)
Para evitar que las advertencias se pierdan al cerrar la sesión o si el usuario decide no abordarlas de inmediato:
1. El agente debe verificar si la tarea de refactorización ya figura en `TODO.md`.
2. Si no figura, el agente la agregará de forma automática y no invasiva con su checkbox `- [ ]`, indicando el archivo, líneas actuales, causa técnica y acción sugerida.
3. De esta forma, la refactorización queda formalmente registrada en el backlog oficial del proyecto para ser ejecutada en el momento oportuno.

---

## 📋 Reglas Específicas por Etapa

### 1. Etapa 1: Extracción de Auxiliares (Paso Inmediato)
* **Contratos OpenAPI:** Todo `*.routes.ts` que supere las 250-300 líneas DEBE extraer sus esquemas Fastify/OpenAPI a un archivo contiguo `*.schemas.ts`. Las rutas deben quedar delgadas (~100-140 líneas) dedicadas únicamente a orquestar la petición HTTP.
* **Procesamiento de Archivos:** Toda manipulación binaria con librerías de terceros (Sharp, ExcelJS, fast-csv) DEBE aislarse en un procesador o parser satélite (`*.processor.ts`, `*.parser.ts`).
* **I/O de Almacenamiento:** Las operaciones directas de escritura, borrado y streams en el sistema de archivos (`createReadStream`, `createWriteStream`, `fs.unlink`, `fs.mkdir`) DEBEN abstraerse en un archivo satélite `*.storage.ts`.
* **Inmutabilidad de Pruebas:** Las extracciones de la Etapa 1 jamás deben modificar la firma pública del servicio ni de las rutas, asegurando que todos los tests existentes pasen al 100% sin modificaciones.

### 2. Etapa 2: Casos de Uso Individuales (Anti-Clase Dios)
* Cuando una entidad requiera múltiples operaciones complejas (`upload`, `replace`, `rename`, `delete`, `list`, `serve`, etc.), cada acción debe vivir en su propio archivo de 40 a 80 líneas dentro de `src/modules/[modulo]/use-cases/` (o `commands/` y `queries/`).
* **Principio de Fachada (Facade Pattern):** La clase `[Modulo]Service` se mantendrá como fachada delgada que delega la ejecución al caso de uso correspondiente. Esto garantiza el cumplimiento estricto de la **Regla 1 de AGENTS.md (Frozen Test Contracts)**, pues los tests que llaman a `imagesService.metodo()` seguirán funcionando intactos.

### 3. Etapa 3: Clean Architecture / Puertos y Adaptadores
* Se activa cuando surja el requerimiento de soportar múltiples destinos de almacenamiento (ej. disco local `./storage` junto con S3, Cloudflare R2 o MinIO) o cuando la lógica de negocio y permisos trascienda a la base de datos.
* Estructura requerida:
  * `domain/`: Entidades y reglas de negocio puras (0 dependencias externas).
  * `domain/ports/`: Interfaces TypeScript de repositorios, almacenamiento y procesadores.
  * `infrastructure/`: Implementaciones concretas (Prisma, Sharp, adaptadores de disco/S3).
  * `application/`: Casos de uso que interactúan únicamente a través de los puertos.

### 4. Etapa 4: Desacoplamiento Asíncrono / Workers
* Se activa cuando el archivo procesado compromete el Event Loop de Node.js (archivos >25MB o tablas >30MB / >100k filas).
* Flujo obligatorio:
  1. La ruta HTTP valida magic bytes y tamaño máximo permitido.
  2. Almacena el stream temporalmente en disco.
  3. Crea el registro en estado `PROCESSING` o `PENDING`.
  4. Responde de inmediato al cliente con `202 Accepted` y el `shortCode`.
  5. Delega la transformación pesada a un `worker_thread` o cola de tareas en segundo plano.
