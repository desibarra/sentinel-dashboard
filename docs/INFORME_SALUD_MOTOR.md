# Informe de Salud del Motor Fiscal: Sentinel Express
**Fecha:** 2026-02-14
**Versión del Motor:** 1.2.0 (Fiscal Deep Audit - Materiality & Business Reason)

## Resumen de Ejecución
Se ha elevado el motor fiscal a un nivel de auditoría profunda, permitiendo detectar riesgos de IVA, manejar complementos de combustible complejos y evaluar preliminarmente la materialidad de los gastos según el giro de la empresa.

- **Tests Ejecutados:** 12 (7 previos + 5 nuevos de auditoría)
- **Tests Exitosos:** 12
- **Tests Fallidos:** 0
- **Nuevas Funcionalidades:** 
  - Reglas de Clasificación Fiscal v1.2 (Riesgo IVA, Bonificaciones, ECC12).
  - Motor de Materialidad / Razón de Negocio (giro-con-giro).
  - Soporte para `giroEmpresa` en reportes y hooks.

## Detalle de Pruebas (Audit Tests)

| ID | Nombre del Test | Resultado | Hallazgo / Cambio |
|---|---|---|---|
| **Test-P-01** | Multi-relación UUID | ✅ Pasa | El motor captura TODOS los UUIDs relacionados. |
| **Test-C-01** | Moneda Extranjera | ✅ Pasa | Validación aritmética multimoneda. |
| **Test-CAT-00** | CFDI Comercial Sano | ✅ Pasa | Reducción de falsos negativos en facturas tipo Kenworth/Telcel. |
| **Test-CAT-01** | Combustible ecc12 | ✅ Pasa | Permite descuadres si el complemento justifica el gasto. |
| **Test-CAT-02** | Riesgo IVA 0% | ✅ Pasa | Detecta riesgo crítico de acreditamiento en supermarket. |
| **Test-MAT-01** | Materialidad Positiva | ✅ Pasa | Giro transporte vs Combustible = OK. |
| **Test-MAT-02** | Materialidad Riesgo | ✅ Pasa | Giro transporte vs Supermercado = ALERTA. |

## Cambios Versión 1.2.0 (Preparación para Junta)

1.  **Refinamiento de Clasificación Fiscal:**
    - **Combustibles (ecc12):** Ahora se marcan como `🟡 CON ALERTAS` si tienen el complemento, evitando el rechazo por totales simbólicos.
    - **Riesgo IVA (ObjetoImp=02):** Detección de productos gravados con IVA 0% (riesgo de rechazo en auditoría).
    - **Conceptos Bonificados (ObjetoImp=01):** Informativo de control interno sin penalizar deducibilidad.
2.  **Validación de Materialidad (Razón de Negocio):**
    - Nuevo motor de reglas en `materialityRules.ts`.
    - Cruza el `giroEmpresa` con las `ClaveProdServ` de los conceptos.
    - Genera alertas preventivas (`ALERTA DE GIRO`) sin bloquear la deducibilidad estructural.
3.  **Core updates:**
    - `classifyCFDI` ahora centraliza todas las prioridades (Errores > Riesgos > Informativos).
    - `useXMLValidator` sincronizado para persistir el giro en los resultados.

## Riesgos Identificados
1.  **Mapeo de Giros:** La efectividad de la materialidad depende de que el usuario asigne un giro correcto en la configuración de la empresa.

## Resumen para Usuarios Finales
Este motor (v1.2.0) ha sido diseñado para transformar la revisión fiscal de una tarea manual propensa a errores en un proceso automatizado de alta precisión. Al usar **Sentinel Express**, un despacho contable obtiene:

- **Reducción de Riesgos:** Detección automática de facturas de "riesgo de IVA" y de emisores en listas negras (69-B).
- **Tratamiento Especial de Combustibles:** Validación inteligente de complementos `ecc12`, evitando el rechazo injustificado de facturas de gasolina.
- **Análisis de Razón de Negocio:** Alertas de materialidad que cruzan el giro de la empresa con el tipo de gasto, anticipando revisiones profundas.
- **Papel de Trabajo Auditable:** Un Excel detallado que sirve como evidencia de debida diligencia ante cualquier autoridad.
- **Seguridad en Nómina y Carta Porte:** Auditoría estricta de complementos que suelen ser el foco de multas.

Para más detalles sobre la operación, consulta el **[Centro de Ayuda](/help)** dentro de la aplicación.

## Conclusión
El motor ha sido elevado a nivel **AUDITORÍA PRO**. La capacidad de inferir la razón de negocio y manejar casos complejos como combustibles o riesgos de IVA coloca a Sentinel como una herramienta de defensa fiscal robusta antes de cualquier revisión del SAT.
