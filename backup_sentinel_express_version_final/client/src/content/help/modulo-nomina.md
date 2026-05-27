# Módulo de Nómina 1.2

La revisión de nómina es crítica para evitar multas por retenciones mal calculadas.

## 🧮 Fórmula de Validación
Sentinel aplica la siguiente lógica:
`Percepciones (Gravado + Exento) + Otros Pagos - Deducciones = Total Líquido`

## 📋 Puntos de Auditoría
- **Periodicidad:** Se valida que el periodo de pago sea coherente.
- **ISR Retenido:** Se extrae específicamente la retención de ISR (Clave 002) para su conciliación.
- **RFC Trabajador:** Validación de estructura de RFC.
- **CURP:** Verificación de presencia de CURP en el nodo del receptor.

---
> **Importante:** Errores de céntimos en nómina suelen ser por truncado vs redondeo. Sentinel detecta estas discrepancias mediante su tolerancia inteligente.
