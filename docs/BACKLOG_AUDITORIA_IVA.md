# Backlog: Auditoría Preventiva de IVA - Sentinel Express

Fecha: 2026-06-26

Objetivo: Convertir a Sentinel Express en una herramienta de auditoría preventiva para contadores, enfocada en detectar riesgos de IVA no acreditable y conciliaciones antes de que ocurran sanciones.

Prioridad y estimaciones (rápidas):

1) Auditoría IVA Acreditable — Prioridad: Alta — Est. 5d
   - Descripción: Reglas que detecten CFDI recibidos con riesgo de no acreditabilidad (uso de CFDI, régimen fiscal, método de pago, falta de complemento, datos incompletos).
   - Criterios de aceptación: Lista de comprobantes con razón de riesgo, explicación técnica y marcado en `ValidationResult`. Tests unitarios con fixtures (incl. 3.3 cuando esté disponible).

2) Reglas PUE vs PPD — Prioridad: Alta — Est. 3d
   - Descripción: Detectar CFDI emitidos PUE sin evidencia de cobro en periodo, y PPD pagados sin complemento.
   - Criterios: Señalización en `ValidationResult`, reglas configurables por periodo contable.

3) Conciliación Complementos de Pago — Prioridad: Alta — Est. 4d
   - Descripción: Vincular facturas origen con CFDI Tipo P/REP y marcar estados: COMPLETO, SIN COMPLEMENTO, COMPLEMENTO FUERA DE PERIODO, UUID RELACIONADO NO ENCONTRADO.
   - Criterios: Reporte con conteo por estado y ejemplos de conciliación fallida.

4) Módulo Conciliación Bancaria — Prioridad: Media — Est. 6d
   - Descripción: Cruce entre CFDI y estados de cuenta por RFC, fecha, monto, referencia y UUID cuando exista.
   - Criterios: Mecanismo de ingestión de CSV/OFX sencillo y primer matcher por RFC+importe+fecha.

5) DIOT Automática — Prioridad: Media — Est. 5d
   - Descripción: Estructura y exportador para DIOT separando IVA acreditable/no acreditable, tasas (16%, 0%), exento, no objeto, proveedor nacional/extranjero y operaciones sin XML.
   - Criterios: Generador preliminar de CSV/XLSX con campos DIOT y ejemplo con fixtures.

6) Reporte ejecutivo (Semáforo) — Prioridad: Alta — Est. 2d
   - Descripción: Añadir hoja resumen al Excel exportado con semáforo (Verde/Amarillo/Rojo) y métricas clave (totales IVA, cuentas afectadas).
   - Criterios: Hoja `Resumen` en el `.XLSX` generado por `excelExporter.ts` y tests que validen semáforo por reglas.

Tareas técnicas pendientes (rápida):
- Agregar fixture real CFDI 3.3 — Est. 0.5d
- Validar físicamente el Excel exportado — Est. 0.5d
- Pruebas Playwright para flujo visual — Est. 3d
- Revisar y eliminar hardcode de año en validación de Complemento de Pagos — Est. 0.5d
- Medir latencia SAT SOAP para alto volumen — Est. 2d

Siguientes pasos recomendados (primer sprint, 10 días):
- Sprint Day 1–2: Implementar reglas básicas de Auditoría IVA Acreditable y agregar fixtures (3.3). (IDs: `Auditoría IVA Acreditable`, `Agregar fixture CFDI 3.3`)
- Sprint Day 3–5: Reglas PUE vs PPD y Conciliación Complementos de Pago (marcar en `ValidationResult`).
- Sprint Day 6–8: Implementar hoja `Resumen` en exportador Excel y pruebas unitarias.
- Sprint Day 9–10: Ingestión básica de estados de cuenta y primer matcher bancario; medir latencias SAT SOAP.

Notas:
- Integrar estos cambios en la rama de feature con PRs pequeños y tests unitarios. Referenciar `docs/AUDITORIA_FUNCIONAL_SENTINEL_EXPRESS.md` para criterios ya validados.
- Si quieres, creo los issues/PR templates y los primeros archivos de PR/issue en el repo.
