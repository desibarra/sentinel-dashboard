# Limitaciones de la Plataforma (v1.2.0)

Aunque Sentinel Express es una herramienta potente de auditoría, existen ciertos alcances que el usuario debe tener en cuenta para una interpretación correcta de los resultados.

## 🚫 Lo que Sentinel NO hace (Alcance Actual)

### 1. Interpretación de Contratos y Legalidad
El sistema valida la estructura fiscal y la materialidad superficial del CFDI. Sin embargo:
- No puede interpretar cláusulas contractuales privadas que justifiquen operaciones atípicas.
- No sustituye la fe pública de un notario o la validación legal de contratos de prestación de servicios.

### 2. Contabilidad Detallada
- **Efectos Contables:** No genera pólizas contables automáticas ni realiza asientos de diario (aunque su salida facilita este proceso).
- **Control de Inventarios:** No rastrea la entrada o salida física de almacén de los productos mencionados en los conceptos.

### 3. Cálculos Financieros Consolidados
- **Conversión Global a MXN:** En reportes consolidados, las columnas de montos muestran el valor nominal del CFDI. Si se mezclan monedas (USD/EUR/MXN), el usuario debe realizar la conversión manual para sumas totales, ya que el reporte no aplica un tipo de cambio histórico global al cierre.
- **Flujo de Efectivo:** El sistema audita el momento de la facturación (devengo), no necesariamente el momento del pago (flujo), excepto en el módulo de auditoría de complementos de pago.

### 4. Limitaciones Técnicas
- **Interpretación de Imágenes:** El sistema solo procesa archivos `.xml`. No realiza OCR sobre archivos PDF o imágenes de facturas.
- **Configuración de Giros:** La efectividad del motor de materialidad depende de que el usuario defina correctamente el giro de la empresa en la configuración. Un giro mal definido puede generar falsos positivos o negativos en las alertas de materialidad.

## 🛡️ Recomendación de Uso
Sentinel Express debe utilizarse como una **herramienta de asistencia y debida diligencia**. Los resultados marcados como `🟡` o `🔴` deben ser validados por un profesional fiscal antes de tomar acciones legales o de rechazo comercial definitivo.
