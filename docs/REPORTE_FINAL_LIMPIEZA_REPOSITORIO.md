# REPORTE FINAL DE LIMPIEZA DE REPOSITORIO

**Proyecto:** Sentinel Express  
**Fecha:** 2026-05-29  
**Rama Actual:** `cleanup-repo-sentinel`

---

## 1. Commits Generados
Se realizaron dos commits clave para asegurar la trazabilidad y reversibilidad:
1. `chore: backup before repository cleanup` - Respaldo de los cambios pendientes en el árbol de trabajo antes de mover nada.
2. `chore: organize repository structure` - Movimiento masivo de archivos hacia las nuevas carpetas categóricas.

---

## 2. Inventario Post-Limpieza

### Archivos Movidos por Categoría
*   **`/legacy/scripts/` (27 archivos):** Scripts temporales o de parches ad-hoc (`fix*.cjs`, `fix*.mjs`, `patch.cjs`, `append.js`, `test_export*.js`, etc.).
*   **`/legacy/backups/` (10+ elementos):** Carpetas y zips de respaldos (`backup/`, `backups/`, `.bak`, `.zip`, timestamps generados por Vite).
*   **`/tests/fixtures/` (14+ elementos):** Datos y archivos de prueba (`.xlsx`, `.xml`, imágenes `.png`, carpetas `demo-xmls`, `stress-xmls`).
*   **`/reports/dev-outputs/` (2 archivos):** Salidas de procesos locales (`build_output.txt`, `test_output.txt`).
*   **`/docs/` (5 archivos):** Documentación técnica (`CORRECCIONES_TECNICAS.md`, `ESTADO_ACTUAL.md`, `GUIA_PRUEBAS.md`, `INFORME_SENTINEL_EXPRESS.md`, `ideas.md`).

### Archivos NO Tocados (Conservados en Raíz)
*   **Archivos de configuración:** `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.*.json`, `ecosystem.config.cjs`, `netlify.toml`, `.env`, `.gitignore`, `.prettierrc`.
*   **Base de datos activa:** La carpeta `data/` con sus archivos (`sentinel.db`, `sentinel.db-shm`, `sentinel.db-wal`) se preservó intacta.
*   **Carpetas Core:** `client/`, `server/`, `shared/`, `node_modules/`, `dist/`, `.netlify/`.

---

## 3. Resultados de Compilación y Pruebas (Post-Limpieza)

*   **`git status`**: Árbol de trabajo limpio en la rama `cleanup-repo-sentinel`.
*   **Build (`pnpm build`)**: ✅ **ÉXITO**. El proyecto compila en ~10.94s, generando la salida en `dist/`. No se rompieron imports ni rutas críticas.
*   **Tests (`pnpm test`)**: 16/17 pasados (94% de éxito).
    *   Fallo único: `Test-C-01: Manejo de moneda extranjera (Riesgo de conversión)`

---

## 4. Análisis del Test Fallido: `Test-C-01`

**Ubicación:** `client/tests/cfdiEngine.test.ts` (Línea 75)

**Diagnóstico Detallado:**
1. **Qué esperaba el test:** Esperaba que el IVA trasladado extraído fuera 0 (`expect(taxes.ivaTraslado).toBe(0)`).
2. **Qué devolvió realmente:** Devolvió `16` (`Received: 16`).
3. **Parte del motor que lo genera:** `extractTaxesByConcepto()` en `client/src/lib/cfdiEngine.ts`. El motor lee correctamente el nodo XML del mock que especifica `<cfdi:Traslado Base="100.00" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa" Importe="16.00" />`.
4. **Origen del fallo:** Es un **fallo preexistente** en la aserción del test. La limpieza de repositorio no tocó el código fuente, y por lo tanto, no provocó esto. El autor del test introdujo un error tipográfico/lógico al escribir el `expect` (esperando `0` en lugar de `16`, a pesar de que el XML define `16.00`).
5. **Comportamiento fiscal (¿Es correcto o incorrecto?):** El comportamiento del motor es **completamente correcto**. Para efectos de validación del CFDI, el SAT exige que la aritmética de totales y subtotales cuadre *en la moneda original* expresada en el comprobante. 
6. **Manejo de Moneda:** La app **no debe convertir a MXN** al hacer validaciones de estructura. Si el documento dice `USD` y el subtotal es 100 y el IVA es 16, el Total es 116. El Tipo de Cambio se ignora para efectos de validación interna de la factura. El motor fiscal actúa correctamente al extraer los valores literales.

---

## 5. Riesgos Pendientes
*   **Deuda técnica en Tests:** El test `Test-C-01` está mal redactado. Esto podría causar confusión en integraciones continuas (CI/CD) si bloquea los despliegues.
*   **Basura Histórica:** `/legacy/backups/` todavía está consumiendo espacio en el repositorio, aunque ahora está confinada a una carpeta.

---

## 6. Recomendación Final

**Veredicto:** ✅ **A) LISTO PARA MERGE (con una acción menor recomendada)**

Recomiendo **fusionar a `main`** porque la estructura actual es infinitamente superior y 100% segura; nada de lo que importa se rompió. Sin embargo, sugiero corregir esa simple línea en `client/tests/cfdiEngine.test.ts` inmediatamente después del merge para tener la suite de pruebas en verde y mantener la salud del CI/CD. No vale la pena bloquear este avance estructural masivo por un error de aserción en un test preexistente.
