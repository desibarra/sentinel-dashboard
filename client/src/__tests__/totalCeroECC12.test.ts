import { describe, it, expect } from 'vitest';
import { classifyCFDI } from '../lib/cfdiEngine';

function analyzeECC12(total: string, isValid: boolean, diferencia: number) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0" SubTotal="0.00" Total="${total}" TipoDeComprobante="I" Moneda="MXN"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:ecc12="http://www.sat.gob.mx/EstadoDeCuentaCombustible">
  <cfdi:Emisor Nombre="GASOLINERA SA" Rfc="AAA010101AAA"/>
  <ecc12:EstadoDeCuentaCombustible/>
</cfdi:Comprobante>`;

  return classifyCFDI(
    xml,
    '4.0',
    'I',
    { desglosePorConcepto: [] },
    { isValid, calculado: parseFloat(total), diferencia },
    false,
    {},
    { presente: false, valido: 'SI' },
    { presente: 'NO', completa: 'NO APLICA', version: 'NO APLICA' },
    'NO',
    '',
    undefined,
  );
}

describe('Total=0 con complemento ECC12 (función real classifyCFDI)', () => {
  it('1. ECC12 vigente con total cero válido → USABLE con mensaje informativo', () => {
    const r = analyzeECC12('0.00', true, 0);
    expect(r.resultado).toBe('🟢 USABLE');
    expect(r.nivelValidacion).toBe('ECC12 - TOTAL CERO');
    expect(r.comentarioFiscal).toContain('total cero');
    expect(r.comentarioFiscal).toContain('Estado de Cuenta de Combustibles');
  });

  it('2. ECC12 inconsistente (validación inválida) → ALERTA', () => {
    const r = analyzeECC12('0.00', false, 100);
    expect(r.resultado).toBe('🟡 ALERTA');
    expect(r.comentarioFiscal).toContain('Diferencia de totales');
  });

  it('3. ECC12 con total no cero y válido → USABLE', () => {
    const r = analyzeECC12('1500.00', true, 0);
    expect(r.resultado).toBe('🟢 USABLE');
    expect(r.comentarioFiscal).toContain('complemento');
  });

  it('4. ECC12 con total no cero e inconsistente → ALERTA', () => {
    const r = analyzeECC12('1500.00', false, 25);
    expect(r.resultado).toBe('🟡 ALERTA');
  });
});
