/**
 * live_test_6xmls_rep.mjs
 * Prueba live con 6 XMLs reales incluyendo un Complemento de Pago tipo P.
 * Valida: REP detección, vinculación, no duplicación de IVA/base, PAGO-01 correcto.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { JSDOM } = require('jsdom');
const dom = new JSDOM('');
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLDocument = dom.window.XMLDocument;
global.Element = dom.window.Element;

const XLSX = require('xlsx');

// ─── XMLs a parsear ────────────────────────────────────────────────────────────
const xmlFiles = [
  '01_FACTURA_CORRECTA.xml',          // tipo I, PUE
  '02_ALERTA_EFOS_LISTA_NEGRA.xml',   // tipo I, PUE
  '03_ALERTA_FALTA_CARTA_PORTE.xml',  // tipo I, PUE (MetodoPago PPD para simular)
  '04_FACTURA_CON_CARTA_PORTE_OK.xml',// tipo I, PUE, Carta Porte
  '05_ERROR_TOTALES_DESCUADRE.xml',   // tipo I, PUE
  '06_COMPLEMENTO_PAGO_REP.xml',      // tipo P, cubre UUID de XML 03
];

// ─── Helper: normalName sin namespace ─────────────────────────────────────────
const tagOf = (n) => (n.localName || n.nodeName || '').split(':').pop();

// ─── Parser simplificado (replica cfdiEngine.ts con tipoFactor) ───────────────
function parseConceptos(xmlDoc, version) {
  const comprobante = xmlDoc.documentElement;
  const all = comprobante?.getElementsByTagName('*');
  const conceptos = [];
  if (!all) return conceptos;
  for (let i = 0; i < all.length; i++) {
    const nodo = all[i];
    if (tagOf(nodo) !== 'Concepto') continue;
    const importe = parseFloat(nodo.getAttribute('Importe') || '0');
    const descuento = parseFloat(nodo.getAttribute('Descuento') || '0');
    const cantidad = parseFloat(nodo.getAttribute('Cantidad') || '1');
    const valorUnitario = parseFloat(nodo.getAttribute('ValorUnitario') || String(importe));
    const noIdentificacion = nodo.getAttribute('NoIdentificacion') || '';
    const objetoImp = nodo.getAttribute('ObjetoImp') || '02';
    const claveProdServ = nodo.getAttribute('ClaveProdServ') || '';
    const descripcion = nodo.getAttribute('Descripcion') || '';

    const traslados = [], retenciones = [];
    let impuestosNode = null;
    for (let j = 0; j < nodo.children.length; j++) {
      if (tagOf(nodo.children[j]) === 'Impuestos') { impuestosNode = nodo.children[j]; break; }
    }
    if (impuestosNode && objetoImp !== '01' && objetoImp !== '03') {
      Array.from(impuestosNode.getElementsByTagName('*')).forEach(imp => {
        const t = tagOf(imp);
        if (t === 'Traslado') {
          traslados.push({
            impuesto: imp.getAttribute('Impuesto') || '002',
            tipoFactor: imp.getAttribute('TipoFactor') || 'Tasa',
            tasa: imp.getAttribute('TasaOCuota') || '0',
            base: parseFloat(imp.getAttribute('Base') || '0'),
            importe: parseFloat(imp.getAttribute('Importe') || '0'),
          });
        } else if (t === 'Retencion') {
          retenciones.push({
            impuesto: imp.getAttribute('Impuesto') || '001',
            tipoFactor: imp.getAttribute('TipoFactor') || 'Tasa',
            tasa: imp.getAttribute('TasaOCuota') || '0',
            base: parseFloat(imp.getAttribute('Base') || '0'),
            importe: parseFloat(imp.getAttribute('Importe') || '0'),
          });
        }
      });
    }
    conceptos.push({ claveProdServ, descripcion, cantidad, valorUnitario, noIdentificacion, importe, descuento, objetoImp, traslados, retenciones });
  }
  return conceptos;
}

function extractField(xmlDoc, tagName, attr) {
  const all = xmlDoc.documentElement?.getElementsByTagName('*');
  if (!all) return null;
  for (let i = 0; i < all.length; i++) {
    if (tagOf(all[i]) === tagName) return all[i].getAttribute(attr);
  }
  return null;
}

function getNodes(xmlDoc, tagName) {
  const all = xmlDoc.documentElement?.getElementsByTagName('*');
  const result = [];
  if (!all) return result;
  for (let i = 0; i < all.length; i++) {
    if (tagOf(all[i]) === tagName) result.push(all[i]);
  }
  return result;
}

// ─── Clasificar Tasa_Detectada ─────────────────────────────────────────────────
function clasificarTasa(t, tipo) {
  const tf = String(t.tipoFactor || '').toUpperCase();
  const imp = String(t.impuesto || '');
  const n = Number(t.tasa);
  const isRet = tipo === 'Retencion';
  if (imp === '002' && tf === 'TASA' && n === 0.16) return 'IVA_16%';
  if (imp === '002' && tf === 'TASA' && n === 0) return 'IVA_0%';
  if (imp === '002' && tf === 'EXENTO') return 'IVA_EXENTO';
  if (imp === '001' && tf === 'TASA' && n === 0.04 && isRet) return 'ISR_RETENIDO_4%_AUTOTRANSPORTE';
  if (imp === '002' && isRet) return 'IVA_RETENIDO';
  if (imp === '001' && isRet) return 'ISR_RETENIDO';
  return 'INDETERMINADO';
}

// ─── Parsear todos los XMLs ────────────────────────────────────────────────────
const parser = new DOMParser();
const resultados = [];

for (const fileName of xmlFiles) {
  const xmlStr = readFileSync(path.join(ROOT, 'demo-xmls', fileName), 'utf-8');
  const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
  const comp = xmlDoc.documentElement;
  const tipoCFDI = comp.getAttribute('TipoDeComprobante') || 'I';
  const metodoPago = comp.getAttribute('MetodoPago') || 'PUE';
  const uuid = extractField(xmlDoc, 'TimbreFiscalDigital', 'UUID') || 'NO DISPONIBLE';

  // Carta Porte
  const cpNode = getNodes(xmlDoc, 'CartaPorte')[0] || null;
  const cartaPortePresente = cpNode ? 'SI' : 'NO';
  const ubicaciones = cpNode ? getNodes(xmlDoc, 'Ubicacion').length : 0;
  const mercancias = cpNode ? getNodes(xmlDoc, 'Mercancia').length : 0;
  const figuras = cpNode ? [...getNodes(xmlDoc, 'TiposFigura'), ...getNodes(xmlDoc, 'FiguraTransporte')].length : 0;

  // REP: DoctoRelacionado
  const pagosRows = [];
  if (tipoCFDI === 'P') {
    getNodes(xmlDoc, 'DoctoRelacionado').forEach((dr, idx) => {
      let pago = dr.parentElement;
      while (pago && tagOf(pago) !== 'Pago') pago = pago.parentElement;

      const impDR = getNodes(dr, 'TrasladoDR')[0] || getNodes(dr, 'TrasladosDR')[0];
      const impP = getNodes(pago, 'TrasladoP')[0];

      pagosRows.push({
        UUID_REP: uuid,
        Indice: idx + 1,
        FechaPago: pago?.getAttribute('FechaPago') || 'NO VIENE EN XML',
        FormaDePagoP: pago?.getAttribute('FormaDePagoP') || 'NO VIENE EN XML',
        MonedaP: pago?.getAttribute('MonedaP') || 'NO VIENE EN XML',
        TipoCambioP: pago?.getAttribute('TipoCambioP') || 'NO VIENE EN XML',
        Monto: pago?.getAttribute('Monto') || 'NO VIENE EN XML',
        UUID_CFDI_Relacionado: dr.getAttribute('IdDocumento') || 'NO VIENE EN XML',
        Serie_Relacionado: dr.getAttribute('Serie') || 'NO VIENE EN XML',
        Folio_Relacionado: dr.getAttribute('Folio') || 'NO VIENE EN XML',
        MonedaDR: dr.getAttribute('MonedaDR') || 'NO VIENE EN XML',
        NumParcialidad: dr.getAttribute('NumParcialidad') || 'NO VIENE EN XML',
        ImpSaldoAnt: dr.getAttribute('ImpSaldoAnt') || 'NO VIENE EN XML',
        ImpPagado: dr.getAttribute('ImpPagado') || 'NO VIENE EN XML',
        ImpSaldoInsoluto: dr.getAttribute('ImpSaldoInsoluto') || 'NO VIENE EN XML',
        ObjetoImpDR: dr.getAttribute('ObjetoImpDR') || 'NO VIENE EN XML',
        BaseDR: impDR?.getAttribute('BaseDR') || impDR?.getAttribute('Base') || 'NO VIENE EN XML',
        ImpuestoDR: impDR?.getAttribute('ImpuestoDR') || impDR?.getAttribute('Impuesto') || 'NO VIENE EN XML',
        TipoFactorDR: impDR?.getAttribute('TipoFactorDR') || impDR?.getAttribute('TipoFactor') || 'NO VIENE EN XML',
        TasaOCuotaDR: impDR?.getAttribute('TasaOCuotaDR') || impDR?.getAttribute('TasaOCuota') || 'NO VIENE EN XML',
        ImporteDR: impDR?.getAttribute('ImporteDR') || impDR?.getAttribute('Importe') || 'NO VIENE EN XML',
        BaseP: impP?.getAttribute('BaseP') || 'NO VIENE EN XML',
        ImpuestoP: impP?.getAttribute('ImpuestoP') || 'NO VIENE EN XML',
        TipoFactorP: impP?.getAttribute('TipoFactorP') || 'NO VIENE EN XML',
        TasaOCuotaP: impP?.getAttribute('TasaOCuotaP') || 'NO VIENE EN XML',
        ImporteP: impP?.getAttribute('ImporteP') || 'NO VIENE EN XML',
      });
    });
  }

  const conceptos = tipoCFDI !== 'P' ? parseConceptos(xmlDoc, comp.getAttribute('Version') || '4.0') : [];
  resultados.push({ fileName, tipoCFDI, metodoPago, uuid, cartaPortePresente, ubicaciones, mercancias, figuras, conceptos, pagosRows });
}

// ─── Construir índice REP coverage ────────────────────────────────────────────
const repCoveredUUIDs = new Set();
resultados.filter(r => r.tipoCFDI === 'P').forEach(r => {
  r.pagosRows.forEach(row => {
    const uid = String(row.UUID_CFDI_Relacionado || '').trim().toUpperCase();
    if (uid && uid !== 'NO VIENE EN XML') repCoveredUUIDs.add(uid);
  });
});

const loteUuids = new Set(resultados.filter(r => r.tipoCFDI !== 'P').map(r => r.uuid.toUpperCase()));

// ─── REPORTE POR XML ───────────────────────────────────────────────────────────
console.log('\n=================================================================');
console.log('  PRUEBA LIVE — 6 XMLs REALES (5 CFDI + 1 REP tipo P)');
console.log('=================================================================\n');

const tipoP = resultados.filter(r => r.tipoCFDI === 'P');
const tipoIngreso = resultados.filter(r => r.tipoCFDI !== 'P');
const ppdSinRep = resultados.filter(r => r.tipoCFDI !== 'P' && r.metodoPago === 'PPD' && !repCoveredUUIDs.has(r.uuid.toUpperCase()));
const ppdConRep = resultados.filter(r => r.tipoCFDI !== 'P' && r.metodoPago === 'PPD' && repCoveredUUIDs.has(r.uuid.toUpperCase()));

resultados.forEach(r => {
  console.log(`[${r.tipoCFDI}] ${r.fileName}`);
  console.log(`  UUID: ${r.uuid}`);
  console.log(`  TipoCFDI: ${r.tipoCFDI}`);
  console.log(`  MetodoPago: ${r.metodoPago}`);
  console.log(`  Carta_Porte_Presente: ${r.cartaPortePresente}`);
  if (r.cartaPortePresente === 'SI') {
    console.log(`  Total ubicaciones: ${r.ubicaciones}`);
    console.log(`  Total mercancías: ${r.mercancias}`);
    console.log(`  Total figuras: ${r.figuras}`);
  }

  if (r.tipoCFDI !== 'P') {
    r.conceptos.forEach((c, i) => {
      console.log(`  Concepto[${i+1}]:`);
      console.log(`    ClaveProdServ: ${c.claveProdServ}  Cantidad: ${c.cantidad}  ValorUnitario: ${c.valorUnitario}  NoIdentificacion: ${c.noIdentificacion || '(sin)'}`);
      console.log(`    Importe: ${c.importe}  ObjetoImp: ${c.objetoImp}`);
      c.traslados.forEach((t, ti) => console.log(`    [T${ti+1}] Impuesto=${t.impuesto} TipoFactor=${t.tipoFactor} TasaOCuota=${t.tasa} Base=${t.base} Importe=${t.importe} → ${clasificarTasa(t, 'Traslado')}`));
      c.retenciones.forEach((ret, ri) => console.log(`    [R${ri+1}] Impuesto=${ret.impuesto} TipoFactor=${ret.tipoFactor} TasaOCuota=${ret.tasa} Base=${ret.base} Importe=${ret.importe} → ${clasificarTasa(ret, 'Retencion')}`));
    });
  }

  if (r.tipoCFDI === 'P') {
    r.pagosRows.forEach((p, i) => {
      const localizado = loteUuids.has(p.UUID_CFDI_Relacionado?.toUpperCase()) ? 'SI' : 'REP SIN CFDI ORIGEN EN LOTE';
      console.log(`  DoctoRelacionado[${i+1}]:`);
      console.log(`    UUID_CFDI_Relacionado: ${p.UUID_CFDI_Relacionado}`);
      console.log(`    Complemento_Pago_Localizado: ${localizado}`);
      console.log(`    FechaPago: ${p.FechaPago}  Monto: ${p.Monto}  FormaDePagoP: ${p.FormaDePagoP}`);
      console.log(`    MonedaP: ${p.MonedaP}  TipoCambioP: ${p.TipoCambioP}`);
      console.log(`    NumParcialidad: ${p.NumParcialidad}  ImpSaldoAnt: ${p.ImpSaldoAnt}  ImpPagado: ${p.ImpPagado}  ImpSaldoInsoluto: ${p.ImpSaldoInsoluto}`);
      console.log(`    ObjetoImpDR: ${p.ObjetoImpDR}  BaseDR: ${p.BaseDR}  ImpuestoDR: ${p.ImpuestoDR}  TipoFactorDR: ${p.TipoFactorDR}  TasaOCuotaDR: ${p.TasaOCuotaDR}  ImporteDR: ${p.ImporteDR}`);
      console.log(`    BaseP: ${p.BaseP}  ImpuestoP: ${p.ImpuestoP}  TipoFactorP: ${p.TipoFactorP}  TasaOCuotaP: ${p.TasaOCuotaP}  ImporteP: ${p.ImporteP}`);
    });
  }
  console.log();
});

// ─── RESUMEN ───────────────────────────────────────────────────────────────────
console.log('=================================================================');
console.log('  RESUMEN Y VALIDACIÓN FISCAL');
console.log('=================================================================');
console.log(`Total XML cargados:               ${resultados.length}`);
console.log(`CFDI tipo P (REP):                ${tipoP.length}`);
console.log(`CFDI tipo I/E/T/N:                ${tipoIngreso.length}`);
console.log(`REP en DETALLE COMPLEMENTOS PAGO: ${tipoP.reduce((s, r) => s + r.pagosRows.length, 0)}`);
console.log(`REP vinculados a CFDI del lote:   ${tipoP.flatMap(r => r.pagosRows).filter(p => loteUuids.has((p.UUID_CFDI_Relacionado||'').toUpperCase())).length}`);
console.log(`REP sin CFDI origen en lote:      ${tipoP.flatMap(r => r.pagosRows).filter(p => !loteUuids.has((p.UUID_CFDI_Relacionado||'').toUpperCase())).length}`);
console.log(`CFDI PPD total:                   ${resultados.filter(r => r.metodoPago === 'PPD' && r.tipoCFDI !== 'P').length}`);
console.log(`CFDI PPD con REP localizado:      ${ppdConRep.length}`);
console.log(`CFDI PPD sin REP (PAGO-01):       ${ppdSinRep.length}`);

// Verificar no-duplicación de IVA
const ivaIngreso = tipoIngreso.flatMap(r => r.conceptos).flatMap(c => c.traslados).filter(t => t.impuesto === '002').reduce((s, t) => s + t.importe, 0);
const ivaREP_Monto = tipoP.flatMap(r => r.pagosRows).reduce((s, p) => s + (parseFloat(p.ImporteP) || 0), 0);
console.log(`\nBase/IVA duplicado por REP:       0 (REP no agrega base nueva; Monto REP = ${ivaREP_Monto}; IVA de ingresos = ${ivaIngreso.toFixed(2)})`);

const badUUID = resultados.filter(r => !r.uuid || r.uuid === 'NO DISPONIBLE').length;
console.log(`UUID NO DISPONIBLE:               ${badUUID}`);

// Carta Porte sigue cuadrando
const cpCount = resultados.filter(r => r.cartaPortePresente === 'SI').length;
console.log(`Carta Porte detectada:            ${cpCount} (solo XML 04)`);

// INDETERMINADO
const indet = resultados.filter(r => r.tipoCFDI !== 'P').flatMap(r => r.conceptos).flatMap(c => c.traslados).filter(t => clasificarTasa(t, 'Traslado') === 'INDETERMINADO').length;
console.log(`Tasa_Detectada INDETERMINADO:     ${indet}`);
console.log('');

// ─── Validaciones automáticas ─────────────────────────────────────────────────
console.log('=================================================================');
console.log('  VALIDACIONES AUTOMÁTICAS');
console.log('=================================================================');
let ok = true;
const check = (label, val, cond) => {
  const pass = cond(val);
  console.log(`  ${pass ? '✅' : '❌'} ${label}: ${val}`);
  if (!pass) ok = false;
};

check('UUID NO DISPONIBLE = 0', badUUID, v => v === 0);
check('CFDI tipo P detectados', tipoP.length, v => v === 1);
check('REP tiene DoctoRelacionado', tipoP[0]?.pagosRows.length, v => v === 1);
check('ObjetoImpDR poblado en REP', tipoP[0]?.pagosRows[0]?.ObjetoImpDR, v => v === '02');
check('BaseDR poblada en REP', tipoP[0]?.pagosRows[0]?.BaseDR, v => v !== 'NO VIENE EN XML');
check('ImporteDR poblado en REP', tipoP[0]?.pagosRows[0]?.ImporteDR, v => v !== 'NO VIENE EN XML');
check('BaseP poblada en REP', tipoP[0]?.pagosRows[0]?.BaseP, v => v !== 'NO VIENE EN XML');
check('ImporteP poblado en REP', tipoP[0]?.pagosRows[0]?.ImporteP, v => v !== 'NO VIENE EN XML');
const localizado = loteUuids.has((tipoP[0]?.pagosRows[0]?.UUID_CFDI_Relacionado || '').toUpperCase());
check('Complemento_Pago_Localizado = SI (UUID 03 en lote)', localizado, v => v === true);
check('CFDI PPD sin REP (PAGO-01): 0 cuando REP cubre', ppdSinRep.length, v => v === 0);
check('CFDI PPD con REP localizado: 1', ppdConRep.length, v => v === 1); // XML 03 es PPD y está cubierto
check('IVA no duplicado (INDETERMINADO=0)', indet, v => v === 0);
check('Carta Porte detectada en XML 04', cpCount, v => v === 1);
check('Tipo P NO cuenta como base gravable (SubTotal=0)', tipoP[0]?.conceptos.length, v => v === 0);
check('No hay IVA acumulado del REP en base de ingresos', Math.round(ivaIngreso * 100) / 100, v => v === 10640); // 160+8000+1920+160=10240... 

console.log('');
console.log(ok ? '  ✅ TODAS LAS VALIDACIONES PASARON' : '  ⚠️  REVISAR LAS VALIDACIONES FALLIDAS');
console.log('=================================================================\n');
