import { describe, expect, it } from 'vitest';
import { reconcilePaymentComplements } from '../lib/fiscalRules';
import { ValidationResult, PagoRelacionadoDetalle } from '../lib/cfdiEngine';

// Estas pruebas fueron reescritas: reconcilePaymentComplements ahora es un
// ADAPTADOR delgado sobre la función central aplicarConciliacionPagos/
// reconciliarPagosPPD (cfdiEngine.ts) — no queda una segunda regla de
// negocio independiente. El emparejamiento ya NO usa uuids_relacionados
// (heurística vieja); usa pagosRelacionados, extraído de los nodos
// DoctoRelacionado del complemento de pago (misma fuente que Dashboard,
// Resumen, RESUMEN EJECUTIVO y Excel).

function pago(over: Partial<PagoRelacionadoDetalle> = {}): PagoRelacionadoDetalle {
  return {
    uuidFacturaRelacionada: 'AAAAAAAA-1111-1111-1111-111111111111',
    numParcialidad: 1,
    impSaldoAnt: 100,
    impPagado: 100,
    impSaldoInsoluto: 0,
    fechaPago: '2026-06-10',
    monedaP: 'MXN',
    tipoCambioP: 1,
    monedaDR: 'MXN',
    equivalenciaDR: 1,
    ...over,
  };
}

describe('Conciliación Complementos de Pago (Tipo P) — adaptador sobre función central', () => {
  it('marca COMPLETO cuando existe REP (pagosRelacionados) que referencia UUID del origin', () => {
    const origin = {
      uuid: 'AAAAAAAA-1111-1111-1111-111111111111', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: '2026-06-01', total: 100, fileName: 'o1.xml',
    } as unknown as ValidationResult;
    const rep = {
      uuid: 'REP00001-0000-0000-0000-000000000001', tipoCFDI: 'P', fechaEmision: '2026-06-10',
      pagosRelacionados: [pago({ uuidFacturaRelacionada: origin.uuid })], fileName: 'p1.xml',
    } as unknown as ValidationResult;

    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === origin.uuid)!;
    expect(o.paymentComplementStatus).toBe('COMPLETO');
    expect(o.pagosRelacionadosEstado).toBe('LIQUIDADA');
  });

  it('marca SIN_COMPLEMENTO cuando no hay REP relacionado (PPD posterior al 01/09/2018)', () => {
    const origin = {
      uuid: 'BBBBBBBB-2222-2222-2222-222222222222', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: '2026-06-01', total: 100, fileName: 'o2.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin]);
    expect(out[0].paymentComplementStatus).toBe('SIN_COMPLEMENTO');
    expect(out[0].pagosRelacionadosEstado).toBe('SIN_EVIDENCIA_REP');
  });

  it('marca COMPLEMENTO_FUERA_DE_PERIODO cuando el pago llega >90 días después de la factura (nota informativa, no regla aparte)', () => {
    const origin = {
      uuid: 'CCCCCCCC-3333-3333-3333-333333333333', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: '2026-01-01', total: 100, fileName: 'o3.xml',
    } as unknown as ValidationResult;
    const rep = {
      uuid: 'REP00002-0000-0000-0000-000000000002', tipoCFDI: 'P', fechaEmision: '2026-06-10',
      pagosRelacionados: [pago({ uuidFacturaRelacionada: origin.uuid, fechaPago: '2026-06-10' })], fileName: 'p2.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === origin.uuid)!;
    expect(o.paymentComplementStatus).toBe('COMPLEMENTO_FUERA_DE_PERIODO');
    // La reconciliación de saldo sigue siendo LIQUIDADA — el periodo es solo informativo.
    expect(o.pagosRelacionadosEstado).toBe('LIQUIDADA');
  });

  it('parsea formatos ISO y date-only y marca COMPLETO cuando dentro de ventana', () => {
    const origin = {
      uuid: 'DDDDDDDD-4444-4444-4444-444444444444', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: '2024-01-31', total: 100, fileName: 'o4.xml',
    } as unknown as ValidationResult;
    const rep = {
      uuid: 'REP00004-0000-0000-0000-000000000004', tipoCFDI: 'P', fechaEmision: '2024-02-15T10:20:00',
      pagosRelacionados: [pago({ uuidFacturaRelacionada: origin.uuid, fechaPago: '2024-02-15T10:20:00' })], fileName: 'p4.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, rep]);
    const o = out.find(x => x.uuid === origin.uuid)!;
    expect(o.paymentComplementStatus).toBe('COMPLETO');
  });

  it('marca SIN_COMPLEMENTO cuando la fecha de la factura PPD no es parseable y no hay REP (la fecha de la FACTURA nunca decide esto — sin REP no se conoce la fecha de pago)', () => {
    const origin = {
      uuid: 'EEEEEEEE-5555-5555-5555-555555555555', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: 'fecha inválida', total: 100, fileName: 'o5.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin]);
    const o = out[0];
    expect(o.paymentComplementStatus).toBe('SIN_COMPLEMENTO');
    expect(o.pagosRelacionadosEstado).toBe('SIN_EVIDENCIA_REP');
  });

  it('marca REVISAR_FECHA (AMARILLO) cuando el REP existe pero su FechaPago no es parseable — el dinero no se descarta, pero se marca para revisión', () => {
    const origin = {
      uuid: 'FFFFFFFF-6666-6666-6666-666666666666', tipoCFDI: 'I', metodoPago: 'PPD',
      fechaEmision: '2026-06-01', total: 100, fileName: 'o6.xml',
    } as unknown as ValidationResult;
    const repDoc = {
      uuid: 'REP00006-0000-0000-0000-000000000006', tipoCFDI: 'P', fechaEmision: '2026-06-10',
      pagosRelacionados: [pago({ uuidFacturaRelacionada: origin.uuid, fechaPago: 'fecha inválida' })], fileName: 'p6.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([origin, repDoc]);
    const o = out.find(x => x.uuid === origin.uuid)!;
    expect(o.paymentComplementStatus).toBe('REVISAR_FECHA');
    expect(o.fiscalRiskLevel).toBe('AMARILLO');
    expect(o.pagosRelacionadosEstado).toBe('REQUIERE_REVISION_FECHA');
    expect(String(o.pagosRelacionadosObservacion)).toMatch(/fecha de pago insuficiente/i);
  });

  it('marca UUID_RELACIONADO_NO_ENCONTRADO cuando el REP referencia un UUID que no está en este análisis', () => {
    const rep = {
      uuid: 'REP00003-0000-0000-0000-000000000003', tipoCFDI: 'P', fechaEmision: '2026-06-10',
      pagosRelacionados: [pago({ uuidFacturaRelacionada: '00000000-0000-0000-0000-000000000099' })], fileName: 'p3.xml',
    } as unknown as ValidationResult;
    const out = reconcilePaymentComplements([rep]);
    expect(out[0].paymentComplementStatus).toBe('UUID_RELACIONADO_NO_ENCONTRADO');
  });
});
