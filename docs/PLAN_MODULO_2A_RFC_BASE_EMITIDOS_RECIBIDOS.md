# Plan Específico: Módulo 2A - RFC Base + Emitidos/Recibidos + Excel Separado

**Objetivo:** Separar los XMLs según el RFC del contribuyente base confirmado por el usuario, sin alterar el núcleo actual certificado.
**Estado de Certificación Base:** `AUTORIZADO_DEMO_CONTROLADA_CON_OBSERVACIONES` (No se altera).

---

## 1. Flujo UX Recomendado

El sistema no debe clasificar nada fiscalmente sin confirmación del usuario. El flujo será:
1. **Carga de XMLs:** El usuario arrastra el lote de XMLs como de costumbre.
2. **Detección y Sugerencia (Heurística):** El motor lee los RFCs y cuenta frecuencias. Aparece un modal o panel superior que dice: *"Hemos detectado que el RFC más frecuente es XXXX. ¿Es este el RFC del Contribuyente Base a auditar?"*
3. **Confirmación / Ingreso Manual:** 
   - Opción A: El usuario hace clic en "Confirmar".
   - Opción B: El usuario ignora la sugerencia y escribe un RFC manualmente en un campo de texto.
4. **Clasificación Asíncrona:** Una vez confirmado el RFC Base, la interfaz dispara una función que recorre los resultados ya parseados y asigna la clasificación (`EMITIDO`, `RECIBIDO`, `AJENO`, `AMBIGUO`).
5. **Recálculo Dinámico:** Si el usuario decide cambiar el RFC Base desde el panel, el sistema simplemente re-ejecuta la clasificación sobre el estado en memoria, actualizando los conteos al instante.
6. **Tablero Actualizado:** Se muestran los indicadores (Emitidos: X, Recibidos: Y, Ajenos: Z, Ambiguos: W).

## 2. Estructura de Datos Propuesta

Se debe extender la interfaz actual de `ValidationResult` o envolverla, sin romper lo existente.
```typescript
type ClasificacionFiscal = 'EMITIDO' | 'RECIBIDO' | 'AJENO' | 'AMBIGUO';
type RolContraparte = 'CLIENTE' | 'PROVEEDOR' | 'DESCONOCIDO';
type TipoFinanciero = 'INGRESO' | 'GASTO' | 'REVISIÓN' | 'NO_RELACIONADO';

interface ValidationResultExtended extends ValidationResult {
  clasificacion: ClasificacionFiscal;
  rfcBaseConfirmado: string;
  rfcContraparte: string;
  rolContraparte: RolContraparte;
  tipoFinanciero: TipoFinanciero;
}
```

## 3. Funciones Nuevas Sugeridas

En `cfdiEngine.ts` (o en un archivo nuevo `classificationEngine.ts` para aislar el módulo):
- `detectarRFCFrecuente(resultados: ValidationResult[]): string` (Retorna el RFC modal).
- `clasificarPorRFCBase(resultados: ValidationResult[], rfcBase: string): ValidationResultExtended[]` (Función pura que no muta el array original).
- `determinarRolContraparte(rfcBase: string, emisor: string, receptor: string): { contraparte, rol, tipoFinanciero }`

## 4. Archivos a Tocar

- `client/src/lib/cfdiEngine.ts` (Agregar tipos y funciones puras).
- `client/src/hooks/useXMLValidator.ts` (Agregar estado para `rfcBase` y modificar la lógica de orquestación para incluir el paso de clasificación).
- [x] Implementar capa de clasificación pura en `classificationEngine.ts`
- [x] Crear pruebas unitarias `classificationEngine.test.ts`
- [x] Integrar selector de RFC Base en `Dashboard.tsx`
- [x] Agregar estado `rfcBaseConfirmado` y lógica sugerida en UI
- [x] Actualizar exportador Excel en `excelExporter.ts` con campos extendidos
- [x] Validar construcción y pruebas (19/19)
- [x] Crear documento `docs/RESULTADOS_MODULO_2A_RFC_BASE.md`

## 5. Riesgos

- **Rendimiento:** Recorrer y reclasificar el array completo puede causar lentitud si se tienen >10,000 XMLs y se cambia el RFC Base constantemente (mitigable usando `useMemo`).
- **Inconsistencia de Tipos:** Alterar `ValidationResult` podría romper funciones de exportación anteriores si no se hace mediante extensión segura (Optional parameters o casting controlado).
- **Confusión UX:** Si el usuario no confirma el RFC Base, el sistema no debería bloquearse, sino mostrar la información neutra (comportamiento actual).

## 6. Pruebas Unitarias

- `clasificarPorRFCBase`: Probar caso EMITIDO (rfcBase == emisor).
- `clasificarPorRFCBase`: Probar caso RECIBIDO (rfcBase == receptor).
- `clasificarPorRFCBase`: Probar caso AJENO (rfcBase != emisor && rfcBase != receptor).
- `clasificarPorRFCBase`: Probar caso AMBIGUO (emisor o receptor en blanco/nulo).

## 7. Pruebas con XMLs Reales (Corpus Mínimo)

1. **Lote 70 Emitidos / 30 Recibidos:** Validar que los conteos sean exactos.
2. **Lote 20 Emitidos / 80 Recibidos:** Validar inversión de roles.
3. **Lote con XMLs Ajenos:** Inyectar 5 XMLs de una empresa aleatoria. Validar que caen en la cubeta "AJENO".
4. **Lote Unidireccional:** Un solo RFC dominante (100 Emitidos). Validar que la sugerencia heurística no falle por falta de varianza.
5. **Corrección de Usuario:** Lote engañoso donde la heurística sugiere el RFC del público en general (XAXX010101000). El usuario lo borra, escribe su RFC real y el recálculo debe ajustarse a la perfección.

## 8. Columnas Nuevas para Excel

La hoja exportada debe agregar estas columnas al final o en un bloque forense claro:
* **Clasificación:** `EMITIDO` / `RECIBIDO` / `AJENO` / `AMBIGUO`
* **RFC Base:** RFC utilizado para la clasificación en esa sesión.
* **RFC Contraparte:** El RFC de la otra entidad.
* **Rol Contraparte:** `CLIENTE` / `PROVEEDOR` / `DESCONOCIDO`
* **Tipo Financiero Sugerido:** `INGRESO` (si es emitido de tipo I), `GASTO` (si es recibido de tipo I), `REVISIÓN` (si es REP o ambiguo), `NO_RELACIONADO` (si es ajeno).

## 9. Criterios de Aprobación

El PR / Módulo será **rechazado** si:
- Clasifica automáticamente sin requerir el clic de "Confirmar" del RFC Base.
- Confunde emisor con receptor.
- Cambia o destruye algún resultado del motor matemático/fiscal actual (el subtotal o EFOS cambian).
- Rompe el formato del Excel actual (las columnas nuevas deben ir al final o en hojas separadas sin romper los encabezados base).
- Al cambiar el RFC Base en la caja de texto, los contadores en pantalla no se actualizan.
- No existe una ruta clara para identificar XMLs "Ajenos" (los esconde o los crashea).

## 10. Rollback Plan

- Mantener los commits atómicos: un commit para las funciones puras en `cfdiEngine`, un commit para la extensión del Excel, y un commit final para la UX en React.
- Si la UX entorpece la experiencia de demostración comercial actual, usar `git revert` de la capa UI, manteniendo las funciones puras en la librería hasta re-diseñar la pantalla.
- Mantener siempre retrocompatibilidad: Si `rfcBase` es nulo, `clasificarPorRFCBase` devuelve la lista original sin alteraciones.
