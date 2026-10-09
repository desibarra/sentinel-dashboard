import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { ValidationResult } from '../lib/cfdiEngine';
import { buildDiagnosticoWorkbook, buildMainReportWorkbook, exportToExcel } from '../lib/excelExporter';

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});

const COMPANY_RFC = 'EMP010101EMP';

function result(uuid: string, overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    fileName: `${uuid}.xml`,
    uuid,
    versionCFDI: '4.0',
    tipoCFDI: 'I',
    serie: 'A',
    folio: uuid.slice(-4),
    fechaEmision: '2026-10-01',
    horaEmision: '12:00:00',
    añoFiscal: 2026,
    estatusSAT: 'Vigente',
    fechaCancelacion: '',
    cfdiSustituido: 'NO',
    uuidSustitucion: '',
    rfcEmisor: COMPANY_RFC,
    nombreEmisor: 'Empresa de prueba',
    regimenEmisor: '601',
    estadoSATEmisor: 'Vigente',
    rfcReceptor: 'CLI010101CLI',
    nombreReceptor: 'Cliente de prueba',
    regimenReceptor: '601',
    usoCFDI: 'G03',
    cpReceptor: '01000',
    tieneCfdiRelacionados: 'NO',
    tipoRelacion: '',
    uuidRelacionado: '',
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
    formaPago: '03',
    metodoPago: 'PUE',
    nivelValidacion: 'VALIDADO',
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
    descuentoGlobal: 0,
    condicionesDePago: '',
    rfcEmpresaEvaluada: COMPANY_RFC,
    ...overrides,
  } as ValidationResult;
}

function rows(workbook: any, sheetName: string, range?: number): Record<string, any>[] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], range === undefined ? {} : { range });
}

afterEach(() => vi.restoreAllMocks());

describe('reporte principal XLSX, dirección e IVA conciliado', () => {
  it('envía exactamente un archivo al navegador', async () => {
    vi.mocked(XLSX.writeFile).mockClear();
    const workbook = await exportToExcel(
      [result('00000000-0000-4000-8000-000000000000')],
      'SentinelExpress_Reporte_test.xlsx',
      undefined,
      { company: { name: 'Empresa de prueba', rfc: COMPANY_RFC } }
    );

    expect(workbook.SheetNames).toHaveLength(11);
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    expect(XLSX.writeFile).toHaveBeenCalledWith(workbook, 'SentinelExpress_Reporte_test.xlsx');
  });

  it('prefiere el estatus SAT revalidado más reciente al deduplicar un UUID', async () => {
    const uuid = '00000000-0000-4000-8000-000000000099';
    const stale = result(uuid, {
      estatusSAT: 'Error Conexión',
      resultado: 'No validado SAT',
      ultimoRefrescoSAT: '2026-10-01T10:00:00.000Z',
    });
    const retried = result(uuid, {
      estatusSAT: 'Vigente',
      resultado: '🟢 USABLE',
      ultimoRefrescoSAT: '2026-10-08T10:00:00.000Z',
    });
    const workbook = await buildMainReportWorkbook([stale, retried], { name: 'Empresa de prueba', rfc: COMPANY_RFC });
    const detail = rows(workbook, 'CFDI Emitidos');

    expect(detail).toHaveLength(1);
    expect(detail[0].Estatus_SAT).toBe('Vigente');
    expect(detail[0].Resultado).toBe('🟢 USABLE');
  });

  it('clasifica emitidos/recibidos por RFC seleccionado y alerta los CFDI ajenos', async () => {
    const issued = result('00000000-0000-4000-8000-000000000001');
    const received = result('00000000-0000-4000-8000-000000000002', {
      rfcEmisor: 'PRO010101PRO',
      nombreEmisor: 'Proveedor',
      rfcReceptor: COMPANY_RFC,
    });
    const foreign = result('00000000-0000-4000-8000-000000000003', {
      rfcEmisor: 'OTR010101OTR',
      rfcReceptor: 'OTR020202OTR',
    });
    const workbook = await buildMainReportWorkbook([issued, received, foreign], { name: 'Empresa de prueba', rfc: COMPANY_RFC });

    expect(workbook.SheetNames).toEqual(expect.arrayContaining([
      'Resumen',
      'CFDI Emitidos',
      'CFDI Recibidos',
      'Alertas',
      '69-B - EFOS',
      'Clientes',
      'Proveedores',
      'Cédula IVA',
      'Conciliación PPD-REP emitidas',
      'Conciliación PPD-REP recibidas',
      'Errores de lectura',
    ]));
    expect(rows(workbook, 'CFDI Emitidos').map(row => row.UUID)).toEqual([issued.uuid]);
    expect(rows(workbook, 'CFDI Recibidos').map(row => row.UUID)).toEqual([received.uuid]);
    expect(rows(workbook, 'Alertas').some(row => row.Motivo === 'CFDI ajeno a la empresa' && row.UUID === foreign.uuid)).toBe(true);
  });

  it('distingue una lista 69-B no cargada de una lista cargada sin coincidencias e informa el corte', async () => {
    const notLoaded = {
      rfc: 'PRO010101PRO',
      isEFOS: false,
      is69B: false,
      found: false,
      notSynced: true,
      fechaCorte: null,
    };
    const loadedNoMatch = {
      ...notLoaded,
      notSynced: false,
      fechaCorte: '2020-01-01',
    };
    const reportNotLoaded = await buildMainReportWorkbook([
      result('00000000-0000-4000-8000-000000000021', {
        rfcEmisorBlacklist: notLoaded,
        rfcReceptorBlacklist: notLoaded,
      }),
    ], { name: 'Empresa de prueba', rfc: COMPANY_RFC });
    const notLoadedRows = rows(reportNotLoaded, 'Resumen');
    const notLoadedMetric = (metric: string) => notLoadedRows.find(row => row.Indicador === metric)?.Valor;

    expect(notLoadedMetric('Estado de validación 69-B')).toBe('LISTA NO CARGADA');
    expect(notLoadedMetric('Cruces 69-B sin coincidencia (lista cargada)')).toBe(0);

    const reportLoaded = await buildMainReportWorkbook([
      result('00000000-0000-4000-8000-000000000022', {
        rfcEmisorBlacklist: loadedNoMatch,
        rfcReceptorBlacklist: loadedNoMatch,
      }),
    ], { name: 'Empresa de prueba', rfc: COMPANY_RFC });
    const loadedRows = rows(reportLoaded, 'Resumen');
    const loadedMetric = (metric: string) => loadedRows.find(row => row.Indicador === metric)?.Valor;

    expect(loadedMetric('Estado de validación 69-B')).toBe('LISTA CARGADA');
    expect(loadedMetric('Cruces 69-B sin coincidencia (lista cargada)')).toBe(2);
    expect(loadedMetric('Fecha de corte 69-B')).toBe('2020-01-01');
    expect(String(loadedMetric('Antigüedad de lista 69-B'))).toContain('más de 30 días');
  });

  it('reconcilia al centavo el IVA de cédula contra las cédulas actuales y separa el IVA no pagado', async () => {
    const issued = result('00000000-0000-4000-8000-000000000011', {
      direccionCFDI: 'EMITIDO',
      rfcEmpresaEvaluada: COMPANY_RFC,
    });
    const receivedPue = result('00000000-0000-4000-8000-000000000012', {
      rfcEmisor: 'PRO010101PRO',
      rfcReceptor: COMPANY_RFC,
      direccionCFDI: 'RECIBIDO',
      metodoPago: 'PUE',
    });
    const receivedPpdUnpaid = result('00000000-0000-4000-8000-000000000013', {
      rfcEmisor: 'PRO010101PRO',
      rfcReceptor: COMPANY_RFC,
      direccionCFDI: 'RECIBIDO',
      metodoPago: 'PPD',
    });
    const inputs = [issued, receivedPue, receivedPpdUnpaid];
    const oldWorkbook = await buildDiagnosticoWorkbook(inputs);
    const newWorkbook = await buildMainReportWorkbook(inputs, { name: 'Empresa de prueba', rfc: COMPANY_RFC });
    const oldIssued = rows(oldWorkbook, 'CEDULA IVA TRASLADADO', 1).reduce((sum, row) => sum + Number(row.IVA || 0), 0);
    const oldReceived = rows(oldWorkbook, 'CEDULA IVA ACREDITABLE', 1).reduce((sum, row) => sum + Number(row.IVA || 0), 0);
    const newIvaRows = rows(newWorkbook, 'Cédula IVA');
    const total = (key: string) => newIvaRows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

    const cents = (value: number) => Math.round(value * 100);
    expect(cents(total('IVA trasladado emitidas (MXN)'))).toBe(cents(oldIssued));
    expect(cents(total('IVA acreditable pagado recibidas (MXN)') + total('IVA recibido pendiente de pago (MXN)'))).toBe(cents(oldReceived));
    expect(total('IVA acreditable pagado recibidas (MXN)')).toBe(16);
    expect(total('IVA recibido pendiente de pago (MXN)')).toBe(16);
  });

  it('genera un único libro menor de 10 MB para 4.000 CFDI sintéticos', async () => {
    const batch = Array.from({ length: 4_000 }, (_, index) => result(
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      {
        folio: String(index + 1),
        subtotal: 1_000 + index,
        baseIVA16: 1_000 + index,
        ivaTraslado: Math.round((1_000 + index) * 0.16 * 100) / 100,
        total: Math.round((1_000 + index) * 1.16 * 100) / 100,
      }
    ));
    const startedAt = performance.now();
    const workbook = await buildMainReportWorkbook(batch, { name: 'Empresa de prueba', rfc: COMPANY_RFC });
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const elapsedMs = performance.now() - startedAt;

    expect(workbook.SheetNames).toHaveLength(11);
    expect(rows(workbook, 'CFDI Emitidos')).toHaveLength(4_000);
    expect(buffer.byteLength).toBeLessThan(10 * 1024 * 1024);
    console.info(`[main report benchmark] 4000 CFDI: ${(elapsedMs / 1000).toFixed(2)}s, ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  });
});
