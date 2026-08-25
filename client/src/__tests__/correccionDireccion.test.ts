import { describe, it, expect, beforeAll } from 'vitest';
import {
  determinarDireccionCFDI,
  resolverClasificacionDireccion,
  normalizarRFC,
  type DireccionCFDI,
} from '../lib/direccionCFDI';
import { applyFiscalRules } from '../lib/fiscalRules';
import { getSatExportFields, buildDiagnosticoWorkbook } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';

// ───────────────────────────────────────────────────────────────────────────
// Fixture factory: un ValidationResult mínimo pero completo y válido.
// ───────────────────────────────────────────────────────────────────────────
const EMPRESA = 'EMP000000EMP';

function baseResult(uuid: string, over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    fileName: `${uuid}.xml`,
    uuid,
    versionCFDI: '4.0',
    tipoCFDI: 'I',
    serie: 'A',
    folio: '1',
    fechaEmision: '2026-06-01',
    horaEmision: '12:00:00',
    añoFiscal: 2026,
    estatusSAT: 'Vigente',
    fechaCancelacion: '',
    cfdiSustituido: 'NO',
    uuidSustitucion: 'NO APLICA',
    rfcEmisor: 'EMI010101EMI',
    nombreEmisor: 'EMISOR SA',
    regimenEmisor: '601',
    estadoSATEmisor: 'Vigente',
    rfcReceptor: 'REC010101REC',
    nombreReceptor: 'RECEPTOR SA',
    regimenReceptor: '601',
    usoCFDI: 'G03',
    cpReceptor: '01000',
    tieneCfdiRelacionados: 'NO',
    tipoRelacion: 'NO APLICA',
    uuidRelacionado: 'NO APLICA',
    uuids_relacionados: [],
    tipoRealDocumento: 'Ingreso',
    requiereCartaPorte: 'NO',
    cartaPorte: 'NO',
    cartaPorteCompleta: 'NO APLICA',
    versionCartaPorte: 'NO APLICA',
    pagosPresente: 'NO',
    versionPagos: 'NO APLICA',
    pagosValido: 'NO APLICA',
    encodingDetectado: 'UTF-8',
    complementosDetectados: [],
    scoreInformativo: 100,
    subtotal: 100,
    baseIVA16: 100,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'GRAVADO',
    ivaTraslado: 16,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 116,
    moneda: 'MXN',
    tipoCambio: 1,
    formaPago: '01',
    metodoPago: 'PUE',
    nivelValidacion: 'ESTRUCTURAL',
    resultado: '🟢 USABLE',
    comentarioFiscal: '',
    observacionesTecnicas: '',
    iva: 16,
    isValid: true,
    totalCalculado: 116,
    diferenciaTotales: 0,
    desglosePorConcepto: [],
    desglose: '',
    esNomina: 'NO',
    versionNomina: 'NO APLICA',
    totalPercepciones: 0,
    totalDeducciones: 0,
    totalOtrosPagos: 0,
    isrRetenidoNomina: 0,
    totalCalculadoNomina: 0,
    observacionesContador: '',
    descuentoGlobal: 0,
    condicionesDePago: 'NO VIENE EN XML',
    ...over,
  } as unknown as ValidationResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) determinarDireccionCFDI — función pura de clasificación
// ═══════════════════════════════════════════════════════════════════════════
describe('determinarDireccionCFDI (función pura)', () => {
  it('1. Empresa = EMISOR de un tipo I => EMITIDO (su venta/ingreso)', () => {
    expect(determinarDireccionCFDI({ rfcEmisor: EMPRESA, rfcReceptor: 'CLI' }, EMPRESA)).toBe('EMITIDO');
  });

  it('2. Empresa = RECEPTOR de un tipo I => RECIBIDO (su compra, NO ingreso propio)', () => {
    expect(determinarDireccionCFDI({ rfcEmisor: 'PROV', rfcReceptor: EMPRESA }, EMPRESA)).toBe('RECIBIDO');
  });

  it('3. Empresa ni emisor ni receptor => REQUIERE_REVISION', () => {
    expect(determinarDireccionCFDI({ rfcEmisor: 'PROV', rfcReceptor: 'CLI' }, EMPRESA)).toBe('REQUIERE_REVISION');
  });

  it('4. Autofacturación (emisor == receptor == empresa) => REQUIERE_REVISION (ambiguo)', () => {
    expect(determinarDireccionCFDI({ rfcEmisor: EMPRESA, rfcReceptor: EMPRESA }, EMPRESA)).toBe('REQUIERE_REVISION');
  });

  it('5. Sin RFC de empresa => REQUIERE_REVISION (no se puede inferir)', () => {
    expect(determinarDireccionCFDI({ rfcEmisor: 'PROV', rfcReceptor: 'CLI' }, '')).toBe('REQUIERE_REVISION');
  });

  it('6. Normaliza mayúsculas, espacios y guiones (RFC con formato sucio)', () => {
    const dirty = ' emp-000-000-emp ';
    expect(normalizarRFC(dirty)).toBe(EMPRESA);
    expect(determinarDireccionCFDI({ rfcEmisor: dirty, rfcReceptor: 'CLI' }, EMPRESA)).toBe('EMITIDO');
  });

  it('7. Nunca hardcodea TVA060209QL6: usa el RFC recibido como parámetro', () => {
    const otroRfc = 'XYZ123456XYZ';
    expect(determinarDireccionCFDI({ rfcEmisor: otroRfc, rfcReceptor: 'CLI' }, otroRfc)).toBe('EMITIDO');
    expect(determinarDireccionCFDI({ rfcEmisor: 'PROV', rfcReceptor: otroRfc }, otroRfc)).toBe('RECIBIDO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) resolverClasificacionDireccion — naturaleza e impacto de IVA
// ═══════════════════════════════════════════════════════════════════════════
describe('resolverClasificacionDireccion (naturaleza + impacto IVA)', () => {
  it('8. EMITIDO + tipo I => INGRESO/VENTA, IVA TRASLADADO (A CARGO)', () => {
    const c = resolverClasificacionDireccion({ rfcEmisor: EMPRESA, rfcReceptor: 'CLI' }, EMPRESA, 'I', false);
    expect(c.direccionCFDI).toBe('EMITIDO');
    expect(c.naturalezaParaEmpresa).toBe('INGRESO/VENTA');
    expect(c.impactoIVA).toContain('TRASLADADO');
    expect(c.rfcEmpresaEvaluada).toBe(EMPRESA);
  });

  it('9. RECIBIDO + tipo I => COMPRA/GASTO, IVA ACREDITABLE (A FAVOR)', () => {
    const c = resolverClasificacionDireccion({ rfcEmisor: 'PROV', rfcReceptor: EMPRESA }, EMPRESA, 'I', false);
    expect(c.direccionCFDI).toBe('RECIBIDO');
    expect(c.naturalezaParaEmpresa).toBe('COMPRA/GASTO');
    expect(c.impactoIVA).toContain('ACREDITABLE');
  });

  it('10. EMITIDO + tipo E => NOTA DE CREDITO EMITIDA', () => {
    const c = resolverClasificacionDireccion({ rfcEmisor: EMPRESA, rfcReceptor: 'CLI' }, EMPRESA, 'E', false);
    expect(c.naturalezaParaEmpresa).toBe('NOTA DE CREDITO EMITIDA');
  });

  it('11. RECIBIDO + tipo P => COMPLEMENTO DE PAGO, NO APLICA IVA', () => {
    const c = resolverClasificacionDireccion({ rfcEmisor: 'PROV', rfcReceptor: EMPRESA }, EMPRESA, 'P', false);
    expect(c.naturalezaParaEmpresa).toBe('COMPLEMENTO DE PAGO');
    expect(c.impactoIVA).toContain('NO APLICA');
  });

  it('12. Nómina emitida => NOMINA (sin IVA a favor)', () => {
    const c = resolverClasificacionDireccion({ rfcEmisor: EMPRESA, rfcReceptor: 'CLI' }, EMPRESA, 'N', true);
    expect(c.naturalezaParaEmpresa).toBe('NOMINA');
    expect(c.impactoIVA).toContain('NOMINA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) Contradicción de riesgo fiscal (applyFiscalRules)
// ═══════════════════════════════════════════════════════════════════════════
describe('Corrección de riesgo fiscal (applyFiscalRules)', () => {
  it('13. NO USABLE nunca queda en VERDE => ROJO (hay hallazgo)', () => {
    const r = applyFiscalRules(
      baseResult('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', {
        resultado: '🔴 NO USABLE',
        direccionCFDI: 'RECIBIDO' as DireccionCFDI,
        ivaTraslado: 0,
      })
    );
    expect(r.fiscalRiskLevel).not.toBe('VERDE');
    expect(r.fiscalRiskLevel).toBe('ROJO');
  });

  it('14. "No validado SAT" nunca queda en VERDE => AMARILLO', () => {
    const r = applyFiscalRules(
      baseResult('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', {
        resultado: 'No validado SAT',
        direccionCFDI: 'RECIBIDO' as DireccionCFDI,
      })
    );
    expect(r.fiscalRiskLevel).not.toBe('VERDE');
    expect(r.fiscalRiskLevel).toBe('AMARILLO');
  });

  it('15. EMITIDO con IVA trasladado => IVA TRASLADADO (no ACREDITABLE para la empresa)', () => {
    const r = applyFiscalRules(
      baseResult('cccccccc-3333-4333-8333-cccccccccccc', {
        direccionCFDI: 'EMITIDO' as DireccionCFDI,
        ivaTraslado: 1600,
        isValid: true,
        pagosValido: 'SI',
      })
    );
    expect(r.ivaCreditabilityStatus).toBe('TRASLADADO');
  });

  it('16. RECIBIDO con IVA trasladado y pagos válidos => ACREDITABLE', () => {
    const r = applyFiscalRules(
      baseResult('dddddddd-4444-4444-8444-dddddddddddd', {
        direccionCFDI: 'RECIBIDO' as DireccionCFDI,
        ivaTraslado: 1600,
        isValid: true,
        pagosValido: 'SI',
      })
    );
    expect(r.ivaCreditabilityStatus).toBe('ACREDITABLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4) Contradicción de columnas SAT (getSatExportFields)
// ═══════════════════════════════════════════════════════════════════════════
describe('Corrección de columnas SAT (getSatExportFields)', () => {
  it('17. CANCELADO => Resultado_Validacion_SAT = CANCELADO (nunca VALIDACION OK)', () => {
    const f = getSatExportFields(baseResult('eeeeeeee-5555-4555-8555-eeeeeeeeeeee', { estatusSAT: 'Cancelado', resultado: '🔴 NO USABLE' }));
    expect(f.Resultado_Validacion_SAT).toBe('CANCELADO');
    expect(f.Accion_Recomendada_SAT).toContain('NO UTILIZAR');
  });

  it('18. No Encontrado => NO VALIDADO SAT (nunca VALIDACION OK)', () => {
    const f = getSatExportFields(baseResult('ffffffff-6666-4666-8666-ffffffffffff', { estatusSAT: 'No Encontrado' }));
    expect(f.Resultado_Validacion_SAT).toBe('NO VALIDADO SAT');
  });

  it('19. Error Conexión => NO VALIDADO SAT', () => {
    const f = getSatExportFields(baseResult('11111111-7777-4777-8777-111111111111', { estatusSAT: 'Error Conexión' }));
    expect(f.Resultado_Validacion_SAT).toBe('NO VALIDADO SAT');
  });

  it('20. Vigente => VIGENTE', () => {
    const f = getSatExportFields(baseResult('22222222-8888-4888-8888-222222222222'));
    expect(f.Resultado_Validacion_SAT).toBe('VIGENTE');
  });

  it('21. Incluye las nuevas columnas de dirección', () => {
    const f = getSatExportFields(
      baseResult('33333333-9999-4999-8999-333333333333', {
        direccionCFDI: 'EMITIDO' as DireccionCFDI,
        rfcEmpresaEvaluada: EMPRESA,
        naturalezaParaEmpresa: 'INGRESO/VENTA',
        impactoIVA: 'IVA TRASLADADO (A CARGO)',
        motivoClasificacion: 'motivo',
      })
    );
    expect(f.Direccion_CFDI).toBe('EMITIDO');
    expect(f.RFC_Empresa_Evaluada).toBe(EMPRESA);
    expect(f.Naturaleza_Para_Empresa).toBe('INGRESO/VENTA');
    expect(f.Impacto_IVA).toContain('TRASLADADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5) Prueba por lotes: cédulas y 69-B por dirección (buildDiagnosticoWorkbook)
// ═══════════════════════════════════════════════════════════════════════════
describe('Prueba por lotes (buildDiagnosticoWorkbook): cédulas por dirección', () => {
  const emitido = baseResult('aaaa1111-1111-4111-8111-aaaaaaaaaaaa', {
    rfcEmisor: EMPRESA,
    rfcReceptor: 'CLI010101CLI',
    tipoCFDI: 'I',
    direccionCFDI: 'EMITIDO' as DireccionCFDI,
    rfcEmpresaEvaluada: EMPRESA,
    naturalezaParaEmpresa: 'INGRESO/VENTA',
    impactoIVA: 'IVA TRASLADADO (A CARGO)',
    ivaTraslado: 160,
  });
  const recibido1 = baseResult('bbbb2222-2222-4222-8222-bbbbbbbbbbbb', {
    rfcEmisor: 'PROV010101PRO',
    rfcReceptor: EMPRESA,
    tipoCFDI: 'I',
    direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    rfcEmpresaEvaluada: EMPRESA,
    naturalezaParaEmpresa: 'COMPRA/GASTO',
    impactoIVA: 'IVA ACREDITABLE (A FAVOR)',
    ivaTraslado: 160,
  });
  const recibido2 = baseResult('cccc3333-3333-4333-8333-cccccccccccc', {
    rfcEmisor: 'PROV020202PRO',
    rfcReceptor: EMPRESA,
    tipoCFDI: 'E',
    direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    rfcEmpresaEvaluada: EMPRESA,
    naturalezaParaEmpresa: 'NOTA DE CREDITO RECIBIDA',
    impactoIVA: 'IVA ACREDITABLE (NEGATIVO)',
    ivaTraslado: 16,
  });

  const lote = [emitido, recibido1, recibido2];
  // buildDiagnosticoWorkbook es async (P0-A: cede el hilo entre hojas) — se
  // resuelve una sola vez en beforeAll y se comparte entre los it() de abajo.
  let wb: any;
  beforeAll(async () => {
    wb = await buildDiagnosticoWorkbook(lote);
  });

  it('22. CÉDULA INGRESOS SAT contiene SOLO emitidos (excluye recibidos tipo I)', () => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA INGRESOS SAT']) as any[];
    expect(filas.length).toBe(1);
    expect(filas[0].UUID).toBe(emitido.uuid);
    expect(filas[0].Direccion_CFDI).toBe('EMITIDO');
  });

  it('23. CÉDULAS IVA: emitidos -> TRASLADADO, recibidos -> ACREDITABLE (SIEMPRE dos hojas, sin mayoría de lote)', () => {
    // Ambas hojas existen siempre, sin importar el predominio del lote
    expect(wb.Sheets['CEDULA IVA TRASLADADO']).toBeTruthy();
    expect(wb.Sheets['CEDULA IVA ACREDITABLE']).toBeTruthy();
    expect(wb.Sheets['CEDULA NO CLASIFICADOS']).toBeTruthy();

    const tras = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA TRASLADADO'], { range: 1 }) as any[];
    const acr = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA ACREDITABLE'], { range: 1 }) as any[];
    const noClas = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA NO CLASIFICADOS'], { range: 1 }) as any[];

    expect(tras.length).toBe(1);
    expect(tras[0].UUID).toBe(emitido.uuid);
    expect(acr.length).toBe(2);
    expect(acr.map((f: any) => f.UUID)).toEqual(expect.arrayContaining([recibido1.uuid, recibido2.uuid]));
    expect(noClas.length).toBe(0);

    // Sin duplicados entre cédulas
    expect(tras.map((f: any) => f.UUID)).not.toContain(recibido1.uuid);
    expect(acr.map((f: any) => f.UUID)).not.toContain(emitido.uuid);
  });

  it('23b. Nota de crédito (tipo E recibida) resta IVA en cédula ACREDITABLE; emitido suma', () => {
    const tras = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA TRASLADADO'], { range: 1 }) as any[];
    const acr = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA ACREDITABLE'], { range: 1 }) as any[];
    const emitRow = tras.find((f: any) => f.UUID === emitido.uuid);
    const notaRow = acr.find((f: any) => f.UUID === recibido2.uuid);
    expect(emitRow.IVA).toBe(160);
    expect(notaRow.IVA).toBe(-16);
  });

  it('24. Hoja 69-B evalúa el RFC correcto según dirección (RECIBIDO => EMISOR del proveedor)', async () => {
    const recibidoCon69B = baseResult('dddd4444-4444-4444-8444-dddddddddddd', {
      rfcEmisor: 'PROV696969PRO',
      rfcReceptor: EMPRESA,
      tipoCFDI: 'I',
      direccionCFDI: 'RECIBIDO' as DireccionCFDI,
      rfcEmisorBlacklist: { rfc: 'PROV696969PRO', is69B: true, found: true, notSynced: false, multiEstado: false, situacion: 'Definitivo', fechaPublicacion: '2023-02-10', source: 'local' } as any,
      rfcReceptorBlacklist: { rfc: EMPRESA, is69B: false, found: false, notSynced: false } as any,
    });
    const wb2 = await buildDiagnosticoWorkbook([recibidoCon69B]);
    const fila = XLSX.utils.sheet_to_json(wb2.Sheets['Diagnostico_CFDI'])[0] as any;
    expect(fila.RFC_Evaluado_69B).toBe('PROV696969PRO');
    expect(fila.Validacion_69B).toBe('Definitivo');
  });

  it('25. Backward-compat: sin dirección definida, INGRESOS SAT usa tipoCFDI (legacy)', async () => {
    const legacyEmit = baseResult('eeee5555-5555-4555-8555-eeeeeeeeeeee', { rfcEmisor: EMPRESA, rfcReceptor: 'X', tipoCFDI: 'I' });
    const legacyRec = baseResult('ffff6666-6666-4666-8666-ffffffffff66', { rfcEmisor: 'P', rfcReceptor: EMPRESA, tipoCFDI: 'I' });
    const wb3 = await buildDiagnosticoWorkbook([legacyEmit, legacyRec]);
    const filas = XLSX.utils.sheet_to_json(wb3.Sheets['CEDULA INGRESOS SAT']) as any[];
    // Sin dirección => el filtro legacy incluye ambos tipo I
    expect(filas.length).toBe(2);
  });
});


// 6) Prueba real de lote mixto: 9 escenarios, celdas reales del workbook
// ═══════════════════════════════════════════════════════════════════════════
describe('Prueba real de lote mixto (cédulas por dirección, celdas reales)', () => {
  const emitidoI = baseResult('aaaa1111-1111-4111-8111-aaaaaaaaaaaa', {
    rfcEmisor: EMPRESA, rfcReceptor: 'CLI010101CLI', tipoCFDI: 'I', direccionCFDI: 'EMITIDO' as DireccionCFDI,
    ivaTraslado: 160, total: 1160, rfcEmpresaEvaluada: EMPRESA,
  });
  const recibidoI = baseResult('bbbb2222-2222-4222-8222-bbbbbbbbbbbb', {
    rfcEmisor: 'PROV010101PRO', rfcReceptor: EMPRESA, tipoCFDI: 'I', direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    ivaTraslado: 160, total: 1160, rfcEmpresaEvaluada: EMPRESA,
  });
  const emitidoE = baseResult('cccc3333-3333-4333-8333-cccccccccccc', {
    rfcEmisor: EMPRESA, rfcReceptor: 'CLI010101CLI', tipoCFDI: 'E', direccionCFDI: 'EMITIDO' as DireccionCFDI,
    ivaTraslado: 16, total: 116, rfcEmpresaEvaluada: EMPRESA,
  });
  const recibidoE = baseResult('dddd4444-4444-4444-8444-dddddddddddd', {
    rfcEmisor: 'PROV010101PRO', rfcReceptor: EMPRESA, tipoCFDI: 'E', direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    ivaTraslado: 16, total: 116, rfcEmpresaEvaluada: EMPRESA,
  });
  const noCoincide = baseResult('eeee5555-5555-4555-8555-eeeeeeeeeeee', {
    rfcEmisor: 'XXX010101XXX', rfcReceptor: 'YYY010101YYY', tipoCFDI: 'I', direccionCFDI: 'REQUIERE_REVISION' as DireccionCFDI,
    ivaTraslado: 50, total: 550, rfcEmpresaEvaluada: EMPRESA,
  });
  const cancelado = baseResult('ffff6666-6666-4666-8666-ffffffffff66', {
    rfcEmisor: EMPRESA, rfcReceptor: 'CLI010101CLI', tipoCFDI: 'I', direccionCFDI: 'EMITIDO' as DireccionCFDI,
    estatusSAT: 'Cancelado', resultado: '🔴 NO USABLE', ivaTraslado: 0, total: 0, rfcEmpresaEvaluada: EMPRESA,
  });
  const errorSat = baseResult('11117777-7777-4777-8777-111111111111', {
    rfcEmisor: 'PROV010101PRO', rfcReceptor: EMPRESA, tipoCFDI: 'I', direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    estatusSAT: 'Error Conexión', resultado: 'No validado SAT', ivaTraslado: 0, rfcEmpresaEvaluada: EMPRESA,
  });
  const b69Real = baseResult('22228888-8888-4888-8888-222222222222', {
    rfcEmisor: 'PROV696969PRO', rfcReceptor: EMPRESA, tipoCFDI: 'I', direccionCFDI: 'RECIBIDO' as DireccionCFDI,
    rfcEmisorBlacklist: { rfc: 'PROV696969PRO', is69B: true, found: true, notSynced: false, multiEstado: false, situacion: 'Definitivo', fechaPublicacion: '2023-02-10', source: 'local' } as any,
    rfcReceptorBlacklist: { rfc: EMPRESA, is69B: false, found: false, notSynced: false } as any,
    ivaTraslado: 0,
    rfcEmpresaEvaluada: EMPRESA,
  });
  const b69SinCoin = baseResult('33339999-9999-4999-8999-333333333333', {
    rfcEmisor: EMPRESA, rfcReceptor: 'CLI010101CLI', tipoCFDI: 'I', direccionCFDI: 'EMITIDO' as DireccionCFDI,
    rfcReceptorBlacklist: { rfc: 'CLI010101CLI', is69B: false, found: false, notSynced: false } as any,
    rfcEmisorBlacklist: { rfc: EMPRESA, is69B: false, found: false, notSynced: false } as any,
    ivaTraslado: 0,
    rfcEmpresaEvaluada: EMPRESA,
  });

  const lote = [emitidoI, recibidoI, emitidoE, recibidoE, noCoincide, cancelado, errorSat, b69Real, b69SinCoin].map(r => applyFiscalRules(r));
  // buildDiagnosticoWorkbook es async (P0-A: cede el hilo entre hojas) — se
  // resuelve una sola vez en beforeAll y se comparte entre los it() de abajo.
  let wb: any;
  let ingresos: any[];
  let trasladado: any[];
  let acreditable: any[];
  let noClas: any[];
  let diag: any[];
  let resumen: any[];
  let findDiag: (u: string) => any;
  let findRes: (m: string) => any;

  beforeAll(async () => {
    wb = await buildDiagnosticoWorkbook(lote);
    ingresos = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA INGRESOS SAT']) as any[];
    trasladado = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA TRASLADADO'], { range: 1 }) as any[];
    acreditable = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA ACREDITABLE'], { range: 1 }) as any[];
    noClas = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA NO CLASIFICADOS'], { range: 1 }) as any[];
    diag = XLSX.utils.sheet_to_json(wb.Sheets['Diagnostico_CFDI']) as any[];
    resumen = XLSX.utils.sheet_to_json(wb.Sheets['Resumen']) as any[];
    findDiag = (u: string) => diag.find((f: any) => f.UUID === u);
    findRes = (m: string) => resumen.find((f: any) => f.Metrica === m);
  });

  it('M1. Emitidos (I y E emitidos, cancelado, 69-B emitido) -> solo INGRESOS e IVA TRASLADADO', () => {
    const u = ingresos.map((f: any) => f.UUID);
    expect(u).toEqual(expect.arrayContaining([emitidoI.uuid, emitidoE.uuid, cancelado.uuid, b69SinCoin.uuid]));
    expect(u).not.toContain(recibidoI.uuid);
    expect(u).not.toContain(recibidoE.uuid);
    expect(u).not.toContain(errorSat.uuid);
    expect(u).not.toContain(noCoincide.uuid);
    const t = trasladado.map((f: any) => f.UUID);
    expect(t).toEqual(expect.arrayContaining([emitidoI.uuid, emitidoE.uuid, cancelado.uuid, b69SinCoin.uuid]));
  });

  it('M2. Recibidos (I y E recibidos, Error SAT, 69-B real) -> solo IVA ACREDITABLE', () => {
    const a = acreditable.map((f: any) => f.UUID);
    expect(a).toEqual(expect.arrayContaining([recibidoI.uuid, recibidoE.uuid, errorSat.uuid, b69Real.uuid]));
    expect(a).not.toContain(emitidoI.uuid);
    expect(a).not.toContain(emitidoE.uuid);
  });

  it('M3. RFC sin coincidencia -> NO CLASIFICADOS, sin contaminar ingresos ni IVA', () => {
    expect(noClas.map((f: any) => f.UUID)).toContain(noCoincide.uuid);
    expect(ingresos.map((f: any) => f.UUID)).not.toContain(noCoincide.uuid);
    expect(trasladado.map((f: any) => f.UUID)).not.toContain(noCoincide.uuid);
    expect(acreditable.map((f: any) => f.UUID)).not.toContain(noCoincide.uuid);
  });

  it('M4. Notas de crédito (tipo E) RESTAN: IVA negativo en la cédula', () => {
    const eTras = trasladado.find((f: any) => f.UUID === emitidoE.uuid);
    const iTras = trasladado.find((f: any) => f.UUID === emitidoI.uuid);
    const eAcr = acreditable.find((f: any) => f.UUID === recibidoE.uuid);
    const iAcr = acreditable.find((f: any) => f.UUID === recibidoI.uuid);
    expect(iTras.IVA).toBe(160);
    expect(eTras.IVA).toBe(-16);
    expect(iAcr.IVA).toBe(160);
    expect(eAcr.IVA).toBe(-16);
  });

  it('M5. Cancelado -> CANCELADO / NO UTILIZAR / riesgo ROJO (nunca VERDE)', () => {
    const f = findDiag(cancelado.uuid);
    expect(f.Resultado_Validacion_SAT).toBe('CANCELADO');
    expect(String(f.Accion_Recomendada_SAT)).toContain('NO UTILIZAR');
    expect(f.Fiscal_Risk_Level).toBe('ROJO');
    expect(f.Fiscal_Risk_Level).not.toBe('VERDE');
  });

  it('M6. Error SAT -> NO VALIDADO SAT / riesgo AMARILLO (nunca VERDE)', () => {
    const f = findDiag(errorSat.uuid);
    expect(f.Resultado_Validacion_SAT).toBe('NO VALIDADO SAT');
    expect(f.Fiscal_Risk_Level).toBe('AMARILLO');
    expect(f.Fiscal_Risk_Level).not.toBe('VERDE');
  });

  it('M7. 69-B direccional: RECIBIDO evalúa EMISOR (proveedor)', () => {
    const f = findDiag(b69Real.uuid);
    expect(f.RFC_Evaluado_69B).toBe('PROV696969PRO');
    expect(f.Validacion_69B).toBe('Definitivo');
  });

  it('M8. 69-B direccional: EMITIDO evalúa RECEPTOR (cliente); sin coincidencia', () => {
    const f = findDiag(b69SinCoin.uuid);
    expect(f.RFC_Evaluado_69B).toBe('CLI010101CLI');
    expect(f.Validacion_69B).toBe('Sin coincidencia');
  });

  it('M9. Contadores del resumen cuadran con las filas de las cédulas', () => {
    expect(ingresos.length).toBe(4);
    expect(trasladado.length).toBe(4);
    expect(acreditable.length).toBe(4);
    expect(noClas.length).toBe(1);
    expect(findRes('Emitidos (empresa vende)').Valor).toBe(4);
    expect(findRes('Recibidos (empresa compra)').Valor).toBe(4);
    expect(findRes('No clasificados (REQUIERE_REVISION)').Valor).toBe(1);
    expect(findRes('Notas de credito emitidas').Valor).toBe(1);
    expect(findRes('Notas de credito recibidas').Valor).toBe(1);
    expect(findRes('IVA trasladado neto (emitidos, notas restan)').Valor).toBe(144);
    expect(findRes('IVA acreditable neto (recibidos, notas restan)').Valor).toBe(144);
  });
});
