import { describe, expect, it } from 'vitest';
import { CFDIMetodoPagoInput, validarMetodosPago } from '../lib/validators/metodoPagoValidator.new';

describe('validarMetodosPago', () => {
  it('marca PPD sin complemento como alerta y asigna ivaEnRiesgo', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'AAA111',
        metodoPago: 'PPD',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-01-01',
        rfcEmisor: 'AAA010101AAA',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 1000,
        ivaTotal: 160,
      },
    ];

    const [result] = validarMetodosPago(input);

    expect(result.nivel).toBe('alerta');
    expect(result.tieneComplemento).toBe(false);
    expect(result.ivaEnRiesgo).toBe(160);
    expect(result.mensaje).toContain('PPD sin complemento');
  });

  it('detecta PPD con complemento en el lote y no asigna ivaEnRiesgo', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'AAA111',
        metodoPago: 'PPD',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-01-01',
        rfcEmisor: 'AAA010101AAA',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 1000,
        ivaTotal: 160,
      },
      {
        uuid: 'REP111',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-02-01',
        rfcEmisor: 'AAA010101AAA',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
        uuidRelacionados: ['AAA111'],
      },
    ];

    const results = validarMetodosPago(input);
    const factura = results.find(r => r.uuid === 'AAA111');

    expect(factura).toBeDefined();
    expect(factura?.tieneComplemento).toBe(true);
    expect(factura?.ivaEnRiesgo).toBe(0);
    expect(factura?.nivel).toBe('ok');
  });

  it('marca CFDI tipo P con total distinto de 0 como critico', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'REP222',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-03-01',
        rfcEmisor: 'BBB010101BBB',
        nombreEmisor: 'PAGOS S.A. DE C.V.',
        montoTotal: 100,
        ivaTotal: 0,
        uuidRelacionados: ['BBB111'],
      },
    ];

    const [result] = validarMetodosPago(input);

    expect(result.nivel).toBe('critico');
    expect(result.mensaje).toContain('Total=0.00');
  });

  it('marca CFDI tipo P sin UUID relacionados como alerta', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'REP333',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-04-01',
        rfcEmisor: 'CCC010101CCC',
        nombreEmisor: 'PAGOS S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
      },
    ];

    const [result] = validarMetodosPago(input);

    expect(result.nivel).toBe('alerta');
    expect(result.tieneComplemento).toBe(false);
    expect(result.mensaje).toContain('sin UUIDs relacionados');
  });

  it('marca CFDI PUE como ok y no riesgo de IVA', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'CCC111',
        metodoPago: 'PUE',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-05-01',
        rfcEmisor: 'CCC010101CCC',
        nombreEmisor: 'CLIENTE S.A. DE C.V.',
        montoTotal: 1500,
        ivaTotal: 240,
      },
    ];

    const [result] = validarMetodosPago(input);

    expect(result.nivel).toBe('ok');
    expect(result.ivaEnRiesgo).toBe(0);
    expect(result.mensaje).toContain('PUE');
  });

  it('tolera mayúsculas/mínúsculas en metodoPago y tipoDeComprobante', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'aaa222',
        metodoPago: 'ppd',
        formaPago: '03',
        tipoDeComprobante: 'i',
        fecha: '2024-06-01',
        rfcEmisor: 'AAA010101AAA',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 2000,
        ivaTotal: 320,
      },
      {
        uuid: 'rep222',
        metodoPago: 'ppd',
        formaPago: '99',
        tipoDeComprobante: 'p',
        fecha: '2024-06-15',
        rfcEmisor: 'AAA010101AAA',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
        uuidRelacionados: ['AAA222'],
      },
    ];

    const results = validarMetodosPago(input);
    const factura = results.find(r => r.uuid === 'AAA222');

    expect(factura).toBeDefined();
    expect(factura?.tieneComplemento).toBe(true);
    expect(factura?.nivel).toBe('ok');
  });

  it('marca PPD con complemento externo por UUID relacionado en lote', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'DDD111',
        metodoPago: 'PPD',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-07-01',
        rfcEmisor: 'DDD010101DDD',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 500,
        ivaTotal: 80,
      },
      {
        uuid: 'REP444',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-07-12',
        rfcEmisor: 'DDD010101DDD',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
        uuidRelacionados: ['DDD111'],
      },
    ];

    const results = validarMetodosPago(input);
    const factura = results.find(r => r.uuid === 'DDD111');

    expect(factura).toBeDefined();
    expect(factura?.tieneComplemento).toBe(true);
    expect(factura?.ivaEnRiesgo).toBe(0);
  });

  it('mantiene ok para CFDI no PPD con complemento presente en lote', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'EEE111',
        metodoPago: 'PUE',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-08-01',
        rfcEmisor: 'EEE010101EEE',
        nombreEmisor: 'CLIENTE S.A. DE C.V.',
        montoTotal: 1200,
        ivaTotal: 192,
      },
      {
        uuid: 'REP555',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-08-12',
        rfcEmisor: 'EEE010101EEE',
        nombreEmisor: 'CLIENTE S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
        uuidRelacionados: ['EEE111'],
      },
    ];

    const results = validarMetodosPago(input);
    const factura = results.find(r => r.uuid === 'EEE111');
    const rep = results.find(r => r.uuid === 'REP555');

    expect(factura?.nivel).toBe('ok');
    expect(rep?.nivel).toBe('ok');
  });

  it('marca alerta cuando PPD usa complemento dentro mismo lote con matching UUID', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'FFF111',
        metodoPago: 'PPD',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-09-01',
        rfcEmisor: 'FFF010101FFF',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 800,
        ivaTotal: 128,
      },
      {
        uuid: 'REP666',
        metodoPago: 'PPD',
        formaPago: '99',
        tipoDeComprobante: 'P',
        fecha: '2024-09-20',
        rfcEmisor: 'FFF010101FFF',
        nombreEmisor: 'EMISOR S.A. DE C.V.',
        montoTotal: 0,
        ivaTotal: 0,
        uuidRelacionados: ['FFF111'],
      },
    ];

    const results = validarMetodosPago(input);
    const factura = results.find(r => r.uuid === 'FFF111');

    expect(factura?.tieneComplemento).toBe(true);
    expect(factura?.nivel).toBe('ok');
  });

  it('asigna ok a PUE sin complementos y no incrementa riesgo de IVA', () => {
    const input: CFDIMetodoPagoInput[] = [
      {
        uuid: 'GGG111',
        metodoPago: 'PUE',
        formaPago: '03',
        tipoDeComprobante: 'I',
        fecha: '2024-10-01',
        rfcEmisor: 'GGG010101GGG',
        nombreEmisor: 'CLIENTE S.A. DE C.V.',
        montoTotal: 2200,
        ivaTotal: 352,
      },
    ];

    const [result] = validarMetodosPago(input);

    expect(result.nivel).toBe('ok');
    expect(result.ivaEnRiesgo).toBe(0);
  });
});
