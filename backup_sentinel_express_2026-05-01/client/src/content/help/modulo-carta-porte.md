# Módulo Carta Porte 3.1

La validación de **Carta Porte** en Sentinel Express está diseñada para eliminar los falsos positivos comunes en auditorías tradicionales.

## ⚖️ Fundamento Legal
Según el Artículo 2.7.7.1 de la RMF y el Anexo 20 del SAT, el complemento de Carta Porte es obligatorio para acreditar la legal estancia y/o tenencia de las mercancías durante el traslado en territorio nacional por vía terrestre, férrea, aérea, marítima o fluvial.

## 🔍 Regla de Validación Sentinel
A diferencia de otros validadores que marcan error en cualquier factura de transporte sin complemento, Sentinel aplica una **Regla Tripartita**:

1. **Clave de Producto:** Debe ser una clave SAT específica de transporte (ej. 78101700).
2. **Descripción:** Debe contener palabras clave de transporte físico (Flete, Traslado de mercancía, Acarreo).
3. **Evidencia de Ruta:** Debe existir referencia a un origen y destino.

### Elementos Obligatorios validados:
- **Ubicaciones:** Nodo `Ubicaciones` con Origen y Destino presentes.
- **Mercancías:** Peso bruto total, unidad de medida y número total de mercancías.
- **Autotransporte:** Permiso SCT, configuración vehicular, placas y póliza de seguro vigente.
- **Figura Transporte:** Operador con RFC válido y número de licencia federal.

---
> **Tip de Auditoría:** Si una factura de "Servicios de Logística" no incluye Carta Porte, Sentinel la marcará como **USABLE** (Verde) siempre y cuando no se detecte transporte físico de bienes, evitando rechazos innecesarios por servicios administrativos.
