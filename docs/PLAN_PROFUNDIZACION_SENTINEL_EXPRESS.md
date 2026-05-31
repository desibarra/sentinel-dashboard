# Plan Técnico de Profundización - Sentinel Express

**Estado Base Actual:** `AUTORIZADO_DEMO_CONTROLADA_CON_OBSERVACIONES`
**Principio Rector:** Arquitectura de crecimiento modular. Ningún desarrollo nuevo debe alterar, bloquear o corromper el núcleo certificado actual. Cada módulo se desarrollará, probará y certificará de manera aislada antes de integrarse al flujo principal.

---

## Módulo 1: REP Avanzado (Conciliación PPD)

*   **Objetivo:** Desarrollar la capacidad de realizar un cruce matemático e histórico entre las facturas de origen (PPD) y sus complementos de pago asociados (REP), calculando saldos y detectando anomalías.
*   **Valor para el usuario:** Permite auditar la cobranza/pagos reales, detectar pagos huérfanos, saldos insolutos incorrectos y pagos que exceden el valor de la factura, ahorrando días de conciliación manual.
*   **Archivos probablemente involucrados:** `cfdiEngine.ts` (nueva función `conciliarCadenaREP`), `excelExporter.ts` (nueva pestaña de conciliación), `useXMLValidator.ts`.
*   **Riesgos de romper el sistema actual:** El cruce requiere mantener estado entre múltiples XMLs (la factura origen puede procesarse antes o después del REP). Si no se maneja bien la memoria, puede saturar el navegador al procesar miles de XMLs.
*   **Estrategia para aislar el módulo:** Crear un "Indexador de UUIDs" en memoria. El núcleo actual seguirá extrayendo datos documento por documento. El indexador correrá en una segunda pasada opcional solo si el usuario activa "Auditoría Profunda de Pagos".
*   **XMLs mínimos necesarios para certificar:** 50 facturas PPD, 80 REPs asociados (incluyendo casos de 1 REP a múltiples facturas, y múltiples REPs a 1 factura), 10 REPs huérfanos, 5 pagos duplicados/excedidos.
*   **Pruebas necesarias:** Test unitarios de cálculo de parcialidades (`saldo_anterior - importe_pagado = saldo_insoluto`). Stress test de memoria cruzando 5,000 UUIDs.
*   **Criterio de aprobación:** El sistema empareja el 100% de la cadena, cuadra los centavos y no altera la lectura actual de Ingresos.
*   **Estado recomendado:** `NO_INICIADO`

---

## Módulo 2: Emitidos vs Recibidos (Identidad Base)

*   **Objetivo:** Identificar automáticamente quién es el "Contribuyente Base" del lote de XMLs para separar contablemente los Ingresos (Emitidos) de las Deducciones (Recibidos).
*   **Valor para el usuario:** Evita mezclar peras con manzanas. Permite generar un Estado de Resultados preliminar y separar el IVA trasladado del acreditable.
*   **Archivos probablemente involucrados:** `cfdiEngine.ts` (nueva heurística `detectarRFCBase`), `excelExporter.ts` (separación de flujos en pestañas).
*   **Riesgos de romper el sistema actual:** Un error en la heurística clasificaría mal el 100% de los documentos. Actualmente, el sistema tabula los RFCs pero no toma partido.
*   **Estrategia para aislar el módulo:** La función de detección de RFC Base se calculará independientemente analizando la moda (el RFC que más se repite como emisor o receptor). Si la certeza es baja, pedirá confirmación al usuario en la UI antes de separar los reportes.
*   **XMLs mínimos necesarios para certificar:** 5 lotes mixtos de 100 XMLs cada uno (70% emitidos, 30% recibidos; 99% recibidos, 1% emitidos, etc.).
*   **Pruebas necesarias:** Test de la heurística de conteo de RFCs. Test de validación de UI para confirmación del contribuyente.
*   **Criterio de aprobación:** Separación 100% precisa en pestañas "Emitidos" y "Recibidos" en el Excel.
*   **Estado recomendado:** `NO_INICIADO`

---

## Módulo 3: Tipos CFDI Pendientes y Borde

*   **Objetivo:** Soportar la extracción profunda y reglas de validación para Egresos (Notas de Crédito), Traslados, Nómina, y casos borde (Tasa 0%, Exentos, Retenciones, Moneda extranjera).
*   **Valor para el usuario:** Entregar un diagnóstico fiscal verdaderamente integral, permitiendo auditar ISR, IEPS, retenciones de fletes y deducciones de nómina.
*   **Archivos probablemente involucrados:** `cfdiEngine.ts` (nuevos validadores `validateEgreso`, `validateNomina`), `excelExporter.ts` (pestañas dedicadas).
*   **Riesgos de romper el sistema actual:** Las reglas para estos comprobantes son radicalmente distintas (ej. Nómina usa complementos enormes, Egreso resta al ingreso). Integrar esta lógica en el validador principal podría generar falsos positivos en las validaciones de Ingresos.
*   **Estrategia para aislar el módulo:** Implementar el patrón `Strategy` para el parseo de XML. Según el `TipoDeComprobante`, se instanciará una clase de validación específica que no contamine la lógica probada de CFDI 4.0 Ingresos.
*   **XMLs mínimos necesarios para certificar:** 30 Notas de crédito, 20 Traslados, 50 Recibos de Nómina, 20 XMLs en USD/EUR, 20 con Tasa 0%/Exentos, 20 con Retenciones.
*   **Pruebas necesarias:** Validación estricta del tipo de cambio, suma algebraica correcta (Ingresos - Egresos), y tabulación de impuestos locales/retenidos.
*   **Criterio de aprobación:** Procesamiento limpio sin afectar la velocidad del núcleo y sin falsas alertas en facturas normales.
*   **Estado recomendado:** `NO_INICIADO`

---

## Módulo 4: Excel Profesional de Auditoría

*   **Objetivo:** Reestructurar la salida actual hacia un formato de Dictamen Ejecutivo, con múltiples hojas cruzadas y tablas dinámicas pre-armadas.
*   **Valor para el usuario:** Convertir el exportable actual de un "volcado de datos" a una "herramienta de inteligencia de negocios", lista para entregar al director de finanzas o dueño de la empresa.
*   **Archivos probablemente involucrados:** `excelExporter.ts`, nueva carpeta `templates/` para posibles plantillas.
*   **Riesgos de romper el sistema actual:** Aumentar masivamente el uso de RAM al generar archivos Excel muy complejos con fórmulas y múltiples pestañas, provocando *crashes* en el navegador del usuario.
*   **Estrategia para aislar el módulo:** Mantener el exportador actual como "Exportación Rápida" (CSV/Plano) y crear una nueva ruta "Generar Dictamen Completo" que utilice *Web Workers* para no congelar la UI durante la generación.
*   **XMLs mínimos necesarios para certificar:** Lote de estrés de 10,000 XMLs variados.
*   **Pruebas necesarias:** Perfilado de memoria (Memory Profiling) durante la exportación. Validación de fórmulas (que no se rompan las referencias en Excel).
*   **Criterio de aprobación:** El archivo Excel se genera en menos de 10 segundos, no congela la pantalla, e incluye: Resumen Ejecutivo, CFDI procesados, Errores críticos, Alertas, REP, Carta Porte, EFOS, Emitidos, Recibidos, Diferencias y Pendientes.
*   **Estado recomendado:** `NO_INICIADO`

---

## Módulo 5: Integración SAT Futura

*   **Objetivo:** Conectar el sistema a servicios web del SAT (o PACs) para descargar listas EFOS diarias, validar el estatus de cancelación en tiempo real y actualizar catálogos automáticamente.
*   **Valor para el usuario:** Certeza jurídica del 100%. Un XML estructuralmente correcto puede estar cancelado en el SAT; esta integración detectaría ese riesgo masivo.
*   **Archivos probablemente involucrados:** `server/` (nuevos endpoints API), `client/src/services/` (conexión API).
*   **Riesgos de romper el sistema actual:** Es el módulo más peligroso. Implica latencia de red, caídas del SAT, manejo de firmas electrónicas (FIEL), riesgos de ciberseguridad, y convierte la app de "local/offline" a dependiente de la nube.
*   **Estrategia para aislar el módulo:** Arquitectura de microservicios. Sentinel Express seguirá siendo 100% funcional offline. La validación en línea será un "Enriquecimiento" asíncrono secundario.
*   **XMLs mínimos necesarios para certificar:** 100 XMLs (50 vigentes, 50 cancelados en diferentes estados de aceptación).
*   **Pruebas necesarias:** Penetration testing, manejo de timeouts del SAT, rate-limiting (protección contra bloqueos de IP por parte del SAT).
*   **Criterio de aprobación:** El sistema no falla si el SAT está caído, simplemente notifica "Validación online no disponible", manteniendo la extracción local intacta.
*   **Estado recomendado:** `NO_INICIADO`

---

## Recomendación Ejecutiva de Implementación

Para maximizar el retorno de inversión comercial, mitigar riesgos técnicos y aprovechar la inercia de la Demo Controlada, el orden estricto sugerido es:

1.  **Módulo 2 (Emitidos vs Recibidos):** Es el más fácil de aislar y aporta un valor comercial inmediato gigante. Permite al usuario ver un "Estado de Resultados" rápido. Requiere bajo esfuerzo técnico.
2.  **Módulo 4 (Excel Profesional):** Con los datos separados del Módulo 2, mejorar el Excel garantiza un factor "WOW" en las demos y empuja el cierre de ventas sin tocar la validación fiscal pura.
3.  **Módulo 1 (REP Avanzado):** Altamente demandado por departamentos de cobranza. Tiene complejidad técnica media/alta, pero aporta un valor incuestionable para justificar la compra.
4.  **Módulo 3 (Tipos CFDI Pendientes):** Desarrollo laborioso por la cantidad de reglas del SAT. Se debe ir agregando tipo por tipo (primero Egresos, luego Nómina) en "Sprints" separados.
5.  **Módulo 5 (Integración SAT):** Dejar al final. Involucra costos de infraestructura, seguridad (FIEL) y dependencias externas inestables. Requiere madurez legal y de servidores.
