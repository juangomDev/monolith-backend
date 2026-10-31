# 🛡️ Regla de Monitoreo Proactivo de Seguridad y Arquitectura

## Contexto y Ámbito de Aplicación
Esta regla es de cumplimiento estricto para todo agente IA o desarrollador que trabaje en este repositorio. Aplica al finalizar cualquier fase de desarrollo, gran actualización, refactorización o lote de cambios importantes.

---

## 📋 Checklist de Validación Post-Actualización (Obligatorio)

Tras realizar modificaciones significativas o antes de dar por cerrada cualquier tarea/fase, el agente DEBE evaluar proactivamente los siguientes vectores:

### 1. Auditoría de Dependencias (`npm audit`)
- **Acción:** Ejecutar `npm audit`.
- **Criterio:** Debe arrojar **0 vulnerabilidades**.
- **Alerta:** Si tras instalar o actualizar librerías se detectan vulnerabilidades moderadas, altas o críticas, el agente **DEBE alertar de inmediato al usuario** y proponer la mitigación pragmática (vía `overrides` en `package.json` o actualización puntual de la dependencia).

### 2. Autenticación y Credenciales Seguras
- **Vigencia de Tokens:** Verificar que los `accessToken` mantengan un ciclo de vida corto (`15m` en `fastifyJwt`). La persistencia prolongada de sesión (7 días) pertenece exclusivamente al `refreshToken` en cookie `HttpOnly` y `SameSite: Strict`.
- **Anti-Fuerza Bruta:** Asegurar que `/api/v1/auth/login` y cualquier nuevo endpoint de autenticación conserve su limitador de tasa estricto (máximo 5 intentos/minuto por IP/usuario).
- **Protección de Secretos:** Verificar que `src/config/env.ts` continúe impidiendo contraseñas o secretos por defecto cuando `NODE_ENV=production`.

### 3. Ingesta Segura de Archivos (Anti-Traversal & Anti-Malware)
- **Magic Bytes Reales:** Ningún nuevo endpoint de carga de archivos debe confiar en la cabecera `Content-Type` del cliente ni en la extensión declarada. Debe validar los primeros bytes con `file-type` (`file-guard.ts`).
- **Nombres de Archivo Seguros:** Jamás usar el nombre provisto por el usuario (`part.filename`) para escribir en el sistema de archivos. Siempre almacenar bajo identificadores únicos opacos (`${shortCode}${ext}`).
- **Limpieza de Temporales:** Garantizar que si un archivo excede el tamaño límite (`part.file.truncated`) o falla la validación, el archivo en disco sea destruido de inmediato con `fs.unlink`.

### 4. Semáforo de Riesgos a Futuro (Gatillos Operativos)
El agente debe vigilar los siguientes 5 escenarios y responder alertando al usuario cuando se cumpla su condición de activación:
1. **Saturación o Clúster de Almacenamiento:** Si se proyecta desplegar múltiples contenedores o el volumen `./storage` crece exponencialmente, avisar para migrar a S3 / Cloudflare R2 / MinIO desacoplado.
2. **Bloqueo del Event Loop por Datasets:** Si se implementa procesamiento de CSV/Excel mayores a 30MB (>100.000 filas), alertar sobre la necesidad de procesamiento por chunks o `worker_threads` nativos.
3. **Tráfico Público Masivo:** Si se crean nuevas rutas públicas de entrega, verificar que cuenten con cabeceras `Cache-Control: public, max-age=31536000, immutable` para delegar la carga al CDN/proxy.
4. **Pool de Conexiones PostgreSQL:** Si se añaden operaciones batch concurrentes o reportes pesados, verificar que `connection_limit` en `DATABASE_URL` esté dimensionado adecuadamente.
5. **Inyección en CSV/Excel:** Al generar descargas binarias de tablas creadas por usuarios, verificar que celdas que inicien con `=`, `+`, `-`, `@` sean neutralizadas para proteger a usuarios que abran el archivo en Microsoft Excel local.

---

## 📢 Protocolo de Notificación al Usuario
Si durante o después de los cambios se identifica un problema en cualquiera de los puntos anteriores, **el agente NO debe guardar silencio ni postergarlo**. Debe incluir en su respuesta un aviso claro con:
1. El riesgo detectado y por qué se convirtió en un problema.
2. La solución mínima y directa (sin sobreingeniería) recomendada.
