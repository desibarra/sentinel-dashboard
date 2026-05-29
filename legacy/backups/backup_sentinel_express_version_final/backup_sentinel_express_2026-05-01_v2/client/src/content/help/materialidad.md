# Materialidad y Giro de la Empresa

Sentinel Express v1.2.1 incluye un motor avanzado de validación de materialidad que ayuda a los auditores a identificar discrepancias entre el gasto realizado y la actividad económica de la empresa.

## 🏢 ¿Qué es el Giro de la Empresa?
El **giro** es la actividad económica principal que el usuario declara en la configuración de la empresa (ej. "Transporte de carga", "Servicios de Limpieza", "Construcción").

## 🔍 ¿Cómo funciona la validación?
El sistema cruza tres puntos clave:
1. **Giro Declarado:** La actividad configurada en la plataforma.
2. **ClaveProdServ:** El código estándar del SAT del concepto en el XML.
3. **Descripción y Emisor:** Análisis de texto de los conceptos y el nombre del proveedor.

### Ejemplo de Alerta:
Si una empresa con giro **"Transporte de carga"** carga un CFDI de **"Supermercado (Despensa personal)"**, el sistema generará una alerta:
> `[ALERTA DE GIRO] El gasto (Abarrotes/Despensa) no parece coincidir con la operación principal de la empresa (Transporte de carga).`

## ⚠️ ¿Qué significa la alerta para el auditor?
La alerta **no bloquea** el CFDI como no deducible automáticamente (el resultado estructural puede ser `🟢 USABLE`), pero sirve como una **bandera roja preliminar** para:
- Detectar gastos personales de socios o empleados.
- Identificar posibles errores en la asignación de proveedores.
- Documentar la debida diligencia de materialidad (Razón de Negocio).

## ⚙️ Configuración
Para que esta validación sea efectiva, asegúrate de asignar el giro correcto en el panel de **Configuración de Empresa**.
