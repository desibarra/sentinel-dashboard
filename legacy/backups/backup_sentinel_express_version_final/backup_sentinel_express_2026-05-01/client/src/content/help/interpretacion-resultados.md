# Interpretación de Resultados

Sentinel Express (Motor 1.2.0) utiliza un sistema de semáforos para clasificar la validez fiscal de cada comprobante según su riesgo.

## 🟢 USABLE (Verde)
El comprobante cumple con todas las reglas estructurales y de cálculo del SAT.
- **Acción:** Puede integrarse a la contabilidad y es deducible/acreditable.
- **Criterio:** Diferencia de totales ≤ 0.01 y sin alertas críticas en complementos.
- **Ejemplo:** Factura comercial sana (Kenworth, Telcel) con totales correctos.

## 🟡 CON ALERTAS (Amarillo)
El comprobante es estructuralmente válido, pero presenta observaciones que requieren atención del auditor.
- **Ejemplos:**
  - **Combustibles:** CFDI con complemento `ecc12` donde el detalle está en el complemento aunque el total principal sea simbólico.
  - **Carta Porte:** Complemento presente pero incompleto.
  - **Bonificaciones:** Incluye conceptos bonificados (`ObjetoImp=01`) que no invalidan el resto de la factura.
- **Acción:** Revisar el comentario fiscal y evaluar conforme a política interna.

## 🔴 NO USABLE (Rojo)
El comprobante tiene errores críticos o riesgos elevados que comprometen su deducibilidad.
- **Causas Críticas:**
  - **Riesgo IVA (Nuevo):** `ObjetoImp=02` con IVA 0% en productos típicamente gravados (riesgo de rechazo de acreditamiento).
  - **Error en Totales:** Diferencia de cálculo > 0.01 (sin complemento ecc12 que lo justifique).
  - **Listas Negras:** Emisor en lista 69-B (operaciones inexistentes).
  - **Estatus SAT:** El comprobante aparece como **CANCELADO**.
- **Acción:** **RECHAZAR** el comprobante y solicitar corrección inmediata.

---
| Estado | Riesgo Fiscal | Acción Recomendada |
| :--- | :--- | :--- |
| Usable | Bajo | Contabilizar |
| Alertas | Medio | Revisar / Mantener bajo observación |
| No Usable | Alto | Rechazar / Refacturar |
