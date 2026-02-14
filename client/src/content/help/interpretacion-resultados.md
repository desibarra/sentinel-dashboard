# Interpretación de Resultados

Sentinel Express utiliza un sistema de semáforos para clasificar la validez fiscal de cada comprobante.

## 🟢 USABLE (Verde)
El comprobante cumple con todas las reglas estructurales y de cálculo del SAT.
- **Acción:** Puede integrarse a la contabilidad y es deducible/acreditable.
- **Criterio:** Diferencia de totales ≤ 0.01 y sin alertas en complementos.

## 🟡 CON ALERTAS (Amarillo)
El comprobante es estructuralmente válido, pero presenta omisiones que podrían causar problemas en una revisión.
- **Ejemplo:** Falta información opcional pero recomendada en Carta Porte.
- **Acción:** Revisar el comentario fiscal y evaluar si se solicita la refacturación.

## 🔴 NO USABLE (Rojo)
El comprobante tiene errores críticos que invalidan su deducibilidad.
- **Causas Comunes:**
  - Totales no cuadran (error de cálculo).
  - El emisor está en la lista negra (EFOS).
  - Falta un complemento obligatorio (ej. Carta Porte en traslados).
- **Acción:** **RECHAZAR** el comprobante y solicitar corrección inmediata al proveedor.

---
| Estado | Riesgo Fiscal | Acción Recomendada |
| :--- | :--- | :--- |
| Usable | Bajo | Contabilizar |
| Alertas | Medio | Revisar / Mantener bajo observación |
| No Usable | Alto | Rechazar / Refacturar |
