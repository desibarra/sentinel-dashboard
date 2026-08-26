import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { exportToExcel } from '../lib/excelExporter';
import { reconciliarPagosPPD, contarEstatusSAT } from '../lib/cfdiEngine';
import type { ValidationResult, PagoRelacionadoDetalle } from '../lib/cfdiEngine';

// Reproducción EXACTA del caso reportado por el usuario (no proporcional):
//   6,726 CFDI totales; 488 REP (71 relacionados, 348 huérfanos, 69
//   duplicados, 0 rechazados); PPD: 4,632 sin evidencia + 1 parcial + 172
//   liquidadas; 406 no validados SAT; 91 no usables; 1,066 alertas; 5,163
//   usables (incluye los 488 REP, estructuralmente válidos).
//
// Verifica el bloqueador señalado: la reconciliación NUNCA debe reportar "0
// duplicados" cuando el lote contiene 69 REP con UUID repetido — deben
// aparecer en el manifiesto (INDICE_CONCILIACION) y en la hoja CONCILIACION
// REP con estado DUPLICADO, sin contarse dos veces en los totales fiscales.

const EMPRESA = 'EMP000000EMP';

function baseResult(uuid: string, over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    fileName: `${uuid}.xml`, uuid, versionCFDI: '4.0', tipoCFDI: 'I', serie: 'A', folio: '1',
    fechaEmision: '2026-01-15', horaEmision: '10:00:00', añoFiscal: 2026, estatusSAT: 'Vigente',
    fechaCancelacion: '', cfdiSustituido: 'NO', uuidSustitucion: 'NO APLICA',
    rfcEmisor: 'AAA010101AAA', nombreEmisor: 'EMISOR SA', regimenEmisor: '601', estadoSATEmisor: 'Vigente',
    rfcReceptor: 'BBB010101BBB', nombreReceptor: 'RECEPTOR SA', regimenReceptor: '601', usoCFDI: 'G03', cpReceptor: '01000',
    tieneCfdiRelacionados: 'NO', tipoRelacion: 'NO APLICA', uuidRelacionado: 'NO APLICA', uuids_relacionados: [],
    tipoRealDocumento: 'Ingreso', requiereCartaPorte: 'NO', cartaPorte: 'NO', cartaPorteCompleta: 'NO APLICA', versionCartaPorte: 'NO APLICA',
    pagosPresente: 'NO', versionPagos: 'NO APLICA', pagosValido: 'NO APLICA', encodingDetectado: 'UTF-8', complementosDetectados: [],
    scoreInformativo: 100, subtotal: 100, baseIVA16: 100, baseIVA8: 0, baseIVA0: 0, baseIVAExento: 0, baseNoObjeto: 0, baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'GRAVADO', ivaTraslado: 16, ivaRetenido: 0, isrRetenido: 0, iepsTraslado: 0, iepsRetenido: 0,
    impuestosLocalesTrasladados: 0, impuestosLocalesRetenidos: 0, total: 116, moneda: 'MXN', tipoCambio: 1,
    formaPago: '01', metodoPago: 'PUE', nivelValidacion: 'ESTRUCTURAL', resultado: '🟢 USABLE', comentarioFiscal: '', observacionesTecnicas: '',
    iva: 16, isValid: true, totalCalculado: 116, diferenciaTotales: 0, desglosePorConcepto: [], desglose: '',
    esNomina: 'NO', versionNomina: 'NO APLICA', totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0,
    isrRetenidoNomina: 0, totalCalculadoNomina: 0, observacionesContador: '', descuentoGlobal: 0, condicionesDePago: 'NO VIENE EN XML',
    rfcEmpresaEvaluada: EMPRESA,
    ...over,
  } as unknown as ValidationResult;
}

function pago(over: Partial<PagoRelacionadoDetalle>): PagoRelacionadoDetalle {
  return {
    uuidFacturaRelacionada: '', numParcialidad: 1, impSaldoAnt: 116, impPagado: 116, impSaldoInsoluto: 0,
    fechaPago: '2026-02-01', monedaP: 'MXN', tipoCambioP: 1, monedaDR: 'MXN', equivalenciaDR: 1,
    ...over,
  };
}

const TOTAL = 6726;
const NUM_NO_VALIDADO_SAT = 406;
const NUM_NO_USABLE = 91;
const NUM_ALERTAS = 1066;
const NUM_REP_TOTAL_ENTRADAS = 488; // filas REP crudas, INCLUYE las 69 duplicadas
const NUM_REP_RELACIONADOS = 71;
const NUM_REP_HUERFANOS = 348;
const NUM_REP_DUPLICADOS = 69;
const NUM_REP_RECHAZADOS = 0;
const NUM_PPD_LIQUIDADAS = 172;
const NUM_PPD_PARCIAL = 1;
const NUM_PPD_SIN_EVIDENCIA = 4632;
const NUM_REGULAR = TOTAL - NUM_REP_TOTAL_ENTRADAS; // 6238
const NUM_USABLE_TOTAL = 5163; // incluye los 488 REP (estructuralmente válidos, excluidos de SAT por diseño)
const NUM_USABLE_REGULAR = NUM_USABLE_TOTAL - NUM_REP_TOTAL_ENTRADAS; // 4675

// Consistencia interna del generador (documenta el razonamiento numérico).
if (NUM_REP_RELACIONADOS + NUM_REP_HUERFANOS + NUM_REP_DUPLICADOS + NUM_REP_RECHAZADOS !== NUM_REP_TOTAL_ENTRADAS) {
  throw new Error('Generador inconsistente: REP no suman 488');
}
if (NUM_NO_VALIDADO_SAT + NUM_NO_USABLE + NUM_ALERTAS + NUM_USABLE_REGULAR !== NUM_REGULAR) {
  throw new Error('Generador inconsistente: clasificación regular no suma 6238');
}
if (NUM_PPD_LIQUIDADAS + NUM_PPD_PARCIAL + NUM_PPD_SIN_EVIDENCIA !== 4805) {
  throw new Error('Generador inconsistente: PPD no suma 4805');
}

function makeExactCase6726(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const facturaUuids: string[] = [];

  // ── 6,238 CFDI regulares (Tipo I) ──────────────────────────────────────
  for (let i = 0; i < NUM_REGULAR; i++) {
    const uuid = `A0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    facturaUuids.push(uuid);

    let estatusSAT = 'Vigente';
    let resultado = '🟢 USABLE';
    if (i < NUM_NO_VALIDADO_SAT) {
      estatusSAT = 'No verificado'; resultado = 'No validado SAT';
    } else if (i < NUM_NO_VALIDADO_SAT + NUM_NO_USABLE) {
      resultado = '🔴 NO USABLE';
    } else if (i < NUM_NO_VALIDADO_SAT + NUM_NO_USABLE + NUM_ALERTAS) {
      resultado = '🟡 ALERTA';
    } // el resto (4,675) queda 🟢 USABLE

    // Los primeros 4,805 CFDI regulares son PPD; el resto (1,433) son PUE.
    const esPPD = i < (NUM_PPD_LIQUIDADAS + NUM_PPD_PARCIAL + NUM_PPD_SIN_EVIDENCIA);
    const metodoPago = esPPD ? 'PPD' : 'PUE';

    results.push(baseResult(uuid, {
      metodoPago, estatusSAT, resultado, direccionCFDI: 'EMITIDO',
    }));
  }

  // ── REP: 71 relacionados (cubren 172 liquidadas + 1 parcial = 173 CFDI),
  //    348 huérfanos, 0 rechazados, 69 duplicados (copias exactas de UUID ya
  //    usado) ───────────────────────────────────────────────────────────
  const FACTURAS_CUBIERTAS = NUM_PPD_LIQUIDADAS + NUM_PPD_PARCIAL; // 173, índices 0..172 (PPD)
  const relacionadosPagos: PagoRelacionadoDetalle[][] = Array.from({ length: NUM_REP_RELACIONADOS }, () => []);
  for (let i = 0; i < FACTURAS_CUBIERTAS; i++) {
    const facturaUuid = facturaUuids[i]; // los primeros 173 CFDI regulares son PPD (ver arriba)
    const esParcial = i === FACTURAS_CUBIERTAS - 1; // el ÚLTIMO cubierto queda parcial
    relacionadosPagos[i % NUM_REP_RELACIONADOS].push(pago({
      uuidFacturaRelacionada: facturaUuid,
      impSaldoAnt: 116,
      impPagado: esParcial ? 50 : 116,
      impSaldoInsoluto: esParcial ? 66 : 0,
    }));
  }

  const repUuidsRelacionados: string[] = [];
  for (let i = 0; i < NUM_REP_RELACIONADOS; i++) {
    const uuid = `B0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    repUuidsRelacionados.push(uuid);
    results.push(baseResult(uuid, {
      tipoCFDI: 'P', metodoPago: 'PUE', total: 0, subtotal: 0, ivaTraslado: 0,
      estatusSAT: 'No verificado', resultado: '🟢 USABLE' as any,
      pagosRelacionados: relacionadosPagos[i],
      direccionCFDI: 'RECIBIDO',
    }));
  }

  const repUuidsHuerfanos: string[] = [];
  for (let i = 0; i < NUM_REP_HUERFANOS; i++) {
    const uuid = `C0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    repUuidsHuerfanos.push(uuid);
    // Referencia un UUID bien formado pero que NO existe en este análisis.
    const facturaFantasma = `F9999999-9999-4999-8999-${String(i).padStart(12, '0')}`;
    results.push(baseResult(uuid, {
      tipoCFDI: 'P', metodoPago: 'PUE', total: 0, subtotal: 0, ivaTraslado: 0,
      estatusSAT: 'No verificado', resultado: '🟢 USABLE' as any,
      pagosRelacionados: [pago({ uuidFacturaRelacionada: facturaFantasma })],
      direccionCFDI: 'RECIBIDO',
    }));
  }

  // 69 duplicados: copias EXACTAS (mismo UUID) de los primeros 69 huérfanos.
  for (let i = 0; i < NUM_REP_DUPLICADOS; i++) {
    const original = results.find(r => r.uuid === repUuidsHuerfanos[i])!;
    results.push({ ...original });
  }

  return results;
}

// Módulo (no por describe): el lote de 6,726 se genera UNA sola vez y se
// reutiliza en todas las pruebas de este archivo — regenerarlo por prueba
// no aporta nada (es determinístico) y evita repetir exportToExcel (~11s)
// más de lo necesario.
const batch = makeExactCase6726();

describe('Reproducción EXACTA del caso reportado (6,726 CFDI) — bloqueador: no reportar "0 duplicados" con 69 REP duplicados', () => {

  it('el generador produce exactamente 6,726 entradas', () => {
    expect(batch.length).toBe(TOTAL);
  });

  it('contarEstatusSAT: 406 no validados SAT (el resto no se ve afectado por esta prueba)', () => {
    const conteo = contarEstatusSAT(batch);
    expect(conteo.total).toBe(TOTAL);
    expect(conteo.noConfirmados).toBe(NUM_NO_VALIDADO_SAT);
  });

  it('clasificación operativa: 5,163 usables (incluye los 488 REP), 1,066 alertas, 91 no usables', () => {
    const usables = batch.filter(r => r.resultado.includes('🟢')).length;
    const alertas = batch.filter(r => r.resultado.includes('🟡')).length;
    const noUsables = batch.filter(r => r.resultado.includes('🔴')).length;
    expect(usables).toBe(NUM_USABLE_TOTAL);
    expect(alertas).toBe(NUM_ALERTAS);
    expect(noUsables).toBe(NUM_NO_USABLE);
  });

  it('reconciliarPagosPPD (motor real): REP = 71 relacionados + 348 huérfanos + 69 duplicados + 0 rechazados = 488', () => {
    const { reps } = reconciliarPagosPPD(batch);
    expect(reps.length).toBe(NUM_REP_TOTAL_ENTRADAS);
    expect(reps.filter(r => r.estado === 'RELACIONADO').length).toBe(NUM_REP_RELACIONADOS);
    expect(reps.filter(r => r.estado === 'SIN_FACTURA_RELACIONADA').length).toBe(NUM_REP_HUERFANOS);
    expect(reps.filter(r => r.estado === 'DUPLICADO').length).toBe(NUM_REP_DUPLICADOS);
    expect(reps.filter(r => r.estado === 'RECHAZADO_ERROR').length).toBe(NUM_REP_RECHAZADOS);
  });

  it('reconciliarPagosPPD (motor real): PPD = 4,632 sin evidencia + 1 parcial + 172 liquidadas', () => {
    const { facturas } = reconciliarPagosPPD(batch);
    const ppd = facturas.filter(f => f.metodoPago === 'PPD');
    expect(ppd.filter(f => f.estado === 'SIN_EVIDENCIA_REP').length).toBe(NUM_PPD_SIN_EVIDENCIA);
    expect(ppd.filter(f => f.estado === 'PARCIAL').length).toBe(NUM_PPD_PARCIAL);
    expect(ppd.filter(f => f.estado === 'LIQUIDADA').length).toBe(NUM_PPD_LIQUIDADAS);
  });

  it('BLOQUEADOR: los duplicados no desaparecen ni se cuentan dos veces fiscalmente — el total pagado de las facturas cubiertas no se duplica', () => {
    const { facturas } = reconciliarPagosPPD(batch);
    // Cada factura liquidada recibió su pago UNA vez (116), no 2 (los REP
    // duplicados son copias de REP HUÉRFANOS, que no referencian ninguna
    // factura real — su duplicación no debe alterar ningún total pagado).
    const liquidadas = facturas.filter(f => f.estado === 'LIQUIDADA');
    expect(liquidadas.length).toBe(NUM_PPD_LIQUIDADAS);
    for (const f of liquidadas) expect(f.totalPagado).toBe(116);
  });
});

// Instrucción 8: reabrir programáticamente TODOS los .xlsx generados (no solo
// confiar en el objeto de estado en memoria) y demostrar que lo que
// realmente quedó en disco es correcto. Se exporta UNA sola vez en
// beforeAll — todas las pruebas de este bloque leen los mismos archivos.
describe('Reapertura de los archivos generados (instrucción 8): lo que quedó en disco es correcto, no solo el estado en memoria', () => {
  let status: any;
  let chunkFiles: string[];
  let globalFile: string;
  let chunkWorkbooks: XLSX.WorkBook[];
  let globalWorkbook: XLSX.WorkBook;

  beforeAll(async () => {
    const wb = await exportToExcel(batch, 'dev-outputs/exact_case_6726.xlsx');
    status = (wb as any).__sentinelExportStatus;
    expect(status.isMultiFile).toBe(true);
    expect(status.status).toBe('complete');

    globalFile = status.filesWritten.find((f: string) => f.includes('00_Resumen_Global'));
    chunkFiles = status.filesWritten.filter((f: string) => f !== globalFile);
    expect(globalFile).toBeTruthy();
    expect(chunkFiles.length).toBeGreaterThan(1);

    globalWorkbook = XLSX.readFile(globalFile);
    chunkWorkbooks = chunkFiles.map(f => XLSX.readFile(f));
  }, 180000);

  it('BLOQUEADOR: el manifiesto (INDICE_CONCILIACION, reabierto desde disco) reporta 69 duplicados — NUNCA 0', () => {
    expect(status.reconciliacion.duplicadosControlados).toBe(NUM_REP_DUPLICADOS);
    expect(status.reconciliacion.uuidExportados).toBe(TOTAL - NUM_REP_DUPLICADOS);
    expect(status.reconciliacion.erroresLectura).toBe(0);
    expect(status.reconciliacion.totalProcesados).toBe(
      status.reconciliacion.uuidExportados + status.reconciliacion.duplicadosControlados + status.reconciliacion.erroresLectura
    );
    expect(status.reconciliacion.cuadra).toBe(true);

    // El propio archivo global (no solo el objeto en memoria) contiene la
    // hoja INDICE_CONCILIACION con esa misma cifra.
    const indice = XLSX.utils.sheet_to_json<any>(globalWorkbook.Sheets['INDICE_CONCILIACION'], { header: 1 });
    const textoCompleto = JSON.stringify(indice);
    expect(textoCompleto).toContain('Duplicados controlados');
    const filaDuplicados = indice.find((row: any[]) => String(row[0] || '').includes('Duplicados controlados'));
    expect(filaDuplicados?.[1]).toBe(NUM_REP_DUPLICADOS);
  });

  it('suma exacta de 6,726 entradas across TODOS los archivos de bloque reabiertos (Diagnostico_CFDI), sin pérdidas', () => {
    let totalFilas = 0;
    const todosLosUuids: string[] = [];
    for (const wb of chunkWorkbooks) {
      const sheetNames = wb.SheetNames.filter(n => n.startsWith('Diagnostico_CFDI'));
      expect(sheetNames.length).toBeGreaterThan(0); // hoja crítica presente en CADA archivo de bloque
      for (const name of sheetNames) {
        const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[name]);
        totalFilas += rows.length;
        for (const row of rows) todosLosUuids.push(String(row.UUID));
      }
    }
    expect(totalFilas).toBe(TOTAL);
    expect(todosLosUuids.length).toBe(TOTAL);

    // Ningún UUID se pierde: el multiset de UUIDs reabiertos desde disco
    // coincide EXACTAMENTE con el del lote original (mismas repeticiones,
    // ni una fila de más ni de menos).
    const uuidsOriginales = batch.map(r => r.uuid).sort();
    expect(todosLosUuids.sort()).toEqual(uuidsOriginales);
  });

  it('69 duplicados identificados al reabrir los archivos (mismo UUID aparece exactamente 2 veces en el conjunto reabierto)', () => {
    const conteoPorUuid = new Map<string, number>();
    for (const wb of chunkWorkbooks) {
      for (const name of wb.SheetNames.filter(n => n.startsWith('Diagnostico_CFDI'))) {
        for (const row of XLSX.utils.sheet_to_json<any>(wb.Sheets[name])) {
          const uuid = String(row.UUID);
          conteoPorUuid.set(uuid, (conteoPorUuid.get(uuid) || 0) + 1);
        }
      }
    }
    const duplicados = Array.from(conteoPorUuid.entries()).filter(([, count]) => count > 1);
    expect(duplicados.length).toBe(NUM_REP_DUPLICADOS);
    expect(duplicados.every(([, count]) => count === 2)).toBe(true);
  });

  it('hojas críticas presentes en CADA archivo de bloque (nunca "EXPORTACIÓN INCOMPLETA" — la exportación fue exitosa)', () => {
    const HOJAS_CRITICAS = ['Resumen', 'Diagnostico_CFDI', 'CEDULA INGRESOS SAT', 'CEDULA IVA TRASLADADO', 'CEDULA IVA ACREDITABLE', 'CEDULA NO CLASIFICADOS'];
    for (const wb of chunkWorkbooks) {
      expect(wb.SheetNames.some(n => n === 'EXPORTACION INCOMPLETA')).toBe(false);
      for (const hoja of HOJAS_CRITICAS) {
        expect(wb.SheetNames.some(n => n === hoja || n.startsWith(`${hoja}_`))).toBe(true);
      }
    }
    expect(globalWorkbook.SheetNames.some(n => n === 'EXPORTACION INCOMPLETA')).toBe(false);
    expect(globalWorkbook.SheetNames).toContain('Resumen');
    expect(globalWorkbook.SheetNames).toContain('RESUMEN EJECUTIVO');
    expect(globalWorkbook.SheetNames).toContain('INDICE_CONCILIACION');
  });

  it('SAT/69-B/dirección/IVA/PPD-REP del resumen global (reabierto) coinciden EXACTAMENTE con la fuente central (contarEstatusSAT/reconciliarPagosPPD)', () => {
    const ejecutivo = XLSX.utils.sheet_to_json<any>(globalWorkbook.Sheets['RESUMEN EJECUTIVO']);
    const buscar = (m: string) => ejecutivo.find((r: any) => r.Metrica === m)?.Valor;

    const conteoSAT = contarEstatusSAT(batch);
    expect(buscar('Total CFDI vigentes')).toBe(conteoSAT.vigentes);
    expect(buscar('Total CFDI cancelados')).toBe(conteoSAT.cancelados);
    expect(buscar('Total CFDI con SAT no confirmado')).toBe(conteoSAT.noConfirmados);
    expect(buscar('Total REP excluidos de validación SAT (Total=0.00, no es error)')).toBe(conteoSAT.repExcluidos);

    const { facturas: facturasReales, reps: repsReales } = reconciliarPagosPPD(batch);
    const facturasPPD = facturasReales.filter(f => f.metodoPago === 'PPD');
    expect(buscar('Facturas PPD - sin evidencia REP')).toBe(facturasPPD.filter(f => f.estado === 'SIN_EVIDENCIA_REP').length);
    expect(buscar('Facturas PPD - pagadas parcialmente')).toBe(facturasPPD.filter(f => f.estado === 'PARCIAL').length);
    expect(buscar('Facturas PPD - liquidadas')).toBe(facturasPPD.filter(f => f.estado === 'LIQUIDADA').length);
    expect(buscar('REP cargados - relacionados')).toBe(repsReales.filter(r => r.estado === 'RELACIONADO').length);
    expect(buscar('REP cargados - sin factura relacionada en este análisis (huérfanos)')).toBe(repsReales.filter(r => r.estado === 'SIN_FACTURA_RELACIONADA').length);
    expect(buscar('REP cargados - duplicados')).toBe(repsReales.filter(r => r.estado === 'DUPLICADO').length);
  });
});
