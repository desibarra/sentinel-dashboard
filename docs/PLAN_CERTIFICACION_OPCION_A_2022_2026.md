# Plan de Certificación - Opción A: Alcance Moderno 2022-2026

## 1. Objetivo
Validar empíricamente el motor de `sentinel-express-pro` utilizando exclusivamente reglas y comprobantes del periodo 2022-2026 (CFDI 4.0 principalmente, junto con Carta Porte y Complemento de Pagos recientes). El objetivo final de esta certificación **no es liberar a producción general**, sino alcanzar un estado de **AUTORIZADO_DEMO_CONTROLADA**.

## 2. Estado Actual
**Estado:** `NO_AUTORIZADO_PRODUCCION`
**Nota Oficial:** *Motor fiscal parcialmente validado para demo controlada 2022-2026. Pendiente certificación empírica.*

## 3. Alcance y Corpus Mínimo Requerido (100 XMLs)
Se deberá consolidar un corpus de al menos 100 XMLs reales o representativos que cumplan con la siguiente taxonomía:
- [ ] CFDI de Ingreso 4.0 (Emitidos y Recibidos).
- [ ] CFDI de Egreso (Notas de Crédito).
- [ ] CFDI de Traslado.
- [ ] CFDI con Complemento de Recepción de Pagos (REP 2.0).
- [ ] CFDI PPD (Pago en Parcialidades o Diferido) con su respectivo REP relacionado.
- [ ] CFDI con Carta Porte (Versiones 2.0, 3.0 o 3.1).
- [ ] CFDI con Moneda Extranjera (ej. USD, EUR).
- [ ] CFDI con Tasa 0%.
- [ ] CFDI Exento.
- [ ] CFDI con Descuentos (a nivel concepto y global).
- [ ] CFDI con Múltiples Conceptos.
- [ ] CFDI con IVA Trasladado explícito.
- [ ] CFDI con Retenciones (ISR / IVA).
- [ ] CFDI Cancelado (simulación o fixture de validación de estatus).
- [ ] CFDI con RFC asociado a EFOS / Listas Negras (lista 69-B).

## 4. Auditoría de UI y Exportación (Excel)
Se deberá generar el reporte Excel real desde la aplicación front-end y validar minuciosamente:
- **Volumetría:** El número de registros exportados coincide con los XMLs subidos.
- **Integridad:** Columnas generadas de forma consistente (sin desplazamientos).
- **Consistencia de Datos:** Los UUID, RFC, y los importes coinciden exactamente con la extracción del XML.
- **Columnas Críticas:** Correcto vaciado de variables como Carta Porte, REP, Trazabilidad Aduanera, y EFOS.
- **Visibilidad EFOS:** Confirmar que listas negras y alertas de EFOS se muestren como advertencias contables y de riesgo, *no* como sentencias jurídicas absolutas.
- **Formato Auditor:** Asegurar que el formato sea limpio, analizable por tablas dinámicas y apto para ser consumido por un auditor fiscal.
- **Diferenciación Emitido vs Recibido:** Claridad absoluta entre quién es el emisor y el receptor.

## 5. Criterio de Aprobación
El paso a estado de **AUTORIZADO_DEMO_CONTROLADA** requiere:
1. Compilación (build) exitosa y tests automatizados en verde.
2. Mínimo 100 XMLs del corpus procesados y registrados en la matriz.
3. Excel real descargado y auditado sin inconsistencias de columnas.
4. **Cero hallazgos críticos** (errores de parseo o crasheos de app).
5. **Cero confusión Emisor/Receptor**.
6. **Cero diferencias graves en cálculo de Totales o IVA**.
7. Correcta clasificación de comprobantes de pago (REP) y Carta Porte.
8. Tratamiento adecuado y prudente del módulo de EFOS/69-B.
