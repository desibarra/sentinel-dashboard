import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { zipSync } from 'fflate';
import UploadZone, { type UploadedFile } from '../components/UploadZone';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { mergeAndReconcileResults, type ValidationResult } from '../lib/cfdiEngine';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

// Prueba de control: el MISMO conjunto de XML cargado como carpeta con
// subcarpetas, como ZIP y como archivos sueltos debe dar exactamente los mismos
// totales. Por omisión usa los XML de prueba del repo; con datos reales:
//   CONTROL_XML_DIR=C:/ruta/XMLs CONTROL_MONTH=2026-07 CONTROL_RFC=XAXX010101000 npx vitest run intakeControl
const REAL_DIR = process.env.CONTROL_XML_DIR;
const MONTH = process.env.CONTROL_MONTH;
const RFC = process.env.CONTROL_RFC || 'TME960709LR2';
const FIXTURES = path.resolve(__dirname, '../../../tests/fixtures');

function loadXmls(): { name: string; bytes: Uint8Array }[] {
  if (REAL_DIR) {
    const fecha = MONTH ? new RegExp(`\\sFecha\\s*=\\s*"${MONTH}`) : null;
    return fs.readdirSync(REAL_DIR).filter(name => /\.xml$/i.test(name)).flatMap(name => {
      const bytes = fs.readFileSync(path.join(REAL_DIR, name));
      return !fecha || fecha.test(bytes.subarray(0, 4096).toString('latin1')) ? [{ name, bytes: new Uint8Array(bytes) }] : [];
    });
  }
  return ['stress-xmls', 'demo-xmls'].flatMap(dir => fs.readdirSync(path.join(FIXTURES, dir)).slice(0, 400)
    .map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(FIXTURES, dir, name))) })));
}

// Carpeta de 3 niveles: empresa/año-mes/tipo/archivo.xml, a partir del propio XML.
const folderPath = (name: string, bytes: Uint8Array) => {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
  const month = /\sFecha\s*=\s*"(\d{4}-\d{2})/.exec(head)?.[1] || 'sin-fecha';
  const tipo = /\sTipoDeComprobante\s*=\s*"(\w)/.exec(head)?.[1] || 'X';
  return `EMPRESA/${month}/${tipo}/${name}`;
};

const satVigente = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"><a:Estado>Vigente</a:Estado></ConsultaResult></ConsultaResponse></s:Body></s:Envelope>`;
const originalFetch = global.fetch;
const requests: { url: string; body: string }[] = [];
// @ts-ignore — red simulada: se registra todo lo que la carga intente enviar.
global.fetch = async (url: string, init?: RequestInit) => {
  requests.push({ url: String(url), body: String(init?.body ?? '') });
  if (String(url).includes('sat-proxy')) return new Response(satVigente, { status: 200, headers: { 'content-type': 'text/xml' } });
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
};
afterAll(() => { global.fetch = originalFetch; });

/** Selecciona archivos en UploadZone, espera la lectura, pulsa "Iniciar Validación" y devuelve lo entregado. */
async function intake(inputId: string, files: File[]): Promise<UploadedFile[]> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let delivered: UploadedFile[] = [];
  act(() => root.render(React.createElement(UploadZone, { onFilesReady: (f: UploadedFile[]) => { delivered = f; }, isValidating: false, hasValidatedResults: false })));
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(`#${inputId}`)!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const button = () => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Iniciar Validación'));
  for (let i = 0; i < 6000 && !(button() && !button()!.disabled); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await act(async () => { button()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  act(() => root.unmount());
  container.remove();
  return delivered;
}

async function validate(files: UploadedFile[]): Promise<ValidationResult[]> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const results = await new Promise<ValidationResult[]>((resolve, reject) => {
    function Harness() {
      const { validateXMLFiles } = useXMLValidator();
      React.useEffect(() => { validateXMLFiles(files as any, 'Transporte', RFC, () => {}).then(resolve, reject); }, []);
      return null;
    }
    act(() => root.render(React.createElement(Harness)));
  });
  act(() => root.unmount());
  container.remove();
  // Misma deduplicación y conciliación que aplica el Dashboard al recibir el lote.
  return mergeAndReconcileResults([], results).combinado;
}

const totals = (results: ValidationResult[]) => ({
  procesados: results.length,
  usables: results.filter(r => r.resultado?.includes('🟢')).length,
  alertas: results.filter(r => r.resultado?.includes('🟡')).length,
  noUsables: results.filter(r => r.resultado?.includes('🔴')).length,
  noValidadosSAT: results.filter(r => r.resultado === 'No validado SAT').length,
  uuids: results.map(r => r.uuid).sort().join('|'),
});

describe('prueba de control: carpeta vs ZIP vs archivos sueltos', () => {
  it('dan exactamente los mismos totales y no envían XML a la red', async () => {
    const xmls = loadXmls();
    expect(xmls.length).toBeGreaterThan(0);

    const loose = xmls.map(({ name, bytes }) => new File([bytes], name));
    const folder = xmls.map(({ name, bytes }) => {
      const file = new File([bytes], name);
      Object.defineProperty(file, 'webkitRelativePath', { value: folderPath(name, bytes) });
      return file;
    });
    const zip = new File([zipSync(Object.fromEntries(xmls.map(({ name, bytes }) => [folderPath(name, bytes), bytes])))], 'descarga-sat.zip');

    const modes = {
      sueltos: await intake('xml-upload', loose),
      carpeta: await intake('xml-folder-upload', folder),
      zip: await intake('xml-upload', [zip]),
    };
    const table: Record<string, ReturnType<typeof totals> & { entregados: number }> = {};
    for (const [mode, delivered] of Object.entries(modes)) table[mode] = { entregados: delivered.length, ...totals(await validate(delivered)) };

    const printable = Object.fromEntries(Object.entries(table).map(([k, { uuids, ...rest }]) => [k, rest]));
    console.log(`[control] ${REAL_DIR ? `${REAL_DIR} ${MONTH || ''}` : 'fixtures del repo'} — ${xmls.length} XML`);
    console.table(printable);
    expect(table.carpeta).toEqual(table.sueltos);
    expect(table.zip).toEqual(table.sueltos);

    // Ninguna solicitud lleva contenido XML: solo la consulta SAT (UUID, RFC, total) y la lista 69-B.
    const leaks = requests.filter(r => /<cfdi:Comprobante|TimbreFiscalDigital|<\?xml/i.test(r.body) && !r.url.includes('sat-proxy'));
    expect(leaks).toEqual([]);
    const satBodies = requests.filter(r => r.url.includes('sat-proxy'));
    expect(satBodies.every(r => !/Comprobante|Concepto/.test(r.body))).toBe(true);
    console.log(`[control] solicitudes a la red: ${requests.length} (${satBodies.length} consultas SAT, ${requests.length - satBodies.length} otras); con contenido XML: ${leaks.length}`);
  }, 900_000);
});
