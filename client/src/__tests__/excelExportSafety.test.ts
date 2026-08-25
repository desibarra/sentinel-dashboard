import { describe, it, expect } from 'vitest';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';

// P0-A: reproduce los escenarios "monstruo" de la auditoría (un complemento
// CartaPorte con miles de mercancías; un CFDI con cientos de conceptos) que
// antes hacían fallar la exportación completa con
// "Text length must not exceed 32767 characters" / riesgo de
// "Too many properties to enumerate". Ahora deben exportar sin error.
// Los tamaños se eligieron por encima del umbral real que producía el fallo
// original (~2,340 elementos ya desbordaba una celda de texto sin límite) y
// por encima de los topes nuevos (200/500 elementos según el campo) —
// suficiente para demostrar la corrección sin que jsdom tarde varios
// minutos por prueba. Sin datos fiscales reales — todo sintético.

const EXCEL_MAX_CELL_CHARS = 32767;

function buildMonsterCartaPorteXML(uuid: string, nMercancias: number): string {
  const mercancias = Array.from({ length: nMercancias }, (_, i) =>
    `<cartaporte31:Mercancia BienesTransp="50111500" Descripcion="Producto ${i + 1}" Cantidad="1" ClaveUnidad="KGM" PesoEnKg="10" ValorMercancia="100" Moneda="MXN"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="CP" Folio="9001" Fecha="2026-03-04T12:00:00" Sello="---" FormaPago="03" NoCertificado="00001" Certificado="---" SubTotal="15061.01" Moneda="MXN" Total="17443.48" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="45000">
    <cfdi:Emisor Rfc="TME960709LR2" Nombre="TRANSPORTES SA DE CV" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="IATD70020G77" Nombre="EMPRESA SA DE CV" DomicilioFiscalReceptor="32310" RegimenFiscalReceptor="603" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="78101802" NoIdentificacion="7501030034" Cantidad="1.00" ClaveUnidad="E48" Unidad="Unidad de servicio" Descripcion="SERVICIO DE TRANSPORTE CONSOLIDADO" ValorUnitario="15000.00" Importe="15000.00" ObjetoImp="02">
            <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="15000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="2400.00"/></cfdi:Traslados></cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="2400.00"><cfdi:Traslados><cfdi:Traslado Base="15000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="2400.00"/></cfdi:Traslados></cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-03-04T12:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
        <cartaporte31:CartaPorte xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="3.1" IdCCP="CCC550E8-8400-41D4-A716-446655440003" TranspInternac="No" TotalDistRec="450">
            <cartaporte31:Ubicaciones>
                <cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR000001" RFCRemitenteDestinatario="MME921204H52" FechaHoraSalidaLlegada="2026-03-04T10:00:00"/>
                <cartaporte31:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE000001" RFCRemitenteDestinatario="UACJ700101TXA" FechaHoraSalidaLlegada="2026-03-04T18:00:00" DistanciaRecorrida="450"/>
            </cartaporte31:Ubicaciones>
            <cartaporte31:Mercancias PesoBrutoTotal="1549.43" UnidadPeso="KGM" NumTotalMercancias="${nMercancias}">${mercancias}</cartaporte31:Mercancias>
            <cartaporte31:FiguraTransporte><cartaporte31:TiposFigura TipoFigura="01" RFCFigura="AAAA620217U54" NumLicencia="1234567890"/></cartaporte31:FiguraTransporte>
        </cartaporte31:CartaPorte>
    </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function buildMonsterConceptosXML(uuid: string, nConceptos: number): string {
  const conceptos = Array.from({ length: nConceptos }, (_, i) =>
    `<cfdi:Concepto ClaveProdServ="78101802" NoIdentificacion="SKU${i}" Cantidad="1.00" ClaveUnidad="E48" Unidad="Pieza" Descripcion="Linea ${i + 1}" ValorUnitario="10.00" Importe="10.00" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="10.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1.60"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="CO" Folio="9002" Fecha="2026-03-04T12:00:00" Sello="---" FormaPago="03" NoCertificado="00001" Certificado="---" SubTotal="${(nConceptos * 10).toFixed(2)}" Moneda="MXN" Total="${(nConceptos * 11.6).toFixed(2)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="45000">
    <cfdi:Emisor Rfc="TME960709LR2" Nombre="TRANSPORTES SA DE CV" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="IATD70020G77" Nombre="EMPRESA SA DE CV" DomicilioFiscalReceptor="32310" RegimenFiscalReceptor="603" UsoCFDI="G03"/>
    <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="${(nConceptos * 1.6).toFixed(2)}"><cfdi:Traslados><cfdi:Traslado Base="${(nConceptos * 10).toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${(nConceptos * 1.6).toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-03-04T12:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function baseValidationResult(uuid: string, xmlContent: string, over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    fileName: `${uuid}.xml`,
    xmlContent,
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

// Recorre todas las celdas de todas las hojas de un workbook.
function allCells(wb: any): any[] {
  const cells: any[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      cells.push(ws[key]);
    }
  }
  return cells;
}

describe('P0-A: exportación robusta con documentos de complejidad real (sin datos fiscales reales)', () => {
  it('un XML con 2,500 mercancías en CartaPorte exporta sin lanzar error', async () => {
    const uuid = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
    const monster = baseValidationResult(uuid, buildMonsterCartaPorteXML(uuid, 2500), {
      requiereCartaPorte: 'SI', cartaPorte: 'SI', versionCartaPorte: '3.1',
    });
    const wb = await buildDiagnosticoWorkbook([monster]);
    expect(wb).toBeTruthy();
    expect(wb.SheetNames.length).toBeGreaterThan(0);
  }, 60000);

  it('un XML con 600 conceptos exporta sin lanzar error', async () => {
    const uuid = 'BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF';
    const monster = baseValidationResult(uuid, buildMonsterConceptosXML(uuid, 600));
    const wb = await buildDiagnosticoWorkbook([monster]);
    expect(wb).toBeTruthy();
  }, 60000);

  it('ninguna celda del workbook supera 32,767 caracteres, incluso con el documento de 600 conceptos', async () => {
    const uuid = 'CCCCCCCC-DDDD-EEEE-FFFF-000000000000';
    const monster = baseValidationResult(uuid, buildMonsterConceptosXML(uuid, 600));
    const wb = await buildDiagnosticoWorkbook([monster]);

    const offending = allCells(wb).filter(cell => typeof cell?.v === 'string' && cell.v.length > EXCEL_MAX_CELL_CHARS);
    expect(offending.length).toBe(0);
  }, 60000);

  it('ninguna celda contiene un objeto/array crudo — todo llega a SheetJS como primitivo saneado', async () => {
    const uuid = 'DDDDDDDD-EEEE-FFFF-0000-111111111111';
    const monster = baseValidationResult(uuid, buildMonsterCartaPorteXML(uuid, 150));
    const wb = await buildDiagnosticoWorkbook([monster]);

    const badTypes = allCells(wb).filter(cell => {
      const v = cell?.v;
      if (v === null || v === undefined) return false;
      const t = typeof v;
      return t !== 'string' && t !== 'number' && t !== 'boolean' && !(v instanceof Date);
    });
    expect(badTypes.length).toBe(0);
  });

  it('el UUID del documento se conserva en las hojas principales incluso siendo un documento atípico', async () => {
    const uuid = 'EEEEEEEE-FFFF-0000-1111-222222222222';
    const monster = baseValidationResult(uuid, buildMonsterCartaPorteXML(uuid, 300), {
      requiereCartaPorte: 'SI', cartaPorte: 'SI', versionCartaPorte: '3.1',
    });
    const wb = await buildDiagnosticoWorkbook([monster]);

    const diag = XLSX.utils.sheet_to_json(wb.Sheets['Diagnostico_CFDI']) as any[];
    expect(diag.length).toBe(1);
    expect(diag[0].UUID).toBe(uuid);
  });

  it('un lote mixto (documentos normales + un documento atípico) exporta completo, sin perder ni duplicar UUID', async () => {
    const normales = Array.from({ length: 20 }, (_, i) => baseValidationResult(`normal-${i}`, buildMonsterConceptosXML(`normal-${i}`, 1)));
    const atipico = baseValidationResult('atipico-1', buildMonsterCartaPorteXML('atipico-1', 400), {
      requiereCartaPorte: 'SI', cartaPorte: 'SI', versionCartaPorte: '3.1',
    });
    const lote = [...normales, atipico];

    const wb = await buildDiagnosticoWorkbook(lote);
    const diag = XLSX.utils.sheet_to_json(wb.Sheets['Diagnostico_CFDI']) as any[];

    expect(diag.length).toBe(lote.length);
    const uuids = diag.map((f: any) => f.UUID);
    expect(new Set(uuids).size).toBe(lote.length); // sin duplicados
    expect(uuids).toEqual(expect.arrayContaining(lote.map(r => r.uuid))); // ninguno perdido
  }, 30000);
});
