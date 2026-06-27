import { describe, expect, it } from 'vitest';
import { SustitucionInput, validarSustitucion } from '../lib/validators/sustitucionGlobalValidator.new';

describe('validarSustitucion', () => {
  it('detecta desfase cuando tipoRelacion es 04 y mesTimbrado difiere de mesOperacion', () => {
    const input: SustitucionInput = {
      uuid: 'A1',
      tipoRelacion: '04',
      fechaEmision: '2026-01-15T10:00:00',
      fechaTimbrado: '2026-02-03T09:00:00',
    };

    const result = validarSustitucion(input);

    expect(result.esSustitucion).toBe(true);
    expect(result.hayDesfase).toBe(true);
    expect(result.nivel).toBe('alerta');
    expect(result.mesTimbrado).toBe('2026-02');
    expect(result.mesOperacion).toBe('2026-01');
  });

  it('marca ok cuando tipoRelacion es 04 y el timbrado es en mismo período', () => {
    const input: SustitucionInput = {
      uuid: 'A2',
      tipoRelacion: '04',
      fechaEmision: '2026-01-15T10:00:00',
      fechaTimbrado: '2026-01-20T09:00:00',
    };

    const result = validarSustitucion(input);

    expect(result.esSustitucion).toBe(true);
    expect(result.hayDesfase).toBe(false);
    expect(result.nivel).toBe('ok');
    expect(result.mensaje).toContain('mismo período');
  });

  it('marca ok cuando tipoRelacion no es 04', () => {
    const input: SustitucionInput = {
      uuid: 'A3',
      tipoRelacion: '01',
      fechaEmision: '2026-01-15T10:00:00',
      fechaTimbrado: '2026-01-20T09:00:00',
    };

    const result = validarSustitucion(input);

    expect(result.esSustitucion).toBe(false);
    expect(result.nivel).toBe('ok');
    expect(result.hayDesfase).toBe(false);
  });

  it('marca ok cuando tipoRelacion es undefined', () => {
    const input: SustitucionInput = {
      uuid: 'A4',
      fechaEmision: '2026-01-15T10:00:00',
      fechaTimbrado: '2026-01-20T09:00:00',
    };

    const result = validarSustitucion(input);

    expect(result.esSustitucion).toBe(false);
    expect(result.nivel).toBe('ok');
  });

  it('detecta desfase en cambio de año entre diciembre y enero', () => {
    const input: SustitucionInput = {
      uuid: 'A5',
      tipoRelacion: '04',
      fechaEmision: '2025-12-30T12:00:00',
      fechaTimbrado: '2026-01-05T09:00:00',
    };

    const result = validarSustitucion(input);

    expect(result.hayDesfase).toBe(true);
    expect(result.nivel).toBe('alerta');
    expect(result.mesOperacion).toBe('2025-12');
    expect(result.mesTimbrado).toBe('2026-01');
  });
});
