import { describe, it, expect, vi, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';

// Requisito 3 (reportes parciales): si una hoja falla, el archivo nunca debe
// presentarse como reporte completo. Se fuerza una falla real en una hoja
// puntual (via spy sobre XLSX.utils.aoa_to_sheet, detectando el contenido
// único de esa hoja) y se verifica el comportamiento exacto pedido.
// Sin datos fiscales reales.

function baseResult(uuid: string, over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    fileName: `${uuid}.xml`,
    uuid,
    versionCFDI: '4.0',
    tipoCFDI: 'I',
    serie: 'A',
    folio: '1',
    fechaEmision: '2026-03-04',
    horaEmision: '12:00:00',
    añoFiscal: 2026,
    estatusSAT: 'Vigente',
    fechaCancelacion: 'NO APLICA',
    cfdiSustituido: 'NO',
    uuidSustitucion: 'NO APLICA',
    rfcEmisor: 'TME960709LR2',
    nombreEmisor: 'TRANSPORTES SA DE CV',
    regimenEmisor: '601',
    estadoSATEmisor: 'Vigente',
    rfcReceptor: 'IATD70020G77',
    nombreReceptor: 'EMPRESA SA DE CV',
    regimenReceptor: '603',
    usoCFDI: 'G03',
    cpReceptor: '32310',
    tieneCfdiRelacionados: 'NO',
    tipoRelacion: 'NO APLICA',
    uuidRelacionado: 'NO APLICA',
    uuids_relacionados: [],
    tipoRealDocumento: 'Factura',
    requiereCartaPorte: 'NO',
    cartaPorte: 'NO',
    cartaPorteCompleta: 'NO APLICA',
    versionCartaPorte: 'NO APLICA',
    pagosPresente: 'NO',
    versionPagos: 'NO APLICA',
    pagosValido: 'NO APLICA',
    encodingDetectado: 'UTF-8',
    complementosDetectados: [],
    scoreInformativo: 90,
    subtotal: 15000,
    baseIVA16: 15000,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'IVA_16',
    ivaTraslado: 2400,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 17400,
    moneda: 'MXN',
    tipoCambio: 1,
    formaPago: '03',
    metodoPago: 'PUE',
    nivelValidacion: 'OK',
    resultado: '🟢 USABLE',
    comentarioFiscal: 'OK',
    observacionesTecnicas: '',
    iva: 2400,
    isValid: true,
    totalCalculado: 17400,
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
  } as ValidationResult;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reportes parciales — hoja NO crítica falla', () => {
  it('marca el workbook como "partial", agrega hoja de aviso como primera, y conserva el resto', async () => {
    const original = (XLSX as any).utils.aoa_to_sheet;
    const spy = vi.spyOn((XLSX as any).utils, 'aoa_to_sheet').mockImplementation((aoa: any, opts?: any) => {
      // "CONTROL CALIDAD XML" tiene 'Tiene_Comprobante' como encabezado único.
      if (Array.isArray(aoa) && Array.isArray(aoa[0]) && aoa[0].includes('Tiene_Comprobante')) {
        throw new Error('Fallo forzado de prueba en CONTROL CALIDAD XML');
      }
      return original(aoa, opts);
    });

    const results = [baseResult('uuid-1'), baseResult('uuid-2')];
    const wb = await buildDiagnosticoWorkbook(results);
    spy.mockRestore();

    const status = wb.__sentinelExportStatus;
    expect(status.status).toBe('partial');
    expect(status.failures.length).toBeGreaterThan(0);
    expect(status.failures.some((f: any) => f.sheet === 'CONTROL CALIDAD XML')).toBe(true);
    expect(status.failures.every((f: any) => f.critical === false)).toBe(true);

    // La hoja de aviso es la PRIMERA del libro — imposible de pasar por alto.
    expect(wb.SheetNames[0]).toBe('EXPORTACION INCOMPLETA');
    const avisoRows = XLSX.utils.sheet_to_json(wb.Sheets['EXPORTACION INCOMPLETA'], { header: 1 }) as any[][];
    expect(avisoRows[0][0]).toBe('EXPORTACION INCOMPLETA');
    expect(JSON.stringify(avisoRows)).toContain('CONTROL CALIDAD XML');

    // Las hojas fiscales críticas SÍ se conservan íntegras (no fue crítica).
    expect(wb.SheetNames).toContain('Diagnostico_CFDI');
    expect(wb.SheetNames).toContain('Resumen');
    expect(wb.SheetNames).toContain('CEDULA INGRESOS SAT');
    const diag = XLSX.utils.sheet_to_json(wb.Sheets['Diagnostico_CFDI']) as any[];
    expect(diag.length).toBe(2);
  });
});

describe('Reportes parciales — hoja CRÍTICA falla', () => {
  it('recorta el archivo a un reporte de diagnóstico ("critical_failure"), no entrega el reporte completo', async () => {
    const original = (XLSX as any).utils.aoa_to_sheet;
    const spy = vi.spyOn((XLSX as any).utils, 'aoa_to_sheet').mockImplementation((aoa: any, opts?: any) => {
      // 'CEDULA INGRESOS SAT' es una hoja crítica (mapaFilaIva usa el campo
      // 'Fecha_Cobro' que solo aparece en dataIngresos).
      if (Array.isArray(aoa) && Array.isArray(aoa[0]) && aoa[0].includes('Fecha_Cobro')) {
        throw new Error('Fallo forzado de prueba en CEDULA INGRESOS SAT');
      }
      return original(aoa, opts);
    });

    const results = [baseResult('uuid-1', { direccionCFDI: 'EMITIDO' as any, rfcEmpresaEvaluada: 'TME960709LR2' })];
    const wb = await buildDiagnosticoWorkbook(results);
    spy.mockRestore();

    const status = wb.__sentinelExportStatus;
    expect(status.status).toBe('critical_failure');
    expect(status.failures.some((f: any) => f.sheet === 'CEDULA INGRESOS SAT' && f.critical === true)).toBe(true);

    expect(wb.SheetNames[0]).toBe('EXPORTACION INCOMPLETA');

    // El archivo final NO contiene las hojas de detalle/forenses completas —
    // se recortó a un reporte de diagnóstico, no se entrega como "completo".
    expect(wb.SheetNames).not.toContain('DETALLE CONCEPTOS XML');
    expect(wb.SheetNames).not.toContain('EXTRACCION CRUDA XML');
    expect(wb.SheetNames.length).toBeLessThan(10);
  });
});
