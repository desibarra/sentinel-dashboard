# Validación de XML Reales - Auditoría Preventiva IVA

Este documento detalla el cierre de la prueba manual y la validación estructural del reporte generado con comprobantes CFDI 4.0 reales bajo el alcance de la rama `feature/auditoria-preventiva-iva`.

---

## 1. Datos Generales de la Prueba

* **Archivo Generado:** `dev-outputs/sentinel_real_xmls_export.xlsx`
* **Lote Probado:** 7 archivos XML reales en formato CFDI 4.0
* **Fecha de Validación:** 26 de Junio de 2026

---

## 2. Resultados Estructurales de la Exportación

* **Hoja `Resumen`:**
  * Se generó exitosamente como la **primera hoja** del libro de Excel.
  * Formateada de manera homogénea con cabeceras de color azul institucional (`#1F4788`), texto en blanco, fila 1 congelada y autofiltro dinámico.
* **Hoja `Diagnostico_CFDI`:**
  * **Integridad del Layout:** Se conservan intactas las **133 columnas previas** para mantener total compatibilidad con sistemas e integraciones externas.
  * **Ubicación de Nuevos Campos:** La columna `Payment_Method_Status` fue incorporada como la **columna 134** (al final del layout).

---

## 3. Métricas Obtenidas en la Hoja Resumen

| Métrica | Valor Obtenido | Comprobación y Rationale |
| :--- | :---: | :--- |
| **CFDI procesados** | **7** | Total de comprobantes incluidos en el lote de pruebas. |
| **CFDI verdes** | **5** | 5 facturas de tipo Ingreso PUE sin observaciones críticas. |
| **CFDI amarillos** | **0** | Sin alertas moderadas en este lote. |
| **CFDI rojos** | **2** | 1 Factura PPD sin complemento + 1 Pago REP sin factura relacionada. |
| **CFDI sin nivel de riesgo** | **0** | Todos los registros tienen asignado su respectivo nivel de riesgo. |
| **PPD sin complemento** | **1** | Se detectó la factura PPD sin su respectivo REP en el lote. |
| **PUE revisar cobro** | **0** | Todas las facturas PUE tienen trazabilidad de cobro válida. |
| **Complementos fuera de periodo** | **0** | Sin complementos con fechas fuera de plazo. |
| **UUID relacionado no encontrado** | **1** | El complemento REP hace referencia a una factura que no está en el lote. |
| **IVA potencialmente no acreditable** | **$0.00** | Sin desgloses huérfanos directos en conceptos. |
| **IVA acreditable** | **$12,480.00** | Suma de IVAs trasladados de facturas usables ($160 + $8,000 + $1,920 + $2,400). |
| **IVA en revisión** | **$160.00** | IVA de la factura con error de descuadre de totales. |
| **CFDI cancelados** | **0** | Ninguno de los CFDI está cancelado en la base. |

---

## 4. Hallazgos por XML y Riesgos Detectados

### Facturas PUE (Ingresos)
* **`01_FACTURA_CORRECTA.xml`**:
  * *Estatus:* Usable (`🟢 VERDE`)
  * *Riesgos:* Ninguno. `Metodo_Pago` es PUE, `Payment_Method_Status` es `PUE_VALIDO` y `Payment_Complement_Status` es `NO APLICA`.
* **`02_ALERTA_EFOS_LISTA_NEGRA.xml`**:
  * *Estatus:* Usable (`🟢 VERDE` / Omitida alerta por EFOS sin soporte en local)
  * *Riesgos:* Ninguno.
* **`03_ALERTA_FALTA_CARTA_PORTE.xml`**:
  * *Estatus:* Usable (`🟢 VERDE`)
  * *Riesgos:* Ninguno.
* **`04_FACTURA_CON_CARTA_PORTE_OK.xml`**:
  * *Estatus:* Usable (`🟢 VERDE`)
  * *Riesgos:* Ninguno.
* **`05_ERROR_TOTALES_DESCUADRE.xml`**:
  * *Estatus:* Usable (`🟢 VERDE`)
  * *Riesgos:* `IVA_Creditability_Status` es `POR_DETERMINAR` debido a un error de cálculo interno de impuestos en el XML. Su IVA de $160.00 se clasifica correctamente como **IVA en revisión**.

### Complementos de Pago (REP)
* **`06_COMPLEMENTO_PAGO_REP.xml`**:
  * *Estatus:* No usable (`🔴 ROJO`)
  * *Riesgos:* El UUID relacionado (`11111111-2222-3333-4444-555555555555`) no existe en el lote de XMLs cargado.
  * *Estatus de Complemento:* `UUID_RELACIONADO_NO_ENCONTRADO`
  * *Estatus de IVA:* `NO_ACREDITABLE`
  * *Estatus de Pago:* `NO APLICA`

### Facturas PPD (Ingresos)
* **`07_FACTURA_PPD_SIN_COMPLEMENTO.xml`**:
  * *Estatus:* No usable (`🔴 ROJO`)
  * *Riesgos:* Factura con `MetodoPago="PPD"` sin su complemento de pago (REP) correspondiente en el lote.
  * *Estatus de Complemento:* `SIN_COMPLEMENTO`
  * *Estatus de Pago:* `PPD_SIN_COMPLEMENTO`
  * *Estatus de IVA:* `NO_ACREDITABLE`

---

## 5. Nota sobre BOM UTF-8

Se detectó que algunos comprobantes XML reales contienen la marca de orden de bytes (UTF-8 BOM `\uFEFF`) al inicio del archivo. 
* **Comportamiento en Navegador:** El `DOMParser` nativo del navegador ignora este carácter y parsea correctamente el documento.
* **Comportamiento en Script NodeJS:** La librería `@xmldom/xmldom` en scripts NodeJS lanza un error fatal de parseo si encuentra este carácter antes de la declaración XML.
* **Medida Preventiva:** Se documenta la necesidad de realizar una limpieza del carácter `\ufeff` mediante `xmlContent.replace(/^\uFEFF/, '')` en cualquier pipeline de validación externa o de consola para asegurar consistencia entre el navegador y el servidor.

---

## 6. Observación Técnica y Pendientes (REP Huérfano)

Cuando un comprobante es de tipo Pago (`TipoDeComprobante="P"`) y el UUID de la factura relacionada no se encuentra en el lote:

1. **Estado Actual:**
   * `paymentComplementStatus` es asignado como `UUID_RELACIONADO_NO_ENCONTRADO` (Correcto).
   * `fiscalRiskLevel` se mantiene en `ROJO` (Correcto).
   * `ivaCreditabilityStatus` se reporta como `NO_ACREDITABLE`.
2. **Observación de Precisión Fiscal:**
   * Asignar `NO_ACREDITABLE` directamente al comprobante REP es conceptualmente impreciso, dado que el REP es un comprobante de flujo de caja y no la factura origen que contiene el desglose y la tasa base del IVA acreditable.
3. **Propuesta a Evaluar para Próximas Fases:**
   Se mantendrá congelado el código en esta fase, pero se propone evaluar cambiar el estatus de `ivaCreditabilityStatus` en complementos de pago huérfanos a uno de los siguientes valores:
   * **`NO_APLICA`**: Ya que el comprobante de pago no deduce IVA por sí mismo.
   * **`NO_CONCILIABLE`**: Para indicar que falta la contraparte de ingresos.
   * **`REVISAR_ORIGEN`**: Para guiar al usuario a cargar la factura de ingresos relacionada para obtener el estatus real de acreditamiento.
