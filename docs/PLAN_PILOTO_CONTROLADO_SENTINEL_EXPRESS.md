# Plan Piloto Controlado - Sentinel Express

*Este documento establece las reglas y alcances para ejecutar pruebas de concepto (PoC) con prospectos reales.*

## Objetivo del Piloto
Demostrar empíricamente el valor de extracción y tabulación de Sentinel Express utilizando una muestra real de los datos del prospecto, sin prometer un pase a producción masiva ni un dictamen fiscal definitivo.

## Duración Sugerida
* **Prueba en Vivo (Recomendada):** Durante una videollamada de 30-45 minutos. Se procesan los datos en vivo en el entorno de demostración, se genera el Excel y se revisa junto con el cliente.
* **Evaluación Asíncrona (Opcional):** Máximo 3 días hábiles si el cliente pide revisar el Excel generado por su cuenta.

## Cantidad Máxima de XMLs por Piloto Inicial
* Mínimo: 10 XMLs.
* **Máximo:** 100 a 200 XMLs. (No procesar miles de documentos, se trata de una prueba de concepto cualitativa, no de una auditoría masiva gratuita).

## Tipo de XMLs Aceptados
* CFDI 4.0 de Ingresos (Facturas regulares).
* Complemento de Recepción de Pagos (REP 2.0).
* Facturas con Carta Porte (2.0 y 3.0/3.1).

## Exclusiones (NO procesar ni prometer)
* Egresos (Notas de crédito), Traslados puros, y recibos de Nómina.
* Comprobantes anteriores a 2022 (CFDI 3.3, 3.2).
* Comprobantes en divisas complejas, tasa 0% con reglas exóticas o retenciones especiales.

## Manejo de Información Sensible y Checklist de Seguridad
Antes de recibir o procesar XMLs reales del prospecto, se debe:
- [ ] **Firmar NDA:** Asegurar que exista un Acuerdo de Confidencialidad firmado si los archivos salen del equipo del cliente.
- [ ] **Procesamiento Local:** Idealmente, realizar la extracción compartiendo pantalla y corriendo Sentinel Express de manera local para que los datos nunca salgan de la red segura.
- [ ] **No retención de datos:** Asegurarse de eliminar los XMLs de prueba y el Excel resultante del entorno de demostración tras la sesión.

## Entregable Final del Piloto
El prospecto recibirá:
1. Una presentación de los resultados en el Dashboard (conteo, errores detectados, alertas).
2. **El Archivo Excel generado** (`.xlsx`) correspondiente a su muestra, para que su equipo (auditores/contadores) lo revise a detalle y valide la calidad de la extracción.

## Criterios para Convertirse en Cliente
El prospecto califica para avanzar a una propuesta comercial si:
* El Excel cubre sus necesidades operativas de extracción.
* Comprende y acepta que Sentinel Express es una herramienta de apoyo y **no** un sustituto del contador.
* Su volumen operativo está concentrado en el alcance certificado (CFDI 4.0, REP y Carta Porte).
* No requiere implementaciones retroactivas pesadas (2010-2021) de forma inmediata.
