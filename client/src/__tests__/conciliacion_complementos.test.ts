import { describe, expect, it } from 'vitest';
import { reconcilePaymentComplements } from '../lib/fiscalRules';
import { ValidationResult } from '../lib/cfdiEngine';

describe('Conciliación Complementos de Pago (Tipo P)', () => {
  it('marca COMPLETO cuando existe REP que referencia UUID del origin', () => {
    const origin: ValidationResult = {
      uuid: 'AAA-111', tipoCFDI: 'I', fechaEmision: '2026-06-01', fileName: 'o1.xml',
    } as unknown as ValidationResult;
    const rep: ValidationResult = {
      uuid: 'REP-1', tipoCFDI: 'P', fechaEmision: '2026-06-10', uuids_relacionados: ['AAA-111'], fileName: 'p1.xml'
    } as unknown as ValidationResult;

    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === 'AAA-111')!;
    expect(o.paymentComplementStatus).toBe('COMPLETO');
  });

  it('marca SIN_COMPLEMENTO cuando no hay REP relacionado', () => {
    const origin: ValidationResult = { uuid: 'BBB-222', tipoCFDI: 'I', fechaEmision: '2026-06-01', fileName: 'o2.xml' } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin]);
    expect(out[0].paymentComplementStatus).toBe('SIN_COMPLEMENTO');
  });

  it('marca COMPLEMENTO_FUERA_DE_PERIODO cuando REP es >90 días después', () => {
    const origin: ValidationResult = { uuid: 'CCC-333', tipoCFDI: 'I', fechaEmision: '2026-01-01', fileName: 'o3.xml' } as unknown as ValidationResult;
    const rep: ValidationResult = { uuid: 'REP-2', tipoCFDI: 'P', fechaEmision: '2026-06-10', uuids_relacionados: ['CCC-333'], fileName: 'p2.xml' } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === 'CCC-333')!;
    expect(o.paymentComplementStatus).toBe('COMPLEMENTO_FUERA_DE_PERIODO');
  });

  it('parsea formatos ISO y date-only y marca COMPLETO cuando dentro de ventana', () => {
    const origin: ValidationResult = { uuid: 'D-444', tipoCFDI: 'I', fechaEmision: '2024-01-31', fileName: 'o4.xml' } as unknown as ValidationResult;
    const rep: ValidationResult = { uuid: 'REP-4', tipoCFDI: 'P', fechaEmision: '2024-02-15T10:20:00', uuids_relacionados: ['D-444'], fileName: 'p4.xml' } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === 'D-444')!;
    expect(o.paymentComplementStatus).toBe('COMPLETO');
  });

  it('marca AMARILLO y REVISAR_FECHA cuando fecha inválida no parseable', () => {
    const origin: ValidationResult = { uuid: 'E-555', tipoCFDI: 'I', fechaEmision: 'fecha inválida', fileName: 'o5.xml' } as unknown as ValidationResult;
    const rep: ValidationResult = { uuid: 'REP-5', tipoCFDI: 'P', fechaEmision: '2024-02-01', uuids_relacionados: ['E-555'], fileName: 'p5.xml' } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === 'E-555')!;
    expect(o.fiscalRiskLevel).toBe('AMARILLO');
    expect(String(o.fiscalRuleApplied)).toMatch(/REVISAR_FECHA/);
  });

  it('marca UUID_RELACIONADO_NO_ENCONTRADO cuando REP referencia UUID desconocido', () => {
    const rep: ValidationResult = { uuid: 'REP-3', tipoCFDI: 'P', fechaEmision: '2026-06-10', uuids_relacionados: ['NOT-FOUND'], fileName: 'p3.xml' } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([rep]);
    expect(out[0].paymentComplementStatus).toBe('UUID_RELACIONADO_NO_ENCONTRADO');
  });
});
