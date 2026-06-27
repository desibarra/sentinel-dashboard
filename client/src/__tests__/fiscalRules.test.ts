import { describe, expect, it } from 'vitest';
import { applyFiscalRules } from '../lib/fiscalRules';
import { ValidationResult } from '../lib/cfdiEngine';

describe('applyFiscalRules', () => {
  it('marca PPD sin complemento como NO_ACREDITABLE y ROJO', () => {
    const r = {
      uuid: 'AAA',
      metodoPago: 'PPD',
      pagosPresente: 'NO',
      pagosValido: 'NO',
      ivaTraslado: 160,
      isValid: true,
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
