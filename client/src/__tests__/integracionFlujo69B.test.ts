import { describe, it, expect } from 'vitest';
import { classifyCFDI } from '../lib/cfdiEngine';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import * as XLSX from 'xlsx';
import type { ValidationResult } from '../lib/cfdiEngine';

const XML_ECC12 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0" SubTotal="0.00" Total="0.00" TipoDeComprobante="I" Moneda="MXN"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:ecc12="http://www.sat.gob.mx/EstadoDeCuentaCombustible">
  <cfdi:Emisor Nombre="GASOLINERA SA" Rfc="RAS050131EC5"/>
  <ecc12:EstadoDeCuentaCombustible/>
</cfdi:Comprobante>`;

describe('Integración flujo real 69-B: XML → análisis → clasificación → objeto → Excel', () => {
  it('sigue el flujo completo y valida celdas 69-B del Excel generado', async () => {
    // 1. ANÁLISIS + CLASIFICACIÓN (función real del motor)
    const clasificacion = classifyCFDI(
      XML_ECC12,
      '4.0',
      'I',
      { desglosePorConcepto: [] },
      { isValid: true, calculado: 0, diferencia: 0 },
      false,
      {},
      { presente: false, valido: 'SI' },
      { presente: 'NO', completa: 'NO APLICA', version: 'NO APLICA' },
      'NO',
      '',
      undefined,
    );

    expect(clasificacion.resultado).toBe('🟢 USABLE');
    expect(clasificacion.nivelValidacion).toBe('ECC12 - TOTAL CERO');

    // 2. OBJETO FINAL (mismo shape que produce useXMLValidator)
    const objetoFinal: ValidationResult = {
      fileName: 'gasolina_ecc12.xml',
      uuid: '33333333-3333-4333-8333-333333333333',
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
      nombreEmisor: 'GASOLINERA SA',
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
      nivelValidacion: clasificacion.nivelValidacion,
      resultado: clasificacion.resultado,
      comentarioFiscal: clasificacion.comentarioFiscal,
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
      rfcEmisorBlacklist: {
        rfc: 'RAS050131EC5',
        isEFOS: false,
        is69B: true,
        found: true,
        notSynced: false,
        multiEstado: false,
        situacion: 'Sentencia Favorable',
        fechaPublicacion: '2023-02-10',
        source: 'IndexedDB local',
      } as any,
    } as ValidationResult;

    // 3. EXPORTACIÓN (función real del exportador)
    const wb = await buildDiagnosticoWorkbook([objetoFinal]);

    // 4. ABRIR EL EXCEL Y VALIDAR CELDAS 69-B (no solo encabezados)
    const sheet = wb.Sheets['Diagnostico_CFDI'];
    expect(sheet).toBeTruthy();
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    expect(rows.length).toBe(1);

    const row = rows[0];
    expect(row.RFC_Evaluado_69B).toBe('RAS050131EC5');
    expect(row.Validacion_69B).toBe('Sentencia favorable');
    expect(row.Situacion_69B).toBe('Sentencia Favorable');
    expect(row.Fecha_Publicacion_69B).toBe('2023-02-10');
    expect(row.Fecha_Corte_Listado).toBe('2025-12-31');
    expect(row.Resultado).toBe('🟢 USABLE');
    expect(row.Observacion_69B).toContain('Sentencia Favorable');
  });
});
