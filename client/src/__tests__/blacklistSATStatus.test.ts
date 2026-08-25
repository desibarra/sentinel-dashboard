import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { replaceBlacklistRecordsBulk, updateMetadata } from '../db/blacklistDB';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import { satQueue } from '../lib/satQueue';
import * as XLSX from 'xlsx';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

// Corrección verificada aquí: classifyBySATStatus() (useXMLValidator.ts) ya
// NO descarta el comentario 69-B enriquecido — antes lo hacía en TODAS sus
// ramas (ver hallazgo reportado en blacklist69BReal.test.ts). Estas pruebas
// cubren los 6 escenarios pedidos usando el pipeline REAL (validateSingleXML
// + checkRFCBlacklist real contra IndexedDB con datos del 69b.json real +
// classifyBySATStatus real), con el SAT mockeado en el formato SOAP/XML
// correcto (no JSON) para cada estatus.

const REAL_69B_PATH = path.resolve(__dirname, '../../public/69b.json');
const EMPRESA_RFC = 'EMP010101AA1'; // receptor de las CFDI de prueba → dirección RECIBIDO → 69-B evalúa al emisor

const RFC_DEFINITIVO = 'AAA120730823';           // situación única: Definitivo
const RFC_PRESUNTO = 'AAAA730727JE3';            // situación única: Presunto
const RFC_SENTENCIA_FAVORABLE = 'AAA080808HL8';  // situación única: Sentencia Favorable (item 4)
const RFC_SIN_COINCIDENCIA = 'ZZZ991231ZZ1';     // no existe en el archivo real (verificado en blacklist69BReal.test.ts)

function buildCFDI(uuid: string, emisorRfc: string, emisorNombre: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1" Fecha="2026-06-01T12:00:00" Sello="---" FormaPago="01" NoCertificado="00001" Certificado="---" SubTotal="100.00" Moneda="MXN" Total="116.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="01000">
    <cfdi:Emisor Rfc="${emisorRfc}" Nombre="${emisorNombre}" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${EMPRESA_RFC}" Nombre="EMPRESA EVALUADA" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1.00" ClaveUnidad="H87" Descripcion="Servicio de prueba SAT+69B" ValorUnitario="100.00" Importe="100.00" ObjetoImp="02">
            <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="16.00"><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-06-01T12:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;
}

// Formato SOAP/XML real que espera checkCFDIStatusSATRaw (satStatusValidator.ts) —
// NO JSON. Un content-type application/json hace que el código lo trate como
// error del proxy.
function soapOk(estado: string, estatusCancelacion = '') {
  return {
    ok: true,
    headers: { get: () => 'text/xml' },
    text: async () => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"><a:Estado>${estado}</a:Estado><a:EsCancelable>Cancelable sin aceptación</a:EsCancelable><a:EstatusCancelacion>${estatusCancelacion}</a:EstatusCancelacion></ConsultaResult></ConsultaResponse></s:Body></s:Envelope>`,
  } as any;
}

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

// Cuenta cuántas veces aparece una subcadena — para verificar "no duplicar mensajes".
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('classifyBySATStatus + 69-B: los 6 escenarios pedidos (pipeline real)', () => {
  const raw69bParsed = JSON.parse(fs.readFileSync(REAL_69B_PATH, 'utf-8'));
  const registros: any[] = raw69bParsed.registros;
  const originalFetch = global.fetch;
  const originalQueueConfig = satQueue.getConfig();

  beforeAll(async () => {
    satQueue.configure({ ...originalQueueConfig, timeoutMs: 300, baseBackoffMs: 5, maxRetries: 2 });
    const registrosNormalizados = registros.map((r: any) => ({
      rfc: (r.rfc || '').trim().toUpperCase(),
      tipo: (r.tipo === 'EFOS' ? 'EFOS' : '69B') as 'EFOS' | '69B',
      situacion: r.situacion || undefined,
      fechaPublicacion: r.fechaPublicacion || undefined,
      razonSocial: r.razonSocial || undefined,
    }));
    await replaceBlacklistRecordsBulk(registrosNormalizados);
    // isBlacklistSynced() (usado por checkRFCBlacklist) consulta metadata, no
    // el store de registros directamente — sin esto, checkRFCBlacklist trata
    // la base como "no cargada" (notSynced=true) aunque los registros existan.
    await updateMetadata({
      key: 'lastUpdate',
      cargadoEl: new Date().toISOString(),
      fechaOficial: raw69bParsed.fechaOficial || null,
      efosCount: 0,
      list69BCount: registrosNormalizados.length,
      totalRFC: new Set(registrosNormalizados.map(r => r.rfc)).size,
      presuntos: 0, definitivos: 0, desvirtuados: 0, sentenciaFavorable: 0,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function validarUnCFDI(emisorRfc: string, satMockFactory: () => any, uuid: string) {
    // @ts-ignore
    global.fetch = async (url: string) => {
      if (String(url).includes('sat-proxy')) return satMockFactory();
      return originalFetch ? originalFetch(url as any) : Promise.reject(new Error('unexpected fetch: ' + url));
    };
    const files = [{ name: 'test.xml', size: 1000, type: 'text/xml', content: buildCFDI(uuid, emisorRfc, 'PROVEEDOR TEST') }];
    const [result] = await runValidateXMLFiles(files, 'Comercio', EMPRESA_RFC);
    return result;
  }

  it('1. Vigente + 69-B Definitivo → 🔴 NO USABLE, comentario conserva "69-B DEFINITIVO", sin duplicar comentarioMotor', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000001';
    const r = await validarUnCFDI(RFC_DEFINITIVO, () => soapOk('Vigente'), uuid);

    expect(r.estatusSAT).toBe('Vigente');
    expect(r.resultado).toBe('🔴 NO USABLE');
    expect(r.comentarioFiscal).toContain('69-B DEFINITIVO');
    expect(countOccurrences(r.comentarioFiscal, r.comentarioMotor)).toBe(1);

    const wb = await buildDiagnosticoWorkbook([r]);
    const fila = XLSX.utils.sheet_to_json<any>(wb.Sheets['Diagnostico_CFDI'])[0];
    expect(fila.Validacion_69B).toBe('Definitivo');
  });

  it('2. Vigente + Presunto → 🟡 ALERTA, comentario conserva "69-B PRESUNTO"', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000002';
    const r = await validarUnCFDI(RFC_PRESUNTO, () => soapOk('Vigente'), uuid);

    expect(r.estatusSAT).toBe('Vigente');
    expect(r.resultado).toBe('🟡 ALERTA');
    expect(r.comentarioFiscal).toContain('69-B PRESUNTO');
    expect(countOccurrences(r.comentarioFiscal, r.comentarioMotor)).toBe(1);

    const wb = await buildDiagnosticoWorkbook([r]);
    const fila = XLSX.utils.sheet_to_json<any>(wb.Sheets['Diagnostico_CFDI'])[0];
    expect(fila.Validacion_69B).toBe('Presunto');
  });

  it('3. Vigente + Sentencia Favorable → conserva información 69-B SIN elevar el riesgo (no pasa a ALERTA/NO USABLE)', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000003';
    const r = await validarUnCFDI(RFC_SENTENCIA_FAVORABLE, () => soapOk('Vigente'), uuid);

    expect(r.estatusSAT).toBe('Vigente');
    expect(r.resultado).not.toBe('🔴 NO USABLE');
    expect(r.resultado).not.toBe('🟡 ALERTA');
    expect(r.comentarioFiscal).toContain('69-B');
    expect(r.comentarioFiscal.toLowerCase()).toContain('sentencia favorable');
    expect(countOccurrences(r.comentarioFiscal, r.comentarioMotor)).toBe(1);

    const wb = await buildDiagnosticoWorkbook([r]);
    const fila = XLSX.utils.sheet_to_json<any>(wb.Sheets['Diagnostico_CFDI'])[0];
    expect(fila.Validacion_69B).toBe('Sentencia favorable');
  });

  it('4. Cancelado + 69-B Definitivo → prioridad crítica de SAT (🔴 NO USABLE, ERROR, score 0), pero el hallazgo 69-B NO desaparece del comentario', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000004';
    const r = await validarUnCFDI(RFC_DEFINITIVO, () => soapOk('Cancelado', 'Cancelado con aceptación'), uuid);

    expect(r.estatusSAT).toBe('Cancelado');
    expect(r.resultado).toBe('🔴 NO USABLE');
    expect(r.nivelValidacion).toBe('ERROR');
    expect(r.comentarioFiscal).toContain('CANCELADO');
    expect(r.comentarioFiscal).toContain('69-B DEFINITIVO');
    expect(countOccurrences(r.comentarioFiscal, r.comentarioMotor)).toBe(1);
  });

  it('5. Error SAT + 69-B Definitivo → NO USABLE (69-B Definitivo se conserva aunque el SAT no responda); el estatus SAT en sí sigue mostrando el fallo real, por separado', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000005';
    const r = await validarUnCFDI(RFC_DEFINITIVO, () => Promise.reject(new TypeError('Failed to fetch')), uuid);

    // Dimensiones independientes (regla de precedencia SAT × 69-B): el
    // estatus SAT real (Error Conexión) se conserva intacto en su propio
    // campo — NO se "limpia" ni se oculta porque 69-B haya ganado la
    // precedencia sobre "resultado".
    expect(r.estatusSAT).toBe('Error Conexión');
    expect(r.resultado).toBe('🔴 NO USABLE');
    expect(r.comentarioFiscal).toContain('69-B DEFINITIVO');
    expect(countOccurrences(r.comentarioFiscal, r.comentarioMotor)).toBe(1);
  }, 10000);

  it('6. Sin coincidencia + Vigente → sin mención de 69-B, resultado normal', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000006';
    const r = await validarUnCFDI(RFC_SIN_COINCIDENCIA, () => soapOk('Vigente'), uuid);

    expect(r.estatusSAT).toBe('Vigente');
    expect(r.comentarioFiscal).not.toContain('69-B');
    expect(r.resultado).not.toBe('🔴 NO USABLE');
  });

  it('un fallo al guardar en caché (localStorage.setItem lanza) NO degrada un resultado "Vigente" a "Error Conexión" — pipeline real completo', async () => {
    const uuid = 'S0000000-0000-0000-0000-000000000007';
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
    try {
      const r = await validarUnCFDI(RFC_SIN_COINCIDENCIA, () => soapOk('Vigente'), uuid);
      expect(r.estatusSAT).toBe('Vigente');
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
