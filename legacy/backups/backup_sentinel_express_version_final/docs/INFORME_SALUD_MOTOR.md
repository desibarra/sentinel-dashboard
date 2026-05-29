# Informe de Salud del Motor Fiscal: Sentinel Express
**Fecha:** 2026-02-14
**Versión del Motor:** 1.2.1 (Fiscal Audit Refinement - Smart IVA Risk)

## Resumen de Ejecución
Se ha refinado la lógica de Riesgo IVA para distinguir entre consumo general riesgoso y servicios exentos legítimos (Educación/Salud), eliminando falsas alertas en colegiaturas y gastos médicos.

- **Tests Ejecutados:** 15 (7 previos + 8 de auditoría profunda)
- **Tests Exitosos:** 15
- **Tests Fallidos:** 0
- **Nuevas Funcionalidades:** 
  - Reglas de Clasificación Fiscal v1.2.1 (Refinamiento Smart IVA).
  - Discriminación por Nombre de Emisor y ClaveProdServ para rubros exentos.
  - Motor de Materialidad / Razón de Negocio (v1.2.0).

## Detalle de Pruebas (Audit Tests)

| ID | Nombre del Test | Resultado | Hallazgo / Cambio |
|---|---|---|---|
| **Test-CAT-02** | Riesgo IVA 0% (Comercial) | ✅ Pasa | Detecta riesgo en supermercados/tiendas. |
| **Test-IVA-01** | Riesgo IVA (Soriana) | ✅ Pasa | Confirma rojo en consumo general. |
| **Test-IVA-02** | Exento IVA (Educación) | ✅ Pasa | Confirma verde en colegiaturas (ObjetoImp=02). |

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
