/**
 * live_test_5xmls.mjs
 * Prueba live: parsea 5 XMLs reales con jsdom (mismo DOMParser que el browser),
 * genera Excel pequeño y valida todos los campos de las Fases 1-4.
 *
 * Uso: node scripts/live_test_5xmls.mjs
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 1. Setup jsdom como DOMParser (idéntico al browser) ─────────────────────
const { JSDOM } = require('jsdom');
const dom = new JSDOM('');
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLDocument = dom.window.XMLDocument;
global.Element = dom.window.Element;

// ── 2. Cargar XLSX ────────────────────────────────────────────────────────────
const XLSX = require('xlsx');

// ── 3. Cargar los 5 XMLs reales ───────────────────────────────────────────────
const xmlFiles = [
  '01_FACTURA_CORRECTA.xml',
  '02_ALERTA_EFOS_LISTA_NEGRA.xml',
  '03_ALERTA_FALTA_CARTA_PORTE.xml',
  '04_FACTURA_CON_CARTA_PORTE_OK.xml',
  '05_ERROR_TOTALES_DESCUADRE.xml',
];

// ── 4. Parser XML real (replica exacta de cfdiEngine.ts) ─────────────────────
function extractTaxesByConcepto(xmlDoc, version) {
  let baseIVA16 = 0, baseIVA0 = 0, baseIVAExento = 0;
  let baseNoObjeto = 0, baseObjetoSinDesglose = 0;
  let ivaTraslado = 0, ivaRetenido = 0, isrRetenido = 0;
  const desglosePorConcepto = [];
  const comprobante = xmlDoc.documentElement;
  const conceptos = comprobante?.getElementsByTagName('*');
  let conceptoNumero = 0;

  if (conceptos) {
    for (let i = 0; i < conceptos.length; i++) {
      const nodo = conceptos[i];
      const tag = (nodo.localName || nodo.nodeName).split(':').pop();
      if (tag !== 'Concepto') continue;
      conceptoNumero++;

      const importe = parseFloat(nodo.getAttribute('Importe') || '0');
      const descuento = parseFloat(nodo.getAttribute('Descuento') || '0');
      const cantidadRaw = nodo.getAttribute('Cantidad');
      const cantidad = cantidadRaw !== null ? parseFloat(cantidadRaw) : 1;
      const noIdentificacion = nodo.getAttribute('NoIdentificacion') || '';
      const valorUnitarioRaw = nodo.getAttribute('ValorUnitario');
      const valorUnitario = valorUnitarioRaw !== null ? parseFloat(valorUnitarioRaw) : importe;
      const objetoImp = nodo.getAttribute('ObjetoImp') || (version === '4.0' ? '01' : '02');
      const claveProdServ = nodo.getAttribute('ClaveProdServ') || '';
      const descripcion = nodo.getAttribute('Descripcion') || '';
      const baseConcepto = importe - descuento;

      if (objetoImp === '01') {
        baseNoObjeto += baseConcepto;
        desglosePorConcepto.push({ numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion, cantidad, noIdentificacion, valorUnitario, traslados: [], retenciones: [], subtotalAcumulado: 0, totalParcial: baseConcepto });
        continue;
      }
      if (objetoImp === '03') {
        baseObjetoSinDesglose += baseConcepto;
        desglosePorConcepto.push({ numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion, cantidad, noIdentificacion, valorUnitario, traslados: [], retenciones: [], subtotalAcumulado: 0, totalParcial: baseConcepto });
        continue;
      }

      const trasladosConcepto = [], retencionesConcepto = [];
      // Buscar nodo Impuestos hijo del Concepto
      let impuestosConcepto = null;
      for (let j = 0; j < nodo.children.length; j++) {
        const childTag = (nodo.children[j].localName || nodo.children[j].nodeName).split(':').pop();
        if (childTag === 'Impuestos') { impuestosConcepto = nodo.children[j]; break; }
      }

      if (impuestosConcepto) {
        const children = Array.from(impuestosConcepto.getElementsByTagName('*'));
        children.forEach(nodoImpuesto => {
          const tagImp = (nodoImpuesto.localName || nodoImpuesto.nodeName).split(':').pop();
          if (tagImp === 'Traslado') {
            const tasa = nodoImpuesto.getAttribute('TasaOCuota') || '0';
            const base = parseFloat(nodoImpuesto.getAttribute('Base') || '0');
            const importeTraslado = parseFloat(nodoImpuesto.getAttribute('Importe') || '0');
            const impuesto = nodoImpuesto.getAttribute('Impuesto') || '002';
            const tipoFactor = nodoImpuesto.getAttribute('TipoFactor') || 'Tasa'; // ← CORRECCIÓN
            trasladosConcepto.push({ impuesto, tasa, importe: importeTraslado, base, tipoFactor });
            if (impuesto === '002') {
              if (tasa === '0.16' || tasa === '0.160000') baseIVA16 += base;
              else if (tasa === '0.00' || tasa === '0.000000') baseIVA0 += base;
              else baseIVAExento += base;
              ivaTraslado += importeTraslado;
            }
          } else if (tagImp === 'Retencion') {
            const impuesto = nodoImpuesto.getAttribute('Impuesto') || '002';
            const importeRetencion = parseFloat(nodoImpuesto.getAttribute('Importe') || '0');
            const tasa = nodoImpuesto.getAttribute('TasaOCuota') || '0';
            const base = parseFloat(nodoImpuesto.getAttribute('Base') || '0');
            const tipoFactor = nodoImpuesto.getAttribute('TipoFactor') || 'Tasa'; // ← CORRECCIÓN
            retencionesConcepto.push({ impuesto, tasa, importe: importeRetencion, base, tipoFactor });
            if (impuesto === '002') ivaRetenido += importeRetencion;
            else if (impuesto === '001') isrRetenido += importeRetencion;
          }
        });
      } else {
        baseIVAExento += baseConcepto;
      }

      const totalParcial = baseConcepto + trasladosConcepto.reduce((s, t) => s + t.importe, 0) - retencionesConcepto.reduce((s, r) => s + r.importe, 0);
      desglosePorConcepto.push({ numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion, cantidad, noIdentificacion, valorUnitario, traslados: trasladosConcepto, retenciones: retencionesConcepto, subtotalAcumulado: 0, totalParcial });
    }
  }
  return { desglosePorConcepto, ivaTraslado, ivaRetenido, isrRetenido, baseIVA16, baseIVA0, baseIVAExento, baseNoObjeto, baseObjetoSinDesglose };
}

function extractUUID(xmlDoc) {
  const all = xmlDoc.documentElement?.getElementsByTagName('*');
  if (!all) return 'NO DISPONIBLE';
  for (let i = 0; i < all.length; i++) {
    const tag = (all[i].localName || all[i].nodeName).split(':').pop();
    if (tag === 'TimbreFiscalDigital') return all[i].getAttribute('UUID') || 'NO DISPONIBLE';
  }
  return 'NO DISPONIBLE';
}

function extractCartaPorte(xmlDoc) {
  const all = xmlDoc.documentElement?.getElementsByTagName('*');
  if (!all) return null;
  for (let i = 0; i < all.length; i++) {
    const tag = (all[i].localName || all[i].nodeName).split(':').pop();
    if (tag === 'CartaPorte') return all[i];
  }
  return null;
}

// ── 5. Clasificar Tasa_Detectada (replica de buildTaxRows) ───────────────────
function clasificarTasa(t, tipo, objetoImp) {
  if (objetoImp === '01') return 'NO OBJETO';
  const tfUp = String(t.tipoFactor || '').toUpperCase();
  const imp = String(t.impuesto || '');
  const tNum = Number(t.tasa);
  const isRet = tipo === 'Retencion';

  if (imp === '002' && tfUp === 'TASA' && tNum === 0.16) return 'IVA_16%';
  if (imp === '002' && tfUp === 'TASA' && tNum === 0) return 'IVA_0%';
  if (imp === '002' && tfUp === 'EXENTO') return 'IVA_EXENTO';
  if (imp === '001' && tfUp === 'TASA' && tNum === 0.04 && isRet) return 'ISR_RETENIDO_4%_AUTOTRANSPORTE';
  if (imp === '002' && isRet) return 'IVA_RETENIDO';
  if (imp === '001' && isRet) return 'ISR_RETENIDO';
  return 'INDETERMINADO';
}

// ── 6. Parsear los 5 XMLs ─────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('  PRUEBA LIVE — PARSER XML REAL CON jsdom (= DOMParser browser)');
console.log('============================================================\n');

const parser = new DOMParser();
const resultados = [];

for (const fileName of xmlFiles) {
  const xmlPath = path.join(ROOT, 'demo-xmls', fileName);
  const xmlStr = readFileSync(xmlPath, 'utf-8');
  const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
  const comp = xmlDoc.documentElement;
  const version = comp.getAttribute('Version') || '4.0';
  const uuid = extractUUID(xmlDoc);
  const cpNode = extractCartaPorte(xmlDoc);
  const cartaPorte = cpNode ? 'SI' : 'NO';

  const { desglosePorConcepto, ivaTraslado, ivaRetenido, isrRetenido } = extractTaxesByConcepto(xmlDoc, version);

  resultados.push({ fileName, uuid, cartaPorte, desglosePorConcepto, ivaTraslado, ivaRetenido, isrRetenido });

  console.log(`[XML] ${fileName}`);
  console.log(`  UUID: ${uuid}`);
  console.log(`  Carta Porte: ${cartaPorte}`);
  console.log(`  Conceptos: ${desglosePorConcepto.length}`);

  desglosePorConcepto.forEach((c, i) => {
    console.log(`  Concepto[${i+1}]:`);
    console.log(`    ClaveProdServ:    ${c.claveProdServ}`);
    console.log(`    Descripcion:      ${c.descripcion.substring(0, 40)}`);
    console.log(`    Cantidad:         ${c.cantidad}  ← debe ser número`);
    console.log(`    ValorUnitario:    ${c.valorUnitario}  ← debe ser número`);
    console.log(`    NoIdentificacion: ${c.noIdentificacion || '(vacío en XML)'}  ← si XML tiene el atributo`);
    console.log(`    Importe:          ${c.importe}`);
    console.log(`    ObjetoImp:        ${c.objetoImp}`);
    console.log(`    Traslados: ${c.traslados.length}`);
    c.traslados.forEach((t, ti) => {
      const tasa = clasificarTasa(t, 'Traslado', c.objetoImp);
      console.log(`      [T${ti+1}] Impuesto=${t.impuesto} TipoFactor=${t.tipoFactor} TasaOCuota=${t.tasa} Base=${t.base} Importe=${t.importe} → Tasa_Detectada=${tasa}`);
    });
    c.retenciones.forEach((r, ri) => {
      const tasa = clasificarTasa(r, 'Retencion', c.objetoImp);
      console.log(`      [R${ri+1}] Impuesto=${r.impuesto} TipoFactor=${r.tipoFactor} TasaOCuota=${r.tasa} Base=${r.base} Importe=${r.importe} → Tasa_Detectada=${tasa}`);
    });
  });
  console.log();
}

// ── 7. Generar Excel pequeño de prueba ────────────────────────────────────────
const conceptRows = [];
const taxRows = [];

for (const r of resultados) {
  for (const c of r.desglosePorConcepto) {
    const cantidad = c.cantidad;
    const valorUnitario = c.valorUnitario;
    const importe = c.importe;
    const importeVerificado = Math.round(cantidad * valorUnitario * 100) / 100;
    const diferencia = Math.round((importe - importeVerificado) * 100) / 100;

    conceptRows.push({
      Archivo_XML:                r.fileName,
      UUID:                       r.uuid,
      ClaveProdServ:              c.claveProdServ,
      Concepto:                   c.descripcion,
      Cantidad:                   cantidad,
      ValorUnitario:              valorUnitario,
      NoIdentificacion:           c.noIdentificacion || 'NO VIENE EN XML',
      Importe:                    importe,
      ObjetoImp:                  c.objetoImp,
      Importe_Verificado:         importeVerificado,
      Diferencia_Importe_Concepto: diferencia,
    });

    for (const t of c.traslados) {
      taxRows.push({
        Archivo_XML:        r.fileName,
        UUID:               r.uuid,
        ClaveProdServ:      c.claveProdServ,
        Descripcion:        c.descripcion,
        ObjetoImp:          c.objetoImp,
        Tipo_Impuesto:      'Traslado',
        Base:               t.base,
        Impuesto:           t.impuesto,
        TipoFactor:         t.tipoFactor,
        TasaOCuota:         t.tasa,
        Importe:            t.importe,
        Tasa_Detectada:     clasificarTasa(t, 'Traslado', c.objetoImp),
      });
    }
    for (const ret of c.retenciones) {
      taxRows.push({
        Archivo_XML:        r.fileName,
        UUID:               r.uuid,
        ClaveProdServ:      c.claveProdServ,
        Descripcion:        c.descripcion,
        ObjetoImp:          c.objetoImp,
        Tipo_Impuesto:      'Retencion',
        Base:               ret.base,
        Impuesto:           ret.impuesto,
        TipoFactor:         ret.tipoFactor,
        TasaOCuota:         ret.tasa,
        Importe:            ret.importe,
        Tasa_Detectada:     clasificarTasa(ret, 'Retencion', c.objetoImp),
      });
    }
  }
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conceptRows), 'DETALLE CONCEPTOS XML');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taxRows), 'DETALLE IMPUESTOS CONCEPTO');

const outPath = path.join(ROOT, 'Test_Live_5XMLs.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`[OK] Excel generado: ${outPath}`);

// ── 8. Validación automática ──────────────────────────────────────────────────
console.log('\n============================================================');
console.log('  VALIDACIÓN AUTOMÁTICA DEL EXCEL LIVE');
console.log('============================================================');

const wbOut = XLSX.readFile(outPath);
const conceptosOut = XLSX.utils.sheet_to_json(wbOut.Sheets['DETALLE CONCEPTOS XML'], { defval: '' });
const impuestosOut = XLSX.utils.sheet_to_json(wbOut.Sheets['DETALLE IMPUESTOS CONCEPTO'], { defval: '' });

let ok = true;
const check = (label, value, condition) => {
  const pass = condition(value);
  console.log(`  ${pass ? '✅' : '❌'} ${label}: ${value}`);
  if (!pass) ok = false;
};

// UUID NO DISPONIBLE = 0
const badUUID = conceptosOut.filter(r => r.UUID === 'NO DISPONIBLE' || r.UUID === '').length;
check('UUID NO DISPONIBLE en CONCEPTOS', badUUID, v => v === 0);

// Cantidad poblada (número, no string 'NO VIENE EN XML')
const cantidadPoblada = conceptosOut.filter(r => typeof r.Cantidad === 'number').length;
check('Cantidad poblada (numérica)', cantidadPoblada, v => v === conceptosOut.length);

// ValorUnitario poblado
const vuPoblado = conceptosOut.filter(r => typeof r.ValorUnitario === 'number').length;
check('ValorUnitario poblado (numérico)', vuPoblado, v => v === conceptosOut.length);

// NoIdentificacion poblado (todos los XMLs de prueba tienen el atributo)
const noidPoblado = conceptosOut.filter(r => r.NoIdentificacion !== 'NO VIENE EN XML' && r.NoIdentificacion !== '').length;
check('NoIdentificacion poblado', noidPoblado, v => v === conceptosOut.length);

// Importe_Verificado = Cantidad × ValorUnitario
const impVerif = conceptosOut.filter(r => typeof r.Importe_Verificado === 'number').length;
check('Importe_Verificado calculado', impVerif, v => v === conceptosOut.length);

// Diferencia numérica
const difNum = conceptosOut.filter(r => typeof r.Diferencia_Importe_Concepto === 'number').length;
check('Diferencia_Importe_Concepto calculada', difNum, v => v === conceptosOut.length);

// TipoFactor en impuestos
const tipoFactorOK = impuestosOut.filter(r => r.TipoFactor && r.TipoFactor !== '' && r.TipoFactor !== 'NO VIENE EN XML').length;
check('TipoFactor poblado en IMPUESTOS', tipoFactorOK, v => v === impuestosOut.length);

// TasaOCuota poblada
const tasaOK = impuestosOut.filter(r => r.TasaOCuota !== '' && r.TasaOCuota !== 'NO VIENE EN XML').length;
check('TasaOCuota poblada en IMPUESTOS', tasaOK, v => v === impuestosOut.length);

// Base poblada (numérica > 0)
const baseOK = impuestosOut.filter(r => typeof r.Base === 'number' && r.Base > 0).length;
check('Base poblada (numérica > 0) en IMPUESTOS', baseOK, v => v === impuestosOut.length);

// Importe IVA poblado
const importeOK = impuestosOut.filter(r => typeof r.Importe === 'number' && r.Importe > 0).length;
check('Importe IVA poblado (> 0) en IMPUESTOS', importeOK, v => v === impuestosOut.length);

// Tasa_Detectada correcta (sin INDETERMINADO)
const indetCount = impuestosOut.filter(r => r.Tasa_Detectada === 'INDETERMINADO').length;
check('Tasa_Detectada sin INDETERMINADO', indetCount, v => v === 0);

// IVA_16% correctamente clasificado
const iva16Count = impuestosOut.filter(r => r.Tasa_Detectada === 'IVA_16%').length;
check('IVA_16% clasificado correctamente', iva16Count, v => v === 5); // 5 XMLs × 1 traslado c/u

// Carta Porte (XML 04 debe detectar SI)
const cpResult = resultados.find(r => r.fileName.includes('04'));
check('Carta Porte detectada en XML 04', cpResult?.cartaPorte, v => v === 'SI');

// No Carta Porte en XMLs sin complemento CP
const noCP = resultados.filter(r => !r.fileName.includes('04') && r.cartaPorte === 'NO').length;
check('XMLs sin Carta Porte = NO (4 de 5)', noCP, v => v === 4);

console.log('\n');
console.log(ok ? '  ✅ TODAS LAS VALIDACIONES PASARON — LIVE TEST OK' : '  ❌ HAY VALIDACIONES FALLIDAS');
console.log('============================================================\n');
