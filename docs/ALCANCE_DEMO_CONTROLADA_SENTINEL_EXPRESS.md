# Alcance y Restricciones - Demo Controlada Sentinel Express

**Versión del Motor:** Opción A (2022-2026)
**Estado:** `AUTORIZADO_DEMO_CONTROLADA_CON_OBSERVACIONES`

Este documento establece las pautas oficiales para realizar demostraciones comerciales de Sentinel Express de forma segura, evitando comprometer a la empresa con funciones fiscales aún no auditadas.

## 1. Lo que SÍ puede demostrarse (Soportado Oficialmente)

Durante la demo, el consultor puede subir lotes de facturas y mostrar con confianza:
- **Procesamiento Masivo de CFDI 4.0:** Lectura rápida y extracción impecable de Facturas de Ingreso (PUE y PPD).
- **Auditoría de Carta Porte:** Detección de presencia, versión y extracción del detalle de vehículos, ubicaciones y mercancías de las versiones recientes.
- **Complementos de Pago (REP 2.0):** Reconocimiento de los nodos de pago y los documentos relacionados que ampara el recibo.
- **Alertas Preventivas EFOS:** Demostración de cómo el sistema detecta RFCs que coinciden con las Listas Negras (69-B) a nivel local.
- **Exportación Forense a Excel:** Descarga en tiempo real del archivo `.xlsx` demostrando cómo se tabula perfectamente toda la inteligencia extraída (UUID, Totales, RFCS y complementos).

## 2. Lo que NO debe prometerse (Fuera de Alcance Demo)

El consultor **debe evitar activamente** mencionar, mostrar o aceptar compromisos relacionados con:
- Auditorías retroactivas del periodo **2010 a 2021** (CFDI 3.2 y 3.3).
- Procesamiento avanzado de Egresos (Notas de crédito), Nóminas o Traslados.
- Cálculos automáticos de conciliación contable internacional (Monedas extranjeras).
- Determinación de impuestos complejos (Retenciones de fletes, ISR, o deducciones exclusivas de Tasa 0%).
- *Matching* automático entre un REP y la Factura Original PPD para cuadrar saldos insolutos exactos (Actualmente el motor extrae el REP, pero no valida el saldo histórico en base de datos).

## 3. Límites de Responsabilidad y Disclaimer Legal

Es de carácter obligatorio que durante cualquier presentación se transmita verbalmente y/o por escrito que:
> **"Sentinel Express es una herramienta tecnológica de extracción forense y apoyo para auditoría administrativa. Los semáforos, alertas y observaciones mostrados (incluyendo EFOS y cuadres de totales) tienen fines informativos y no constituyen un dictamen legal, jurídico o contable definitivo."**

Especialmente con respecto a las alertas de EFOS (Listas Negras), el sistema solo advierte de la coincidencia del RFC; la presunción de operaciones inexistentes es facultad exclusiva del SAT y debe desvirtuarse por los canales oficiales.

## 4. Checklist para una Demo Segura

Para evitar fallos en vivo y garantizar la mejor experiencia, el presentador debe cumplir este checklist antes de la sesión:

- [ ] **Selección del Lote:** Preparar un archivo `.zip` que contenga entre 10 y 100 XMLs del año 2022 en adelante.
- [ ] **Limpieza de Tipos:** Asegurarse de que el lote demo *no* incluya recibos de nómina (`TipoComprobante="N"`).
- [ ] **Inclusión de Valores:** Garantizar que el lote incluye al menos un comprobante con Carta Porte y un REP para mostrar todo el poder del Excel.
- [ ] **Preparar Disclaimer:** Tener a la mano la aclaración de que el análisis jurídico final recae sobre el despacho contable del cliente.
