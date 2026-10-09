import { describe, it, expect } from 'vitest';
import { revalidarFilaSAT, type SATRevalidationStatus } from '../pages/Dashboard';
import { buildDiagnosticoWorkbook, buildExecutiveSummaryRows, buildMainReportWorkbook } from '../lib/excelExporter';
import * as XLSX from 'xlsx';
import type { ValidationResult } from '../lib/cfdiEngine';

// Fila base previa a cualquier consulta SAT (resultado del motor sin SAT).
function makeRow(uuid: string, opts: Partial<ValidationResult> = {}): ValidationResult {
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
    estatusSAT: 'No verificado',
    fechaCancelacion: 'NO APLICA',
    cfdiSustituido: 'NO',
    uuidSustitucion: 'NO APLICA',
    rfcEmisor: 'AAA010101AAA',
    nombreEmisor: 'EMISOR SA',
    regimenEmisor: '601',
    estadoSATEmisor: 'Vigente',
    rfcReceptor: 'BBB010101BBB',
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
    subtotal: 0,
    baseIVA16: 0,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'SIN_IMPUESTOS',
    ivaTraslado: 0,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 0,
    moneda: 'MXN',
    tipoCambio: 1,
    formaPago: '01',
    metodoPago: 'PUE',
    nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
    resultado: 'No validado SAT',
    comentarioFiscal: 'No validado: no se pudo confirmar el estatus del CFDI ante el SAT. Reintenta la consulta. ',
    observacionesTecnicas: '',
    iva: 0,
    isValid: true,
    totalCalculado: 0,
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
    // Base del motor (sin SAT) que el reintento restaura:
    resultadoMotor: '🟢 USABLE',
    comentarioMotor: 'motor ok',
    ...opts,
  } as unknown as ValidationResult;
}

// Predicados idénticos a los usados en Dashboard.tsx para los contadores derivados.
const countUsables = (rs: ValidationResult[]) => rs.filter(r => r.resultado.includes('🟢')).length;
const countAlertas = (rs: ValidationResult[]) => rs.filter(r => r.resultado.includes('🟡')).length;
const countNoUsable = (rs: ValidationResult[]) => rs.filter(r => r.resultado.includes('🔴')).length;
const countNoValidadosSAT = (rs: ValidationResult[]) =>
  rs.filter(r => r.resultado === 'No validado SAT' || r.resultado?.startsWith('No validado')).length;

describe('Flujo real de reintento SAT (revalidarFilaSAT + reducer por UUID + recálculo derivado)', () => {
  it('1. Re-query SAT → actualiza SOLO la fila por UUID y deja las demás intactas (misma referencia)', () => {
    const rowA = makeRow('AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA'); // previamente sin validar
    const rowB = makeRow('BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB', {
      estatusSAT: 'Vigente',
      resultado: '🟢 USABLE',
      comentarioFiscal: 'motor ok',
      resultadoMotor: undefined,
      comentarioMotor: undefined,
    });
    const results = [rowA, rowB];

    // Esto es exactamente lo que hace handleRevalidateSAT: re-query (status) + map por UUID.
    const status: SATRevalidationStatus = { estado: 'Vigente', validatedAt: new Date('2026-06-01T12:00:00Z') };
    const after = results.map(r => (r.uuid === rowA.uuid ? revalidarFilaSAT(r, status, 'GIRO X') : r));

    // La fila A cambió de estatus/resultado/diagnóstico
    expect(after[0].estatusSAT).toBe('Vigente');
    expect(after[0].resultado).toBe('🟢 USABLE'); // restaura base del motor
    expect(after[0].comentarioFiscal).toBe('motor ok');
    expect(after[0].ultimoRefrescoSAT).toBe('2026-06-01T12:00:00.000Z');
    expect(after[0].giroEmpresa).toBe('GIRO X');

    // La fila B NO se tocó (misma referencia → inmune a sort/paginación)
    expect(after[1]).toBe(rowB);
  });

  it('2. CANCELADO → 🔴 NO USABLE (consistente con classifyBySATStatus) y diagnóstico crítico', () => {
    const row = makeRow('CCCCCCCC-3333-4333-8333-CCCCCCCCCCCC', {
      resultado: '🟢 USABLE',
      comentarioFiscal: 'motor ok',
      resultadoMotor: '🟢 USABLE',
      comentarioMotor: 'motor ok',
    });
    const out = revalidarFilaSAT(row, { estado: 'Cancelado', estatusCancelacion: 'Cancelado con motivo', validatedAt: new Date() }, 'GIRO');
    expect(out.resultado).toBe('🔴 NO USABLE');
    expect(out.comentarioFiscal).toContain('[CRÍTICO] CFDI CANCELADO en SAT');
    expect(out.comentarioFiscal).toContain('Cancelado con motivo');
    expect(out.estatusSAT).toBe('Cancelado');
  });

  it('3. NO ENCONTRADO / ERROR CONEXIÓN → No validado SAT (nunca USABLE)', () => {
    const base = makeRow('DDDDDDDD-4444-4444-8444-DDDDDDDDDDDD', {
      resultado: '🟢 USABLE', resultadoMotor: '🟢 USABLE', comentarioMotor: 'motor ok',
    });
    const noEnc = revalidarFilaSAT(base, { estado: 'No Encontrado', validatedAt: new Date() }, 'GIRO');
    const errC = revalidarFilaSAT(base, { estado: 'Error Conexión', validatedAt: new Date() }, 'GIRO');
    for (const r of [noEnc, errC]) {
      expect(r.resultado).toBe('No validado SAT');
      expect(r.resultado).not.toContain('🟢');
      expect(r.resultado).not.toContain('🟡');
      expect(r.resultado).not.toContain('🔴');
    }
  });

  it('4. Recálculo de contadores derivados (misma lógica de Dashboard) tras reintento', () => {
    const rowA = makeRow('AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA'); // No validado SAT
    const rowB = makeRow('BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB', {
      estatusSAT: 'Vigente', resultado: '🟢 USABLE', comentarioFiscal: 'motor ok',
      resultadoMotor: undefined, comentarioMotor: undefined,
    });
    const antes = [rowA, rowB];
    expect(countUsables(antes)).toBe(1);
    expect(countNoValidadosSAT(antes)).toBe(1);
    expect(countNoUsable(antes)).toBe(0);

    const after = antes.map(r => (r.uuid === rowA.uuid
      ? revalidarFilaSAT(r, { estado: 'Vigente', validatedAt: new Date() }, 'GIRO')
      : r));

    expect(countUsables(after)).toBe(2);      // Ahora A también es usable
    expect(countNoValidadosSAT(after)).toBe(0); // Ya no hay no validados
    expect(countAlertas(after)).toBe(0);
    expect(countNoUsable(after)).toBe(0);
  });

  it('5. Recálculo del Resumen ejecutivo REAL (buildExecutiveSummaryRows) tras reintento', () => {
    const rowA = makeRow('AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA');
    const rowB = makeRow('BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB', {
      estatusSAT: 'Vigente', resultado: '🟢 USABLE', comentarioFiscal: 'motor ok',
      resultadoMotor: undefined, comentarioMotor: undefined,
    });
    const antes = [rowA, rowB];
    const metricaAntes = buildExecutiveSummaryRows(antes).find(m => m.Metrica === 'No validados SAT')?.Valor;
    expect(metricaAntes).toBe(1);

    const after = antes.map(r => (r.uuid === rowA.uuid
      ? revalidarFilaSAT(r, { estado: 'Vigente', validatedAt: new Date() }, 'GIRO')
      : r));
    const metricaDespues = buildExecutiveSummaryRows(after).find(m => m.Metrica === 'No validados SAT')?.Valor;
    expect(metricaDespues).toBe(0);
  });

  it('6. Recálculo del Excel REAL (buildDiagnosticoWorkbook) refleja el nuevo estatus y conserva columnas 69-B', async () => {
    const rowA = makeRow('AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA', {
      rfcEmisor: 'RAS050131EC5',
      rfcEmisorBlacklist: { rfc: 'RAS050131EC5', is69B: true, found: true, notSynced: false, multiEstado: false, situacion: 'Definitivo', fechaPublicacion: '2023-02-10', source: 'IndexedDB local' } as any,
    });
    const antes = [rowA];
    const wbAntes = await buildDiagnosticoWorkbook(antes);
    const filaAntes = XLSX.utils.sheet_to_json(wbAntes.Sheets['Diagnostico_CFDI']) as any[];
    expect(filaAntes[0].Resultado).toBe('No validado SAT');

    const after = antes.map(r => revalidarFilaSAT(r, { estado: 'Vigente', validatedAt: new Date() }, 'GIRO'));
    const wbDespues = await buildDiagnosticoWorkbook(after);
    const filaDespues = XLSX.utils.sheet_to_json(wbDespues.Sheets['Diagnostico_CFDI']) as any[];
    // SAT Vigente no "limpia" un 69-B definitivo (precedencia 2 de combinarResultadoFinal).
    expect(filaDespues[0].Resultado).toBe('🔴 NO USABLE');
    // Columnas 69-B siguen presentes tras el recálculo
    expect(Object.keys(filaDespues[0])).toContain('RFC_Evaluado_69B');
    expect(Object.keys(filaDespues[0])).toContain('Validacion_69B');
    expect(filaDespues[0].Validacion_69B).toBe('Definitivo');
  });

  it('7. Reintento cambia estatus, resultado y diagnóstico (escenario Error → Vigente)', () => {
    const row = makeRow('EEEEEEEE-5555-4555-8555-EEEEEEEEEEEE', { estatusSAT: 'Error Conexión' });
    const trasError = revalidarFilaSAT(row, { estado: 'Error Conexión', validatedAt: new Date() }, 'GIRO');
    expect(trasError.resultado).toBe('No validado SAT');

    const trasExito = revalidarFilaSAT(row, { estado: 'Vigente', validatedAt: new Date() }, 'GIRO');
    expect(trasExito.estatusSAT).toBe('Vigente');
    expect(trasExito.resultado).toBe('🟢 USABLE');
    expect(trasExito.comentarioFiscal).toBe('motor ok');
  });

  it('el reporte principal exporta el estado SAT renovado que ve el tablero', async () => {
    const row = makeRow('FRESH-SAT-5555-4555-8555-EEEEEEEEEEEE', {
      rfcEmisor: 'EMP010101EMP',
      rfcReceptor: 'CLI010101CLI',
      estatusSAT: 'Error Conexión',
      trazabilidadInfo: {
        observacionSAT: 'Error Conexión',
        fuenteEstatus: 'SAT',
        consultadoEn: '2026-10-01T12:00:00.000Z',
      },
    });
    const retried = revalidarFilaSAT(
      row,
      { estado: 'Vigente', validatedAt: new Date('2026-10-08T12:00:00.000Z') },
      'GIRO'
    );
    const workbook = await buildMainReportWorkbook([retried], { name: 'Empresa', rfc: 'EMP010101EMP' });
    const details = XLSX.utils.sheet_to_json<any>(workbook.Sheets['CFDI Emitidos']);

    expect(retried.estatusSAT).toBe('Vigente');
    expect(retried.trazabilidadInfo?.observacionSAT).toBe('Vigente');
    expect(details[0].Estatus_SAT).toBe(retried.estatusSAT);
    expect(details[0].Resultado).toBe(retried.resultado);
  });

  it('una limitación SAT deja la fila pendiente y permite incluirla en reintentos posteriores', () => {
    const row = makeRow('RATE-LIMITED-5555-4555-8555-EEEEEEEEEEEE', { estatusSAT: 'Vigente' });
    const pending = revalidarFilaSAT(row, { estado: 'Rate Limited', validatedAt: new Date() }, 'GIRO');

    expect(pending.estatusSAT).toBe('Rate Limited');
    expect(pending.resultado).toBe('🟡 CONSULTA SAT PENDIENTE');
    expect(pending.resultado).not.toBe('No validado SAT');
    expect(pending.fiscalRiskLevel).toBe('AMARILLO');
  });
});
