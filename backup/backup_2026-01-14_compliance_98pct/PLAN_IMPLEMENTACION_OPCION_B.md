# 📋 PLAN DE IMPLEMENTACIÓN - OPCIÓN B (HISTÓRICO)

**Fecha de Inicio:** 2026-01-14  
**Modalidad:** INCREMENTAL (Regla por regla)  
**Alcance:** 8 Reglas CRÍTICAS  
**Objetivo:** Cumplimiento ≥95% (48/51 reglas)  
**Estado Bloqueo:** 🔴 ACTIVO (se mantiene hasta completar)

---

## 🎯 METODOLOGÍA DE IMPLEMENTACIÓN

### Principios
1. ✅ Una regla a la vez (no batching)
2. ✅ Declarar regla + referencia SKILL antes de cambio
3. ✅ Actualizar AUTO-AUDITORIA después de cambio
4. ✅ Recalcular compliance después de cada corrección
5. ✅ Commit incremental por regla
6. ✅ No procesar XMLs externos hasta ≥95%

### Flujo por Regla
```
1. Declarar regla → 2. Referenciar SKILL → 3. Implementar código
   ↓
4. Validar sintaxis → 5. Actualizar auditoría → 6. Recalcular %
   ↓
7. Confirmar con usuario → 8. Siguiente regla
```

---

## 📊 ORDEN DE IMPLEMENTACIÓN (PRIORIZADO)

### BLOQUE 1: FUNDAMENTOS ESTRUCTURALES (2 reglas)
**Objetivo:** Habilitar soporte multiversión  
**Impacto:** Desbloquea auditorías históricas 2010-2026  
**Tiempo estimado:** 60-90 minutos

#### Regla 1.1: Soporte CFDI 2.0/2.2/3.0/3.2/3.3/4.0
- **Estado actual:** ❌ NO ALINEADA (Regla #1 auditoría)
- **Archivo:** `useXMLValidator.ts` líneas 825-827
- **SKILL afectado:** 
  - Sección: "ALCANCE TEMPORAL Y VERSIONES CFDI"
  - Regla: "CFDI 2.0/2.2/3.0/3.2 (históricos), 3.3 (2017-2021), 4.0 (2022-actual)"
- **Cambio:** Aceptar versiones 2.0, 2.2, 3.0, 3.2, 3.3, 4.0
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 20 min
- **Compliance esperado:** 58.8% → 60.8% (+2.0%)

#### Regla 1.2: Extracción y reporte de Año Fiscal
- **Estado actual:** ❌ NO ALINEADA (Regla #41 auditoría)
- **Archivo:** `useXMLValidator.ts` + `ValidationResult` interface
- **SKILL afectado:**
  - Sección: "REPORTES (OBLIGATORIOS)"
  - Regla: "Cada registro debe incluir: Año fiscal"
- **Cambio:** 
  - Agregar campo `añoFiscal: number` en interface
  - Extraer de `fechaEmision.substring(0, 4)`
  - Incluir en return final
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 15 min
- **Compliance esperado:** 60.8% → 62.7% (+1.9%)

**Checkpoint BLOQUE 1:** 62.7% cumplimiento (+3.9%)

---

### BLOQUE 2: CLASIFICACIÓN DOCUMENTAL (3 reglas)
**Objetivo:** Identificar correctamente tipo real de documento  
**Impacto:** NC, ND, REP clasificados según SAT  
**Tiempo estimado:** 75-90 minutos

#### Regla 2.1: Detección de CfdiRelacionados
- **Estado actual:** ❌ NO ALINEADA (Regla #14 auditoría)
- **Archivo:** `useXMLValidator.ts` (nueva función + campos interface)
- **SKILL afectado:**
  - Sección: "CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)"
  - Regla: "Sustitución/Relación: CfdiRelacionados"
- **Cambio:**
  - Buscar nodo `<cfdi:CfdiRelacionados>`
  - Extraer `TipoRelacion` (01-09)
  - Extraer UUIDs relacionados
  - Agregar campos: `tieneCfdiRelacionados`, `tipoRelacion`, `uuidRelacionado`
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 30 min
- **Compliance esperado:** 62.7% → 64.7% (+2.0%)

#### Regla 2.2: Clasificación Tipo Real de Documento
- **Estado actual:** ❌ NO ALINEADA (Reglas #9, #10, #42 auditoría)
- **Archivo:** `useXMLValidator.ts` (nueva función `determinarTipoRealDocumento()`)
- **SKILL afectado:**
  - Sección: "CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)"
  - Reglas:
    - "Factura: Tipo I"
    - "Nota de Crédito: Tipo E + TipoRelacion=01"
    - "Nota de Cargo: Tipo I + TipoRelacion=02"
    - "Pago (REP): Tipo P (Total=0)"
    - "Nómina: Tipo N"
    - "Traslado: Tipo T"
- **Cambio:**
  - Crear función clasificadora
  - Lógica: Tipo + TipoRelacion + Total
  - Agregar campo `tipoRealDocumento` en interface
  - Incluir en return y reporte
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 25 min
- **Compliance esperado:** 64.7% → 70.6% (+5.9%)

#### Regla 2.3: Validación TipoRelacion obligatorio NC/ND
- **Estado actual:** ❌ NO ALINEADA (Regla #10 auditoría)
- **Archivo:** `useXMLValidator.ts` (validación en clasificación)
- **SKILL afectado:**
  - Sección: "CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)"
  - Regla: "NC debe tener TipoRelacion=01, ND debe tener TipoRelacion=02"
- **Cambio:**
  - Si Tipo=E y NO tiene TipoRelacion=01 → ALERTA
  - Si Tipo=I con TipoRelacion y NO es 02 → validar consistencia
  - Mensaje: "Nota de Crédito sin TipoRelacion=01" o similar
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 20 min
- **Compliance esperado:** 70.6% → 72.5% (+1.9%)

**Checkpoint BLOQUE 2:** 72.5% cumplimiento (+9.8% acumulado)

---

### BLOQUE 3: VALIDACIÓN FISCAL REP (1 regla)
**Objetivo:** Detectar REPs mal formados  
**Impacto:** REP con Total>0 marcados como NO USABLE  
**Tiempo estimado:** 30-40 minutos

#### Regla 3.1: Validación REP (Total=0 obligatorio)
- **Estado actual:** ❌ NO ALINEADA (Reglas #11, #19 auditoría)
- **Archivo:** `useXMLValidator.ts` (validación temprana tipo P)
- **SKILL afectado:**
  - Sección: "CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)"
  - Regla: "Pago (REP): Tipo P (Total = 0)"
  - Sección: "MOTOR DE VALIDACIÓN (REGLAS)"
  - Regla: "REP: Total = 0"
- **Cambio:**
  - Después de detectar `tipoCFDI = "P"`
  - Validar `Total = 0` (tolerancia 0.00)
  - Si Total > 0 → `createErrorResult("REP inválido: Total debe ser 0")`
  - Validar presencia de complemento Pagos
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 30 min
- **Compliance esperado:** 72.5% → 76.5% (+4.0%)

**Checkpoint BLOQUE 3:** 76.5% cumplimiento (+13.8% acumulado)

---

### BLOQUE 4: CONTEXTO TEMPORAL (2 reglas)
**Objetivo:** Aplicar reglas según año y versión del CFDI  
**Impacto:** Validaciones contextuales históricas  
**Tiempo estimado:** 90-120 minutos

#### Regla 4.1: Función de Reglas por Contexto Temporal
- **Estado actual:** ❌ NO ALINEADA (Reglas #44, #45, #48 auditoría)
- **Archivo:** `useXMLValidator.ts` (nueva función antes de validateSingleXML)
- **SKILL afectado:**
  - Sección: "PRINCIPIOS NO NEGOCIABLES"
  - Regla: "Validar en el contexto histórico del año"
  - Sección: "PROHIBICIONES"
  - Regla: "Aplicar reglas fuera de su periodo"
- **Cambio:**
  - Crear `obtenerReglasAplicables(version, añoFiscal, tipoCFDI)`
  - Retorna:
    ```typescript
    {
      requiereCartaPorte: boolean,
      requiereComplementoPagos: boolean,
      versionPagosEsperada: string,
      versionNominaEsperada: string,
      toleranciaRedondeo: number,
      reglasEspecificas: string[]
    }
    ```
  - Lógica por periodo:
    - CFDI 2.x/3.0/3.2 (2010-2016): Sin Carta Porte, sin Pagos 1.0
    - CFDI 3.3 (2017-2021): Sin Carta Porte, Pagos 1.0 desde 2018
    - CFDI 4.0 (2022-actual): Carta Porte obligatoria, Pagos 2.0
- **Complejidad:** 🔴 ALTA
- **Tiempo:** 60 min
- **Compliance esperado:** 76.5% → 82.4% (+5.9%)

#### Regla 4.2: Aplicación de Reglas Contextuales
- **Estado actual:** ❌ NO ALINEADA (continuación de 4.1)
- **Archivo:** `useXMLValidator.ts` (refactorizar validaciones existentes)
- **SKILL afectado:** Mismo que 4.1
- **Cambio:**
  - Obtener reglas al inicio de `validateSingleXML`
  - Aplicar `requiereCartaPorte` solo si contexto lo indica
  - Aplicar validación Pagos según `versionPagosEsperada`
  - Mensajes con contexto: "Según reglas SAT de [año]..."
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 30 min
- **Compliance esperado:** 82.4% → 84.3% (+1.9%)

**Checkpoint BLOQUE 4:** 84.3% cumplimiento (+21.6% acumulado)

---

### BLOQUE 5: COMPLEMENTO PAGOS (No CRÍTICO pero requerido para Opción B)
**Objetivo:** Validar REP con complemento correcto  
**Impacto:** REPs con Pagos 1.0/2.0 validados  
**Tiempo estimado:** 60-75 minutos

#### Regla 5.1: Detección y Validación Complemento Pagos
- **Estado actual:** ❌ NO ALINEADA (Regla #33 auditoría - ALTA)
- **Archivo:** `useXMLValidator.ts` (nueva función después de extractCartaPorteInfo)
- **SKILL afectado:**
  - Sección: "COMPLEMENTOS SOPORTADOS (POR VERSIÓN)"
  - Regla: "Pagos: 1.0 (2018-2021), 2.0 (2022-actual)"
- **Cambio:**
  - Crear `extractPagosInfo(xmlContent, version, añoFiscal)`
  - Detectar `pago10:Pagos` o `pago20:Pagos`
  - Validar versión según contexto temporal
  - Retornar: `{ presente, versionPagos, esValido, errorMsg }`
  - Agregar campos en interface: `pagosPresente`, `versionPagos`, `pagosValido`
  - Si Tipo=P y NO tiene Pagos → NO USABLE
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 45 min
- **Compliance esperado:** 84.3% → 86.3% (+2.0%)

**Checkpoint BLOQUE 5:** 86.3% cumplimiento (+23.6% acumulado)

---

### BLOQUE 6: ENCODING MÚLTIPLE (No CRÍTICO pero mejora robustez)
**Objetivo:** Soportar XMLs con encoding antiguo  
**Impacto:** Lectura correcta de CFDIs históricos  
**Tiempo estimado:** 45-60 minutos

#### Regla 6.1: Soporte Encoding ISO-8859-1 y Windows-1252
- **Estado actual:** ⚠️ PARCIAL (Regla #3 auditoría)
- **Archivo:** `useXMLValidator.ts` (refactorizar parseo inicial)
- **SKILL afectado:**
  - Sección: "MOTOR DE VALIDACIÓN (REGLAS)"
  - Regla: "Encodings: UTF-8 / ISO-8859-1 / Windows-1252"
- **Cambio:**
  - Intentar UTF-8 primero
  - Si falla y XML declara ISO-8859-1 → reintentar con ese encoding
  - Si falla y XML declara Windows-1252 → reintentar
  - Solo marcar error si todos fallan
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 45 min
- **Compliance esperado:** 86.3% → 88.2% (+1.9%)

**Checkpoint BLOQUE 6:** 88.2% cumplimiento (+25.5% acumulado)

---

### BLOQUE 7: COMPLEMENTOS ADICIONALES (Completar Opción B)
**Objetivo:** Soporte completo de complementos  
**Impacto:** Nómina 1.1, versiones en reporte  
**Tiempo estimado:** 30-40 minutos

#### Regla 7.1: Soporte Nómina 1.1
- **Estado actual:** ⚠️ PARCIAL (Regla #26 auditoría - BAJA)
- **Archivo:** `useXMLValidator.ts` (extender extractNominaInfo)
- **SKILL afectado:**
  - Sección: "COMPLEMENTOS SOPORTADOS (POR VERSIÓN)"
  - Regla: "Nómina: 1.1, 1.2"
- **Cambio:**
  - Aceptar `Version="1.1"` además de "1.2"
  - Aplicar validaciones estructurales de 1.1
  - Campos específicos de 1.1 si difieren
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 30 min
- **Compliance esperado:** 88.2% → 90.2% (+2.0%)

**Checkpoint BLOQUE 7:** 90.2% cumplimiento (+27.5% acumulado)

---

### BLOQUE 8: REPORTES COMPLETOS (Alcanzar ≥95%)
**Objetivo:** Información completa en resultados  
**Impacto:** Excel con todos los campos requeridos  
**Tiempo estimado:** 60-75 minutos

#### Regla 8.1: Versiones de Complementos en Reporte
- **Estado actual:** ⚠️ PARCIAL (Regla #43 auditoría)
- **Archivo:** `ValidationResult` interface + return final
- **SKILL afectado:**
  - Sección: "REPORTES (OBLIGATORIOS)"
  - Regla: "Complementos (y versión)"
- **Cambio:**
  - Agregar campos: `complementosDetectados: string[]`
  - Ejemplo: ["CartaPorte 3.1", "Pagos 2.0", "Nómina 1.2"]
  - Incluir en reporte
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 20 min
- **Compliance esperado:** 90.2% → 92.2% (+2.0%)

#### Regla 8.2: Validación Encoding con Fallback
- **Estado actual:** Implementado en Bloque 6, ajustar reporte
- **Cambio:**
  - Campo `encodingDetectado: string` ("UTF-8", "ISO-8859-1", "Windows-1252")
  - Incluir en observacionesTecnicas
- **Complejidad:** 🟢 BAJA
- **Tiempo:** 15 min
- **Compliance esperado:** 92.2% → 94.1% (+1.9%)

#### Regla 8.3: Score Informativo (Opcional para ≥95%)
- **Estado actual:** ❌ NO ALINEADA (Regla #37 auditoría - BAJA)
- **Archivo:** `ValidationResult` interface + cálculo en validación
- **SKILL afectado:**
  - Sección: "RESULTADO ÚNICO"
  - Regla: "Score informativo (no sustituye dictamen)"
- **Cambio:**
  - Campo `score: number` (0-100)
  - Fórmula: (campos válidos / campos totales) * 100
  - Factores: estructura, totales, complementos, clasificación
- **Complejidad:** 🟡 MEDIA
- **Tiempo:** 30 min
- **Compliance esperado:** 94.1% → 96.1% (+2.0%)

**Checkpoint BLOQUE 8:** 96.1% cumplimiento (+33.4% acumulado)

---

## 📊 RESUMEN DE BLOQUES

| Bloque | Reglas | Tipo | Tiempo | Compliance | Acumulado |
|--------|--------|------|--------|------------|-----------|
| **INICIO** | - | - | - | **58.8%** | - |
| **1. Fundamentos** | 2 | Estructural | 35 min | 62.7% | +3.9% |
| **2. Clasificación** | 3 | Clasificación | 75 min | 72.5% | +9.8% |
| **3. REP** | 1 | Fiscal | 30 min | 76.5% | +13.8% |
| **4. Contexto Temporal** | 2 | Fiscal/Sistema | 90 min | 84.3% | +21.6% |
| **5. Pagos** | 1 | Complemento | 45 min | 86.3% | +23.6% |
| **6. Encoding** | 1 | Estructural | 45 min | 88.2% | +25.5% |
| **7. Nómina 1.1** | 1 | Complemento | 30 min | 90.2% | +27.5% |
| **8. Reportes** | 3 | Reporte | 65 min | **96.1%** | **+33.4%** |
| **TOTAL** | **14** | - | **415 min** | **96.1%** | **+37.3%** |

**Tiempo total estimado:** 6.9 horas (415 minutos)  
**Compliance final:** 96.1% (49/51 reglas)  
**Objetivo:** ✅ ALCANZADO (≥95%)

---

## 🎯 CRITERIOS DE ACEPTACIÓN

### Por Regla
- ✅ Sintaxis TypeScript correcta (0 errores)
- ✅ Código comentado con referencia SKILL
- ✅ AUTO-AUDITORIA actualizada
- ✅ Compliance recalculado y documentado
- ✅ Confirmación de usuario antes de siguiente

### Por Bloque
- ✅ Checkpoint de compliance alcanzado
- ✅ Tests de concepto (si aplica)
- ✅ Sin regresiones en código existente

### Final (≥95%)
- ✅ Compliance ≥95% alcanzado
- ✅ Todas las reglas CRÍTICAS implementadas
- ✅ AUTO-AUDITORIA v1.1.0 generada
- ✅ Validación con XMLs de prueba (100+)
- ✅ Aprobación para levantar bloqueo

---

## ⚠️ ADVERTENCIAS

### Durante Implementación
- 🔴 **BLOQUEO SE MANTIENE** activo en todo momento
- 🔴 **NO procesar XMLs externos** hasta ≥95%
- 🟡 Cada regla debe **compilar sin errores** antes de continuar
- 🟡 Usuario debe **confirmar** antes de siguiente regla

### Riesgos Identificados
- **Regresión:** Cambios en fórmulas pueden afectar validaciones actuales
- **Performance:** Múltiples intentos de encoding pueden ralentizar
- **Compatibilidad:** CFDI 2.x puede tener estructura diferente

### Mitigaciones
- ✅ Commits incrementales por regla
- ✅ Backup de código antes de cada bloque
- ✅ Tests con XMLs sintéticos antes de reales

---

## 📋 CHECKLIST DE INICIO

Antes de comenzar, confirmar:

- [ ] ✅ BLOQUEO_PRODUCCION.md está activo
- [ ] ✅ AUTO-AUDITORIA_v1.0.0.md está registrada
- [ ] ✅ SKILL.md tiene `audit_status: NO_AUTORIZADO_PRODUCCION`
- [ ] ✅ Backup de `useXMLValidator.ts` creado
- [ ] ✅ Ambiente de desarrollo funcional
- [ ] ✅ Usuario confirma inicio de Bloque 1

---

## 🚀 ESTADO DE EJECUCIÓN

**Estado actual:** 🟡 PLAN APROBADO - ESPERANDO INICIO

**Próxima acción:** Esperar confirmación de usuario para:
1. Comenzar con **BLOQUE 1: Fundamentos Estructurales**
2. Implementar **Regla 1.1: Soporte CFDI multiversión**

**Comando para iniciar:**
```
Usuario: "Proceder con Bloque 1, Regla 1.1"
```

---

**Fecha de plan:** 2026-01-14  
**Versión de plan:** v1.0.0  
**Responsable:** Sistema de Implementación Guiada  
**Aprobador:** Usuario (pendiente)

---

📌 **NOTA IMPORTANTE:**

Este plan es **incremental y pausable**. Puedes:
- Detener después de cualquier bloque
- Validar resultados intermedios
- Ajustar prioridades según necesidad
- Continuar en otra sesión

El progreso se documenta en AUTO-AUDITORIA después de cada regla.
