import { describe, it, expect } from 'vitest';
import { contarEstatusSAT } from '../lib/cfdiEngine';
import { buildDiagnosticoWorkbook, buildExecutiveSummaryRows } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';

// Corrige la contradicción real encontrada por el usuario en un Excel de 43
// CFDI: la hoja "Resumen" mostraba "No validados SAT = 3" (correcto) mientras
// "RESUMEN EJECUTIVO" mostraba "Total CFDI con SAT no confirmado = 0"
// (incorrecto). Causa raíz: buildSummaryRows() comparaba
// getSatExportFields(r).Estatus_SAT contra el string de respaldo genérico
// 'ESTATUS SAT NO CONFIRMADO', que esa función SOLO produce si el estatus
// viene vacío — algo que nunca ocurre en la práctica (estatusSAT siempre
// tiene un valor concreto). Ahora ambas hojas y el Dashboard usan la MISMA
// función central: contarEstatusSAT() (cfdiEngine.ts).

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
    rfcEmpresaEvaluada: EMPRESA,
    ...over,
  } as unknown as ValidationResult;
}

function buildMatriz43(): ValidationResult[] {
  const vigentes = Array.from({ length: 39 }, (_, i) =>
    baseResult(`V0000000-0000-0000-0000-${String(i).padStart(12, '0')}`, {
      estatusSAT: 'Vigente', resultado: '🟢 USABLE',
    })
  );
  const cancelados = Array.from({ length: 1 }, (_, i) =>
    baseResult(`C0000000-0000-0000-0000-${String(i).padStart(12, '0')}`, {
      estatusSAT: 'Cancelado', resultado: '🔴 NO USABLE',
    })
  );
  const noEncontrados = Array.from({ length: 3 }, (_, i) =>
    baseResult(`N0000000-0000-0000-0000-${String(i).padStart(12, '0')}`, {
      estatusSAT: 'No Encontrado', resultado: 'No validado SAT',
    })
  );
  return [...vigentes, ...cancelados, ...noEncontrados];
}

describe('contarEstatusSAT — función central (39 Vigentes + 1 Cancelado + 3 No Encontrados = 43)', () => {
  it('cuenta correctamente y reconcilia al total exacto', () => {
    const results = buildMatriz43();
    const conteo = contarEstatusSAT(results);

    expect(conteo.total).toBe(43);
    expect(conteo.vigentes).toBe(39);
    expect(conteo.cancelados).toBe(1);
    expect(conteo.noConfirmados).toBe(3);
    expect(conteo.repExcluidos).toBe(0);
    expect(conteo.vigentes + conteo.cancelados + conteo.noConfirmados + conteo.repExcluidos).toBe(conteo.total);
  });

  it('cubre Error Conexión, No verificado y "resultado" ya clasificado como No validado SAT (aunque 69-B haya tomado precedencia)', () => {
    const results = [
      baseResult('u1', { estatusSAT: 'Error Conexión', resultado: 'No validado SAT' }),
      baseResult('u2', { estatusSAT: 'No verificado', resultado: 'No validado SAT' }),
      // Caso de precedencia SAT×69-B: SAT no confirmado pero 69-B Definitivo
      // hizo que "resultado" sea NO USABLE, no "No validado SAT" — igual
      // debe contarse aquí porque el SAT en sí sigue sin confirmarse.
      baseResult('u3', { estatusSAT: 'Error Conexión', resultado: '🔴 NO USABLE' }),
    ];
    const conteo = contarEstatusSAT(results);
    expect(conteo.noConfirmados).toBe(3);
  });

  it('NUNCA cuenta REP (Tipo P) como SAT no confirmado — se identifican por separado', () => {
    const results = [
      ...buildMatriz43(),
      baseResult('rep1', { tipoCFDI: 'P', estatusSAT: 'No verificado', resultado: 'No verificado (REP)' as any }),
      baseResult('rep2', { tipoCFDI: 'P', estatusSAT: 'No verificado', resultado: 'No verificado (REP)' as any }),
    ];
    const conteo = contarEstatusSAT(results);
    expect(conteo.total).toBe(45);
    expect(conteo.repExcluidos).toBe(2);
    expect(conteo.noConfirmados).toBe(3); // los 2 REP NO se suman aquí
    expect(conteo.vigentes + conteo.cancelados + conteo.noConfirmados + conteo.repExcluidos).toBe(45);
  });
});

describe('Coherencia entre hojas "Resumen" y "RESUMEN EJECUTIVO" (mismo lote de 43)', () => {
  it('ambas hojas reportan EXACTAMENTE los mismos conteos de estatus SAT', async () => {
    const results = buildMatriz43();

    // Hoja "Resumen"
    const resumenRows = buildExecutiveSummaryRows(results);
    const buscar = (rows: any[], metrica: string) => rows.find(r => r.Metrica === metrica)?.Valor;
    expect(buscar(resumenRows, 'Vigentes')).toBe(39);
    expect(buscar(resumenRows, 'Cancelados')).toBe(1);
    expect(buscar(resumenRows, 'No validados SAT')).toBe(3);
    expect(buscar(resumenRows, 'REP excluidos de validación SAT (Total=0.00, no es error)')).toBe(0);

    // Hoja "RESUMEN EJECUTIVO" (vía el pipeline real de exportación)
    const wb = await buildDiagnosticoWorkbook(results);
    const ejecutivoRows = XLSX.utils.sheet_to_json<any>(wb.Sheets['RESUMEN EJECUTIVO']);
    expect(buscar(ejecutivoRows, 'Total CFDI vigentes')).toBe(39);
    expect(buscar(ejecutivoRows, 'Total CFDI cancelados')).toBe(1);
    expect(buscar(ejecutivoRows, 'Total CFDI con SAT no confirmado')).toBe(3); // antes: 0 (bug)
    expect(buscar(ejecutivoRows, 'Total REP excluidos de validación SAT (Total=0.00, no es error)')).toBe(0);

    // Reconciliación cruzada: ambas hojas deben coincidir entre sí.
    expect(buscar(resumenRows, 'Vigentes')).toBe(buscar(ejecutivoRows, 'Total CFDI vigentes'));
    expect(buscar(resumenRows, 'Cancelados')).toBe(buscar(ejecutivoRows, 'Total CFDI cancelados'));
    expect(buscar(resumenRows, 'No validados SAT')).toBe(buscar(ejecutivoRows, 'Total CFDI con SAT no confirmado'));
  });
});
