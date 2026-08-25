import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlacklistManager } from '../components/BlacklistManager';
import { getBlacklistsByRFC, replaceBlacklistRecordsBulk } from '../db/blacklistDB';
import { checkRFCBlacklist } from '../utils/blacklistValidator';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { buildDiagnosticoWorkbook } from '../lib/excelExporter';
import * as XLSX from 'xlsx';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom no implementa ResizeObserver; BlacklistManager usa un gráfico
// (recharts ResponsiveContainer) que lo requiere para montar sin error.
// @ts-ignore
global.ResizeObserver = global.ResizeObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Prueba con datos REALES: usa el archivo client/public/69b.json ya incluido
// en el repositorio (2,084,091 bytes, 14,110 registros, fechaOficial
// 2025-12-31 al momento de esta prueba) — NO se descarga ni consulta ninguna
// lista externa. Se simula únicamente la respuesta de fetch('/69b.json') para
// que el componente de producción BlacklistManager la consuma exactamente
// como lo haría en el navegador real, ejercitando el código de carga real
// (normalización, dedup, IndexedDB) sin red.
const REAL_69B_PATH = path.resolve(__dirname, '../../public/69b.json');
const EMPRESA_RFC = 'EMP010101AA1'; // "mi empresa" — receptor en las 3 CFDI de prueba (dirección = RECIBIDO)

// RFC reales verificados en el archivo bundleado, elegidos para cubrir los 3
// casos pedidos:
const RFC_DEFINITIVO = 'AAA120730823';   // situación única: "Definitivo"
const RFC_SIN_COINCIDENCIA = 'ZZZ991231ZZ1'; // no aparece en el archivo (verificado abajo)
// RFC_HISTORIAL tiene 2 registros reales: "Definitivo" (2020-06-19) y
// "Sentencia Favorable" (2019-12-20). checkRFCBlacklist resuelve por fecha
// de publicación más reciente cuando las fechas NO empatan (este caso real),
// por lo que el resultado esperado es "Sentencia Favorable" vigente, NO un
// "situación múltiple sin resolver" — ver verificación exhaustiva abajo: en
// los 54 RFC con más de un registro del archivo bundleado actual, NINGUNO
// tiene fechas de publicación empatadas, así que multiEstado=true (ambigüedad
// real) no es alcanzable con estos datos concretos; se prueba por separado
// con un registro sintético con fechas empatadas para verificar que esa rama
// de código sí funciona cuando corresponde.
const RFC_HISTORIAL = 'AAS110331G59';
const RFC_EMPATE_SINTETICO = 'ZZZ010101EM1'; // no existe en el archivo real; se inserta a mano con 2 fechas idénticas

function buildCFDI(uuid: string, emisorRfc: string, emisorNombre: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1" Fecha="2026-06-01T12:00:00" Sello="---" FormaPago="01" NoCertificado="00001" Certificado="---" SubTotal="100.00" Moneda="MXN" Total="116.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="01000">
    <cfdi:Emisor Rfc="${emisorRfc}" Nombre="${emisorNombre}" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${EMPRESA_RFC}" Nombre="EMPRESA EVALUADA" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1.00" ClaveUnidad="H87" Descripcion="Servicio de prueba 69-B" ValorUnitario="100.00" Importe="100.00" ObjetoImp="02">
            <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="16.00"><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-06-01T12:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001" SelloSAT="---"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;
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

describe('69-B con datos reales del archivo bundleado (client/public/69b.json)', () => {
  const raw69bText = fs.readFileSync(REAL_69B_PATH, 'utf-8');
  const raw69bParsed = JSON.parse(raw69bText);
  const registros: any[] = Array.isArray(raw69bParsed) ? raw69bParsed : raw69bParsed.registros;

  it('el archivo bundleado existe y contiene los 3 RFC de prueba en los estados esperados', () => {
    expect(registros.length).toBeGreaterThan(1000);

    const porRfc = (rfc: string) => registros.filter(r => (r.rfc || '').trim().toUpperCase() === rfc);

    const defin = porRfc(RFC_DEFINITIVO);
    expect(defin.length).toBe(1);
    expect(defin[0].situacion).toBe('Definitivo');

    const sinMatch = porRfc(RFC_SIN_COINCIDENCIA);
    expect(sinMatch.length).toBe(0); // confirma que el RFC "sin coincidencia" real no existe en el archivo

    const historial = porRfc(RFC_HISTORIAL);
    expect(historial.length).toBe(2);
    const situaciones = historial.map(r => r.situacion).sort();
    expect(situaciones).toEqual(['Definitivo', 'Sentencia Favorable']);
    // Confirma la premisa documentada arriba: en TODO el archivo real, ningún
    // RFC con más de un registro tiene fechas de publicación empatadas.
    const multi = registros.reduce((acc: Record<string, any[]>, r: any) => {
      const rfc = (r.rfc || '').trim().toUpperCase();
      (acc[rfc] = acc[rfc] || []).push(r);
      return acc;
    }, {});
    const multiRfcs = Object.values(multi).filter((recs: any) => recs.length > 1) as any[][];
    expect(multiRfcs.length).toBeGreaterThan(10);
    const conFechasEmpatadas = multiRfcs.filter(recs => {
      const fechas = recs.map(r => r.fechaPublicacion).filter(Boolean);
      return fechas.length > 1 && new Set(fechas).size < fechas.length;
    });
    expect(conFechasEmpatadas.length).toBe(0);
  });

  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeAll(async () => {
    // Simula fetch: '/69b.json' devuelve el archivo YA incluido en el repo
    // (sin red, sin descarga externa) para ejercitar el código de producción
    // real de carga (BlacklistManager.handleLoadLocal → replaceBlacklistRecordsBulk).
    // El endpoint SAT se mockea también (mismo patrón que el resto de la
    // suite) y se deja instalado para TODA la suite (no se restaura hasta
    // afterAll) porque la prueba de validación end-to-end, más adelante,
    // también necesita el SAT mockeado — ver hallazgo aparte sobre qué pasa
    // cuando el SAT SÍ falla (classifyBySATStatus sobrescribe un 69-B
    // "Definitivo" con "No validado SAT").
    // @ts-ignore
    global.fetch = async (url: string) => {
      if (String(url).includes('69b.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => raw69bParsed,
        } as any;
      }
      if (String(url).includes('sat-proxy')) {
        // checkCFDIStatusSATRaw espera XML/SOAP (busca <Estado>/<a:Estado> por
        // getElementsByTagName), NO JSON — un content-type "application/json"
        // hace que el código lo trate como un error del proxy y devuelva
        // "Error Conexión" en vez de "Vigente". Este es el formato real.
        return {
          ok: true,
          headers: { get: () => 'text/xml' },
          text: async () => '<root><Estado>Vigente</Estado><EsCancelable>Cancelable sin aceptación</EsCancelable><EstatusCancelacion></EstatusCancelacion><CodigoEstatus>S - Comprobante obtenido satisfactoriamente.</CodigoEstatus></root>',
        } as any;
      }
      return originalFetch ? originalFetch(url as any) : Promise.reject(new Error('unexpected fetch: ' + url));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(BlacklistManager));
    });
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Cargar listas en este dispositivo'))!;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // deja correr los microtasks/promesas del handler real
      await new Promise(r => setTimeout(r, 50));
    });

    // Inserta ADEMÁS un registro sintético con 2 fechas EMPATADAS (caso que no
    // existe en el archivo real) para probar la rama de código "situación
    // múltiple sin poder determinar la vigente" (multiEstado=true), ya que
    // ninguna combinación real del archivo bundleado la alcanza. Se recarga
    // el store completo (reales + sintético) porque replaceBlacklistRecordsBulk
    // reemplaza todo el contenido en una sola transacción atómica.
    const empateNuevo = [
      { rfc: RFC_EMPATE_SINTETICO, tipo: '69B' as const, situacion: 'Presunto', fechaPublicacion: '2024-01-01', razonSocial: 'EMPATE SINTETICO SA' },
      { rfc: RFC_EMPATE_SINTETICO, tipo: '69B' as const, situacion: 'Definitivo', fechaPublicacion: '2024-01-01', razonSocial: 'EMPATE SINTETICO SA' },
    ];
    const registrosNormalizados = registros.map((r: any) => ({
      rfc: (r.rfc || '').trim().toUpperCase(),
      tipo: (r.tipo === 'EFOS' ? 'EFOS' : '69B') as 'EFOS' | '69B',
      situacion: r.situacion || undefined,
      fechaPublicacion: r.fechaPublicacion || undefined,
      razonSocial: r.razonSocial || undefined,
    }));
    await replaceBlacklistRecordsBulk([...registrosNormalizados, ...empateNuevo]);
  });

  it('IndexedDB queda cargado con los registros reales tras usar el flujo de producción', async () => {
    const defin = await getBlacklistsByRFC(RFC_DEFINITIVO);
    expect(defin.length).toBe(1);
    expect(defin[0].situacion).toBe('Definitivo');

    const sinMatch = await getBlacklistsByRFC(RFC_SIN_COINCIDENCIA);
    expect(sinMatch.length).toBe(0);

    const historial = await getBlacklistsByRFC(RFC_HISTORIAL);
    expect(historial.length).toBe(2);

    const empate = await getBlacklistsByRFC(RFC_EMPATE_SINTETICO);
    expect(empate.length).toBe(2);
  });

  it('checkRFCBlacklist (función real de producción) clasifica correctamente los 3 casos pedidos + el caso sintético de empate', async () => {
    const rDefin = await checkRFCBlacklist(RFC_DEFINITIVO);
    expect(rDefin.found).toBe(true);
    expect(rDefin.multiEstado).toBeFalsy();
    expect(rDefin.situacion).toBe('Definitivo');

    const rSinMatch = await checkRFCBlacklist(RFC_SIN_COINCIDENCIA);
    expect(rSinMatch.found).toBe(false);
    expect(rSinMatch.notSynced).toBe(false); // la base SÍ está cargada; simplemente no hay coincidencia

    // Caso real de historial múltiple: las fechas NO empatan → se resuelve a
    // la situación más reciente (Sentencia Favorable, 2019-12-20 es posterior
    // a Definitivo 2020-06-19... ver nota: en este RFC específico Definitivo
    // es 2020-06-19 y Sentencia Favorable 2019-12-20, por lo que Definitivo es
    // la fecha MÁS RECIENTE → la app debe reportar "Definitivo" como vigente).
    const rHist = await checkRFCBlacklist(RFC_HISTORIAL);
    expect(rHist.found).toBe(true);
    expect(rHist.multiEstado).toBe(false);
    expect(rHist.situacion).toBe('Definitivo');

    // Caso sintético con fechas empatadas: SÍ debe producir multiEstado=true.
    const rEmpate = await checkRFCBlacklist(RFC_EMPATE_SINTETICO);
    expect(rEmpate.found).toBe(true);
    expect(rEmpate.multiEstado).toBe(true);
    expect(rEmpate.situacion).toBe('Situación múltiple; requiere revisión');
  });

  it('resultado en pantalla (pipeline real de validación) y en las celdas del Excel exportado son consistentes con los 4 casos', async () => {
    const uuidDefinitivo = 'D0000000-0000-0000-0000-000000000001';
    const uuidSinMatch = 'D0000000-0000-0000-0000-000000000002';
    const uuidHistorial = 'D0000000-0000-0000-0000-000000000003';
    const uuidEmpate = 'D0000000-0000-0000-0000-000000000004';

    const files = [
      { name: 'definitivo.xml', size: 1000, type: 'text/xml', content: buildCFDI(uuidDefinitivo, RFC_DEFINITIVO, 'PROVEEDOR DEFINITIVO') },
      { name: 'sinmatch.xml', size: 1000, type: 'text/xml', content: buildCFDI(uuidSinMatch, RFC_SIN_COINCIDENCIA, 'PROVEEDOR LIMPIO') },
      { name: 'historial.xml', size: 1000, type: 'text/xml', content: buildCFDI(uuidHistorial, RFC_HISTORIAL, 'PROVEEDOR HISTORIAL') },
      { name: 'empate.xml', size: 1000, type: 'text/xml', content: buildCFDI(uuidEmpate, RFC_EMPATE_SINTETICO, 'PROVEEDOR EMPATE') },
    ];

    const results = await runValidateXMLFiles(files, 'Comercio', EMPRESA_RFC);
    expect(results.length).toBe(4);

    const rDef = results.find(r => r.uuid === uuidDefinitivo)!;
    const rSin = results.find(r => r.uuid === uuidSinMatch)!;
    const rHist = results.find(r => r.uuid === uuidHistorial)!;
    const rEmp = results.find(r => r.uuid === uuidEmpate)!;

    // ── Resultado en pantalla ──
    // HALLAZGO (no corregido — fuera de alcance de esta ronda, ver reporte):
    // classifyBySATStatus() en useXMLValidator.ts SIEMPRE descarta el
    // comentarioFiscal enriquecido por la sección 69-B (el que agrega
    // "[CRÍTICO — 69-B DEFINITIVO]", "[ADVERTENCIA — 69-B SITUACIÓN
    // MÚLTIPLE]", etc.) y lo reemplaza por comentarioMotor (el comentario
    // genérico del motor, sin mención de 69-B) en TODAS sus ramas —
    // independientemente del estatus SAT. El campo "resultado" (badge
    // 🔴/🟡/🟢) SÍ refleja correctamente el hallazgo 69-B; el texto
    // explicativo (comentarioFiscal / columna "Comentario_Fiscal" del Excel)
    // NO lo hace. Por eso estas aserciones verifican "resultado" y NO buscan
    // el texto "69-B"/"SITUACIÓN MÚLTIPLE" dentro de comentarioFiscal — ese
    // texto real y demostrablemente no llega ahí.
    expect(rDef.resultado).toBe('🔴 NO USABLE');

    expect(rSin.resultado).not.toBe('🔴 NO USABLE');
    expect(rSin.resultado).not.toBe('🟡 ALERTA');

    // RFC_HISTORIAL resuelve a "Definitivo" vigente (ver nota arriba) → mismo
    // tratamiento crítico que el caso simple.
    expect(rHist.resultado).toBe('🔴 NO USABLE');

    // El caso con fechas empatadas se degrada a ALERTA (no a NO USABLE ni se
    // deja como si no hubiera coincidencia).
    expect(rEmp.resultado).toBe('🟡 ALERTA');

    // ── Celdas del Excel exportado ──
    const wb = await buildDiagnosticoWorkbook(results);
    const diag = XLSX.utils.sheet_to_json<any>(wb.Sheets['Diagnostico_CFDI']);

    const filaDef = diag.find(r => r.UUID === uuidDefinitivo)!;
    expect(filaDef.RFC_Evaluado_69B).toBe(RFC_DEFINITIVO); // dirección RECIBIDO → evalúa emisor
    expect(filaDef.Validacion_69B).toBe('Definitivo');
    expect(filaDef.Situacion_69B).toBe('Definitivo');
    expect(filaDef.Historial_69B).toBe('Definitivo');

    const filaSin = diag.find(r => r.UUID === uuidSinMatch)!;
    expect(filaSin.RFC_Evaluado_69B).toBe(RFC_SIN_COINCIDENCIA);
    expect(filaSin.Validacion_69B).toBe('Sin coincidencia');
    expect(filaSin.Situacion_69B).toBe('Sin coincidencia');

    const filaHist = diag.find(r => r.UUID === uuidHistorial)!;
    expect(filaHist.RFC_Evaluado_69B).toBe(RFC_HISTORIAL);
    expect(filaHist.Validacion_69B).toBe('Definitivo');
    expect(filaHist.Situacion_69B).toBe('Definitivo');

    const filaEmp = diag.find(r => r.UUID === uuidEmpate)!;
    expect(filaEmp.RFC_Evaluado_69B).toBe(RFC_EMPATE_SINTETICO);
    expect(filaEmp.Validacion_69B).toBe('Requiere revisión');
    expect(filaEmp.Historial_69B).toBe('Situación múltiple; requiere revisión');
  });
});
