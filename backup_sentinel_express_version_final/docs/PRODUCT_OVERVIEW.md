# 🚀 Sentinel Express - Product Overview

## 1. ¿Qué es Sentinel Express?
Sentinel Express es una plataforma web inteligente diseñada para analizar masivamente **facturas electrónicas CFDI del SAT**. Actúa como una capa protectora pre-auditoría, evaluando cada factura para detectar inconsistencias fiscales, errores estructurales y riesgos de cumplimiento (como proveedores en listas EFOS) en tiempo real y **antes de que el SAT notifique o penalice al contribuyente**.

A diferencia de las herramientas contables convencionales, su motor de validación se ejecuta en un diseño *Serverless Frontend-first*, donde la lectura y procesamiento de los miles de archivos XML ocurren nativamente en el navegador del usuario para asegurar un cumplimiento de **Privacidad 100% Zero-Knowledge**.

---

## 2. El Problema que Resuelve
La validación fiscal en México (CFDI 4.0) contiene cientos de nodos, cálculos cruzados y reglas complejas. 

**Problemas actuales:**
1. **Auditorías reactivas**: Los despachos y empresas descubren los problemas cuando el SAT ya rechazó la deducción o impuso multas.
2. **Proveedores en Listas Negras (EFOS)**: Aceptar una factura apócrifa o de una "empresa fantasma" puede llevar a consecuencias penales si no se detecta y revierte inmediatamente.
3. **Validación manual o prohibitiva**: Validar grandes volúmenes de XML toma horas de trabajo humano, y las herramientas empresariales requieren instalaciones complejas de ERPs y licencias costosas.

**Consecuencias mitigadas:**
- Rechazos de deducciones y devoluciones de IVA.
- Multas por Complementos de Carta Porte mal estructurados.
- Detección tardía de facturas canceladas en el portal del SAT.

---

## 3. Propuesta de Valor y Ventajas Competitivas
> *"Sube tus facturas del mes. En minutos sabes cuáles son un problema para el SAT — antes de que el SAT lo sepa."*

* **Velocidad sin fricción**: Procesa de **1,000 a 10,000 archivos XML** en cuestión de segundos mediante concurrencia web.
* **Privacidad Absoluta**: Los XML **nunca se suben al servidor**. El motor decodificador parsea la data directamente en el cliente (navegador).
* **Diagnóstico "Actionable"**: No solo dice "Válido/Inválido". Un **semáforo intuitivo** devuelve un diagnóstico con la *Causa Raíz* exacta del problema (ej. "Tasa de ISR retenido incompatible con régimen").
* **Exportabilidad Operativa**: Traduce miles de nodos abstractos en reportes Excel condensados y organizados para contadores, auditores o CFOs.

---

## 4. Segmentos de Clientes
1. **Despachos Contables (Prioridad)**: Para contadores que necesitan revisar decenas de empresas cliente simultáneamente a final de mes. Multiplica su eficiencia.
2. **CFOs, Controllers y Auditores**: Perfiles directivos en empresas medianas/grandes, que buscan herramientas de control preventivo rápido (auditoría interna).
3. **Transportistas y Logística**: Responsables de operaciones que tienen que lidiar con el alto rigor técnico de las validaciones de Carta Porte y Traslados.

---

## 5. El Flujo Central del Usuario
1. **Acceso Seguro**: El usuario entra mediante un *Token URL Mágico* o cuenta premium. Sin configuraciones previas ni 2FA invasivos iniciales.
2. **Carga Drag-and-Drop**: Arrastra su carpeta de miles de XML directamente al tablero.
3. **Engine Evaluation**: El algoritmo asíncrono analiza:
   - Cadena Original, Sellos, Algoritmos RSA.
   - Listas Negras (Listado 69-B del SAT consolidado).
   - Matemáticas del Impuesto (sumatorias base vs tasas locales o federales).
4. **Respuesta Rápida**: El semáforo muestra de forma interactiva (Verde / Amarillo / Rojo).
5. **Decisión**: El usuario filtra resultados visuales (Soft Delete), hace consultas Proxy directo al portal SAT para verificar si el CFDI fue cancelado, y exporta resoluciones.
