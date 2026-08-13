import { describe, it, expect } from 'vitest';
import { clasificarValidacion69B, buildDiagnosticoWorkbook } from '../lib/excelExporter';
import * as XLSX from 'xlsx';
import type { ValidationResult } from '../lib/cfdiEngine';

const baseResult: ValidationResult = {
  fileName: 'fixture_69b.xml',
  uuid: '11111111-1111-4111-8111-111111111111',
  versionCFDI: '4.0',
  tipoCFDI: 'I',
  serie: 'A',
  folio: '1',
  fechaEmision: '2026-06-01',
  horaEmision: '12:00:00',
  añoFiscal: 2026,
  estatusSAT: 'Vigente',
  fechaCancelacion: 'NO APLICA',
  cfdiSustituido: 'NO',
  uuidSustitucion: 'NO APLICA',
  rfcEmisor: 'RAS050131EC5',
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
  scoreInformativo: 80,
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
  nivelValidacion: 'ECC12 - TOTAL CERO',
  resultado: '🟢 USABLE',
  comentarioFiscal: 'CFDI con complemento de Estado de Cuenta de Combustibles y total cero.',
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
} as ValidationResult;

describe('Clasificación 69-B (función real clasificarValidacion69B)', () => {
  it('1. Lista 69-B no cargada → NO VALIDADO', () => {
    expect(clasificarValidacion69B({ notSynced: true, found: false })).toBe('No validado: lista no cargada');
  });

  it('2. Sin coincidencia real → Sin coincidencia', () => {
    expect(clasificarValidacion69B({ found: false, notSynced: false })).toBe('Sin coincidencia');
  });

  it('3. Coincidencia real → Definitivo', () => {
    expect(clasificarValidacion69B({ found: true, situacion: 'Definitivo' })).toBe('Definitivo');
  });

  it('4. Coincidencia real → Presunto', () => {
    expect(clasificarValidacion69B({ found: true, situacion: 'Presunto' })).toBe('Presunto');
  });

  it('5. Coincidencia real → Desvirtuado', () => {
    expect(clasificarValidacion69B({ found: true, situacion: 'Desvirtuado' })).toBe('Desvirtuado');
  });

  it('6. Coincidencia real → Sentencia favorable', () => {
    expect(clasificarValidacion69B({ found: true, situacion: 'Sentencia Favorable' })).toBe('Sentencia favorable');
  });

  it('7. Multi-estado → Requiere revisión', () => {
    expect(clasificarValidacion69B({ found: true, multiEstado: true, situacion: 'Definitivo' })).toBe('Requiere revisión');
  });
});

describe('Exportación Excel con columnas 69-B (buildDiagnosticoWorkbook real)', () => {
  it('8. El Excel contiene las columnas 69-B y los valores reales del objeto analizado', () => {
    const conDefinitivo: ValidationResult = {
      ...baseResult,
      rfcEmisor: 'RAS050131EC5',
      rfcEmisorBlacklist: {
        rfc: 'RAS050131EC5',
        isEFOS: false,
        is69B: true,
        found: true,
        notSynced: false,
        multiEstado: false,
        situacion: 'Definitivo',
        fechaPublicacion: '2023-02-10',
        source: 'IndexedDB local',
      } as any,
    };

    const noCargada: ValidationResult = {
      ...baseResult,
      uuid: '22222222-2222-4222-8222-222222222222',
      rfcEmisor: 'AAA010101AAA',
      rfcEmisorBlacklist: {
        rfc: 'AAA010101AAA',
        isEFOS: false,
        is69B: false,
        found: false,
        notSynced: true,
      } as any,
    };

    const wb = buildDiagnosticoWorkbook([conDefinitivo, noCargada]);
    const sheet = wb.Sheets['Diagnostico_CFDI'];
    expect(sheet).toBeTruthy();

    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    expect(rows.length).toBe(2);

    const headers = Object.keys(rows[0]);
    expect(headers).toContain('RFC_Evaluado_69B');
    expect(headers).toContain('Validacion_69B');
    expect(headers).toContain('Situacion_69B');
    expect(headers).toContain('Fecha_Publicacion_69B');
    expect(headers).toContain('Fecha_Corte_Listado');
    expect(headers).toContain('Observacion_69B');

    const rowDefinitivo = rows[0];
    expect(rowDefinitivo.RFC_Evaluado_69B).toBe('RAS050131EC5');
    expect(rowDefinitivo.Validacion_69B).toBe('Definitivo');
    expect(rowDefinitivo.Situacion_69B).toBe('Definitivo');
    expect(rowDefinitivo.Fecha_Publicacion_69B).toBe('2023-02-10');
    expect(rowDefinitivo.Resultado).toBe('🟢 USABLE');

    const rowNoCargada = rows[1];
    expect(rowNoCargada.Validacion_69B).toBe('No validado: lista no cargada');
    expect(rowNoCargada.Situacion_69B).toBe('No validado: lista no cargada');
  });
});
