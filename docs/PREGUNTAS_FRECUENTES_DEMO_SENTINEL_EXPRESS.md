# Preguntas Frecuentes Demo - Sentinel Express

**¿Esto sustituye a un contador?**
No. Sentinel Express es una herramienta de apoyo diseñada para empoderar a tu equipo contable. Automatiza la extracción de datos y la detección de riesgos básicos para que el contador pueda enfocarse en el análisis jurídico y financiero, en lugar de abrir XMLs manualmente.

**¿Está certificado por el SAT?**
No requerimos certificación oficial del SAT porque no timbramos ni cancelamos comprobantes. Somos una herramienta de pre-auditoría administrativa que extrae y organiza la información basada en las reglas técnicas del Anexo 20 del SAT.

**¿Puede revisar todos mis XMLs?**
Actualmente, el sistema está optimizado y certificado para comprobantes recientes (CFDI 4.0, periodo 2022-2026). XMLs de años anteriores (como CFDI 3.3) serán extraídos de forma básica, pero sugerimos enfocar la herramienta en su facturación actual.

**¿Detecta facturas falsas?**
Sentinel Express detecta si el RFC del emisor coincide con las Listas Negras (69-B) conocidas del SAT y levanta una alerta de "EFOS". Esta alerta es estrictamente un indicador de riesgo preventivo para tu departamento legal/contable, no una sentencia jurídica o un dictamen fiscal definitivo.

**¿Valida Carta Porte?**
Sí. El sistema es capaz de extraer y tabular la información de los complementos Carta Porte recientes (ubicaciones, mercancías y vehículos) directamente a Excel para facilitar su auditoría logística.

**¿Valida complementos de pago?**
El sistema extrae correctamente el Complemento de Recepción de Pagos (REP 2.0) y lista los documentos relacionados (facturas amparadas). Sin embargo, el análisis de trazabilidad cruzada (verificar que la cadena de REPs cuadre históricamente con la factura original PPD) requiere análisis manual apoyado en nuestro Excel.

**¿Ya está listo para producción?**
En este momento ofrecemos la plataforma bajo un esquema de **piloto controlado**. Esto te permite procesar y analizar lotes de facturación para validar el valor de la herramienta antes de integrarla definitivamente a tus procesos masivos de producción.

**¿Qué pasa si subo XMLs de otros años?**
El motor intentará extraer la información compatible (nodos básicos). Sin embargo, reglas específicas de años anteriores podrían no ser evaluadas a profundidad. Reiteramos el uso de la herramienta para comprobantes CFDI 4.0.

**¿Qué tan confiable es el Excel?**
La exportación a Excel ha sido rigurosamente validada en pruebas de certificación. Las columnas críticas (UUIDs, Totales, RFCs y detalles de complementos) se extraen con alta fidelidad y sin cruce de datos, siendo el mejor formato de apoyo para tu auditor.

**¿Puedo usarlo para auditorías internas?**
¡Es su propósito principal! Es la herramienta ideal para que la Contraloría o el departamento de Impuestos haga pre-cierres y revisiones masivas mensuales de su facturación emitida y recibida.
