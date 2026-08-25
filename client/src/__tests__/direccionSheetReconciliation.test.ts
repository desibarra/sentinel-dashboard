import { describe, it, expect } from 'vitest';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';

// Explica y demuestra la diferencia de 1 fila observada en el diagnóstico de
// 2,351 XML entre "CEDULA INGRESOS SAT" (1,913 filas contadas) y "CEDULA IVA
// TRASLADADO" (1,914 filas contadas). Ambas hojas filtran EXACTAMENTE el
// mismo predicado sobre el mismo arreglo (`r.direccionCFDI === 'EMITIDO'`)
// — ver excelExporter.ts líneas 2375 y 2551-2560 — por lo que DEBEN tener el
// mismo número de filas de datos. La diferencia observada fue un artefacto
// de medición: "CEDULA IVA TRASLADADO" se construye con buildTitledSheetChunks,
// que escribe un título en A1 y los encabezados reales en A2 (origin: 'A2');
// XLSX.utils.sheet_to_json SIN {range:1} toma la fila 1 (el título) como
// encabezado y cuenta la fila 2 (los encabezados reales) como si fuera un
// dato — inflando el conteo en +1. "CEDULA INGRESOS SAT" no tiene título, así
// que se cuenta correctamente sin ese ajuste.

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

describe('Reconciliación exacta: CEDULA INGRESOS SAT vs CEDULA IVA TRASLADADO', () => {
  it('con el mismo predicado (direccionCFDI === EMITIDO) sobre el mismo lote, ambas hojas tienen EXACTAMENTE el mismo número de filas de datos', async () => {
    const emitidos = Array.from({ length: 5 }, (_, i) =>
      baseResult(`E0000000-0000-0000-0000-00000000000${i}`, { direccionCFDI: 'EMITIDO' as any, rfcEmisor: EMPRESA, rfcReceptor: `CLI${i}` })
    );
    const recibidos = Array.from({ length: 3 }, (_, i) =>
      baseResult(`R0000000-0000-0000-0000-00000000000${i}`, { direccionCFDI: 'RECIBIDO' as any, rfcEmisor: `PROV${i}`, rfcReceptor: EMPRESA })
    );
    const results = [...emitidos, ...recibidos];

    const wb = await buildDiagnosticoWorkbook(results);

    // Conteo CORRECTO (respetando el título en A1/A2 de la hoja de IVA):
    const ingresosCorrecto = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA INGRESOS SAT']);
    const ivaTrasladadoCorrecto = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA TRASLADADO'], { range: 1 });

    expect(ingresosCorrecto.length).toBe(5);
    expect(ivaTrasladadoCorrecto.length).toBe(5);
    expect(ingresosCorrecto.length).toBe(ivaTrasladadoCorrecto.length); // ← la igualdad real

    // Reproduce el artefacto de medición original (sin {range:1}):
    const ivaTrasladadoSinAjuste = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA TRASLADADO']);
    expect(ivaTrasladadoSinAjuste.length).toBe(6); // 5 datos reales + 1 fila de encabezado mal interpretada como dato
    expect(ivaTrasladadoSinAjuste.length).toBe(ivaTrasladadoCorrecto.length + 1); // exactamente el +1 observado en el diagnóstico de 2,351

    // Ninguna factura RECIBIDA aparece como ingreso propio ni como IVA trasladado propio.
    const uuidsIngresos = ingresosCorrecto.map((r: any) => r.UUID);
    const uuidsIvaTrasladado = ivaTrasladadoCorrecto.map((r: any) => r.UUID);
    for (const r of recibidos) {
      expect(uuidsIngresos).not.toContain(r.uuid);
      expect(uuidsIvaTrasladado).not.toContain(r.uuid);
    }
    // Y SÍ aparecen, correctamente, en CEDULA IVA ACREDITABLE (su hoja correcta).
    const ivaAcreditable = XLSX.utils.sheet_to_json(wb.Sheets['CEDULA IVA ACREDITABLE'], { range: 1 });
    const uuidsAcreditable = ivaAcreditable.map((r: any) => r.UUID);
    for (const r of recibidos) {
      expect(uuidsAcreditable).toContain(r.uuid);
    }
  });
});
