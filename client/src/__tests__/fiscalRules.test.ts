import { describe, expect, it } from 'vitest';
import { applyFiscalRules } from '../lib/fiscalRules';
import { ValidationResult } from '../lib/cfdiEngine';

describe('applyFiscalRules', () => {
  it('marca PPD sin complemento como NO_ACREDITABLE y ROJO', () => {
    // direccionCFDI: 'RECIBIDO' — en el flujo real (useXMLValidator.ts) este
    // campo SIEMPRE está resuelto (vía resolverClasificacionDireccion) antes
    // de llamar a applyFiscalRules; se fija aquí explícitamente para que el
    // fixture sea representativo (ver FASE 1: la cadena de NO_ACREDITABLE/
    // ACREDITABLE ahora exige 'RECIBIDO' explícito, nunca "lo que no sea
    // EMITIDO").
    const r = {
      uuid: 'AAA',
      metodoPago: 'PPD',
      pagosPresente: 'NO',
      pagosValido: 'NO',
      ivaTraslado: 160,
      isValid: true,
      direccionCFDI: 'RECIBIDO',
    } as unknown as ValidationResult;

    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PPD_SIN_COMPLEMENTO');
    expect(out.paymentComplementStatus).toBe('SIN_COMPLEMENTO');
    expect(out.ivaCreditabilityStatus).toBe('NO_ACREDITABLE');
    expect(out.fiscalRiskLevel).toBe('ROJO');
  });

  it('marca PUE sin evidencia de cobro como PUE_REVISAR_COBRO y AMARILLO', () => {
    const r = {
      uuid: 'BBB',
      metodoPago: 'PUE',
      trazabilidadInfo: {},
      ivaTraslado: 240,
      isValid: true,
    } as unknown as ValidationResult;

    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PUE_REVISAR_COBRO');
    expect(out.paymentComplementStatus).toBe('NO APLICA');
    expect(out.fiscalRiskLevel).toBe('AMARILLO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 1 — bug: REQUIERE_REVISION podía terminar como ACREDITABLE
// ═══════════════════════════════════════════════════════════════════════════
// Causa raíz: la cadena de decisión de ivaCreditabilityStatus solo tenía una
// rama especial para 'EMITIDO'; todo lo demás (incluido 'REQUIERE_REVISION' —
// un CFDI cuyo emisor/receptor NO coincide con el RFC de la empresa
// seleccionada, p. ej. un CFDI de un tercero cargado por accidente) caía en
// la MISMA cadena que 'RECIBIDO'. Si ese CFDI ajeno tenía IVA trasladado y
// era estructuralmente válido, terminaba marcado ACREDITABLE — como si la
// empresa seleccionada pudiera acreditar el IVA de una transacción que no le
// pertenece.
describe('applyFiscalRules — ivaCreditabilityStatus respeta la dirección del CFDI (bug REQUIERE_REVISION → ACREDITABLE)', () => {
  const base = (over: Partial<ValidationResult>): ValidationResult => ({
    uuid: 'UUID-TEST',
    metodoPago: 'PUE',
    trazabilidadInfo: { fechaCobro: '2026-01-15' },
    pagosPresente: 'NO APLICA',
    pagosValido: 'SI',
    ivaTraslado: 160,
    isValid: true,
    tipoCFDI: 'I',
    total: 1160,
    resultado: '🟢 USABLE',
    ...over,
  } as unknown as ValidationResult);

  it('1. RECIBIDO válido + IVA trasladado → ACREDITABLE (comportamiento actual, no debe romperse)', () => {
    const out = applyFiscalRules(base({ direccionCFDI: 'RECIBIDO' as any }));
    expect(out.ivaCreditabilityStatus).toBe('ACREDITABLE');
  });

  it('2. EMITIDO → nunca ACREDITABLE (es IVA trasladado a cargo, no un crédito de la empresa)', () => {
    const out = applyFiscalRules(base({ direccionCFDI: 'EMITIDO' as any }));
    expect(out.ivaCreditabilityStatus).not.toBe('ACREDITABLE');
    expect(out.ivaCreditabilityStatus).toBe('TRASLADADO');
  });

  it('3. REQUIERE_REVISION + IVA trasladado + estructuralmente válido → JAMÁS ACREDITABLE (bug corregido)', () => {
    const out = applyFiscalRules(base({ direccionCFDI: 'REQUIERE_REVISION' as any }));
    expect(out.ivaCreditabilityStatus).not.toBe('ACREDITABLE');
    // Semántica existente más segura: no se afirma nada (ni ACREDITABLE ni
    // NO_ACREDITABLE) sobre un documento que no se sabe si es de la empresa.
    expect(out.ivaCreditabilityStatus).toBe('POR_DETERMINAR');
  });

  it('4. REQUIERE_REVISION + PPD sin REP → no se afirma una conclusión fiscal propia de la empresa (ni ACREDITABLE ni NO_ACREDITABLE)', () => {
    const out = applyFiscalRules(base({
      direccionCFDI: 'REQUIERE_REVISION' as any,
      metodoPago: 'PPD',
      pagosPresente: 'NO',
      pagosValido: 'NO',
    }));
    expect(out.ivaCreditabilityStatus).toBe('POR_DETERMINAR');
    expect(out.ivaCreditabilityStatus).not.toBe('ACREDITABLE');
    expect(out.ivaCreditabilityStatus).not.toBe('NO_ACREDITABLE');
  });

  it('5. CFDI de un tercero B↔C cargado mientras la empresa A está seleccionada → no suma IVA acreditable de A', () => {
    // Simula exactamente el escenario de la auditoría: ni emisor ni receptor
    // coinciden con el RFC de la empresa evaluada -> direccionCFDI queda
    // REQUIERE_REVISION (ver direccionCFDI.ts) -> nunca debe acreditarse.
    const cfdiDeTerceros = base({
      direccionCFDI: 'REQUIERE_REVISION' as any,
      rfcEmisor: 'BBB010101BB1',
      rfcReceptor: 'CCC010101CC1',
      rfcEmpresaEvaluada: 'AAA010101AA1',
    } as any);
    const out = applyFiscalRules(cfdiDeTerceros);
    expect(out.ivaCreditabilityStatus).not.toBe('ACREDITABLE');
  });

  it('6. Regresión: PPD sin complemento (dirección RECIBIDO) sigue NO_ACREDITABLE; PUE válido (RECIBIDO) sigue ACREDITABLE', () => {
    const ppdSinComplemento = applyFiscalRules(base({
      direccionCFDI: 'RECIBIDO' as any, metodoPago: 'PPD', pagosPresente: 'NO', pagosValido: 'NO',
    }));
    expect(ppdSinComplemento.ivaCreditabilityStatus).toBe('NO_ACREDITABLE');

    const pueValido = applyFiscalRules(base({ direccionCFDI: 'RECIBIDO' as any }));
    expect(pueValido.ivaCreditabilityStatus).toBe('ACREDITABLE');

    const pagosInvalidos = applyFiscalRules(base({ direccionCFDI: 'RECIBIDO' as any, pagosValido: 'NO' }));
    expect(pagosInvalidos.ivaCreditabilityStatus).toBe('NO_ACREDITABLE');
  });
});
