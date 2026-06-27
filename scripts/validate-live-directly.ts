import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import * as XLSX from 'xlsx';

// Mock global DOMParser for the engine imports
(global as any).DOMParser = DOMParser;

import {
  detectCFDIVersion,
  parseXMLDate,
  extractReceptorInfo,
  extractCPReceptor,
  extractCfdiRelacionados,
  determinarTipoRealDocumento,
  obtenerReglasAplicables,
  extractTaxesByConcepto,
  validateTotals,
  generateDesglose,
  determineRequiereCartaPorte,
  extractCartaPorteInfo,
  extractPagosInfo,
  detectarEncoding,
  calcularScoreInformativo,
  detectarNomina,
  extractNominaInfo,
  classifyCFDI,
  evaluarTrazabilidad,
  ValidationResult
} from '../client/src/lib/cfdiEngine';

import { applyFiscalRules, reconcilePaymentComplements } from '../client/src/lib/fiscalRules';
import { exportToExcel } from '../client/src/lib/excelExporter';

const FIXTURES_DIR = 'tests/fixtures/demo-xmls';
const OUTPUT_EXCEL = 'dev-outputs/sentinel_live_5xmls_test.xlsx';

const XMLS = [
  '01_FACTURA_CORRECTA.xml',
  '02_ALERTA_EFOS_LISTA_NEGRA.xml',
  '03_ALERTA_FALTA_CARTA_PORTE.xml',
  '04_FACTURA_CON_CARTA_PORTE_OK.xml',
  '05_ERROR_TOTALES_DESCUADRE.xml',
  '06_COMPLEMENTO_PAGO_REP.xml',
  '07_FACTURA_PPD_SIN_COMPLEMENTO.xml'
];

// Helper replica of createErrorResult from useXMLValidator.ts
const createErrorResult = (
  fileName: string, 
  errorMsg: string, 
  giroEmpresa?: string,
  errorGrave: boolean = true,
  warning: boolean = false,
  xmlContent?: string
): ValidationResult => {
  let resultado = "🟢 USABLE";
  if (errorGrave) {
    resultado = "🔴 NO USABLE";
  } else if (warning) {
    resultado = "🟡 ALERTA";
  }

  let uuid = "NO DISPONIBLE";
  let version = "NO DISPONIBLE";
  let tipoCFDI = "NO DISPONIBLE";
  let serie = "SIN SERIE";
  let folio = "SIN FOLIO";
  let fechaEmision = "NO DISPONIBLE";
  let horaEmision = "NO DISPONIBLE";
  let rfcEmisor = "NO DISPONIBLE";
  let nombreEmisor = "NO DISPONIBLE";
  let regimenEmisor = "NO DISPONIBLE";
  let rfcReceptor = "NO DISPONIBLE";
  let nombreReceptor = "NO DISPONIBLE";
  let regimenReceptor = "NO DISPONIBLE";
  let usoCFDI = "NO DISPONIBLE";
  let cpReceptor = "NO DISPONIBLE";
  let subtotal = 0;
  let total = 0;
  let moneda = "MXN";
  let tipoCambio = 1;
  let metodoPago = "NO DISPONIBLE";
  let formaPago = "NO DISPONIBLE";

  if (xmlContent) {
    xmlContent = xmlContent.replace(/^\uFEFF/, '');
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
      const parserError = xmlDoc.getElementsByTagName("parsererror");
      if (parserError.length === 0) {
        const comprobante = xmlDoc.documentElement;
        if (comprobante && (comprobante.localName === "Comprobante" || comprobante.nodeName.includes("Comprobante"))) {
          version = comprobante.getAttribute("Version") || comprobante.getAttribute("version") || "NO DISPONIBLE";
          tipoCFDI = comprobante.getAttribute("TipoDeComprobante") || "NO DISPONIBLE";
          serie = comprobante.getAttribute("Serie") || "SIN SERIE";
          folio = comprobante.getAttribute("Folio") || "SIN FOLIO";
          const fechaStr = comprobante.getAttribute("Fecha") || "NO DISPONIBLE";
          if (fechaStr !== "NO DISPONIBLE") {
            const parts = fechaStr.split("T");
            fechaEmision = parts[0] || "NO DISPONIBLE";
            horaEmision = parts[1]?.substring(0, 8) || "NO DISPONIBLE";
          }
          subtotal = parseFloat(comprobante.getAttribute("SubTotal") || comprobante.getAttribute("subTotal") || "0") || 0;
          total = parseFloat(comprobante.getAttribute("Total") || comprobante.getAttribute("total") || "0") || 0;
          moneda = comprobante.getAttribute("Moneda") || "MXN";
          tipoCambio = parseFloat(comprobante.getAttribute("TipoCambio") || "1") || 1;
          metodoPago = comprobante.getAttribute("MetodoPago") || "NO DISPONIBLE";
          formaPago = comprobante.getAttribute("FormaPago") || "NO DISPONIBLE";

          const emisorNode = xmlDoc.getElementsByTagName("cfdi:Emisor")[0] || xmlDoc.getElementsByTagName("Emisor")[0];
          if (emisorNode) {
            rfcEmisor = emisorNode.getAttribute("Rfc") || emisorNode.getAttribute("rfc") || "NO DISPONIBLE";
            nombreEmisor = emisorNode.getAttribute("Nombre") || emisorNode.getAttribute("nombre") || "NO DISPONIBLE";
            regimenEmisor = emisorNode.getAttribute("RegimenFiscal") || emisorNode.getAttribute("regimenFiscal") || "NO DISPONIBLE";
          }
          const receptorNode = xmlDoc.getElementsByTagName("cfdi:Receptor")[0] || xmlDoc.getElementsByTagName("Receptor")[0];
          if (receptorNode) {
            rfcReceptor = receptorNode.getAttribute("Rfc") || receptorNode.getAttribute("rfc") || "NO DISPONIBLE";
            nombreReceptor = receptorNode.getAttribute("Nombre") || receptorNode.getAttribute("nombre") || "NO DISPONIBLE";
            regimenReceptor = receptorNode.getAttribute("RegimenFiscalReceptor") || receptorNode.getAttribute("regimenFiscalReceptor") || "NO DISPONIBLE";
            usoCFDI = receptorNode.getAttribute("UsoCFDI") || receptorNode.getAttribute("usoCFDI") || "NO DISPONIBLE";
            cpReceptor = receptorNode.getAttribute("DomicilioFiscalReceptor") || receptorNode.getAttribute("domicilioFiscalReceptor") || "NO DISPONIBLE";
          }

          const todosNodos = xmlDoc.getElementsByTagName("*");
          for (let i = 0; i < todosNodos.length; i++) {
            const nodo = todosNodos[i];
            const tagName = nodo.localName || nodo.nodeName;
            if (tagName === "TimbreFiscalDigital") {
              uuid = nodo.getAttribute("UUID") || "NO DISPONIBLE";
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("Falla al pre-parsear XML en createErrorResult:", err);
    }
  }

  return {
    fileName,
    xmlContent,
    uuid,
    versionCFDI: version,
    tipoCFDI,
    serie,
    folio,
    fechaEmision,
    horaEmision,
    añoFiscal: fechaEmision !== "NO DISPONIBLE" ? parseInt(fechaEmision.substring(0, 4), 10) : 0,
    estatusSAT: "No verificado",
    fechaCancelacion: "",
    rfcEmisor,
    nombreEmisor,
    regimenEmisor,
    estadoSATEmisor: "Vigente",
    rfcReceptor,
    nombreReceptor,
    regimenReceptor,
    usoCFDI,
    cpReceptor,
    tieneCfdiRelacionados: "NO",
    tipoRelacion: "NO APLICA",
    uuidRelacionado: "NO APLICA",
    uuids_relacionados: [],
    tipoRealDocumento: "Factura",
    requiereCartaPorte: "NO",
    cartaPorte: "NO",
    cartaPorteCompleta: "NO APLICA",
    versionCartaPorte: "NO APLICA",
    pagosPresente: "NO",
    versionPagos: "NO APLICA",
    pagosValido: "NO APLICA",
    encodingDetectado: "UTF-8",
    complementosDetectados: [],
    scoreInformativo: 0,
    subtotal,
    baseIVA16: 0,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: "SIN_IMPUESTOS",
    ivaTraslado: 0,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total,
    moneda,
    tipoCambio,
    formaPago,
    metodoPago,
    nivelValidacion: "ERROR",
    resultado,
    comentarioFiscal: errorMsg,
    observacionesTecnicas: errorMsg,
    iva: 0,
    isValid: false,
    totalCalculado: 0,
    diferenciaTotales: 0,
    desglosePorConcepto: [],
    desglose: "",
    esNomina: "NO",
    versionNomina: "NO APLICA",
    totalPercepciones: 0,
    totalDeducciones: 0,
    totalOtrosPagos: 0,
    isrRetenidoNomina: 0,
    totalCalculadoNomina: 0,
    observacionesContador: "",
    descuentoGlobal: 0,
    condicionesDePago: "NO VIENE EN XML"
  };
};

const createWarningResult = (
  fileName: string,
  warningMsg: string,
  base: any
): ValidationResult => {
  return {
    ...base,
    fileName,
    resultado: "🟡 ALERTA",
    comentarioFiscal: warningMsg,
    nivelValidacion: "ALERTA",
    isValid: true,
  } as ValidationResult;
};

// Replicate validateSingleXML logic from useXMLValidator.ts without React state and browser dependencies
async function validateSingleXML(fileName: string, xmlContent: string, giroEmpresa?: string): Promise<ValidationResult> {
  xmlContent = xmlContent.replace(/^\uFEFF/, '');
  try {
    const encodingInfo = detectarEncoding(xmlContent);
    if (!encodingInfo.soportado) {
      return createErrorResult(fileName, encodingInfo.errorMsg, giroEmpresa, true, false, xmlContent);
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      return createErrorResult(fileName, "Error al procesar XML: formato inválido", giroEmpresa, true, false, xmlContent);
    }

    const comprobante = xmlDoc.documentElement;
    const version = detectCFDIVersion(xmlContent);

    const versionesValidas = ["2.0", "2.2", "3.0", "3.2", "3.3", "4.0"];
    if (!versionesValidas.includes(version)) {
      return createErrorResult(
        fileName,
        `Versión no soportada: ${version}. Se aceptan CFDI 2.0, 2.2, 3.0, 3.2, 3.3 y 4.0 según contexto histórico SAT.`,
        giroEmpresa,
        true,
        false,
        xmlContent
      );
    }

    let uuid = "NO DISPONIBLE";
    const todosNodos = comprobante?.getElementsByTagName("*");
    if (todosNodos) {
      for (let i = 0; i < todosNodos.length; i++) {
        const nodo = todosNodos[i];
        const tagName = nodo.localName || nodo.nodeName;
        if (tagName === "TimbreFiscalDigital") {
          uuid = nodo.getAttribute("UUID") || "NO DISPONIBLE";
          break;
        }
      }
    }

    const tipoCFDI = comprobante?.getAttribute("TipoDeComprobante") || "NO DISPONIBLE";
    const serie = comprobante?.getAttribute("Serie") || "SIN SERIE";
    const folio = comprobante?.getAttribute("Folio") || "SIN FOLIO";
    const fechaStr = comprobante?.getAttribute("Fecha") || "NO DISPONIBLE";
    const { fecha: fechaEmision, hora: horaEmision } = parseXMLDate(fechaStr);

    const añoFiscal = fechaEmision !== "NO DISPONIBLE" ? parseInt(fechaEmision.substring(0, 4), 10) : 0;
    const reglasAplicables = obtenerReglasAplicables(version, añoFiscal, tipoCFDI);
    const moneda = comprobante?.getAttribute("Moneda") || "MXN";
    const tipoCambio = parseFloat(comprobante?.getAttribute("TipoCambio") || "1");

    let rfcEmisor = "NO DISPONIBLE";
    let nombreEmisor = "NO DISPONIBLE";
    let regimenEmisor = "NO DISPONIBLE";

    const todosElementos = comprobante?.getElementsByTagName("*");
    if (todosElementos) {
      for (let i = 0; i < todosElementos.length; i++) {
        const nodo = todosElementos[i];
        const tagName = nodo.localName || nodo.nodeName;
        if (tagName === "Emisor" || tagName === "cfdi:Emisor") {
          const rfc = nodo.getAttribute("Rfc") || nodo.getAttribute("rfc");
          const nombre = nodo.getAttribute("Nombre") || nodo.getAttribute("nombre");
          const regimen = nodo.getAttribute("RegimenFiscal") || nodo.getAttribute("regimenFiscal");
          if (rfc && rfcEmisor === "NO DISPONIBLE") rfcEmisor = rfc;
          if (nombre && nombreEmisor === "NO DISPONIBLE") nombreEmisor = nombre;
          if (regimen && regimenEmisor === "NO DISPONIBLE") regimenEmisor = regimen;
        }
      }
    }

    const receptorInfo = extractReceptorInfo(xmlDoc);
    let rfcReceptor = receptorInfo.rfc;
    let nombreReceptor = receptorInfo.nombre;
    let regimenReceptor = receptorInfo.regimenFiscal;
    let usoCFDI = receptorInfo.usoCFDI;

    const cpReceptor = extractCPReceptor(xmlDoc, version);
    const { tieneCfdiRelacionados, tipoRelacion, uuidRelacionado, uuids_relacionados } = extractCfdiRelacionados(xmlDoc, xmlContent);
    const tipoRealDocumento = determinarTipoRealDocumento(tipoCFDI, tieneCfdiRelacionados, tipoRelacion);

    if (tipoRealDocumento === "Nota de Crédito" && (tieneCfdiRelacionados === "NO" || tipoRelacion !== "01")) {
      return createWarningResult(fileName, `Nota de Crédito sin TipoRelacion=01. Encontrado: ${tipoRelacion}.`, {
        uuid, tipoCFDI, serie, folio, fechaEmision, horaEmision, añoFiscal, rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor,
        tipoRealDocumento, tieneCfdiRelacionados, tipoRelacion, uuidRelacionado, uuids_relacionados, giroEmpresa
      });
    }

    if (tipoCFDI === "P" && parseFloat(comprobante?.getAttribute("Total") || "0") !== 0) {
      return createErrorResult(fileName, "El total de un REP debe ser 0.00", giroEmpresa, true, false, xmlContent);
    }

    const descuentoGlobal = parseFloat(comprobante?.getAttribute("Descuento") || "0") || 0;
    const condicionesDePago = comprobante?.getAttribute("CondicionesDePago") || "NO VIENE EN XML";

    const requiereCartaPorte = determineRequiereCartaPorte(xmlContent, tipoCFDI, version);
    const cpInfo = extractCartaPorteInfo(xmlContent, version);
    const cartaPortePresente = cpInfo.presente ? "SI" : "NO";
    const cartaPorteCompleta = cpInfo.presente ? (cpInfo.completa ? "SI" : "NO") : "NO APLICA";
    const versionCartaPorte = cpInfo.presente ? cpInfo.version : "NO APLICA";

    const totalXML = parseFloat(comprobante?.getAttribute("Total") || "0") || 0;
    const taxesByConcepto = extractTaxesByConcepto(xmlDoc, version);
    const validation = validateTotals(taxesByConcepto, totalXML, descuentoGlobal);

    const esNomina = detectarNomina(xmlContent, tipoCFDI);
    const nominaInfo = extractNominaInfo(xmlDoc, xmlContent);
    const pagosInfo = extractPagosInfo(xmlContent, tipoCFDI, version, añoFiscal, false, "2.0");

    const formaPago = comprobante?.getAttribute("FormaPago") || "NO DISPONIBLE";
    const metodoPago = comprobante?.getAttribute("MetodoPago") || "NO DISPONIBLE";

    const classification = classifyCFDI(
      xmlContent,
      version,
      tipoCFDI,
      taxesByConcepto,
      validation,
      esNomina,
      nominaInfo,
      pagosInfo,
      cpInfo,
      requiereCartaPorte,
      reglasAplicables.contextoHistorico,
      giroEmpresa
    );

    const objVal: ValidationResult = {
      fileName,
      xmlContent,
      uuid,
      versionCFDI: version,
      tipoCFDI,
      serie,
      folio,
      fechaEmision,
      horaEmision,
      añoFiscal,
      estatusSAT: "Vigente", // simulamos SAT vigente
      fechaCancelacion: "NO APLICA",
      rfcEmisor,
      nombreEmisor,
      regimenEmisor,
      estadoSATEmisor: "Vigente",
      rfcReceptor,
      nombreReceptor,
      regimenReceptor,
      usoCFDI,
      cpReceptor,
      tieneCfdiRelacionados,
      tipoRelacion,
      uuidRelacionado,
      uuids_relacionados,
      tipoRealDocumento,
      requiereCartaPorte,
      cartaPorte: cartaPortePresente,
      cartaPorteCompleta,
      versionCartaPorte,
      pagosPresente: pagosInfo.presente,
      versionPagos: pagosInfo.versionPagos,
      pagosValido: pagosInfo.valido,
      encodingDetectado: "UTF-8",
      complementosDetectados: esNomina ? ["Nómina"] : [],
      scoreInformativo: 85,
      subtotal: taxesByConcepto.subtotal,
      baseIVA16: taxesByConcepto.baseIVA16,
      baseIVA8: taxesByConcepto.baseIVA8,
      baseIVA0: taxesByConcepto.baseIVA0,
      baseIVAExento: taxesByConcepto.baseIVAExento,
      baseNoObjeto: taxesByConcepto.baseNoObjeto ?? 0,
      baseObjetoSinDesglose: taxesByConcepto.baseObjetoSinDesglose ?? 0,
      clasificacionFiscal: taxesByConcepto.clasificacionFiscal ?? "SIN_IMPUESTOS",
      ivaTraslado: taxesByConcepto.ivaTraslado,
      ivaRetenido: taxesByConcepto.ivaRetenido,
      isrRetenido: taxesByConcepto.isrRetenido,
      iepsTraslado: taxesByConcepto.iepsTraslado,
      iepsRetenido: taxesByConcepto.iepsRetenido,
      impuestosLocalesTrasladados: taxesByConcepto.impuestosLocalesTrasladados,
      impuestosLocalesRetenidos: taxesByConcepto.impuestosLocalesRetenidos,
      total: totalXML,
      moneda,
      tipoCambio,
      formaPago,
      metodoPago,
      nivelValidacion: classification.nivelValidacion,
      resultado: classification.resultado,
      comentarioFiscal: classification.comentarioFiscal,
      observacionesTecnicas: "Sincronizado con Motor Fiscal v1.1",
      iva: taxesByConcepto.ivaTraslado,
      isValid: validation.isValid,
      totalCalculado: validation.calculado,
      diferenciaTotales: validation.diferencia,
      desglosePorConcepto: taxesByConcepto.desglosePorConcepto,
      desglose: JSON.stringify(taxesByConcepto.desglosePorConcepto),
      esNomina: esNomina ? "SÍ" : "NO",
      giroEmpresa,
      versionNomina: nominaInfo.versionNomina,
      totalPercepciones: nominaInfo.totalPercepciones,
      totalDeducciones: nominaInfo.totalDeducciones,
      totalOtrosPagos: nominaInfo.totalOtrosPagos,
      isrRetenidoNomina: nominaInfo.isrRetenido,
      totalCalculadoNomina: validation.calculado,
      observacionesContador: "",
      descuentoGlobal,
      condicionesDePago
    };

    const trazabilidadInfo = evaluarTrazabilidad(xmlDoc, xmlContent, objVal);

    const withTraz = {
      ...objVal,
      trazabilidadInfo
    } as ValidationResult;

    const finalResult = applyFiscalRules(withTraz);
    return finalResult;

  } catch (err: any) {
    return createErrorResult(fileName, err.message, giroEmpresa, true, false, xmlContent);
  }
}

async function run() {
  console.log("Iniciando validación directa de XMLs reales...");
  
  const results: ValidationResult[] = [];
  
  for (const file of XMLS) {
    const filePath = path.join(FIXTURES_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`No existe el archivo: ${filePath}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const res = await validateSingleXML(file, content, "Servicios");
    results.push(res);
  }

  // Conciliar complementos
  const reconciled = reconcilePaymentComplements(results);
  
  console.log(`Validación completa. Registros: ${reconciled.length}`);
  
  console.log("=== PROPIEDADES DE RECONCILED ===");
  reconciled.forEach(r => {
    console.log(`File: ${r.fileName}`);
    console.log(`  - fiscalRiskLevel:`, r.fiscalRiskLevel);
    console.log(`  - paymentComplementStatus:`, r.paymentComplementStatus);
    console.log(`  - paymentMethodStatus:`, r.paymentMethodStatus);
  });
  console.log("=================================");

  // Exportar a Excel
  console.log(`Generando Excel en: ${OUTPUT_EXCEL}`);
  exportToExcel(reconciled, OUTPUT_EXCEL);
  console.log("Excel generado exitosamente.");
}

run().catch(console.error);
