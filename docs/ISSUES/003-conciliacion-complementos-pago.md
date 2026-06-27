#003 - Conciliación de Complementos de Pago

Prioridad: Alta
Estimación: 4d

Descripción:
Vincular facturas origen con CFDI Tipo P/REP y marcar estado mínimo: COMPLETO, SIN_COMPLEMENTO, COMPLEMENTO_FUERA_DE_PERIODO, UUID_RELACIONADO_NO_ENCONTRADO.

Criterios de aceptación:
- Estado en `ValidationResult` y campo `complementPaymentStatus` con valores enumerados.
- Reporte agregando conteo por estado y ejemplos de conciliación fallida.
- Exportación a Excel con hoja detallada de conciliación.

Tareas sugeridas:
- Implementar matcher por UUIDs y montos entre factura y complemento.
- Definir ventana de periodo para validar "fuera de periodo".
- Añadir tests con fixtures que incluyan casos REP/Tipo P.
