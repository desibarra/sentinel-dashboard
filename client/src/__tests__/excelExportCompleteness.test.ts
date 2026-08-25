import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { replaceBlacklistRecordsBulk, updateMetadata } from '../db/blacklistDB';
import * as XLSX from 'xlsx';

// useXMLValidator es un hook de React real (usa useState) — en el entorno de
// prueba (jsdom, con `window` definido) no puede invocarse fuera de un
// componente. Se monta un componente mínimo real con createRoot para
// respetar las reglas de hooks y obtener el resultado de validateXMLFiles.
async function runValidateXMLFiles(files: any[], giro: string, rfc: string): Promise<any[]> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let resultado: any[] = [];
  await new Promise<void>((resolve, reject) => {
    function Harness() {
      const { validateXMLFiles } = useXMLValidator();
      React.useEffect(() => {
        validateXMLFiles(files, giro, rfc, () => {})
          .then((r: any[]) => { resultado = r; resolve(); })
          .catch(reject);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    const root = createRoot(container);
    act(() => { root.render(React.createElement(Harness)); });
  });
  return resultado;
}

// Corrección solicitada tras la revisión: los resúmenes con "+N más" NO deben
// ser la única fuente de esos elementos. Esta prueba corre el pipeline REAL
// (parseo + validación real, no un ValidationResult armado a mano) y verifica
// la igualdad exacta: total de elementos en el XML de origen === total de
// filas en la hoja de detalle correspondiente, para cada lista capada.
// Sin datos fiscales reales — todo sintético.

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

const MERCANCIA_UUID = 'AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA';
const CONCEPTO_UUID = 'BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB';
const N_MERCANCIAS = 600;
const N_CONCEPTOS = 250;

let mercanciaResult: any;
let conceptoResult: any;

beforeAll(async () => {
  await replaceBlacklistRecordsBulk([{ rfc: 'EFO000001XX1', tipo: '69B', situacion: 'Presunto', fechaPublicacion: '2024-01-01', razonSocial: 'X' }] as any);
  await updateMetadata({ key: 'lastUpdate', cargadoEl: new Date().toISOString(), fechaOficial: '2024-01-01', efosCount: 0, list69BCount: 1, totalRFC: 1, presuntos: 1, definitivos: 0, desvirtuados: 0, sentenciaFavorable: 0 } as any);

  const files = [
    { name: 'monster_mercancias.xml', size: 0, type: 'text/xml', content: buildMonsterCartaPorteXML(MERCANCIA_UUID, N_MERCANCIAS) },
    { name: 'monster_conceptos.xml', size: 0, type: 'text/xml', content: buildMonsterConceptosXML(CONCEPTO_UUID, N_CONCEPTOS) },
  ];
  const results = await runValidateXMLFiles(files, 'Empresa Prueba', 'BEN010101AAA');
  mercanciaResult = results.find((r: any) => r.uuid === MERCANCIA_UUID);
  conceptoResult = results.find((r: any) => r.uuid === CONCEPTO_UUID);
}, 120000);

describe('Completitud de hojas de detalle (pipeline REAL, no fixtures armados a mano)', () => {
  it('el pipeline real puebla trazabilidadInfo.cartaPorteDetalle.mercancias sin recorte', () => {
    expect(mercanciaResult).toBeTruthy();
    expect(mercanciaResult.trazabilidadInfo?.cartaPorteDetalle?.mercancias?.length).toBe(N_MERCANCIAS);
  });

  it('el pipeline real puebla desglosePorConcepto sin recorte', () => {
    expect(conceptoResult).toBeTruthy();
    expect(conceptoResult.desglosePorConcepto?.length).toBe(N_CONCEPTOS);
  });

  it('total mercancías de origen === total filas en "DETALLE CARTA PORTE MERCANCIAS" para ese UUID', async () => {
    const wb = await buildDiagnosticoWorkbook([mercanciaResult]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE CARTA PORTE MERCANCIAS']) as any[];
    const rowsForThisUuid = rows.filter(r => r.UUID === MERCANCIA_UUID);
    expect(rowsForThisUuid.length).toBe(N_MERCANCIAS);
  }, 60000);

  it('total conceptos de origen === total filas en "DETALLE CONCEPTOS XML" para ese UUID', async () => {
    const wb = await buildDiagnosticoWorkbook([conceptoResult]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE CONCEPTOS XML']) as any[];
    const rowsForThisUuid = rows.filter(r => r.UUID === CONCEPTO_UUID);
    expect(rowsForThisUuid.length).toBe(N_CONCEPTOS);
  }, 60000);

  it('total conceptos de origen === total filas en "DETALLE IMPUESTOS CONCEPTO" (1 traslado por concepto)', async () => {
    const wb = await buildDiagnosticoWorkbook([conceptoResult]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE IMPUESTOS CONCEPTO']) as any[];
    const rowsForThisUuid = rows.filter(r => r.UUID === CONCEPTO_UUID);
    expect(rowsForThisUuid.length).toBe(N_CONCEPTOS);
  }, 60000);

  it('el resumen truncado ("Mercancias_Resumen") indica cuántos elementos más existen, y ese número más los mostrados suma el total real', async () => {
    const wb = await buildDiagnosticoWorkbook([mercanciaResult]);
    const forense = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE FORENSE POR CFDI']) as any[];
    const fila = forense.find(f => f.UUID === MERCANCIA_UUID);
    expect(fila.Mercancias_Resumen).toContain('más');
    expect(fila.Mercancias_Resumen).toContain('DETALLE CARTA PORTE MERCANCIAS');
    const match = String(fila.Mercancias_Resumen).match(/\+(\d+) más/);
    expect(match).toBeTruthy();
    const restantes = Number(match![1]);
    const mostrados = 5; // summarizeList(..., 5, ...)
    expect(mostrados + restantes).toBe(N_MERCANCIAS);
  }, 60000);

  it('un lote con ambos documentos exporta ambas hojas de detalle completas simultáneamente', async () => {
    const wb = await buildDiagnosticoWorkbook([mercanciaResult, conceptoResult]);
    const mercRows = (XLSX.utils.sheet_to_json(wb.Sheets['DETALLE CARTA PORTE MERCANCIAS']) as any[]).filter(r => r.UUID === MERCANCIA_UUID);
    const concRows = (XLSX.utils.sheet_to_json(wb.Sheets['DETALLE CONCEPTOS XML']) as any[]).filter(r => r.UUID === CONCEPTO_UUID);
    expect(mercRows.length).toBe(N_MERCANCIAS);
    expect(concRows.length).toBe(N_CONCEPTOS);
  }, 60000);
});
