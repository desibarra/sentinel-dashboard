# Flujo General del Sistema

Entender cómo Sentinel Express procesa la información garantiza una mejor interpretación de las auditorías.

## 🔄 El ciclo de vida del dato
1. **Ingesta:** Lectura de metadatos del XML (UUID, RFC, Totales).
2. **Normalización:** Homologación de campos entre CFDI 3.3 y 4.0.
3. **Validación Fiscal:** Aplicación de fórmulas del Anexo 20 y validación de complementos.
4. **Cruce de Listas Negras:** Verificamos si el RFC emisor existe en la base de datos local de EFOS.
5. **Consulta SAT:** Verificación de vigencia en tiempo real via webservice.
6. **Reporteo:** Generación de dashboard y exportación a Excel.

---
Este flujo está diseñado para ser **transparente y auditable**, permitiendo al usuario ver el resultado de cada etapa en el reporte final.
