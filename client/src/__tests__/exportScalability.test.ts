import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  exportToExcel,
  planExportChunks,
  estimateCfdiExportWeight,
  type ExportCancelToken,
  type ExportProgressEvent,
} from '../lib/excelExporter';
import type { ValidationResult, PagoRelacionadoDetalle } from '../lib/cfdiEngine';

// El namespace de 'xlsx' es un módulo ESM de solo lectura — vi.spyOn no puede
// redefinir sus propiedades. Se envuelve writeFile en un vi.fn() que por
// defecto DELEGA en la implementación real (todas las pruebas, salvo la de
// "bloque que falla", siguen escribiendo archivos reales en dev-outputs/).
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

// Exportación de lotes grandes (caso real reportado: 6,726 CFDI, "Error al
// exportar el diagnóstico" con el archivo único). Causa raíz medida (ver
// comentario extenso junto a exportToExcelMultiFile en excelExporter.ts):
// ~20 hojas de detalle por documento, TODAS mantenidas en un solo workbook
// hasta el final, más una única llamada síncrona a XLSX.writeFile() que debe
// serializar ~8 millones de celdas de una vez a los 6,726 CFDI (medido:
// ~66s / ~2.4GB build + ~14s / ~3.0GB pico en XLSX.write, archivo de 353MB).
// Estas pruebas verifican el paquete de varios archivos (00_Resumen_Global +
// bloques Diagnostico_00N) que reemplaza esa única llamada gigante, SIN
// perder, resumir, omitir ni alterar ningún CFDI/REP/relación PPD-REP.

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

describe('exportToExcel — paquete multi-archivo para lotes grandes (integración real, no solo la función de partición)', () => {
  for (const n of SIZES) {
    it(`n=${n}: reconciliación exacta — total procesados = UUID exportados + errores de lectura + duplicados controlados`, async () => {
      const batch = makeBatch(n);
      const events: ExportProgressEvent[] = [];
      const wb = await exportToExcel(batch, `dev-outputs/scale_n${n}.xlsx`, (e) => events.push(e));
      const status = (wb as any).__sentinelExportStatus;

      if (status?.isMultiFile) {
        expect(status.status).toBe('complete');
        expect(status.reconciliacion).toBeTruthy();
        expect(status.reconciliacion.totalProcesados).toBe(n);
        expect(status.reconciliacion.cuadra).toBe(true);
        expect(status.reconciliacion.totalProcesados).toBe(
          status.reconciliacion.uuidExportados + status.reconciliacion.erroresLectura + status.reconciliacion.duplicadosControlados
        );
        expect(status.filesWritten.length).toBe(status.totalFiles);
        // Progreso visible por archivo (instrucción 7): al menos un evento
        // "building" trae fileIndex/fileTotal poblados.
        expect(events.some(e => e.stage === 'building' && typeof e.fileIndex === 'number' && typeof e.fileTotal === 'number')).toBe(true);
      } else {
        // Lote pequeño: sigue siendo un solo XLSX real (wb.SheetNames existe).
        expect(wb.SheetNames).toBeDefined();
        expect(wb.SheetNames.length).toBeGreaterThan(0);
      }
    }, 120000);
  }

  it('cancelación a mitad del paquete: se detiene, conserva los archivos ya descargados, y NO modifica el arreglo de entrada (la sesión cargada no se ve afectada)', async () => {
    const batch = makeBatch(5000);
    const snapshotBefore = JSON.stringify(batch.map(r => r.uuid));
    const cancelToken: ExportCancelToken = { cancelled: false };
    let firstFileDone = false;

    const wb = await exportToExcel(batch, 'dev-outputs/scale_cancel', (e) => {
      // Se distingue el evento de "archivo de bloque YA ESCRITO a disco" (el
      // que esta prueba necesita — ver el texto exacto que emite
      // exportToExcelMultiFile) de los eventos de progreso por HOJA dentro de
      // ese bloque, que también traen fileIndex pero ocurren ANTES de que
      // XLSX.writeFile se ejecute para ese archivo.
      if (e.stage === 'done' && e.sheet.includes('completado') && !firstFileDone) {
        firstFileDone = true;
        cancelToken.cancelled = true; // cancela apenas termina el primer archivo del paquete
      }
    }, { cancelToken });

    const status = (wb as any).__sentinelExportStatus;
    expect(status.status).toBe('cancelled');
    expect(status.filesWritten.length).toBeGreaterThanOrEqual(1);
    expect(status.filesWritten.length).toBeLessThan(status.totalFiles || Infinity + 1);
    // El arreglo de entrada nunca se modifica — la sesión guardada no se toca.
    expect(JSON.stringify(batch.map(r => r.uuid))).toBe(snapshotBefore);
  }, 120000);

  it('instrucción 6: usuario cancela ANTES del primer archivo (token ya cancelado desde el inicio) — cero archivos escritos, nada que reanudar salvo empezar de nuevo', async () => {
    const batch = makeBatch(2351);
    const cancelToken: ExportCancelToken = { cancelled: true };
    const wb = await exportToExcel(batch, 'dev-outputs/scale_cancel_before_first', undefined, { cancelToken });
    const status = (wb as any).__sentinelExportStatus;
    expect(status.status).toBe('cancelled');
    expect(status.filesWritten.length).toBe(0);
  }, 60000);

  it('instrucción 6: usuario cancela DESPUÉS del archivo 3 — luego reintenta y SOLO genera los pendientes (ningún archivo ya generado se repite)', async () => {
    const batch = makeBatch(5000);
    const basePrefix = 'dev-outputs/scale_cancel_after_3';
    const cancelToken: ExportCancelToken = { cancelled: false };
    let archivosCompletados = 0;

    const primerIntento = await exportToExcel(batch, basePrefix, (e) => {
      if (e.stage === 'done' && e.sheet.includes('completado')) {
        archivosCompletados++;
        if (archivosCompletados === 3) cancelToken.cancelled = true;
      }
    }, { cancelToken });
    const status1 = (primerIntento as any).__sentinelExportStatus;
    expect(status1.status).toBe('cancelled');
    expect(status1.filesWritten.length).toBe(3);

    // Reintento dirigido: se le dice exactamente dónde continuar (archivo 4).
    const resumeFromFile = status1.filesWritten.length + 1;
    const hojasReconstruidas: string[] = [];
    const segundoIntento = await exportToExcel(batch, basePrefix, (e) => {
      if (e.stage === 'building' && typeof e.fileIndex === 'number') hojasReconstruidas.push(e.fileName || '');
    }, { cancelToken: { cancelled: false }, resumeFromFile });
    const status2 = (segundoIntento as any).__sentinelExportStatus;

    expect(status2.status).toBe('complete');
    // Los 3 primeros archivos NUNCA se reconstruyeron en el segundo intento.
    const archivosPrimerosTres = status1.filesWritten as string[];
    for (const nombre of archivosPrimerosTres) {
      expect(hojasReconstruidas).not.toContain(nombre);
    }
    // Pero SÍ aparecen en el resultado final (se asumen ya generados, no se pierden del reporte).
    for (const nombre of archivosPrimerosTres) {
      expect(status2.filesWritten).toContain(nombre);
    }
    // La reconciliación del paquete completo sigue siendo exacta.
    expect(status2.reconciliacion.totalProcesados).toBe(5000);
    expect(status2.reconciliacion.cuadra).toBe(true);
  }, 120000);

  it('exportación reintentable: tras una cancelación, una nueva llamada con un token fresco completa el paquete completo', async () => {
    const batch = makeBatch(2351);
    const cancelToken1: ExportCancelToken = { cancelled: true }; // cancelada desde el inicio
    const cancelado = await exportToExcel(batch, 'dev-outputs/scale_retry', undefined, { cancelToken: cancelToken1 });
    expect((cancelado as any).__sentinelExportStatus.status).toBe('cancelled');

    const cancelToken2: ExportCancelToken = { cancelled: false };
    const reintento = await exportToExcel(batch, 'dev-outputs/scale_retry', undefined, { cancelToken: cancelToken2 });
    const status = (reintento as any).__sentinelExportStatus;
    expect(status.status).toBe('complete');
    expect(status.reconciliacion.totalProcesados).toBe(2351);
  }, 120000);

  it('instrucción 5: File System Access API — escritura CONFIRMADA (writesConfirmed=true), un archivo por llamada, nunca dos workbooks a la vez', async () => {
    const batch = makeBatch(2351);
    const escritos: string[] = [];
    const fakeDirectoryHandle = {
      getFileHandle: async (name: string) => {
        escritos.push(name);
        return {
          createWritable: async () => ({
            write: async () => { /* no-op: no se necesita persistir bytes reales para esta prueba */ },
            close: async () => { /* no-op */ },
          }),
        };
      },
    };

    const wb = await exportToExcel(batch, 'dev-outputs/scale_fsapi', undefined, { directoryHandle: fakeDirectoryHandle as any });
    const status = (wb as any).__sentinelExportStatus;
    expect(status.status).toBe('complete');
    expect(status.writesConfirmed).toBe(true);
    expect(escritos.length).toBe(status.totalFiles); // un archivo por cada bloque + el resumen global
  }, 120000);

  it('instrucción 5: si el navegador/SO bloquea la escritura vía File System Access API (permiso revocado, cuota, etc.), se reporta como falla de ESE archivo — no se afirma un guardado que no ocurrió', async () => {
    const batch = makeBatch(5000);
    let llamada = 0;
    const fakeDirectoryHandleQueFalla = {
      getFileHandle: async (name: string) => {
        llamada++;
        if (llamada === 2) throw new DOMException('Acceso denegado (simulado)', 'NotAllowedError');
        return {
          createWritable: async () => ({ write: async () => {}, close: async () => {} }),
        };
      },
    };

    const wb = await exportToExcel(batch, 'dev-outputs/scale_fsapi_fail', undefined, { directoryHandle: fakeDirectoryHandleQueFalla as any });
    const status = (wb as any).__sentinelExportStatus;
    expect(status.status).toBe('critical_failure');
    expect(status.failedAtFile).toBe(2);
    expect(status.filesWritten.length).toBe(1); // el primer archivo SÍ se confirmó antes de la falla
  }, 120000);

  it('si un bloque falla a la mitad del paquete, los archivos anteriores se conservan (ya se descargaron) y se reporta exactamente cuál bloque falló', async () => {
    const batch = makeBatch(5000); // suficientemente grande para varios bloques
    const plan = planExportChunks(batch);
    expect(plan.chunks.length).toBeGreaterThan(2); // la prueba requiere al menos 3 bloques

    // Se reemplaza XLSX.writeFile por un stub para las primeras dos
    // invocaciones: no necesita escribir un archivo real para esta prueba
    // (solo importa CUÁNTAS veces se invocó y en cuál invocación se hizo
    // fallar) — así se verifica el manejo de errores de la orquestación sin
    // depender del sistema de archivos. mockRestore() al final regresa el
    // mock a delegar en la implementación real para las demás pruebas.
    const mockedWriteFile = vi.mocked(XLSX.writeFile);
    mockedWriteFile.mockImplementationOnce(() => undefined as any); // bloque 1: éxito simulado
    mockedWriteFile.mockImplementationOnce(() => { throw new Error('Fallo simulado de escritura (prueba)'); }); // bloque 2: falla

    try {
      const wb = await exportToExcel(batch, 'dev-outputs/scale_fail', undefined);
      const status = (wb as any).__sentinelExportStatus;
      expect(status.status).toBe('critical_failure');
      expect(status.failedAtFile).toBe(2);
      expect(status.filesWritten.length).toBe(1); // solo el primer bloque se alcanzó a escribir con éxito
    } finally {
      mockedWriteFile.mockRestore();
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
