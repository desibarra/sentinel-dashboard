import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  exportToExcel,
  planExportChunks,
  estimateCfdiExportWeight,
} from '../lib/excelExporter';
import type { ValidationResult, PagoRelacionadoDetalle } from '../lib/cfdiEngine';
const blobBytes = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

// El namespace de 'xlsx' es un módulo ESM de solo lectura — vi.spyOn no puede
// redefinir sus propiedades. Se envuelve writeFile en un vi.fn() que por
// defecto DELEGA en la implementación real (todas las pruebas, salvo la de
// "bloque que falla", siguen escribiendo archivos reales en dev-outputs/).
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

// El reporte principal mantiene una sola fila por UUID y descarga un solo
// workbook; la partición antigua sigue probándose como helper aislado.

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

function makeConcepto(i: number): any {
  return {
    numero: i + 1, importe: 100, descuento: 0, objetoImp: '02', claveProdServ: '01010101',
    descripcion: `Concepto ${i + 1}`, cantidad: 1, valorUnitario: 100,
    traslados: [{ impuesto: '002', tasa: '0.160000', importe: 16, base: 100, tipoFactor: 'Tasa' }],
    retenciones: [], subtotalAcumulado: 100, totalParcial: 116,
  };
}

// Genera un lote sintético que replica las proporciones del caso reportado
// (6,726 CFDI: 5,163 usables, 1,066 alertas, 91 no usables, 406 no validados
// SAT, 488 REP), escalado a `n`.
function makeBatch(n: number): ValidationResult[] {
  const numREP = Math.round(n * 488 / 6726);
  const numNoUsable = Math.round(n * 91 / 6726);
  const numNoValidadoSAT = Math.round(n * 406 / 6726);
  const numAlertas = Math.round(n * 1066 / 6726);
  const numRegular = n - numREP;

  const results: ValidationResult[] = [];
  const facturaUuids: string[] = [];

  for (let i = 0; i < numRegular; i++) {
    const uuid = `A0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    facturaUuids.push(uuid);
    const numConceptos = 1 + (i % 3);
    const metodoPago = i % 5 === 0 ? 'PPD' : 'PUE';
    let estatusSAT = 'Vigente';
    let resultado = '🟢 USABLE';
    if (i < numNoUsable) { resultado = '🔴 NO USABLE'; }
    else if (i < numNoUsable + numNoValidadoSAT) { estatusSAT = 'No verificado'; resultado = 'No validado SAT'; }
    else if (i < numNoUsable + numNoValidadoSAT + numAlertas) { resultado = '🟡 ALERTA'; }

    results.push(baseResult(uuid, {
      metodoPago, estatusSAT, resultado,
      desglosePorConcepto: Array.from({ length: numConceptos }, (_, c) => makeConcepto(c)),
      total: 116 * numConceptos, subtotal: 100 * numConceptos, ivaTraslado: 16 * numConceptos,
      direccionCFDI: 'EMITIDO',
    }));
  }

  const ppdUuids = facturaUuids.filter((_, i) => i % 5 === 0);
  for (let i = 0; i < numREP; i++) {
    const uuid = `B0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const facturaUuid = ppdUuids.length ? ppdUuids[i % ppdUuids.length] : facturaUuids[i % facturaUuids.length];
    results.push(baseResult(uuid, {
      tipoCFDI: 'P', metodoPago: 'PUE', total: 0, subtotal: 0, ivaTraslado: 0,
      estatusSAT: 'No verificado', resultado: 'No verificado (REP)' as any,
      pagosRelacionados: [{
        uuidFacturaRelacionada: facturaUuid, numParcialidad: 1, impSaldoAnt: 116, impPagado: 116, impSaldoInsoluto: 0,
        fechaPago: '2026-02-01', monedaP: 'MXN', tipoCambioP: 1, monedaDR: 'MXN', equivalenciaDR: 1,
      } as PagoRelacionadoDetalle],
      direccionCFDI: 'RECIBIDO',
    }));
  }

  return results;
}

const SIZES = [500, 2351, 5000, 6726];

describe('planExportChunks — partición por peso, nunca separa REP de su(s) factura(s) relacionada(s)', () => {
  for (const n of SIZES) {
    it(`n=${n}: cada REP queda en el MISMO bloque que su factura relacionada`, () => {
      const batch = makeBatch(n);
      const plan = planExportChunks(batch);

      const chunkIndexByUuid = new Map<string, number>();
      plan.chunks.forEach((chunk, i) => {
        chunk.forEach(r => chunkIndexByUuid.set(String(r.uuid).toUpperCase(), i));
      });

      let repsVerificados = 0;
      for (const r of batch) {
        if (String(r.tipoCFDI).toUpperCase() !== 'P') continue;
        const repChunk = chunkIndexByUuid.get(String(r.uuid).toUpperCase());
        for (const pago of r.pagosRelacionados || []) {
          const facturaChunk = chunkIndexByUuid.get(String(pago.uuidFacturaRelacionada).toUpperCase());
          expect(facturaChunk).toBe(repChunk);
          repsVerificados++;
        }
      }
      expect(repsVerificados).toBeGreaterThan(0);
    });

    it(`n=${n}: ningún CFDI se pierde ni se duplica entre bloques (unión de bloques === lote original)`, () => {
      const batch = makeBatch(n);
      const plan = planExportChunks(batch);
      const totalEnBloques = plan.chunks.reduce((sum, c) => sum + c.length, 0);
      expect(totalEnBloques).toBe(batch.length);

      const vistos = new Set<ValidationResult>();
      for (const chunk of plan.chunks) {
        for (const r of chunk) {
          expect(vistos.has(r)).toBe(false); // el mismo objeto nunca aparece en dos bloques
          vistos.add(r);
        }
      }
      expect(vistos.size).toBe(batch.length);
    });
  }

  it('un lote pequeño produce un solo bloque (singleFile=true) — conserva el comportamiento de archivo único', () => {
    const batch = makeBatch(50);
    const plan = planExportChunks(batch);
    expect(plan.singleFile).toBe(true);
    expect(plan.chunks.length).toBe(1);
  });

  it('estimateCfdiExportWeight crece con la cantidad de conceptos (más conceptos = más peso = bloques más chicos)', () => {
    const liviano = baseResult('X', { desglosePorConcepto: [] });
    const pesado = baseResult('Y', { desglosePorConcepto: Array.from({ length: 50 }, (_, i) => makeConcepto(i)) });
    expect(estimateCfdiExportWeight(pesado)).toBeGreaterThan(estimateCfdiExportWeight(liviano) * 10);
  });
});

// Estas pruebas cubren el flujo retirado de descargas múltiples y su
// reanudación por archivo. El exportador principal ahora produce un XLSX;
// la integración vigente se prueba en mainReportWorkbook.test.ts.
describe('exportToExcel — reporte principal de archivo único', () => {
  it('serializa los 5,000 CFDI en una sola descarga', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:test'; }), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const workbook = await exportToExcel(makeBatch(5000), 'dev-outputs/reporte-unico.xlsx');
      expect(workbook.SheetNames).toHaveLength(16);
      expect(click).toHaveBeenCalledTimes(1);
      expect(XLSX.read(await blobBytes(blobs[0])).SheetNames).toHaveLength(16);
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  }, 120000);
});
describe('planExportChunks — clusters extremos: nunca separa una relación PPD<->REP, nunca entra en ciclo infinito', () => {
  it('un REP relacionado con MUCHAS facturas (2,000): todas quedan en el mismo bloque que el REP, sin colgarse', () => {
    const facturaUuids: string[] = [];
    const facturas: ValidationResult[] = [];
    for (let i = 0; i < 2000; i++) {
      const uuid = `A0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      facturaUuids.push(uuid);
      facturas.push(baseResult(uuid, { metodoPago: 'PPD' }));
    }
    const repUuid = 'B0000000-0000-4000-8000-000000000001';
    const rep = baseResult(repUuid, {
      tipoCFDI: 'P', metodoPago: 'PUE', total: 0,
      pagosRelacionados: facturaUuids.map(u => ({
        uuidFacturaRelacionada: u, numParcialidad: 1, impSaldoAnt: 116, impPagado: 116, impSaldoInsoluto: 0,
        fechaPago: '2026-02-01', monedaP: 'MXN', tipoCambioP: 1, monedaDR: 'MXN', equivalenciaDR: 1,
      } as PagoRelacionadoDetalle)),
    });
    const batch = [...facturas, rep];

    const start = Date.now();
    const plan = planExportChunks(batch);
    expect(Date.now() - start).toBeLessThan(5000); // nunca se cuelga

    expect(plan.chunks.reduce((sum, c) => sum + c.length, 0)).toBe(batch.length); // nada se pierde
    const chunkOfRep = plan.chunks.findIndex(c => c.some(r => r.uuid === repUuid));
    expect(chunkOfRep).toBeGreaterThanOrEqual(0);
    // Las 2,000 facturas relacionadas están TODAS en el mismo bloque que el REP —
    // un cluster mayor al tamaño objetivo se convierte en su propio bloque
    // sobredimensionado en vez de romperse.
    for (const uuid of facturaUuids) {
      const chunkOfFactura = plan.chunks.findIndex(c => c.some(r => r.uuid === uuid));
      expect(chunkOfFactura).toBe(chunkOfRep);
    }
  });

  it('VARIOS REP (50) para UNA sola factura: la factura y los 50 REP quedan en el mismo bloque', () => {
    const facturaUuid = 'A0000000-0000-4000-8000-000000000001';
    const factura = baseResult(facturaUuid, { metodoPago: 'PPD', total: 5000 });
    const reps: ValidationResult[] = [];
    const repUuids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const repUuid = `B0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      repUuids.push(repUuid);
      reps.push(baseResult(repUuid, {
        tipoCFDI: 'P', metodoPago: 'PUE', total: 0,
        pagosRelacionados: [{
          uuidFacturaRelacionada: facturaUuid, numParcialidad: i + 1, impSaldoAnt: 5000 - i * 100, impPagado: 100, impSaldoInsoluto: 5000 - (i + 1) * 100,
          fechaPago: '2026-02-01', monedaP: 'MXN', tipoCambioP: 1, monedaDR: 'MXN', equivalenciaDR: 1,
        } as PagoRelacionadoDetalle],
      }));
    }
    const batch = [factura, ...reps];
    const plan = planExportChunks(batch);

    const chunkOfFactura = plan.chunks.findIndex(c => c.some(r => r.uuid === facturaUuid));
    for (const repUuid of repUuids) {
      const chunkOfRep = plan.chunks.findIndex(c => c.some(r => r.uuid === repUuid));
      expect(chunkOfRep).toBe(chunkOfFactura);
    }
  });

  it('cluster mayor al tamaño objetivo del bloque: se convierte en su propio bloque sobredimensionado, no se rompe ni bloquea bloques posteriores', () => {
    // Cluster gigante (factura con 1,500 REP) + 2,000 CFDI normales sueltos
    // alrededor. El cluster gigante debe quedar completo en un bloque,
    // y los CFDI sueltos deben seguir empaquetándose normalmente en otros.
    const facturaUuid = 'A0000000-0000-4000-8000-000000000001';
    const factura = baseResult(facturaUuid, { metodoPago: 'PPD', total: 150000 });
    const repsGigante: ValidationResult[] = Array.from({ length: 1500 }, (_, i) => {
      const repUuid = `B0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      return baseResult(repUuid, {
        tipoCFDI: 'P', metodoPago: 'PUE', total: 0,
        pagosRelacionados: [{
          uuidFacturaRelacionada: facturaUuid, numParcialidad: i + 1, impSaldoAnt: 100, impPagado: 100, impSaldoInsoluto: 0,
          fechaPago: '2026-02-01', monedaP: 'MXN', tipoCambioP: 1, monedaDR: 'MXN', equivalenciaDR: 1,
        } as PagoRelacionadoDetalle],
      });
    });
    const sueltos: ValidationResult[] = Array.from({ length: 2000 }, (_, i) =>
      baseResult(`D0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, { metodoPago: 'PUE' })
    );
    const batch = [factura, ...repsGigante, ...sueltos];

    const start = Date.now();
    const plan = planExportChunks(batch);
    expect(Date.now() - start).toBeLessThan(10000);

    expect(plan.chunks.reduce((sum, c) => sum + c.length, 0)).toBe(batch.length);
    expect(plan.chunks.length).toBeGreaterThan(1); // los 2,000 sueltos SÍ se reparten en varios bloques

    const chunkOfFactura = plan.chunks.findIndex(c => c.some(r => r.uuid === facturaUuid));
    const clusterChunk = plan.chunks[chunkOfFactura];
    // Los 1,500 REP del cluster gigante están TODOS en el mismo bloque que su factura.
    expect(clusterChunk.filter(r => String(r.tipoCFDI).toUpperCase() === 'P').length).toBe(1500);
  });

  it('lote con solo clusters pequeños e independientes: no produce ciclos ni bloques vacíos', () => {
    const batch: ValidationResult[] = [];
    for (let i = 0; i < 3000; i++) {
      batch.push(baseResult(`A0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, { metodoPago: i % 2 === 0 ? 'PUE' : 'PPD' }));
    }
    const plan = planExportChunks(batch);
    expect(plan.chunks.every(c => c.length > 0)).toBe(true);
    expect(plan.chunks.reduce((sum, c) => sum + c.length, 0)).toBe(batch.length);
  });
});
