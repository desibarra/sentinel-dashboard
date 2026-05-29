import { JSDOM } from 'jsdom';
const dom = new JSDOM("");
(global as any).DOMParser = dom.window.DOMParser;
(global as any).Element = dom.window.Element;
(global as any).Document = dom.window.Document;

import * as XLSX from 'xlsx';
import { exportToExcel } from './client/src/lib/excelExporter.js';
import { validateTotals, classifyCFDI } from './client/src/lib/cfdiEngine.js';
import fs from 'fs';

// Mock XML 1: Tipo E sin relaciones
const xmlE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" TipoDeComprobante="E" Version="4.0" SubTotal="100" Total="116" Moneda="MXN" FormaPago="01" MetodoPago="PUE" CondicionesDePago="Contado">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMISOR TEST" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="RECEPTOR TEST" RegimenFiscalReceptor="601" UsoCFDI="G03" DomicilioFiscalReceptor="00000"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ValorUnitario="100" Importe="100" ObjetoImp="02" Descripcion="Devolucion">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="100" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

// Mock XML 2: Tipo I con Descuento Global
const xmlI = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" TipoDeComprobante="I" Version="4.0" SubTotal="100" Descuento="10" Total="104.4" Moneda="MXN" FormaPago="01" MetodoPago="PUE" CondicionesDePago="Credito 30 dias">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMISOR TEST 2" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="RECEPTOR TEST 2" RegimenFiscalReceptor="601" UsoCFDI="G03" DomicilioFiscalReceptor="00000"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ValorUnitario="100" Importe="100" Descuento="10" ObjetoImp="02" Descripcion="Servicio">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="90" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="14.4"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

// Mock XML 3: Tipo P
const xmlP = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" TipoDeComprobante="P" Version="4.0" SubTotal="0" Total="0" Moneda="XXX">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMISOR TEST 3" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="RECEPTOR TEST 3" RegimenFiscalReceptor="601" UsoCFDI="CP01" DomicilioFiscalReceptor="00000"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ValorUnitario="0" Importe="0" ObjetoImp="01" Descripcion="Pago"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

const taxesE = { subtotal: 100, trasladosTotales: 16, retencionesTotales: 0, impuestosLocalesTrasladados: 0, impuestosLocalesRetenidos: 0, ivaTraslado: 16, desglosePorConcepto: [{ importe: 100, descuento: 0, cantidad: 1, valorUnitario: 100, claveProdServ: "84111506", descripcion: "Devolucion" }] };
const validationE = validateTotals(taxesE, 116, 0);
const classE = classifyCFDI(xmlE, "4.0", "E", taxesE, validationE, false, { totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0, isrRetenido: 0 }, { presente: false, valido: false }, { presente: false, completa: false, version: "" }, "NO", "Actual", "Sin Giro");

const taxesI = { subtotal: 100, trasladosTotales: 14.4, retencionesTotales: 0, impuestosLocalesTrasladados: 0, impuestosLocalesRetenidos: 0, ivaTraslado: 14.4, desglosePorConcepto: [{ importe: 100, descuento: 10, cantidad: 1, valorUnitario: 100, claveProdServ: "84111506", descripcion: "Servicio" }] };
const validationI = validateTotals(taxesI, 104.4, 10);
const classI = classifyCFDI(xmlI, "4.0", "I", taxesI, validationI, false, { totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0, isrRetenido: 0 }, { presente: false, valido: false }, { presente: false, completa: false, version: "" }, "NO", "Actual", "Sin Giro");

const taxesP = { subtotal: 0, trasladosTotales: 0, retencionesTotales: 0, impuestosLocalesTrasladados: 0, impuestosLocalesRetenidos: 0, ivaTraslado: 0, desglosePorConcepto: [{ importe: 0, descuento: 0, cantidad: 1, valorUnitario: 0, claveProdServ: "84111506", descripcion: "Pago" }] };
const validationP = validateTotals(taxesP, 0, 0);
const classP = classifyCFDI(xmlP, "4.0", "P", taxesP, validationP, false, { totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0, isrRetenido: 0 }, { presente: true, valido: true, versionPagos: "2.0" }, { presente: false, completa: false, version: "" }, "NO", "Actual", "Sin Giro");

const results = [
  {
    uuid: "UUID-E", fileName: "Egreso.xml", xmlContent: xmlE, tipoCFDI: "E", subtotal: 100, total: 116, moneda: "MXN", descuentoGlobal: 0, condicionesDePago: "Contado", desglosePorConcepto: taxesE.desglosePorConcepto, resultado: classE.resultado, comentarioFiscal: classE.comentarioFiscal, estatusSAT: "Vigente", rfcEmisor: "XAXX010101000", rfcReceptor: "XEXX010101000"
  },
  {
    uuid: "UUID-I", fileName: "Ingreso.xml", xmlContent: xmlI, tipoCFDI: "I", subtotal: 100, total: 104.4, moneda: "MXN", descuentoGlobal: 10, condicionesDePago: "Credito 30 dias", desglosePorConcepto: taxesI.desglosePorConcepto, resultado: classI.resultado, comentarioFiscal: classI.comentarioFiscal, estatusSAT: "Vigente", rfcEmisor: "XAXX010101000", rfcReceptor: "XEXX010101000"
  },
  {
    uuid: "UUID-P", fileName: "Pago.xml", xmlContent: xmlP, tipoCFDI: "P", subtotal: 0, total: 0, moneda: "XXX", descuentoGlobal: 0, condicionesDePago: "NO VIENE EN XML", desglosePorConcepto: taxesP.desglosePorConcepto, resultado: classP.resultado, comentarioFiscal: classP.comentarioFiscal, estatusSAT: "Vigente", rfcEmisor: "XAXX010101000", rfcReceptor: "XEXX010101000", trazabilidadInfo: { observacionSAT: "ESTATUS NO APLICABLE (REP)" }
  }
];

console.log("=== EXPORTING EXCEL ===");
exportToExcel(results as any, "test_output.xlsx");

setTimeout(() => {
    console.log("=== VALIDATING EXCEL ===");
    const wb = XLSX.read(fs.readFileSync("test_output.xlsx"), {type: 'buffer'});
    console.log("Hojas disponibles:", wb.SheetNames);
    
    // Check DETALLE FORENSE POR CFDI
    const forenseSheet = wb.Sheets["DETALLE FORENSE POR CFDI"];
    const forenseData = XLSX.utils.sheet_to_json(forenseSheet);
    console.log("\\nColumnas en hoja Forense (muestra):");
    const cols = Object.keys(forenseData[0] || {});
    console.log(cols.filter(c => c.includes("Descuento") || c.includes("Condiciones")));
    
    console.log("\\nFilas en hoja Forense:");
    forenseData.forEach((r: any) => {
        console.log(`- UUID: ${r.UUID}, Tipo: ${r.Tipo_CFDI}, DescuentoGlobal: ${r.Descuento_Global}, DescuentoConceptos: ${r.Descuento_Conceptos}, Diff: ${r.Diferencia_Descuento}, CondPago: ${r.CondicionesDePago}`);
    });

    // Check DETALLE CONCEPTOS XML
    const conceptosSheet = wb.Sheets["DETALLE CONCEPTOS XML"];
    const conceptosData = XLSX.utils.sheet_to_json(conceptosSheet);
    console.log("\\nDetalle Conceptos:");
    conceptosData.forEach((r: any) => {
        console.log(`- UUID: ${r.UUID}, Concepto: ${r.Concepto}, Importe: ${r.Importe}, Descuento: ${r.Descuento}`);
    });

    console.log("\\n=== MAT-06 ===");
    console.log("Comentario:", classE.comentarioFiscal);

    console.log("\\n=== DESCUENTO GLOBAL ===");
    console.log("isValid:", validationI.isValid, "Diff:", validationI.diferencia, "Explicación:", validationI.explicacion);

}, 1000);
