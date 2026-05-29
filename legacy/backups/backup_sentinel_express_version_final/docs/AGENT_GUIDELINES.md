# 🤖 Sentinel Express - Agent Guidelines

## 1. Instrucciones de Inicialización (Pre-ejecución)
Al asignar una tarea sobre el repositorio de **Sentinel Express**, los agentes de IA (ej. Antigravity) deben cumplir ESTRICTAMENTE con los siguientes pasos **antes** de proponer o escribir cualquier código:

* **Leer la Documentación Core**: Debes acceder y leer la carpeta `/docs` (particularmente `TECH_ARCHITECTURE.md` y `PRODUCT_OVERVIEW.md`). La arquitectura de pre-validación frontend no debe verse alterada sin consenso.
* **Comprender el Problema del Usuario**: Revisa el Prompt, el origen del Bug o la nueva "Feature" y evalúa si impacta a (1) Node/Backend Proxy, (2) UI/UX, o (3) Engine/Reglas Fiscales.
* **Evaluar Impacto Zero-Knowledge**: Nunca subas archivos crudos (XML) a una base de datos externa ni modifiques la política de que "todo se parsea en el frontend" a menos que existan instrucciones inversas del CTO.
* **Análisis Preventivo**: Ejecuta búsquedas `grep_search` masivas en `cfdiEngine.ts` o en las validaciones de listas negras antes de sugerir reescrituras innecesarias. 

---

## 2. Convenciones del Proyecto (TypeScript / React)
1. **Lógica de Tipado (STRICT)**:
   - Todo debe estar debidamente tipado, especialmente la inferencia del objeto central `ValidationResult`. 
   - No introducir `any` o conversiones silenciosas en lógica fiscal (ejecutar Parse / Cast cuidadoso a Nodos de Montos base y Subtotales).

2. **Convenciones de Interfaz (shadcn / Tailwind)**:
   - Mantén el look-and-feel original; colores neutros base, y el "Semáforo Fiscal" con las utilidades de color `emerald-X`, `amber-X`, `rose-X`. 
   - Elementos visuales como Tooltips deben proveer justificaciones de negocio sobre qué regla fiscal falló (Diagnóstico).
   
3. **Control del Renderizado**:
   - Para mapas masivos de Data como `results.map` utiliza Paginación o Virtualización. Un usuario podría querer visualizar +2,000 CFDI en un solo archivo XML de lote; evita provocar OOM (Out Of Memory) en Chrome.

4. **Manejo de Errores UX**:
   - Cada error asíncrono debe mostrar un `toast.error()` controlado o fallar en silencio sin crashear toda la tabla interactiva de React.

---

## 3. Guía para Modificación de Archivos Críticos
Si el requerimiento implica alterar el "Corazón del sistema", aplica esta guía:

* **`client/src/lib/cfdiEngine.ts` (Motor SAT)**: Este es el cerebro algorítmico (2,000+ horas de R&D contable). Si te piden ajustar reglas del ObjetoImp, Impuestos Retenidos, Desgloses de IVA o ISR, debes analizar 2 veces. Solo haz cambios precisos (`replace_file_content`) a las condicionales y deja el resto de la validación matemática intocable. Prueba el tipado rigurosamente al exportarlo a Excel.
* **`server/api.ts` (Backend Gateway)**: Si inyectas nuevos Endpoints o peticiones proxy, hazlo manteniendo el diseño enrutado actual con `Express`. No uses dependencias pesadas que rompan el archivo compreso PM2.
* **`package.json` o Toolchains**: No actualizar subversiones complejas de React ni inyectar librerías de UI externas innecesarias, todo debe utilizar los estandares de shadcn-ui preexistentes.

---

## 4. Estructura de "Reportes y Explicaciones" (Al Usuario)
Cuando generes una solución a un usuario en Sentinel Express, el formato final del bot deberá:
1. **Explicar QUÉ Se Solucionó**: Usar lenguaje directo y comercial del SaaS, como lo haría un "Líder Técnico Senior". E.g: "Corregido el falso positivo del Desglose Objeto 01".
2. **Resumir los Efectos Colaterales**: Indicar qué funcionalidades paralelas (Tabla, Excel, Landing Page) se verán beneficiadas.
3. **Entregar Código Pulcro**: Nunca borrar bloques de código en los Diff. Utiliza `replace_file_content` o `multi_replace_file_content` solo en los fragmentos de la *Causa Raíz*.
4. **Respetar el Idioma**: La comunicación técnica, reglas del SAT, alertas modales y explicaciones al usuario final mexicano (`.tsx`, `.html`) DEBEN estar estricta y ortográficamente correctas en **Español (México)** por naturaleza corporativa SaaS.
