# 🔄 Flujo Diario de Trabajo Recomendado

Para maximizar la productividad y garantizar el cumplimiento fiscal, recomendamos seguir este flujo operativo diariamente:

## 1. Selección de Entidad
Antes de comenzar, asegúrate de haber seleccionado la **Razón Social** correcta en el selector superior. Esto separa tus históricos y evita mezclar auditorías de distintos clientes.

## 2. Ingesta de Datos (Carga Masiva)
- Descarga los XML del portal del SAT o de tu sistema contable.
- Arrastra la carpeta completa a la **Zona de Carga**.
- Sentinel procesará los documentos localmente sin exponer datos sensibles.

## 3. Triaje Fiscal (Semáforos)
Observa los indicadores rápidos:
- **🟢 USABLE:** Procede con la descarga o contabilización.
- **🟡 ALERTAS:** Revisa el comentario fiscal. Puede ser una omisión de complemento o error de redondeo.
- **🔴 NO USABLE:** Detén la operación. El CFDI tiene errores estructurales graves o está cancelado en el SAT.

## 4. Auditoría de Estatus SAT
Si un CFDI tiene varios días de emitido, usa el botón **🔄 Revalidar** para confirmar que el proveedor no lo haya cancelado posteriormente.

## 5. Documentación y Notas
Utiliza el campo **📝 Notas del Contador** para dejar constancia de revisiones manuales o aprobaciones especiales. Estas notas aparecerán en tu reporte final.

## 6. Papel de Trabajo (Excel)
Haz clic en **Exportar Excel**. Este archivo es tu evidencia de auditoría; guárdalo junto con tus archivos contables del mes como respaldo ante una revisión de la autoridad.

---
*Este flujo reduce el tiempo de auditoría en un 80% frente a la validación manual.*
