---
name: sentinel-express-pro
version: v1.0.0
status: ESTABLE
last_validated: 2026-01-14
last_audit: 2026-01-14
audit_document: AUTO-AUDITORIA_v1.0.0.md
audit_status: NO_AUTORIZADO_PRODUCCION
compliance: 58.8% (30/51 reglas alineadas)
description: Validación fiscal profesional de CFDI y complementos SAT, multiversión y multi-año, con diagnóstico explicable y reportes auditables. Diseñado para revisiones históricas sin falsos positivos.
---

# SKILL: SENTINEL EXPRESS PRO — REGLAS VERSIONADAS

## POLÍTICA DE VERSIONADO (OBLIGATORIA)
- **PATCH (v1.0.x):** correcciones sin cambiar reglas.
- **MINOR (v1.x.0):** nuevas validaciones sin romper histórico.
- **MAJOR (v2.0.0):** cambio de criterios (requiere revalidación completa).
- El agente **DEBE indicar** qué versión del skill usa en cada ejecución.

---

## PRINCIPIOS NO NEGOCIABLES
1. Preferir **NO USABLE** antes que falso OK.
2. **Nunca asumir versión** de CFDI o complemento.
3. Validar **en el contexto histórico** del año.
4. Todo resultado **explicable y trazable**.
5. Separar **Error**, **Alerta**, **Observación**.

---

## ALCANCE TEMPORAL Y VERSIONES CFDI
Soportadas y **obligatorias de identificar**:

- CFDI **2.0 / 2.2 / 3.0 / 3.2** (históricos)
- CFDI **3.3** (2017–2021)
- CFDI **4.0** (2022–actual)

**Regla:** si no se puede leer `Version` → **NO USABLE**.

---

## COMPLEMENTOS SOPORTADOS (POR VERSIÓN)
- **Pagos:** 1.0 (2018–2021), 2.0 (2022–actual)
- **Nómina:** 1.1, 1.2
- **Carta Porte:** 2.0, 3.0, 3.1
- **Impuestos Locales**
- **INE / Donatarias / Comercio Exterior** (validación estructural)

**Regla:** aplicar **solo** las reglas de la versión detectada.

---

## CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)
- **Factura:** Tipo `I`
- **Nota de Crédito:** Tipo `E` + `TipoRelacion=01`
- **Nota de Cargo:** Tipo `I` + `TipoRelacion=02`
- **Pago (REP):** Tipo `P` (Total = 0)
- **Nómina:** Tipo `N`
- **Traslado:** Tipo `T`
- **Sustitución/Relación:** `CfdiRelacionados`

Nunca inferir por monto o concepto.

---

## MOTOR DE VALIDACIÓN (REGLAS)
### Parseo
- Namespaces tolerantes.
- Encodings: UTF-8 / ISO-8859-1 / Windows-1252.
- Falla de parseo → **NO USABLE**.

### Campos mínimos
UUID, RFC Emisor/Receptor, Fecha, Tipo, Total.  
Falta uno → **NO USABLE**.

### Totales (según tipo)
- **I/E:** `Total = Subtotal + Traslados - Retenciones`
- **Nómina:** `Percepciones + OtrosPagos - Deducciones`
- **REP:** `Total = 0`
Tolerancia máx: **0.01**.

### Carta Porte
**Aplica solo si**: Clave transporte + descripción + evidencia de traslado.  
Si falta una → **NO APLICA** (no error).

---

## RESULTADO ÚNICO
- 🟢 **USABLE**
- 🟡 **USABLE CON ALERTAS**
- 🔴 **NO USABLE**

**Score** informativo (no sustituye dictamen).

---

## REPORTES (OBLIGATORIOS)
Cada registro debe incluir:
- Año fiscal
- Versión CFDI
- Tipo real de documento
- Complementos (y versión)
- Regla SAT aplicada
- Diagnóstico humano

---

## MEMORIA DEL AGENTE
- Registrar errores reales detectados.
- No repetir falsos positivos documentados.
- Antes de cambiar reglas: **revisar historial** y solicitar confirmación.

---

## PROHIBICIONES
- Ajustar XML
- Inventar datos/UUID
- Aplicar reglas fuera de su periodo
- Marcar OK con duda

---

## GOBERNANZA Y CONTROL DE CALIDAD

### Auto-Auditoría Oficial
**Documento:** `AUTO-AUDITORIA_v1.0.0.md`  
**Fecha:** 2026-01-14  
**Estado:** ⛔ **NO AUTORIZADO** para producción  
**Cumplimiento:** 58.8% (30/51 reglas alineadas)

### Regla de Bloqueo (OBLIGATORIA)
```
⛔ NINGUNA VALIDACIÓN EXTERNA AUTORIZADA
⛔ NINGÚN XML PUEDE PROCESARSE EN PRODUCCIÓN
```

**Hasta cumplir:**
- ✅ Implementar Opción A (Alcance Moderno 2022-2026) o
- ✅ Implementar Opción B (Alcance Histórico 2010-2026)
- ✅ Validar con XMLs de prueba reales
- ✅ Re-ejecutar auto-auditoría (objetivo: >95%)

### Evidencia Vinculante
Este skill está **contractualmente vinculado** a:
- `AUTO-AUDITORIA_v1.0.0.md` - Evidencia oficial de cumplimiento
- `useXMLValidator.ts` - Código auditado (1,323 líneas)
- `ValidationResult` interface - 73 campos validados

### Autorización de Producción
**Requiere:**
1. ✅ Cumplimiento mínimo: 95% de reglas alineadas
2. ✅ Todas las reglas CRÍTICAS implementadas
3. ✅ Validación con conjunto de prueba (mínimo 100 XMLs diversos)
4. ✅ Actualización de `audit_status` en header a `AUTORIZADO_PRODUCCION`
5. ✅ Firma de aprobación en documento de auditoría

**Responsable de autorización:** Product Owner / Tech Lead

---

## HISTORIAL DE VERSIONES
- **v1.0.0 (2026-01-14):** Base multiversión estable para auditoría histórica.
  - ⛔ **BLOQUEADO:** Auto-auditoría detectó 31.4% no alineación (16/51 reglas)
  - 📄 Documento: `AUTO-AUDITORIA_v1.0.0.md`
  - 🎯 Objetivo: Implementar Opción A o B antes de producción
