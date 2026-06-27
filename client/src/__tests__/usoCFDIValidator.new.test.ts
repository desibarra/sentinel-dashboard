import { describe, it, expect } from 'vitest';
import { validarUsoCFDI, CATALOGO_USOS_CFDI } from '@/lib/validators/usoCFDIValidator.new';

describe('validarUsoCFDI', () => {
  it('debe marcar critico cuando el uso CFDI esta vacio', () => {
    const result = validarUsoCFDI({
      usoCFDI: '',
      regimenReceptor: '601',
      montoTotal: 1000,
      conceptoDescripcion: 'Compra de mercancía',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('critico');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('no está especificado');
  });

  it('debe marcar alerta cuando el uso CFDI es desconocido', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'X99',
      regimenReceptor: '601',
      montoTotal: 1000,
      conceptoDescripcion: 'Compra de mercancía',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('no pertenece al catálogo conocido');
  });

  it('debe marcar alerta cuando D08 no describe donativo', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'D08',
      regimenReceptor: '601',
      montoTotal: 5000,
      conceptoDescripcion: 'Compra de suministros de oficina',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('pero el concepto no indica un donativo');
  });

  it('debe marcar alerta cuando P01 se usa para un concepto de mercancía', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'P01',
      regimenReceptor: '603',
      montoTotal: 12000,
      conceptoDescripcion: 'Compra de producto electrónico',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('se asocia a pagos o anticipos');
  });

  it('debe marcar alerta cuando I01 se usa para un servicio', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'I01',
      regimenReceptor: '601',
      montoTotal: 8000,
      conceptoDescripcion: 'Servicio de consultoría empresarial',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('pero el concepto parece corresponder a un servicio');
  });

  it('debe marcar alerta cuando CP01 se usa sin anticipo ni pago diferido', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'CP01',
      regimenReceptor: '601',
      montoTotal: 30000,
      conceptoDescripcion: 'Suministros de oficina',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('pero el concepto no describe un anticipo o pago diferido');
  });

  it('debe marcar alerta cuando S01 se usa con un servicio deducible', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'S01',
      regimenReceptor: '601',
      montoTotal: 15000,
      conceptoDescripcion: 'Honorarios profesionales',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('pero el concepto indica un servicio o mercancía');
  });

  it('debe marcar alerta cuando G02 no describe devolución ni descuento', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'G02',
      regimenReceptor: '601',
      montoTotal: 2000,
      conceptoDescripcion: 'Compra de material escolar',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('alerta');
    expect(result.mensaje).toContain('pero el concepto no describe una devolución o descuento');
  });

  it('debe marcar ok para G03 con concepto de gasto general', () => {
    const result = validarUsoCFDI({
      usoCFDI: 'G03',
      regimenReceptor: '601',
      montoTotal: 4500,
      conceptoDescripcion: 'Compra de insumos y material para oficina',
      claveProdServ: '01010101',
    });

    expect(result.nivel).toBe('ok');
    expect(result.valido).toBe(true);
    expect(result.descripcionUsoCFDI).toBe(CATALOGO_USOS_CFDI['G03']);
  });
});
