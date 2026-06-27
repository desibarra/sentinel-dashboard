#002 - Reglas PUE vs PPD

Prioridad: Alta
Estimación: 3d

Descripción:
Crear reglas para detectar CFDI emitidos como PUE que no tengan evidencia de cobro en el periodo, y CFDI PPD pagados que no tengan complemento de pago.

Criterios de aceptación:
- Campo `paymentStatus` en `ValidationResult` con valores: `PUE_VALIDO`, `PUE_REVISAR_COBRO`, `PPD_CON_COMPLEMENTO`, `PPD_SIN_COMPLEMENTO`.
- Periodo contable configurable en la UI/params de validación.
- Tests unitarios que cubran cada clasificación.

Tareas sugeridas:
- Implementar reglas en motor de validación que consideren fecha emisión, fecha de cobro detectada y complementos de pago asociados.
- Añadir UI mínima para configurar periodo contable (opcional en primer paso).
