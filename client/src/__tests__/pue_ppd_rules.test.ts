import { describe, expect, it } from 'vitest';
import { applyFiscalRules } from '../lib/fiscalRules';
import { ValidationResult } from '../lib/cfdiEngine';

describe('PUE vs PPD rules', () => {
  it('clasifica PUE_VALIDO cuando hay fecha de cobro en trazabilidad', () => {
    const r = { metodoPago: 'PUE', trazabilidadInfo: { fechaCobro: '2026-06-10' }, ivaTraslado: 100, isValid: true } as unknown as ValidationResult;
    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PUE_VALIDO');
    expect(out.paymentComplementStatus).toBe('NO APLICA');
    expect(out.fiscalRiskLevel).not.toBe('ROJO');
  });

  it('clasifica PUE_REVISAR_COBRO cuando no hay evidencia de cobro', () => {
    const r = { metodoPago: 'PUE', trazabilidadInfo: {}, ivaTraslado: 100, isValid: true } as unknown as ValidationResult;
    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PUE_REVISAR_COBRO');
    expect(out.paymentComplementStatus).toBe('NO APLICA');
    expect(out.fiscalRiskLevel).toBe('AMARILLO');
  });

  it('clasifica PPD_CON_COMPLEMENTO cuando pagos presentes y válidos', () => {
    const r = { metodoPago: 'PPD', pagosPresente: 'SI', pagosValido: 'SI', ivaTraslado: 160, isValid: true } as unknown as ValidationResult;
    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PPD_CON_COMPLEMENTO');
    expect(out.paymentComplementStatus).toBe('COMPLETO');
  });

  it('clasifica PPD_REVISAR_COMPLEMENTO cuando pagos presentes pero inválidos', () => {
    const r = { metodoPago: 'PPD', pagosPresente: 'SI', pagosValido: 'NO', ivaTraslado: 160, isValid: true } as unknown as ValidationResult;
    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PPD_REVISAR_COMPLEMENTO');
    expect(out.paymentComplementStatus).toBe('SIN_COMPLEMENTO');
    expect(out.fiscalRiskLevel).toBe('ROJO');
  });

  it('clasifica PPD_SIN_COMPLEMENTO cuando no hay pagos presentes', () => {
    const r = { metodoPago: 'PPD', pagosPresente: 'NO', pagosValido: 'NO', ivaTraslado: 160, isValid: true } as unknown as ValidationResult;
    const out = applyFiscalRules(r);
    expect(out.paymentMethodStatus).toBe('PPD_SIN_COMPLEMENTO');
    expect(out.paymentComplementStatus).toBe('SIN_COMPLEMENTO');
    expect(out.ivaCreditabilityStatus).toBe('NO_ACREDITABLE');
  });
});
