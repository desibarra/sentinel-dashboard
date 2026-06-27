#004 - Reporte Ejecutivo / Semáforo

Prioridad: Alta
Estimación: 2d

Descripción:
Agregar hoja `Resumen` al Excel exportado con semáforo fiscal (Verde/Amarillo/Rojo) y métricas clave.

Criterios de aceptación:
- Hoja `Resumen` incluida en `.XLSX` producido por `excelExporter.ts`.
- Semáforo calculado por reglas configurables.
- Métricas: total CFDI, total IVA acreditable, IVA en revisión, IVA potencialmente no acreditable, CFDI sin complemento, CFDI PUE/PPD con inconsistencias, CFDI cancelados.
- Tests que validen cálculo de semáforo para escenarios representativos.

Tareas sugeridas:
- Extender `excelExporter.ts` para añadir hoja resumen.
- Definir umbrales para semáforo (configurable).
- Añadir ejemplos en `tests/fixtures` y tests que validen contenido del resumen.
