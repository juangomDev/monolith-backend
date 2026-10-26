# Regla de Inmutabilidad de Pruebas Unitarias y de Integración

## Contexto y Aplicación
Esta regla aplica a todo el código bajo el directorio `tests/` y a cualquier prueba automatizada en este repositorio.

## Directivas Obligatorias
1. **Inmutabilidad Absoluta:**
   - Una vez escritas y validadas, las pruebas en `tests/` son inmutables.
   - Ningún agente o desarrollador puede alterar aserciones, eliminar pruebas o saltarlas (`.skip`) para ocultar regresiones o bugs.
2. **Corrección Orientada al Código:**
   - Ante cualquier fallo de test, la solución siempre es corregir o completar la lógica en `src/`.
3. **Excepción Exclusiva:**
   - Solo se modificará un test existente si el usuario humano solicita de forma inequívoca un cambio en la especificación o comportamiento esperado del endpoint/servicio.
