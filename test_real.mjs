import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import * as XLSX from 'xlsx';

// Mock variables from cfdiEngine logic, simplified to just extract what we need
function extractData(xmlContent, fileName) {
  const dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
  const xmlDoc = dom.window.document;
  
  const comprobante = xmlDoc.getElementsByTagName('cfdi:Comprobante')[0] || xmlDoc.getElementsByTagName('Comprobante')[0];
  const emisor = xmlDoc.getElementsByTagName('cfdi:Emisor')[0] || xmlDoc.getElementsByTagName('Emisor')[0];
  const receptor = xmlDoc.getElementsByTagName('cfdi:Receptor')[0] || xmlDoc.getElementsByTagName('Receptor')[0];
  const conceptos = Array.from(xmlDoc.getElementsByTagName('cfdi:Concepto') || xmlDoc.getElementsByTagName('Concepto'));
  
  const tipoCFDI = comprobante?.getAttribute('TipoDeComprobante') || 'I';
  const exportacion = comprobante?.getAttribute('Exportacion') || 'NO DISPONIBLE';
  
  const desglosePorConcepto = conceptos.map(c => ({
    concepto: c.getAttribute('Descripcion') || 'Sin desc',
    objetoImp: c.getAttribute('ObjetoImp') || '01'
  }));

  let tieneCartaPorte = (xmlDoc.getElementsByTagName('cartaporte20:CartaPorte').length > 0 || xmlDoc.getElementsByTagName('cartaporte30:CartaPorte').length > 0 || xmlDoc.getElementsByTagName('cartaporte31:CartaPorte').length > 0) ? 'S?' : 'No';
  
  let pedimentosStr = "REQUIERE CAPTURA/IMPORTACION";
  let tienePedimento = "No";
  if (xmlContent.includes("NumeroPedimento") || xmlContent.includes("NumPedimento")) {
      tienePedimento = "S?";
      const pedMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g) || xmlContent.match(/NumPedimento="([^"]+)"/g);
      if (pedMatch) {
          pedimentosStr = Array.from(new Set(pedMatch.map(m => m.split('"')[1]))).join(" | ");
      } else {
          pedimentosStr = "Detectado (sin detalle)";
      }
  }

  return {
    fileName,
    uuid: 'TEST-UUID-' + Math.random().toString(36).substr(2, 9),
    tipoCFDI,
    subtotal: 100, total: 116, ivaTraslado: 16, baseIVA0: 0,
    desglosePorConcepto,
    trazabilidadInfo: {
      exportacion,
      tieneCartaPorte,
      tieneOrigen: tieneCartaPorte === 'S?' ? 'S?' : 'NO VIENE EN XML',
      tieneDestino: tieneCartaPorte === 'S?' ? 'S?' : 'NO VIENE EN XML',
      tienePedimento,
      pedimento: pedimentosStr,
      tieneDoda: 'No',
      numeroDodaIntegracion: 'NO VIENE EN XML',
      diagnosticoTasa0: 'NO APLICA',
      accionRecomendadaTasa0: 'NO APLICA',
      datosFaltantes: tieneCartaPorte === 'No' ? 'Carta Porte' : 'NO APLICA',
      fuenteExternaRequerida: 'REQUIERE CRUCE EXTERNO',
      diagnosticoDatosFaltantes: 'XML B?SICO',
      accionRecomendadaDatosFaltantes: 'Revisar',
      nivelExpediente: 'SOPORTE FISCAL PARCIAL',
      identificadorBancario: 'REQUIERE IMPORTACION',
      banco: 'REQUIERE CAPTURA',
      folioTransferencia: 'REQUIERE CAPTURA',
      fechaCobro: 'REQUIERE CAPTURA',
      estadoDeCuenta: 'REQUIERE IMPORTACION'
    }
  };
}

const files = [
  'test-cfdi-cedular.xml',
  'test-cfdi-ejemplo.xml',
  'demo-xmls/01_FACTURA_CORRECTA.xml',
  'demo-xmls/02_ALERTA_EFOS_LISTA_NEGRA.xml',
  'demo-xmls/03_ALERTA_FALTA_CARTA_PORTE.xml',
  'demo-xmls/04_FACTURA_CON_CARTA_PORTE_OK.xml',
  'demo-xmls/05_ERROR_TOTALES_DESCUADRE.xml',
  'test-xmls/693957F0-2141-4116-A373-C4EDEC85AF82.xml'
];

const results = [];
for (const file of files) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    results.push(extractData(content, file));
  }
}

console.log(Total CFDI procesados: );

// Test validation logic
for (const r of results) {
  const conceptosUnicos = r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map(c => c.concepto))).join(' | ') : 'NO VIENE EN XML';
  console.log(File: );
  console.log(Exportacion (Raiz): );
  console.log(Conceptos (Limpios): );
  console.log(Pedimento (Limpio): );
  console.log('---');
}

