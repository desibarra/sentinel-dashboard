#001 - Auditoría IVA Acreditable

Prioridad: Alta
Estimación: 5d

Descripción:
Detectar CFDI recibidos con riesgo de no acreditabilidad por uso de CFDI, régimen fiscal, método de pago, falta de complemento de pago, datos incompletos o inconsistencias básicas.

Criterios de aceptación:
- Marcar resultado en `ValidationResult` con campo `ivaAcreditableRisk` (boolean) y `ivaAcreditableReason` (string).
- Incluir `ivaAcreditableRule` que documente el criterio técnico aplicado.
- Tests unitarios usando fixtures CFDI 4.0 (y CFDI 3.3 cuando esté disponible).
- Documento de ejemplos en `docs/` con casos positivos/negativos.

Tareas sugeridas:
- Definir lista de reglas iniciales (uso CFDI, régimen, método de pago, ausencia de complemento de pago).
- Implementar validadores en `cfdiEngine.ts`/`useXMLValidator.ts`.
- Añadir tests en `tests/` con fixtures.
