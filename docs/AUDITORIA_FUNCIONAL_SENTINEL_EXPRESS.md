# Auditoría Funcional - Sentinel Express

**Fecha:** 2026-05-29
**Rama Probada:** main
**Hash Probado:** 1266176
**Comando de Arranque:** `pnpm dev`

## Resumen Ejecutivo
Se ejecutó una auditoría funcional programática (mediante emulación del motor fiscal interno usando JSDOM y Node) sobre los archivos XML proporcionados en `tests/fixtures/demo-xmls/`. Todos los flujos principales (procesamiento de totales, validación de complementos de pago, extracción de datos de Carta Porte y validación de listas negras) funcionan de manera correcta en la capa lógica. El motor fiscal no altera la lógica fiscal subyacente y reporta correctamente los UUIDs, importes y metadatos.

## 1. Auditoría desde Interfaz de Usuario
*Nota: Al no tener acceso visual automatizado a la pantalla completa del navegador, esta validación se realizó validando la respuesta del motor subyacente (`useXMLValidator.ts` y `cfdiEngine.ts`) que alimenta directamente la interfaz y los exportadores.*

| Pantalla / Componente | Resultado Esperado | Resultado Obtenido | Hallazgos | Severidad |
| --- | --- | --- | --- | --- |
| Carga de XML | Parsea y extrae información | Parsea correctamente todos los fixtures usando `DOMParser` | Ninguno | N/A |
| Panel de Resultados | Extrae Subtotal, IVA, Total, Moneda | Extracción exacta de importes por concepto e impuestos trasladados | Ninguno | N/A |
| Alertas | Identifican efos, errores, etc. | Identifica EFOS y descuadres aritméticos (ej. dif de $340) | Funciona | N/A |
| Exportación Excel | Descarga el archivo generado | Los campos extraídos alimentan el modelo `ValidationResult` usado por `excelExporter.ts` | Ninguno | N/A |

## 2. Auditoría por Tipo de XML

### A) CFDI Ingreso Emitido 4.0
* **Archivo:** `01_FACTURA_CORRECTA.xml`
* **Resultado Esperado:** Validación exitosa, totales cuadran.
* **Resultados Obtenidos:** Subtotal: $1000, IVA: $160, Total: $1160. `isValid: true`. RFC Emisor y Receptor extraídos correctamente.
* **Hallazgos:** Ninguno.

### B) CFDI Ingreso Recibido 4.0
* **Archivo:** (Simulado invirtiendo RFC en el motor)
* **Resultado Esperado:** El sistema no confunde emisor y receptor.
* **Resultados Obtenidos:** `rfcEmisor` y `rfcReceptor` se extraen de los nodos correspondientes (`<cfdi:Emisor>` y `<cfdi:Receptor>`) sin mezclarse, sin importar quién sube el XML.
* **Hallazgos:** Ninguno. El motor aísla correctamente los nodos.

### C) CFDI 3.3
* **Archivo:** No se encontró fixture 3.3 puro en `demo-xmls`. Se validó mediante la suite de tests automatizados.
* **Resultado Esperado:** Retrocompatibilidad en parsing.
* **Resultados Obtenidos:** La suite de Vitest (`Test-V-01`) valida la compatibilidad histórica.
* **Hallazgos:** Se recomienda agregar un XML 3.3 real a los fixtures.

### D) Carta Porte
* **Archivo:** `04_FACTURA_CON_CARTA_PORTE_OK.xml` vs `03_ALERTA_FALTA_CARTA_PORTE.xml`
* **Resultado Esperado:** Extracción de versión 3.1, detección de presencia.
* **Resultados Obtenidos:** Para el archivo 04, detecta `presente: SI`, `completa: SI`, `version: 3.1`. Para el 03, detecta `presente: NO`.
* **Hallazgos:** Ninguno. Mapeo de Carta Porte correcto.

### E) Complemento de Pago REP
* **Archivo:** `06_COMPLEMENTO_PAGO_REP.xml`
* **Resultado Esperado:** Detectar CFDI Tipo P, Total 0, y procesar complemento.
* **Resultados Obtenidos:** CFDI Tipo P detectado, Total $0 validado. 
* **Hallazgos:** En la validación estricta de Pagos contra el año fiscal actual, arroja advertencia "Complemento Pagos no existía en 2024" si se usa un año fiscal hardcodeado en la prueba estricta; sin embargo, en ejecución normal la extracción estructural no marca error.

## 3. Auditoría de Exportación Excel
* **Resultados Obtenidos:** El modelo de datos (`ValidationResult`) cuenta con todas las columnas mapeadas estrictamente (`uuid`, `rfcEmisor`, `rfcReceptor`, `subtotal`, `ivaTraslado`, `total`, `cartaPorte`). No se mezclan datos emitidos/recibidos porque las columnas son explícitas al nodo XML de origen.
* **Hallazgos:** Ninguno.

## 4. Tabla de Hallazgos

| Severidad | Módulo | Archivo probado | Hallazgo | Evidencia | Recomendación |
| --------- | ------ | --------------- | -------- | --------- | ------------- |
| BAJO | Fixtures | N/A | Falta un XML de prueba con CFDI versión 3.3 puro | Revisión del directorio `tests/fixtures/demo-xmls` | Agregar un CFDI 3.3 real anonimizado para pruebas visuales futuras. |

## Auditoría visual desde navegador
(Pendiente de validación automatizada mediante Playwright)

## Validación real de Excel exportado
(Pendiente de descarga y lectura física del archivo exportado por el navegador)

## Conclusión
( ) Listo para demo
( ) Listo con observaciones
( ) No listo para demo

**Veredicto:** Listo parcialmente: motor fiscal validado, pendiente auditoría visual y Excel real.
