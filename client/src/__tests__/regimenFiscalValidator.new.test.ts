import { describe, it, expect } from 'vitest';
import { validarRegimenFiscal, CATALOGO_REGIMENES } from '@/lib/validators/regimenFiscalValidator.new';

describe('validarRegimenFiscal', () => {
  it('debe marcar critico cuando el regimen esta vacio', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '',
      usoCFDI: 'G01',
      montoTotal: 1000,
      conceptoDescripcion: 'Producto general',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('critico');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('no está especificado');
    expect(result.fundamento).toBe('Art. 29-A CFF, tercer párrafo');
  });

  it('debe marcar critico para regimen 606 con honorarios profesionales', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '606',
      usoCFDI: 'G03',
      montoTotal: 12000,
      conceptoDescripcion: 'Honorarios profesionales de consultoría',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('critico');
    expect(result.mensaje).toContain('no permite deducir servicios profesionales');
  });

  it('debe marcar critico para regimen 606 con clave 52 de vehiculos', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '606',
      usoCFDI: 'G03',
      montoTotal: 150000,
      conceptoDescripcion: 'Renta de vehículo',
      claveProdServ: '52161500',
    });

    expect(result.nivel).toBe('critico');
    expect(result.mensaje).toContain('conceptos de vehículo o clave 52');
  });

  it('debe marcar alerta para regimen 626 con monto 500000', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '626',
      usoCFDI: 'P01',
      montoTotal: 500000,
      conceptoDescripcion: 'Servicios varios',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('excede $300,000 MXN');
    expect(result.fundamento).toBe('Art. 29-A CFF, tercer párrafo');
  });

  it('debe marcar alerta para regimen desconocido', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '999',
      usoCFDI: 'G01',
      montoTotal: 50000,
      conceptoDescripcion: 'Compra de insumos',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.descripcionRegimen).toBe('Régimen desconocido');
  });

  it('debe marcar ok para regimen 601 con concepto normal', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '601',
      usoCFDI: 'G01',
      montoTotal: 50000,
      conceptoDescripcion: 'Compra de mercancía',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('ok');
    expect(result.valido).toBe(true);
  });

  it('debe retornar descripcionRegimen correcta para regimen 606', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '606',
      usoCFDI: 'G01',
      montoTotal: 50000,
      conceptoDescripcion: 'Renta de local',
      claveProdServ: '01010101',
    });

    expect(result.descripcionRegimen).toBe(CATALOGO_REGIMENES['606']);
  });

  it('debe retornar el fundamento siempre', () => {
    const result = validarRegimenFiscal({
      regimenReceptor: '601',
      usoCFDI: 'G01',
      montoTotal: 50000,
      conceptoDescripcion: 'Compra de mercancía',
      claveProdServ: '01010101',
    });

    expect(result.fundamento).toBe('Art. 29-A CFF, tercer párrafo');
  });
});
