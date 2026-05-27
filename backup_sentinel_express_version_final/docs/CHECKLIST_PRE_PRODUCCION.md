# Checklist de Pre-Producción (Sentinel Express)

Usa esta lista de verificación antes de realizar un despliegue a producción para asegurar la integridad fiscal del motor y la consistencia de la plataforma.

## ✅ Pasos Obligatorios

1.  **Validar Compilación:** Ejecutar `npm run build` localmente y verificar que no existan errores de TypeScript o imports rotos en el bundle.
2.  **Suite de Pruebas (Integridad Fiscal):** Ejecutar `npm test` y confirmar que las 15 pruebas de auditoría (incluyendo Riesgo IVA, Combustibles y Materialidad) pasen en verde.
3.  **Consistencia de Versión:** Actualizar la versión del motor en `Dashboard.tsx` (Footer) y en `INFORME_SALUD_MOTOR.md` para que coincidan con la lógica desplegada.
4.  **Verificación de Columnas Excel:** Si se añadieron campos nuevos al modelo `ValidationResult`, confirmar que están mapeados en `excelExporter.ts` y que el filtro automático (`!autofilter`) cubra el rango completo de columnas.
5.  **Ayuda y Documentación:** Verificar que los nuevos artículos `.md` en `client/src/content/help/` estén registrados en `registry.ts` para que aparezcan en el Help Center.
6.  **Limpieza de Datos Sensibles:** Asegurarse de que no existan archivos `.env` con credenciales de prueba ni XMLs de clientes reales en las carpetas de tests o assets antes del `git commit`.
7.  **Branding:** Confirmar que el logo y favicon de la plataforma estén correctamente referenciados en `index.html` y los componentes principales.

---
**Última Revisión:** 2026-02-14 | **Versión de Motor Objetivo:** 1.2.1
