import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  reconciliarPagosPPD,
  contarEstatusSAT,
  evaluarObligacionREP,
  aplicarConciliacionPagos,
  mergeAndReconcileResults,
  type PagoRelacionadoDetalle,
} from '../lib/cfdiEngine';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import { useXMLValidator } from '../hooks/useXMLValidator';
import type { ValidationResult } from '../lib/cfdiEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

// Auditoría PPD↔REP + corrección de etiquetas REP. Todas las pruebas usan
// funciones reales: reconciliarPagosPPD (motor de reconciliación real),
// combinarResultadoFinal (vía el pipeline real de validación para el punto
// 13), y buildDiagnosticoWorkbook (exportación real) para la coincidencia
// pantalla/Excel del punto 15.

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
    subtotal: 1000,
    baseIVA16: 1000,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'GRAVADO',
    ivaTraslado: 160,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 1160,
    moneda: 'MXN',
    tipoCambio: 1,
    formaPago: '99',
    metodoPago: 'PPD',
    nivelValidacion: 'ESTRUCTURAL',
    resultado: '🟢 USABLE',
    comentarioFiscal: '',
    observacionesTecnicas: '',
    iva: 160,
    isValid: true,
    totalCalculado: 1160,
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

function pago(over: Partial<PagoRelacionadoDetalle>): PagoRelacionadoDetalle {
  return {
    uuidFacturaRelacionada: '',
    numParcialidad: 1,
    impSaldoAnt: null,
    impPagado: null,
    impSaldoInsoluto: null,
    fechaPago: '2026-06-15T10:00:00',
    monedaP: 'MXN',
    tipoCambioP: 1,
    monedaDR: 'MXN',
    equivalenciaDR: 1,
    ...over,
  };
}

function rep(uuid: string, pagos: PagoRelacionadoDetalle[], over: Partial<ValidationResult> = {}): ValidationResult {
  return baseResult(uuid, {
    tipoCFDI: 'P',
    metodoPago: 'PUE',
    total: 0,
    subtotal: 0,
    ivaTraslado: 0,
    pagosRelacionados: pagos,
    ...over,
  });
}

describe('reconciliarPagosPPD — matriz de 15 casos (auditoría PPD↔REP)', () => {
  it('1. Factura PUE sin REP → estado PUE, no requiere evidencia', () => {
    const factura = baseResult('F0000000-0000-0000-0000-000000000001', { metodoPago: 'PUE', total: 1160 });
    const { facturas } = reconciliarPagosPPD([factura]);
    expect(facturas[0].estado).toBe('PUE');
    expect(facturas[0].totalPagado).toBe(1160);
    expect(facturas[0].observacion).toContain('no requiere REP');
  });

  it('2. PPD sin REP → "Sin evidencia de pago en los XML cargados" (nunca "impagada")', () => {
    const factura = baseResult('F0000000-0000-0000-0000-000000000002', { metodoPago: 'PPD' });
    const { facturas } = reconciliarPagosPPD([factura]);
    expect(facturas[0].estado).toBe('SIN_EVIDENCIA_REP');
    expect(facturas[0].observacion.toLowerCase()).toContain('sin evidencia de pago');
    expect(facturas[0].observacion.toLowerCase()).not.toContain('impagada');
  });

  it('3. PPD con un pago parcial → PARCIAL + saldo insoluto correcto', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000003';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-000000000003', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impSaldoAnt: 1160, impPagado: 500, impSaldoInsoluto: 660 }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('PARCIAL');
    expect(f.totalPagado).toBe(500);
    expect(f.saldoAnterior).toBe(1160);
    expect(f.saldoInsoluto).toBe(660);
    expect(f.ultimaParcialidad).toBe(1);
  });

  it('4. PPD con varios pagos parciales (2 REP distintos) → acumula sin duplicar y refleja el saldo más reciente', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000004';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const rep1 = rep('R0000000-0000-0000-0000-000000000041', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impSaldoAnt: 1160, impPagado: 500, impSaldoInsoluto: 660, fechaPago: '2026-06-10T10:00:00' }),
    ]);
    const rep2 = rep('R0000000-0000-0000-0000-000000000042', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 2, impSaldoAnt: 660, impPagado: 300, impSaldoInsoluto: 360, fechaPago: '2026-06-20T10:00:00' }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, rep1, rep2]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('PARCIAL');
    expect(f.totalPagado).toBe(800); // 500 + 300, sin duplicar
    expect(f.saldoInsoluto).toBe(360); // saldo de la parcialidad MÁS RECIENTE (2), no de la 1
    expect(f.ultimaParcialidad).toBe(2);
    expect(f.repRelacionados.sort()).toEqual([rep1.uuid, rep2.uuid].sort());
  });

  it('5. PPD liquidada (el saldo insoluto reportado llega a 0) → LIQUIDADA', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000005';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-000000000005', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0 }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.saldoInsoluto).toBe(0);
  });

  it('6. REP duplicado (mismo UUID de REP repetido) → se cuenta UNA sola vez en el importe pagado, y la segunda ocurrencia se reporta como DUPLICADO (no se pierde ni se vuelve a sumar)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000006';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-000000000006', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0 }),
    ]);
    // El mismo REP (mismo uuid) aparece dos veces en el lote (p.ej. archivo cargado por error dos veces).
    const { facturas, reps } = reconciliarPagosPPD([factura, repDoc, { ...repDoc }]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.totalPagado).toBe(1160); // NO 2320
    expect(f.estado).toBe('LIQUIDADA');
    const ocurrencias = reps.filter(r => r.uuid === repDoc.uuid);
    expect(ocurrencias.length).toBe(2); // una RELACIONADO (la primera) + una DUPLICADO (la repetida) — ninguna se descarta en silencio
    expect(ocurrencias.filter(r => r.estado === 'RELACIONADO').length).toBe(1);
    expect(ocurrencias.filter(r => r.estado === 'DUPLICADO').length).toBe(1);
  });

  it('7. REP sin factura relacionada en este análisis (UUID válido pero no está en el lote)', () => {
    const repDoc = rep('R0000000-0000-0000-0000-000000000007', [
      pago({ uuidFacturaRelacionada: 'F9999999-9999-9999-9999-999999999999', numParcialidad: 1, impPagado: 500 }),
    ]);
    const { reps } = reconciliarPagosPPD([repDoc]);
    expect(reps[0].estado).toBe('SIN_FACTURA_RELACIONADA');
    expect(reps[0].observacion).toContain('en este análisis');
    // Nunca debe afirmar que la factura no existe en ningún lado.
    expect(reps[0].observacion.toLowerCase()).not.toContain('no existe');
  });

  it('8. REP con UUID incorrecto (formato inválido) → rechazado por error, NUNCA se sustituye por fecha/importe/RFC', () => {
    const repDoc = rep('R0000000-0000-0000-0000-000000000008', [
      pago({ uuidFacturaRelacionada: 'ESTO-NO-ES-UN-UUID', numParcialidad: 1, impPagado: 500 }),
    ]);
    const { reps } = reconciliarPagosPPD([repDoc]);
    expect(reps[0].estado).toBe('RECHAZADO_ERROR');
    expect(reps[0].observacion).toContain('formato inválido');
  });

  it('9. Factura RECIBIDA con REP → reconciliación funciona igual que para emitidas', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000009';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160, direccionCFDI: 'RECIBIDO' as any, rfcEmisor: 'PROV010101PRO', rfcReceptor: EMPRESA });
    const repDoc = rep('R0000000-0000-0000-0000-000000000009', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impPagado: 1160, impSaldoInsoluto: 0 }),
    ], { direccionCFDI: 'RECIBIDO' as any });
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.direccionCFDI).toBe('RECIBIDO');
  });

  it('10. Factura EMITIDA con REP → reconciliación funciona igual que para recibidas', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000010';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160, direccionCFDI: 'EMITIDO' as any, rfcEmisor: EMPRESA, rfcReceptor: 'CLI010101CLI' });
    const repDoc = rep('R0000000-0000-0000-0000-000000000010', [
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impPagado: 1160, impSaldoInsoluto: 0 }),
    ], { direccionCFDI: 'EMITIDO' as any });
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.direccionCFDI).toBe('EMITIDO');
  });

  it('11. Moneda extranjera y tipo de cambio: el pago en USD se convierte a la moneda de la factura vía EquivalenciaDR', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000011';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160, moneda: 'MXN' });
    const repDoc = rep('R0000000-0000-0000-0000-000000000011', [
      // Pago de 58 USD equivalente a 1160 MXN (EquivalenciaDR = 20)
      pago({ uuidFacturaRelacionada: uuidFactura, numParcialidad: 1, impPagado: 58, impSaldoInsoluto: 0, monedaP: 'USD', monedaDR: 'USD', tipoCambioP: 20, equivalenciaDR: 20 }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.totalPagado).toBe(1160); // 58 * 20, convertido a la moneda de la factura
    expect(f.estado).toBe('LIQUIDADA');
  });

  it('12. Nota de crédito NUNCA se trata como pago (solo Tipo P contribuye al importe pagado)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000012';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const notaCredito = baseResult('N0000000-0000-0000-0000-000000000012', {
      tipoCFDI: 'E', tipoRealDocumento: 'Nota de Crédito', tieneCfdiRelacionados: 'SI', tipoRelacion: '01',
      uuidRelacionado: uuidFactura, uuids_relacionados: [uuidFactura], total: 200,
    });
    const { facturas } = reconciliarPagosPPD([factura, notaCredito]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    // La nota de crédito no es Tipo P: no aporta nada a pagosPorFactura.
    expect(f.estado).toBe('SIN_EVIDENCIA_REP');
    expect(f.totalPagado).toBe(0);
  });

  it('13. REP excluido de SAT NUNCA aparece como "No validado SAT" (pipeline real, classifyBySATStatus reemplazada)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const repXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="REP" Folio="1" Fecha="2026-06-15T10:00:00" Sello="---" NoCertificado="00001" Certificado="---" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="01000">
    <cfdi:Emisor Rfc="EMI010101EMI" Nombre="EMISOR SA" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${EMPRESA}" Nombre="EMPRESA EVALUADA" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="D0000000-0000-0000-0000-000000000013" FechaTimbrado="2026-06-15T10:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
        <pago20:Pagos Version="2.0">
            <pago20:Pago FechaPago="2026-06-15T10:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="1160">
                <pago20:DoctoRelacionado IdDocumento="F0000000-0000-0000-0000-000000000013" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1160" ImpPagado="1160" ImpSaldoInsoluto="0" ObjetoImpDR="01"/>
            </pago20:Pago>
        </pago20:Pagos>
    </cfdi:Complemento>
</cfdi:Comprobante>`;

    let resultado: any[] = [];
    await new Promise<void>((resolve, reject) => {
      function Harness() {
        const { validateXMLFiles } = useXMLValidator();
        React.useEffect(() => {
          validateXMLFiles(
            [{ name: 'rep.xml', size: 100, type: 'text/xml', content: repXml } as any],
            'Comercio', EMPRESA, () => {}
          ).then(r => { resultado = r; resolve(); }).catch(reject);
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }
      const root = createRoot(container);
      act(() => { root.render(React.createElement(Harness)); });
    });

    const rep0 = resultado[0];
    expect(rep0.tipoCFDI).toBe('P');
    expect(rep0.estatusSAT).toBe('No Aplica (REP)');
    expect(rep0.resultado).not.toBe('No validado SAT');
    expect(rep0.pagosRelacionados?.length).toBe(1);
    expect(rep0.pagosRelacionados?.[0].uuidFacturaRelacionada).toBe('F0000000-0000-0000-0000-000000000013');

    // Excel: la fila REP en Diagnostico_CFDI usa las etiquetas nuevas, y NO se
    // cuenta como "No validado SAT" en el conteo central.
    const wb = await buildDiagnosticoWorkbook([rep0]);
    const diag = XLSX.utils.sheet_to_json<any>(wb.Sheets['Diagnostico_CFDI'])[0];
    expect(diag.Estatus_SAT).toBe('NO APLICA — REP');
    expect(diag.Resultado_Validacion_SAT).toBe('EXCLUIDO DE CONSULTA SAT');

    const conteo = contarEstatusSAT([rep0]);
    expect(conteo.repExcluidos).toBe(1);
    expect(conteo.noConfirmados).toBe(0);
    expect(conteo.vigentes).toBe(0);
    expect(conteo.cancelados).toBe(0);
  });

  it('14. Persistencia entre cargas sucesivas: reconciliarPagosPPD (usado por el Excel) SÍ funciona sobre el acumulado de varios lotes; paymentComplementStatus (calculado por lote en validateXMLFiles) NO se actualiza retroactivamente', async () => {
    const uuidFactura = 'F0000000-0000-0000-0000-000000000014';
    const facturaXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1" Fecha="2026-06-01T10:00:00" Sello="---" FormaPago="99" MetodoPago="PPD" NoCertificado="00001" Certificado="---" SubTotal="1000.00" Moneda="MXN" Total="1160.00" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="01000">
    <cfdi:Emisor Rfc="EMI010101EMI" Nombre="EMISOR SA" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${EMPRESA}" Nombre="EMPRESA EVALUADA" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1.00" ClaveUnidad="H87" Descripcion="Servicio PPD" ValorUnitario="1000.00" Importe="1000.00" ObjetoImp="02">
            <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00"><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuidFactura}" FechaTimbrado="2026-06-01T10:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;
    const repXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="REP" Folio="1" Fecha="2026-06-15T10:00:00" Sello="---" NoCertificado="00001" Certificado="---" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="01000">
    <cfdi:Emisor Rfc="EMI010101EMI" Nombre="EMISOR SA" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${EMPRESA}" Nombre="EMPRESA EVALUADA" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="D0000000-0000-0000-0000-000000000014" FechaTimbrado="2026-06-15T10:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
        <pago20:Pagos Version="2.0">
            <pago20:Pago FechaPago="2026-06-15T10:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="1160">
                <pago20:DoctoRelacionado IdDocumento="${uuidFactura}" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1160" ImpPagado="1160" ImpSaldoInsoluto="0" ObjetoImpDR="01"/>
            </pago20:Pago>
        </pago20:Pagos>
    </cfdi:Complemento>
</cfdi:Comprobante>`;

    async function validar(files: any[]): Promise<any[]> {
      const container = document.createElement('div');
      document.body.appendChild(container);
      let out: any[] = [];
      await new Promise<void>((resolve, reject) => {
        function Harness() {
          const { validateXMLFiles } = useXMLValidator();
          React.useEffect(() => {
            validateXMLFiles(files, 'Comercio', EMPRESA, () => {}).then(r => { out = r; resolve(); }).catch(reject);
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, []);
          return null;
        }
        const root = createRoot(container);
        act(() => { root.render(React.createElement(Harness)); });
      });
      return out;
    }

    // Lote 1: solo la factura. Lote 2 (carga sucesiva, misma sesión): solo el REP.
    const lote1 = await validar([{ name: 'factura.xml', size: 100, type: 'text/xml', content: facturaXml } as any]);
    const lote2 = await validar([{ name: 'rep.xml', size: 100, type: 'text/xml', content: repXml } as any]);

    const facturaDeLote1 = lote1[0];
    // LIMITACIÓN REAL DEMOSTRADA: reconcilePaymentComplements corrió DENTRO de
    // validateXMLFiles del lote 1, cuando el REP todavía no existía — el
    // campo paymentComplementStatus calculado en ese momento NO se actualiza
    // retroactivamente cuando el REP llega en un lote posterior.
    expect(facturaDeLote1.paymentComplementStatus).toBe('SIN_COMPLEMENTO');

    // Lo que SÍ ocurre en la práctica: el Dashboard acumula ambos lotes en un
    // mismo arreglo `results` (results = [...results, ...nuevos]), y el Excel
    // se exporta siempre sobre ese acumulado completo. reconciliarPagosPPD
    // (usado por buildDiagnosticoWorkbook) SÍ relaciona correctamente factura
    // y REP cuando se le pasa el acumulado de ambos lotes:
    const acumulado = [...lote1, ...lote2];
    const { facturas } = reconciliarPagosPPD(acumulado);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.totalPagado).toBe(1160);
  });

  it('15. Coincidencia exacta entre pantalla (reconciliarPagosPPD), contadores y Excel para un lote mixto', async () => {
    const results = [
      baseResult('F0000000-0000-0000-0000-000000000101', { metodoPago: 'PUE', total: 500 }),
      baseResult('F0000000-0000-0000-0000-000000000102', { metodoPago: 'PPD', total: 1000 }),
      baseResult('F0000000-0000-0000-0000-000000000103', { metodoPago: 'PPD', total: 2000 }),
      rep('R0000000-0000-0000-0000-000000000103', [
        pago({ uuidFacturaRelacionada: 'F0000000-0000-0000-0000-000000000103', numParcialidad: 1, impSaldoAnt: 2000, impPagado: 2000, impSaldoInsoluto: 0 }),
      ]),
    ];

    // "Pantalla" = llamar la misma función central directamente.
    const conciliacion = reconciliarPagosPPD(results);
    const sinEvidencia = conciliacion.facturas.filter(f => f.estado === 'SIN_EVIDENCIA_REP').length;
    const liquidadas = conciliacion.facturas.filter(f => f.estado === 'LIQUIDADA').length;
    const puePagadas = conciliacion.facturas.filter(f => f.estado === 'PUE').length;
    expect(sinEvidencia).toBe(1);
    expect(liquidadas).toBe(1);
    expect(puePagadas).toBe(1);

    // "Excel" = misma función, invocada dentro de buildDiagnosticoWorkbook.
    const wb = await buildDiagnosticoWorkbook(results);
    const conciliacionSheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['CONCILIACION PAGOS PPD']);
    const ejecutivoSheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['RESUMEN EJECUTIVO']);
    const buscar = (rows: any[], m: string) => rows.find(r => r.Metrica === m)?.Valor;

    expect(conciliacionSheet.filter((r: any) => r.Estado_Pago === 'SIN EVIDENCIA REP').length).toBe(sinEvidencia);
    expect(conciliacionSheet.filter((r: any) => r.Estado_Pago === 'LIQUIDADO').length).toBe(liquidadas);
    expect(buscar(ejecutivoSheet, 'Facturas PPD - sin evidencia REP')).toBe(sinEvidencia);
    expect(buscar(ejecutivoSheet, 'Facturas PPD - liquidadas')).toBe(liquidadas);
    expect(buscar(ejecutivoSheet, 'Facturas PPD total (= sin evidencia + parciales + liquidadas + requieren revisión)')).toBe(conciliacion.facturas.filter(f => f.metodoPago === 'PPD').length);
    expect(buscar(ejecutivoSheet, 'REP cargados - relacionados')).toBe(conciliacion.reps.filter(r => r.estado === 'RELACIONADO').length);
  });
});

describe('Bloqueadores: regla histórica corregida (evaluarObligacionREP usa la FECHA DEL PAGO, no la de la factura), multimoneda, cargas sucesivas y aislamiento por empresa', () => {
  // ── evaluarObligacionREP: matriz directa de la función pura ──────────────
  it('M1. Factura 31/08/2018 + pago 31/08/2018 (ambos anteriores al corte) → NO_EXIGIBLE_HISTORICO', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2018-08-31', fechaPago: '2018-08-31', existeREP: true });
    expect(r.estado).toBe('NO_EXIGIBLE_HISTORICO');
    expect(r.requiereEvidencia).toBe(false);
  });

  it('M2. Factura 31/08/2018 + PAGO 01/09/2018 (factura antigua, pago posterior al corte) → REQUIERE_EVIDENCIA: sí requiere REP', () => {
    // Este es el caso que la versión anterior de la regla resolvía MAL: usaba
    // la fecha de la FACTURA (anterior al corte) y concluía "no exigible",
    // ignorando que el pago (el hecho que dispara la obligación) es posterior.
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2018-08-31', fechaPago: '2018-09-01', existeREP: true });
    expect(r.estado).toBe('REQUIERE_EVIDENCIA');
    expect(r.requiereEvidencia).toBe(true);
  });

  it('M3. Factura 01/09/2018 + pago posterior (ambos exigibles) → REQUIERE_EVIDENCIA', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2018-09-01', fechaPago: '2019-01-15', existeREP: true });
    expect(r.estado).toBe('REQUIERE_EVIDENCIA');
  });

  it('M4. Factura antigua sin REP ni fecha de pago conocida → SIN_EVIDENCIA_PAGO (NUNCA "no exigible" ni "incumplimiento", sin importar qué tan vieja sea la factura)', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2010-01-01', fechaPago: null, existeREP: false });
    expect(r.estado).toBe('SIN_EVIDENCIA_PAGO');
    expect(r.mensaje.toLowerCase()).not.toMatch(/no exigible|incumpl/);
  });

  it('M5. PPD moderna sin evidencia de pago → SIN_EVIDENCIA_PAGO (misma regla, independiente de la fecha de la factura)', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2026-06-01', fechaPago: null, existeREP: false });
    expect(r.estado).toBe('SIN_EVIDENCIA_PAGO');
  });

  it('M6. REP con FechaPago válida (posterior al corte) → REQUIERE_EVIDENCIA', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2018-01-01', fechaPago: '2020-05-01', existeREP: true });
    expect(r.estado).toBe('REQUIERE_EVIDENCIA');
  });

  it('M7. REP con FechaPago ausente o inválida → "Requiere revisión: fecha de pago insuficiente"', () => {
    const ausente = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2020-01-01', fechaPago: null, existeREP: true });
    const invalida = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2020-01-01', fechaPago: 'fecha inválida', existeREP: true });
    for (const r of [ausente, invalida]) {
      expect(r.estado).toBe('FECHA_PAGO_INSUFICIENTE');
      expect(r.mensaje.toLowerCase()).toContain('fecha de pago insuficiente');
    }
  });

  it('M8. Tipo P y PUE → NO_APLICA sin importar fechas', () => {
    expect(evaluarObligacionREP({ tipoCFDI: 'P', metodoPago: 'PUE', fechaFactura: null, fechaPago: null, existeREP: false }).estado).toBe('NO_APLICA');
    expect(evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PUE', fechaFactura: '2018-01-01', fechaPago: null, existeREP: false }).estado).toBe('NO_APLICA');
  });

  // ── reconciliarPagosPPD: la misma corrección, wireada en el motor real ───
  it('B1. PPD sin REP → SIEMPRE SIN_EVIDENCIA_REP, sin importar qué tan antigua sea la factura (nunca "no exigible" por fecha de la factura)', () => {
    const antigua = baseResult('F0000000-0000-0000-0000-00000000B001', { metodoPago: 'PPD', fechaEmision: '2018-08-31', total: 1160 });
    const moderna = baseResult('F0000000-0000-0000-0000-00000000B002', { metodoPago: 'PPD', fechaEmision: '2026-06-01', total: 1160 });
    const { facturas } = reconciliarPagosPPD([antigua, moderna]);
    for (const f of facturas) {
      expect(f.estado).toBe('SIN_EVIDENCIA_REP');
      expect(f.observacion.toLowerCase()).toContain('sin evidencia de pago');
      expect(f.observacion.toLowerCase()).not.toMatch(/no exigible|incumpl/);
    }
  });

  it('B2. Factura PPD de 2018-08-31 CON REP cuyo pago fue el 2018-08-31 → LIQUIDADA + pagoHistoricamenteExento=true (informativo, no cambia el estado de pago)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B003';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', fechaEmision: '2018-08-31', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B003', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0, fechaPago: '2018-08-31' }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.pagoHistoricamenteExento).toBe(true);
    expect(f.observacion).toContain('Pago recibido antes de la obligatoriedad general del REP — informativo.');
    expect(f.observacion.toLowerCase()).not.toContain('exent');
  });

  it('B3. Factura PPD de 2018-08-31 (antigua) pero CON REP cuyo pago fue el 2018-09-01 (posterior al corte) → LIQUIDADA, SIN el flag histórico (el pago SÍ requería REP y lo tiene)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B004';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', fechaEmision: '2018-08-31', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B004', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0, fechaPago: '2018-09-01' }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.pagoHistoricamenteExento).toBeFalsy();
  });

  it('B3b. REP con FechaPago ausente o inválida → REQUIERE_REVISION_FECHA (el dinero no se descarta, pero se marca para revisión)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B005';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B005', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0, fechaPago: 'fecha inválida' }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('REQUIERE_REVISION_FECHA');
    expect(f.observacion.toLowerCase()).toContain('fecha de pago insuficiente');
  });

  it('B4. Multimoneda válida: MonedaDR distinta de la factura con EquivalenciaDR correcta → LIQUIDADA (conversión demostrable)', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B005';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', moneda: 'MXN', total: 1750 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B005', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1750, impPagado: 100, impSaldoInsoluto: 0, monedaDR: 'USD', equivalenciaDR: 17.5 }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.estado).toBe('LIQUIDADA');
    expect(f.totalPagado).toBe(1750);
  });

  it('B5. Multimoneda con EquivalenciaDR ausente o inválida (0 / negativa) → REQUIERE_REVISION_MONEDA, nunca se aproxima en silencio', () => {
    const uuidAusente = 'F0000000-0000-0000-0000-00000000B006';
    const facturaAusente = baseResult(uuidAusente, { metodoPago: 'PPD', moneda: 'MXN', total: 1750 });
    const repAusente = rep('R0000000-0000-0000-0000-00000000B006', [
      pago({ uuidFacturaRelacionada: uuidAusente, impSaldoAnt: 1750, impPagado: 100, impSaldoInsoluto: 0, monedaDR: 'USD', equivalenciaDR: null }),
    ]);

    const uuidCero = 'F0000000-0000-0000-0000-00000000B007';
    const facturaCero = baseResult(uuidCero, { metodoPago: 'PPD', moneda: 'MXN', total: 1750 });
    const repCero = rep('R0000000-0000-0000-0000-00000000B007', [
      pago({ uuidFacturaRelacionada: uuidCero, impSaldoAnt: 1750, impPagado: 100, impSaldoInsoluto: 0, monedaDR: 'USD', equivalenciaDR: 0 }),
    ]);

    const { facturas } = reconciliarPagosPPD([facturaAusente, repAusente, facturaCero, repCero]);
    for (const uuid of [uuidAusente, uuidCero]) {
      const f = facturas.find(x => x.uuid === uuid)!;
      expect(f.estado).toBe('REQUIERE_REVISION_MONEDA');
      expect(f.observacion).toBe('Requiere revisión por conversión de moneda.');
    }
  });

  it('B6. Prueba de integración (función de estado productiva del Dashboard, no la función pura aislada): factura en lote 1 + REP en lote 2 actualiza retroactivamente vía mergeAndReconcileResults', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B008';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B008', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0 }),
    ]);

    // Lote 1: exactamente lo que hace Dashboard.tsx en su handler principal
    // de validación (mergeAndReconcileResults(results, validationResults)).
    const paso1 = mergeAndReconcileResults([], [factura]);
    const facturaTrasPaso1 = paso1.combinado.find(r => r.uuid === uuidFactura)!;
    expect(facturaTrasPaso1.pagosRelacionadosEstado).toBe('SIN_EVIDENCIA_REP');
    expect(facturaTrasPaso1.paymentComplementStatus).toBe('SIN_COMPLEMENTO');

    // Lote 2 (carga sucesiva, misma sesión): el REP llega después. Se le pasa
    // el ACUMULADO de la pantalla (paso1.combinado), tal como lo hace
    // Dashboard.tsx con su estado `results` actual.
    const paso2 = mergeAndReconcileResults(paso1.combinado, [repDoc]);
    const facturaTrasPaso2 = paso2.combinado.find(r => r.uuid === uuidFactura)!;
    expect(facturaTrasPaso2.pagosRelacionadosEstado).toBe('LIQUIDADA');
    expect(facturaTrasPaso2.paymentComplementStatus).toBe('COMPLETO');
    expect(paso2.agregados).toBe(1);
    expect(paso2.omitidosPorDuplicado).toBe(0);
  });

  it('B7. Restauración desde IndexedDB (sesión previa) y posterior carga del REP → se reconcilia igual que si nunca se hubiera cerrado la sesión', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B009';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });

    // Simula lo que Dashboard.tsx hace al restaurar sesión: aplicarConciliacionPagos
    // sobre el arreglo leído de IndexedDB (cached.results).
    const cacheRestaurada = aplicarConciliacionPagos([factura]);
    expect(cacheRestaurada.find(r => r.uuid === uuidFactura)!.pagosRelacionadosEstado).toBe('SIN_EVIDENCIA_REP');

    const repDoc = rep('R0000000-0000-0000-0000-00000000B009', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0 }),
    ]);
    const { combinado } = mergeAndReconcileResults(cacheRestaurada, [repDoc]);
    expect(combinado.find(r => r.uuid === uuidFactura)!.pagosRelacionadosEstado).toBe('LIQUIDADA');
  });

  it('B8. REP duplicado entre dos cargas (mismo archivo subido dos veces en sesiones distintas) → no se agrega ni se duplica el pago', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000B010';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', total: 1160 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B010', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0 }),
    ]);

    const paso1 = mergeAndReconcileResults([], [factura, repDoc]);
    expect(paso1.combinado.find(r => r.uuid === uuidFactura)!.pagosRelacionadosEstado).toBe('LIQUIDADA');

    // Carga sucesiva: el usuario vuelve a subir el MISMO archivo de REP por error.
    const paso2 = mergeAndReconcileResults(paso1.combinado, [{ ...repDoc }]);
    expect(paso2.agregados).toBe(0);
    expect(paso2.omitidosPorDuplicado).toBe(1);
    const facturaFinal = paso2.combinado.find(r => r.uuid === uuidFactura)!;
    expect(facturaFinal.pagosRelacionadosEstado).toBe('LIQUIDADA');
    expect(facturaFinal.pagosRelacionadosTotalPagado).toBe(1160); // NO 2320
  });

  it('B9. Cambio de empresa sin contaminación: mergeAndReconcileResults con acumulado vacío no arrastra facturas/REP de otra empresa', () => {
    const uuidFacturaEmpresaA = 'F0000000-0000-0000-0000-00000000B011';
    const facturaEmpresaA = baseResult(uuidFacturaEmpresaA, { metodoPago: 'PPD', total: 1160, rfcEmpresaEvaluada: 'AAA010101AAA' });
    const { combinado: estadoEmpresaA } = mergeAndReconcileResults([], [facturaEmpresaA]);
    expect(estadoEmpresaA.length).toBe(1);

    // Dashboard.tsx limpia `results` a [] al cambiar de empresa (ver useEffect
    // de cleanup) — se simula aquí pasando un acumulado vacío para la empresa B.
    const uuidFacturaEmpresaB = 'F0000000-0000-0000-0000-00000000B012';
    const facturaEmpresaB = baseResult(uuidFacturaEmpresaB, { metodoPago: 'PPD', total: 500, rfcEmpresaEvaluada: 'BBB010101BBB' });
    const { combinado: estadoEmpresaB } = mergeAndReconcileResults([], [facturaEmpresaB]);
    expect(estadoEmpresaB.length).toBe(1);
    expect(estadoEmpresaB.some(r => r.uuid === uuidFacturaEmpresaA)).toBe(false);
    expect(estadoEmpresaB[0].uuid).toBe(uuidFacturaEmpresaB);
  });

  it('B10. Prueba de integración obligatoria: coincidencia exacta entre el estado acumulado producido por la función de estado productiva del Dashboard (mergeAndReconcileResults) y el Excel — no solo función pura vs Excel', async () => {
    const uuidLiquidada = 'F0000000-0000-0000-0000-00000000B013';
    const facturaLiquidada = baseResult(uuidLiquidada, { metodoPago: 'PPD', total: 1160 });
    // Factura ANTIGUA pero con REP cuyo pago SÍ está comprobado antes del
    // corte: debe seguir contando como LIQUIDADA (dinero real), con el flag
    // informativo activado — nunca un estado de pago propio.
    const uuidHistorica = 'F0000000-0000-0000-0000-00000000B014';
    const facturaHistorica = baseResult(uuidHistorica, { metodoPago: 'PPD', fechaEmision: '2018-01-01', total: 500 });
    // Factura ANTIGUA SIN ningún REP: no hay evidencia de cuándo (o si) se
    // pagó — debe seguir siendo SIN_EVIDENCIA_REP y SÍ generar PAGO-01 (la
    // versión anterior de la regla la suprimía incorrectamente por ser vieja).
    const uuidSinEvidencia = 'F0000000-0000-0000-0000-00000000B015';
    const facturaSinEvidencia = baseResult(uuidSinEvidencia, { metodoPago: 'PPD', fechaEmision: '2015-01-01', total: 300 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000B013', [
      pago({ uuidFacturaRelacionada: uuidLiquidada, impSaldoAnt: 1160, impPagado: 1160, impSaldoInsoluto: 0, fechaPago: '2026-06-10' }),
    ]);
    const repHistorico = rep('R0000000-0000-0000-0000-00000000B014', [
      pago({ uuidFacturaRelacionada: uuidHistorica, impSaldoAnt: 500, impPagado: 500, impSaldoInsoluto: 0, fechaPago: '2018-02-01' }),
    ]);

    // Lote 1: las tres facturas llegan solas (sin REP todavía).
    const paso1 = mergeAndReconcileResults([], [facturaLiquidada, facturaHistorica, facturaSinEvidencia]);
    // Lote 2 (carga sucesiva): llegan los REP de las dos primeras.
    const paso2 = mergeAndReconcileResults(paso1.combinado, [repDoc, repHistorico]);
    const estadoFinalDashboard = paso2.combinado; // esto es EXACTAMENTE lo que Dashboard.tsx pondría en `results`.

    const liquidadaFinal = estadoFinalDashboard.find(r => r.uuid === uuidLiquidada)!;
    const historicaFinal = estadoFinalDashboard.find(r => r.uuid === uuidHistorica)!;
    const sinEvidenciaFinal = estadoFinalDashboard.find(r => r.uuid === uuidSinEvidencia)!;
    expect(liquidadaFinal.pagosRelacionadosEstado).toBe('LIQUIDADA');
    expect(liquidadaFinal.pagosRelacionadosHistoricamenteExento).toBe(false);
    expect(historicaFinal.pagosRelacionadosEstado).toBe('LIQUIDADA');
    expect(historicaFinal.pagosRelacionadosHistoricamenteExento).toBe(true);
    expect(sinEvidenciaFinal.pagosRelacionadosEstado).toBe('SIN_EVIDENCIA_REP');

    // El Excel se genera sobre ESE MISMO estado acumulado (como hace
    // Dashboard.tsx en handleExportToExcel: exportToExcel(results, ...)).
    const wb = await buildDiagnosticoWorkbook(estadoFinalDashboard);
    const conciliacionSheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['CONCILIACION PAGOS PPD']);
    const ejecutivoSheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['RESUMEN EJECUTIVO']);
    const buscar = (rows: any[], m: string) => rows.find(r => r.Metrica === m)?.Valor;

    const filaLiquidadaExcel = conciliacionSheet.find((r: any) => r.UUID_Factura === uuidLiquidada);
    const filaHistoricaExcel = conciliacionSheet.find((r: any) => r.UUID_Factura === uuidHistorica);
    const filaSinEvidenciaExcel = conciliacionSheet.find((r: any) => r.UUID_Factura === uuidSinEvidencia);
    expect(filaLiquidadaExcel.Estado_Pago).toBe('LIQUIDADO');
    expect(filaLiquidadaExcel.Pago_Antes_Obligatoriedad_REP).toBe('NO');
    expect(filaHistoricaExcel.Estado_Pago).toBe('LIQUIDADO');
    expect(filaHistoricaExcel.Pago_Antes_Obligatoriedad_REP).toMatch(/^SI/);
    // El texto de la columna NUNCA usa "exento" (se puede confundir con una
    // exención fiscal) — es puramente informativo sobre CUÁNDO se pagó.
    expect(filaHistoricaExcel.Pago_Antes_Obligatoriedad_REP.toLowerCase()).not.toContain('exent');
    expect(filaSinEvidenciaExcel.Estado_Pago).toBe('SIN EVIDENCIA REP');
    expect(filaSinEvidenciaExcel.Observacion).toBe(
      'Sin evidencia de pago en los XML cargados. Carga el complemento de pago para determinar si fue pagada total o parcialmente.'
    );
    expect(filaHistoricaExcel.Observacion).toContain('Pago recibido antes de la obligatoriedad general del REP — informativo.');
    expect(filaHistoricaExcel.Observacion.toLowerCase()).not.toContain('exent');

    // PAGO-01: texto y severidad EXACTOS. Nunca "impagada", "REP omitido",
    // "incumplimiento fiscal" ni "complemento obligatorio no emitido" — es
    // una advertencia de revisión (AMARILLO), no un riesgo crítico
    // (ROJO/NARANJA), porque Sentinel solo conoce los XML cargados en este lote.
    const alertsSheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['ALERTAS FORENSES']);
    const alertaSinEvidencia = alertsSheet.find((a: any) => a.UUID === uuidSinEvidencia && a.Regla === 'PAGO-01');
    expect(alertsSheet.some((a: any) => a.UUID === uuidHistorica && a.Regla === 'PAGO-01')).toBe(false);
    expect(alertaSinEvidencia).toBeTruthy();
    expect(alertaSinEvidencia.Nivel_Riesgo).toBe('AMARILLO');
    expect(alertaSinEvidencia.Descripcion_Tecnica).toBe(
      'Sin evidencia de pago en los XML cargados. Carga el complemento de pago para determinar si fue pagada total o parcialmente.'
    );
    const textoCompletoAlerta = JSON.stringify(alertaSinEvidencia).toLowerCase();
    expect(textoCompletoAlerta).not.toMatch(/impagada/);
    expect(textoCompletoAlerta).not.toMatch(/rep omitido/);
    expect(textoCompletoAlerta).not.toMatch(/incumplimiento fiscal/);
    expect(textoCompletoAlerta).not.toMatch(/complemento obligatorio no emitido/);

    // Reconciliación cruzada pantalla (estado acumulado real) ↔ Excel: mismos
    // conteos exactos, ninguno recalculado de forma independiente.
    expect(buscar(ejecutivoSheet, 'Facturas PPD - liquidadas')).toBe(
      estadoFinalDashboard.filter(r => r.pagosRelacionadosEstado === 'LIQUIDADA').length
    );
    expect(buscar(ejecutivoSheet, 'Facturas PPD - sin evidencia REP')).toBe(
      estadoFinalDashboard.filter(r => r.pagosRelacionadosEstado === 'SIN_EVIDENCIA_REP').length
    );
    expect(buscar(ejecutivoSheet, 'Facturas PPD - pago comprobado antes del 01/09/2018 (informativo, YA incluidas en parciales/liquidadas)')).toBe(
      estadoFinalDashboard.filter(r => r.pagosRelacionadosHistoricamenteExento).length
    );
  });
});

describe('Textos y severidades exactos: PAGO-01 y aviso histórico (motor, Dashboard, Excel)', () => {
  const FRASES_PROHIBIDAS = [/impagada/i, /rep omitido/i, /incumplimiento fiscal/i, /complemento obligatorio no emitido/i];

  it('evaluarObligacionREP: SIN_EVIDENCIA_PAGO usa el texto exacto pedido y ninguna frase prohibida', () => {
    const r = evaluarObligacionREP({ tipoCFDI: 'I', metodoPago: 'PPD', fechaFactura: '2020-01-01', fechaPago: null, existeREP: false });
    expect(r.mensaje).toBe('Sin evidencia de pago en los XML cargados. Carga el complemento de pago para determinar si fue pagada total o parcialmente.');
    for (const frase of FRASES_PROHIBIDAS) expect(r.mensaje).not.toMatch(frase);
  });

  it('reconciliarPagosPPD: la observación de un pago históricamente comprobado usa "Pago recibido antes de la obligatoriedad general del REP — informativo." y NUNCA la palabra "exento"', () => {
    const uuidFactura = 'F0000000-0000-0000-0000-00000000C001';
    const factura = baseResult(uuidFactura, { metodoPago: 'PPD', fechaEmision: '2018-01-01', total: 500 });
    const repDoc = rep('R0000000-0000-0000-0000-00000000C001', [
      pago({ uuidFacturaRelacionada: uuidFactura, impSaldoAnt: 500, impPagado: 500, impSaldoInsoluto: 0, fechaPago: '2018-02-01' }),
    ]);
    const { facturas } = reconciliarPagosPPD([factura, repDoc]);
    const f = facturas.find(x => x.uuid === uuidFactura)!;
    expect(f.observacion).toContain('Pago recibido antes de la obligatoriedad general del REP — informativo.');
    expect(f.observacion.toLowerCase()).not.toContain('exent');
  });

  it('Dashboard.tsx: el texto visible de la tarjeta de conciliación PPD↔REP no usa "exento" y sí usa "obligatoriedad del REP"', () => {
    // Lectura del código fuente real de Dashboard.tsx (no un mock): confirma
    // que el texto que el usuario ve en pantalla cumple la regla, sin montar
    // el árbol completo de React (que requiere providers de Company/Auth/Theme
    // no relevantes para esta verificación de copy).
    const dashboardSource = fs.readFileSync(path.join(__dirname, '../pages/Dashboard.tsx'), 'utf-8');
    const inicioTarjeta = dashboardSource.indexOf('Conciliación de Pagos PPD ↔ REP');
    expect(inicioTarjeta).toBeGreaterThan(-1);
    const finTarjeta = dashboardSource.indexOf('{/* Charts */}', inicioTarjeta);
    const bloqueTarjeta = dashboardSource.slice(inicioTarjeta, finTarjeta > -1 ? finTarjeta : inicioTarjeta + 6000);

    // Extrae solo el TEXTO VISIBLE (JSX text nodes y atributos title="...") —
    // no los nombres de variables/props internos como `pagosHistoricamenteExentos`,
    // que son identificadores de código, nunca texto que el usuario lea.
    const textosVisibles = [
      ...bloqueTarjeta.matchAll(/>([^<>{}\n]{3,})</g),
      ...bloqueTarjeta.matchAll(/title="([^"]+)"/g),
    ].map(m => m[1]).join(' \n ');

    expect(textosVisibles).toContain('Pago antes de la obligatoriedad del REP');
    expect(textosVisibles).toContain('Pago recibido antes de la obligatoriedad general del REP');
    expect(textosVisibles.toLowerCase()).not.toContain('exento');
    for (const frase of FRASES_PROHIBIDAS) expect(textosVisibles).not.toMatch(frase);
  });

  it('excelExporter.ts: PAGO-01 usa severidad AMARILLO (advertencia de revisión, no riesgo crítico) y ninguna frase prohibida en el código fuente', () => {
    const excelExporterSource = fs.readFileSync(path.join(__dirname, '../lib/excelExporter.ts'), 'utf-8');
    const inicioRegla = excelExporterSource.indexOf("'PAGO-01'");
    expect(inicioRegla).toBeGreaterThan(-1);
    const lineaRegla = excelExporterSource.slice(excelExporterSource.lastIndexOf('\n', inicioRegla), excelExporterSource.indexOf('\n', inicioRegla + 200));
    expect(lineaRegla).toContain("'AMARILLO'");
    expect(lineaRegla).not.toContain("'NARANJA'");
    expect(lineaRegla).not.toContain("'ROJO'");
    for (const frase of FRASES_PROHIBIDAS) expect(lineaRegla).not.toMatch(frase);

    // La columna informativa del Excel tampoco usa "exento" en su nombre.
    expect(excelExporterSource).toContain('Pago_Antes_Obligatoriedad_REP');
    expect(excelExporterSource).not.toContain('Pago_Historicamente_Exento');
  });
});
