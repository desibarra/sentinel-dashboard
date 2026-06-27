import { describe, expect, it } from 'vitest';
import { ExportacionInput, validarExportacion } from '../lib/validators/exportacionValidator.new';

describe('validarExportacion', () => {
  it('no aplica cuando exportacion es 00', () => {
    const input: ExportacionInput = {
      uuid: 'B1',
      exportacion: '00',
      moneda: 'USD',
      tieneImpuestoTasa0: false,
      tieneComplementoComex: false,
      rfcReceptor: 'XEXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.esExportacion).toBe(false);
    expect(result.nivel).toBe('ok');
    expect(result.clasificacionCorrecta).toBe('no_aplica');
  });

  it('critico para exportacion 02 sin tasa 0%', () => {
    const input: ExportacionInput = {
      uuid: 'B2',
      exportacion: '02',
      moneda: 'USD',
      tieneImpuestoTasa0: false,
      tieneComplementoComex: true,
      rfcReceptor: 'XEXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.nivel).toBe('critico');
    expect(result.clasificacionCorrecta).toBe('exportacion_tasa0');
  });

  it('alerta para exportacion 01 sin complemento comex pero con tasa 0', () => {
    const input: ExportacionInput = {
      uuid: 'B3',
      exportacion: '01',
      moneda: 'EUR',
      tieneImpuestoTasa0: true,
      tieneComplementoComex: false,
      rfcReceptor: 'XEXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.nivel).toBe('alerta');
    expect(result.clasificacionCorrecta).toBe('exportacion_tasa0');
  });

  it('ok para exportacion 01 con complemento comex y tasa 0', () => {
    const input: ExportacionInput = {
      uuid: 'B4',
      exportacion: '01',
      moneda: 'EUR',
      tieneImpuestoTasa0: true,
      tieneComplementoComex: true,
      rfcReceptor: 'XEXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.nivel).toBe('ok');
    expect(result.clasificacionCorrecta).toBe('exportacion_tasa0');
  });

  it('ok para exportacion 03 con tasa 0', () => {
    const input: ExportacionInput = {
      uuid: 'B5',
      exportacion: '03',
      moneda: 'USD',
      tieneImpuestoTasa0: true,
      tieneComplementoComex: false,
      rfcReceptor: 'XEXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.nivel).toBe('ok');
    expect(result.clasificacionCorrecta).toBe('exportacion_tasa0');
  });

  it('no aplica cuando exportacion está vacío', () => {
    const input: ExportacionInput = {
      uuid: 'B6',
      exportacion: '',
      moneda: 'MXN',
      tieneImpuestoTasa0: false,
      tieneComplementoComex: false,
      rfcReceptor: 'XAXX010101000',
    };

    const result = validarExportacion(input);

    expect(result.esExportacion).toBe(false);
    expect(result.nivel).toBe('ok');
    expect(result.clasificacionCorrecta).toBe('no_aplica');
  });
});
