import { useState } from "react";
import { UploadedFile } from "@/components/UploadZone";
import { checkCFDIStatusSAT } from "@/utils/satStatusValidator";
import { checkRFCBlacklist, BlacklistValidation } from "@/utils/blacklistValidator"; // Nuevo

export interface ConceptoDesglose {
  numero: number;
  importe: number;
  traslados: Array<{ impuesto: string; tasa: string; importe: number }>;
  retenciones: Array<{ impuesto: string; tasa: string; importe: number }>;
  subtotalAcumulado: number;
  totalParcial: number;
}

export interface ValidationResult {
  fileName: string;
  uuid: string;
  versionCFDI: string;
  tipoCFDI: string;
  serie: string;
  folio: string;
  fechaEmision: string;
  horaEmision: string;
  añoFiscal: number;
  estatusSAT: string;
  fechaCancelacion: string;
  // ✅ SKILL - LISTAS NEGRAS
  rfcEmisorBlacklist?: BlacklistValidation;
  rfcReceptorBlacklist?: BlacklistValidation;
  cfdiSustituido: string;
  uuidSustitucion: string;
  rfcEmisor: string;
  nombreEmisor: string;
  regimenEmisor: string;
  estadoSATEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  regimenReceptor: string;
  cpReceptor: string;
  tieneCfdiRelacionados: string;
  tipoRelacion: string;
  uuidRelacionado: string;
  tipoRealDocumento: string;
  requiereCartaPorte: string;
  cartaPorte: string;
  cartaPorteCompleta: string;
  versionCartaPorte: string;
  pagosPresente: string;
  versionPagos: string;
  pagosValido: string;
  encodingDetectado: string;
  complementosDetectados: string[];
  scoreInformativo: number;
  subtotal: number;
  baseIVA16: number;
  baseIVA8: number;
  baseIVA0: number;
  baseIVAExento: number;
  ivaTraslado: number;
  ivaRetenido: number;
  isrRetenido: number;
  iepsTraslado: number;
  iepsRetenido: number;
  impuestosLocalesTrasladados: number;
  impuestosLocalesRetenidos: number;
  total: number;
  moneda: string;
  tipoCambio: number;
  formaPago: string;
  metodoPago: string;
  nivelValidacion: string;
  resultado: string;
  comentarioFiscal: string;
  observacionesTecnicas: string;
  iva: number;
  isValid: boolean;
  totalCalculado: number;
  diferenciaTotales: number;
  desglosePorConcepto: ConceptoDesglose[];
  desglose: string;
  esNomina: string;
  versionNomina: string;
  totalPercepciones: number;
  totalDeducciones: number;
  totalOtrosPagos: number;
  isrRetenidoNomina: number;
  totalCalculadoNomina: number;
}

export function useXMLValidator() {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // ✅ PRODUCCIÓN: Procesamiento por LOTES para evitar congelamiento
  const validateXMLFiles = async (files: UploadedFile[], onProgressUpdate?: (current: number, total: number) => void) => {
    setIsValidating(true);
    setProgress({ current: 0, total: files.length });

    const BATCH_SIZE = 20; // Procesar 20 XMLs por lote
    const BATCH_DELAY = 50; // 50ms entre lotes para no bloquear UI
    const XML_TIMEOUT = 10000; // 10 segundos máximo por XML

    const allResults: ValidationResult[] = [];

    // Procesar en lotes
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      // Procesar lote actual
      const batchPromises = batch.map(async (file) => {
        if (!file.content) return null;

        try {
          // Timeout de seguridad por XML
          const result = await Promise.race([
            validateSingleXML(file.name, file.content),
            new Promise<ValidationResult>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout: XML tomó demasiado tiempo")), XML_TIMEOUT)
            )
          ]);
          return result;
        } catch (error) {
          console.error(`Error validating ${file.name}:`, error);
          // Retornar error controlado en lugar de detener todo
          return createErrorResult(
            file.name,
            error instanceof Error && error.message.includes("Timeout")
              ? "Error: Tiempo de procesamiento excedido"
              : "Error al procesar archivo"
          );
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter((r): r is ValidationResult => r !== null);
      allResults.push(...validResults);

      // Actualizar progreso
      const currentProgress = Math.min(i + BATCH_SIZE, files.length);
      setProgress({ current: currentProgress, total: files.length });
      if (onProgressUpdate) {
        onProgressUpdate(currentProgress, files.length);
      }

      // Actualizar resultados incrementalmente para feedback visual
      setValidationResults((prev) => [...prev, ...validResults]);

      // Delay entre lotes para permitir que el navegador respire
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    setIsValidating(false);
    setProgress({ current: 0, total: 0 });
    return allResults;
  };

  const detectCFDIVersion = (xmlContent: string): string => {
    const versionMatch = xmlContent.match(/Version="([^"]+)"/);
    return versionMatch ? versionMatch[1] : "DESCONOCIDA";
  };

  const parseXMLDate = (dateStr: string): { fecha: string; hora: string } => {
    if (!dateStr) return { fecha: "NO DISPONIBLE", hora: "NO DISPONIBLE" };

    const parts = dateStr.split("T");
    const fecha = parts[0] || "NO DISPONIBLE";
    const hora = parts[1]?.substring(0, 8) || "NO DISPONIBLE";

    return { fecha, hora };
  };

  const extractCPReceptor = (xmlDoc: XMLDocument, version: string): string => {
    const todosNodos = xmlDoc.documentElement?.getElementsByTagName("*");

    if (todosNodos) {
      for (let i = 0; i < todosNodos.length; i++) {
        const nodo = todosNodos[i];
        const tagName = nodo.localName || nodo.nodeName;

        // En CFDI 4.0, buscar DomicilioFiscalReceptor
        if (version === "4.0" && tagName === "Receptor") {
          const cp = nodo.getAttribute("DomicilioFiscalReceptor");
          if (cp) return cp;
        }

        // Buscar en cualquier nodo con atributo CodigoPostal o codigoPostal
        if (nodo.hasAttribute("CodigoPostal")) {
          return nodo.getAttribute("CodigoPostal") || "NO DISPONIBLE";
        }
        if (nodo.hasAttribute("codigoPostal")) {
          return nodo.getAttribute("codigoPostal") || "NO DISPONIBLE";
        }
      }
    }

    return "NO DISPONIBLE";
  };

  const extractCfdiRelacionados = (xmlDoc: XMLDocument, xmlContent: string): {
    tieneCfdiRelacionados: string;
    tipoRelacion: string;
    uuidRelacionado: string;
  } => {
    // ✅ SKILL sentinel-express-pro v1.0.0 - CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)
    // Detectar nodo CfdiRelacionados para clasificación de documentos (NC, ND, Sustitución)
    const tieneCfdiRelacionados = xmlContent.includes("CfdiRelacionados");

    if (!tieneCfdiRelacionados) {
      return {
        tieneCfdiRelacionados: "NO",
        tipoRelacion: "NO APLICA",
        uuidRelacionado: "NO APLICA"
      };
    }

    // Extraer TipoRelacion (01=NC, 02=ND, 03=Devolución, 04=Sustitución, etc.)
    let tipoRelacion = "NO DISPONIBLE";
    const tipoRelacionMatch = xmlContent.match(/TipoRelacion="(\d{2})"/);
    if (tipoRelacionMatch) {
      tipoRelacion = tipoRelacionMatch[1];
    }

    // Extraer primer UUID relacionado
    let uuidRelacionado = "NO DISPONIBLE";
    const uuidMatch = xmlContent.match(/CfdiRelacionado[^>]*UUID="([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})"/);
    if (uuidMatch) {
      uuidRelacionado = uuidMatch[1].toUpperCase();
    }

    return {
      tieneCfdiRelacionados: "SÍ",
      tipoRelacion,
      uuidRelacionado
    };
  };

  const determinarTipoRealDocumento = (
    tipoCFDI: string,
    tieneCfdiRelacionados: string,
    tipoRelacion: string
  ): string => {
    // ✅ SKILL sentinel-express-pro v1.0.0 - CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)
    // Clasificar tipo real basado en TipoDeComprobante + TipoRelacion (si existe)
    // NO validar montos, NO exigir TipoRelacion, solo clasificar si está presente

    // Nota de Cargo: Tipo I + TipoRelacion=02
    if (tipoCFDI === "I" && tieneCfdiRelacionados === "SÍ" && tipoRelacion === "02") {
      return "Nota de Cargo";
    }

    // Nota de Crédito: Tipo E + TipoRelacion=01
    if (tipoCFDI === "E" && tieneCfdiRelacionados === "SÍ" && tipoRelacion === "01") {
      return "Nota de Crédito";
    }

    // Egreso sin TipoRelacion específico
    if (tipoCFDI === "E") {
      return "Egreso";
    }

    // Pago (REP): Tipo P (sin validar Total=0)
    if (tipoCFDI === "P") {
      return "Pago (REP)";
    }

    // Nómina: Tipo N
    if (tipoCFDI === "N") {
      return "Nómina";
    }

    // Traslado: Tipo T
    if (tipoCFDI === "T") {
      return "Traslado";
    }

    // Factura: Tipo I (por defecto)
    if (tipoCFDI === "I") {
      return "Factura";
    }

    return "Desconocido";
  };

  const obtenerReglasAplicables = (
    version: string,
    añoFiscal: number,
    tipoCFDI: string
  ): {
    requiereCartaPorte: boolean;
    requiereComplementoPagos: boolean;
    versionPagosEsperada: string;
    validacionesAplicables: string[];
    contextoHistorico: string;
  } => {
    // ✅ SKILL sentinel-express-pro v1.0.0 - PRINCIPIOS FUNDAMENTALES: Contexto temporal
    // Seleccionar reglas SAT según año fiscal + versión CFDI
    // Si no aplica → NO APLICA, no ERROR
    // NUNCA aplicar reglas retroactivas

    // CFDI 2.x/3.0/3.2: Reglas históricas 2010-2016
    if (["2.0", "2.2", "3.0", "3.2"].includes(version)) {
      return {
        requiereCartaPorte: false, // No existía antes de 2022
        requiereComplementoPagos: false, // No existía Pagos 1.0/2.0
        versionPagosEsperada: "NO APLICA",
        validacionesAplicables: ["estructural", "totales", "campos-obligatorios"],
        contextoHistorico: `CFDI ${version} (${añoFiscal}): Reglas históricas SAT ${añoFiscal}, sin Carta Porte ni Pagos`
      };
    }

    // CFDI 3.3 (2017-2021): Era pre-Carta Porte
    if (version === "3.3") {
      return {
        requiereCartaPorte: false, // Carta Porte desde 2022 con CFDI 4.0
        requiereComplementoPagos: añoFiscal >= 2018 && tipoCFDI === "P", // Pagos 1.0 desde junio 2018
        versionPagosEsperada: añoFiscal >= 2018 ? "1.0" : "NO APLICA",
        validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado"],
        contextoHistorico: `CFDI 3.3 (${añoFiscal}): Reglas SAT ${añoFiscal}, ${añoFiscal >= 2018 ? 'Pagos 1.0 disponible' : 'Pre-Pagos'}, sin Carta Porte`
      };
    }

    // CFDI 4.0 (2022-actual): Era Carta Porte + Pagos 2.0
    if (version === "4.0") {
      return {
        requiereCartaPorte: ["T", "I"].includes(tipoCFDI), // Obligatoria para Traslado e Ingreso según Anexo 20
        requiereComplementoPagos: tipoCFDI === "P", // Pagos 2.0 obligatorio
        versionPagosEsperada: tipoCFDI === "P" ? "2.0" : "NO APLICA",
        validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado", "carta-porte"],
        contextoHistorico: `CFDI 4.0 (${añoFiscal}): Reglas SAT vigentes ${añoFiscal}, Carta Porte obligatoria según tipo, Pagos 2.0`
      };
    }

    // Versión desconocida (no debería llegar aquí)
    return {
      requiereCartaPorte: false,
      requiereComplementoPagos: false,
      versionPagosEsperada: "NO APLICA",
      validacionesAplicables: ["estructural"],
      contextoHistorico: `Versión ${version} no reconocida, validación mínima`
    };
  };

  const extractTaxesByConcepto = (xmlDoc: XMLDocument, version: string) => {
    let subtotalCalculado = 0;
    let baseIVA16 = 0, baseIVA8 = 0, baseIVA0 = 0, baseIVAExento = 0;
    let trasladosTotales = 0, retencionesTotales = 0;
    let ivaTraslado = 0, ivaRetenido = 0;
    let isrRetenido = 0;
    let iepsTraslado = 0, iepsRetenido = 0;
    let impuestosLocalesTrasladados = 0, impuestosLocalesRetenidos = 0;

    const desglosePorConcepto: ConceptoDesglose[] = [];
    const comprobante = xmlDoc.documentElement;

    // PASO 1: LEER IMPUESTOS POR CONCEPTO (FUENTE PRIMARIA SAT)
    // Usar getElementsByTagName para evitar problemas de namespace
    const conceptos = comprobante?.getElementsByTagName("*");
    let conceptoNumero = 0;

    if (conceptos) {
      for (let i = 0; i < conceptos.length; i++) {
        const nodo = conceptos[i];
        const tagName = nodo.localName || nodo.nodeName;

        // Solo procesar nodos Concepto
        if (tagName !== "Concepto") continue;

        conceptoNumero++;

        // Sumar importe del concepto al subtotal (FUENTE PRIMARIA)
        const importe = parseFloat(nodo.getAttribute("Importe") || "0");
        subtotalCalculado += importe;

        const trasladosConcepto: Array<{ impuesto: string; tasa: string; importe: number }> = [];
        const retencionesConcepto: Array<{ impuesto: string; tasa: string; importe: number }> = [];

        // Buscar nodo de Impuestos dentro del concepto
        const hijosConcepto = nodo.children;
        let impuestosConcepto: Element | null = null;

        for (let j = 0; j < hijosConcepto.length; j++) {
          const hijo = hijosConcepto[j];
          const hijoTag = hijo.localName || hijo.nodeName;
          if (hijoTag === "Impuestos") {
            impuestosConcepto = hijo;
            break;
          }
        }

        if (impuestosConcepto) {
          // TRASLADOS por concepto
          const trasladosNodes = impuestosConcepto.getElementsByTagName("*");
          for (let k = 0; k < trasladosNodes.length; k++) {
            const nodoImpuesto = trasladosNodes[k];
            const tagImpuesto = nodoImpuesto.localName || nodoImpuesto.nodeName;

            if (tagImpuesto === "Traslado") {
              const tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0";
              const base = parseFloat(nodoImpuesto.getAttribute("Base") || "0");
              const importeTraslado = parseFloat(nodoImpuesto.getAttribute("Importe") || "0");
              const impuesto = nodoImpuesto.getAttribute("Impuesto") || "002";

              trasladosTotales += importeTraslado;
              trasladosConcepto.push({ impuesto, tasa, importe: importeTraslado });

              if (impuesto === "002") { // IVA
                if (tasa === "0.16" || tasa === "0.160000") baseIVA16 += base;
                else if (tasa === "0.08" || tasa === "0.080000") baseIVA8 += base;
                else if (tasa === "0.00" || tasa === "0.000000") baseIVA0 += base;
                ivaTraslado += importeTraslado;
              } else if (impuesto === "003") { // IEPS
                iepsTraslado += importeTraslado;
              }
            }
          }

          // RETENCIONES por concepto
          for (let k = 0; k < trasladosNodes.length; k++) {
            const nodoImpuesto = trasladosNodes[k];
            const tagImpuesto = nodoImpuesto.localName || nodoImpuesto.nodeName;

            if (tagImpuesto === "Retencion") {
              const impuesto = nodoImpuesto.getAttribute("Impuesto") || "002";
              const importeRetencion = parseFloat(nodoImpuesto.getAttribute("Importe") || "0");
              const tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0";

              retencionesTotales += importeRetencion;
              retencionesConcepto.push({ impuesto, tasa, importe: importeRetencion });

              if (impuesto === "002") { // IVA retenido
                ivaRetenido += importeRetencion;
              } else if (impuesto === "001") { // ISR retenido
                isrRetenido += importeRetencion;
              } else if (impuesto === "003") { // IEPS retenido
                iepsRetenido += importeRetencion;
              }
            }
          }
        }

        // Calcular total parcial del concepto
        const totalParcial = importe + trasladosConcepto.reduce((sum, t) => sum + t.importe, 0) - retencionesConcepto.reduce((sum, r) => sum + r.importe, 0);

        desglosePorConcepto.push({
          numero: conceptoNumero,
          importe,
          traslados: trasladosConcepto,
          retenciones: retencionesConcepto,
          subtotalAcumulado: subtotalCalculado,
          totalParcial,
        });
      }
    }

    // PASO 2: IMPUESTOS LOCALES (CEDULAR) - Buscar complemento implocal:ImpuestosLocales
    // Ruta: cfdi:Complemento > implocal:ImpuestosLocales
    const todosNodos = comprobante?.getElementsByTagName("*");
    if (todosNodos) {
      for (let i = 0; i < todosNodos.length; i++) {
        const nodo = todosNodos[i];
        const tagName = nodo.localName || nodo.nodeName;

        // Buscar nodo ImpuestosLocales (con o sin namespace)
        if (tagName === "ImpuestosLocales") {
          // Leer atributos totales si existen
          const totalTrasladados = nodo.getAttribute("TotaldeTraslados") || nodo.getAttribute("TotalImpuestosLocalesTrasladados");
          const totalRetenidos = nodo.getAttribute("TotaldeRetenciones") || nodo.getAttribute("TotalImpuestosLocalesRetenidos");

          if (totalTrasladados) impuestosLocalesTrasladados += parseFloat(totalTrasladados);
          if (totalRetenidos) impuestosLocalesRetenidos += parseFloat(totalRetenidos);

          // Leer nodos hijos para desglose detallado
          const hijosImpLocales = nodo.children;
          for (let j = 0; j < hijosImpLocales.length; j++) {
            const hijo = hijosImpLocales[j];
            const hijoTag = hijo.localName || hijo.nodeName;

            // TRASLADOS LOCALES
            if (hijoTag === "TrasladosLocales") {
              const impuesto = hijo.getAttribute("ImpLocTrasladado") || "";
              const tasa = hijo.getAttribute("TasadeTraslado") || "0";
              const importe = parseFloat(hijo.getAttribute("Importe") || "0");

              if (importe > 0 && !totalTrasladados) {
                impuestosLocalesTrasladados += importe;
              }
            }

            // RETENCIONES LOCALES (CEDULAR)
            if (hijoTag === "RetencionesLocales") {
              const impuesto = hijo.getAttribute("ImpLocRetenido") || "";
              const tasa = hijo.getAttribute("TasadeRetencion") || "0";
              const importe = parseFloat(hijo.getAttribute("Importe") || "0");

              if (importe > 0 && !totalRetenidos) {
                impuestosLocalesRetenidos += importe;
              }
            }
          }

          break; // Solo debe haber un nodo ImpuestosLocales
        }

        // Fallback: buscar por atributos directos (compatibilidad)
        if (nodo.hasAttribute("TotalImpuestosLocalesTrasladados") || nodo.hasAttribute("TotalImpuestosLocalesRetenidos")) {
          const trasladados = nodo.getAttribute("TotalImpuestosLocalesTrasladados");
          const retenidos = nodo.getAttribute("TotalImpuestosLocalesRetenidos");
          if (trasladados && impuestosLocalesTrasladados === 0) impuestosLocalesTrasladados = parseFloat(trasladados);
          if (retenidos && impuestosLocalesRetenidos === 0) impuestosLocalesRetenidos = parseFloat(retenidos);
        }
      }
    }

    // Redondear a 2 decimales
    return {
      subtotal: Math.round(subtotalCalculado * 100) / 100,
      baseIVA16: Math.round(baseIVA16 * 100) / 100,
      baseIVA8: Math.round(baseIVA8 * 100) / 100,
      baseIVA0: Math.round(baseIVA0 * 100) / 100,
      baseIVAExento: Math.round(baseIVAExento * 100) / 100,
      ivaTraslado: Math.round(ivaTraslado * 100) / 100,
      ivaRetenido: Math.round(ivaRetenido * 100) / 100,
      isrRetenido: Math.round(isrRetenido * 100) / 100,
      iepsTraslado: Math.round(iepsTraslado * 100) / 100,
      iepsRetenido: Math.round(iepsRetenido * 100) / 100,
      impuestosLocalesTrasladados: Math.round(impuestosLocalesTrasladados * 100) / 100,
      impuestosLocalesRetenidos: Math.round(impuestosLocalesRetenidos * 100) / 100,
      trasladosTotales: Math.round(trasladosTotales * 100) / 100,
      retencionesTotales: Math.round(retencionesTotales * 100) / 100,
      desglosePorConcepto,
    };
  };

  const validateTotals = (
    taxesByConcepto: ReturnType<typeof extractTaxesByConcepto>,
    totalXML: number
  ): { isValid: boolean; calculado: number; diferencia: number; explicacion: string } => {
    // FÓRMULA ÚNICA Y CORRECTA DEL SAT:
    // TOTAL = Subtotal + Traslados - Retenciones + Locales Trasladados - Locales Retenidos

    const totalCalculado =
      taxesByConcepto.subtotal +
      taxesByConcepto.trasladosTotales -
      taxesByConcepto.retencionesTotales +
      taxesByConcepto.impuestosLocalesTrasladados -
      taxesByConcepto.impuestosLocalesRetenidos;

    const diferencia = Math.abs(totalCalculado - totalXML);
    const tolerancia = 0.01; // SAT permite redondeo ≤ 0.01

    const explicacion = `Subtotal: ${taxesByConcepto.subtotal} + Traslados: ${taxesByConcepto.trasladosTotales} - Retenciones: ${taxesByConcepto.retencionesTotales} + Impuestos Locales Trasladados: ${taxesByConcepto.impuestosLocalesTrasladados} - Impuestos Locales Retenidos: ${taxesByConcepto.impuestosLocalesRetenidos} = ${totalCalculado}`;

    return {
      isValid: diferencia <= tolerancia,
      calculado: Math.round(totalCalculado * 100) / 100,
      diferencia: Math.round(diferencia * 100) / 100,
      explicacion,
    };
  };

  const generateDesglose = (result: ReturnType<typeof extractTaxesByConcepto>): string => {
    let desglose = "DESGLOSE POR CONCEPTO:\n\n";

    result.desglosePorConcepto.forEach((concepto) => {
      desglose += `Concepto ${concepto.numero}\n`;
      desglose += `  Importe: $${concepto.importe.toFixed(2)}\n`;

      if (concepto.traslados.length > 0) {
        desglose += `  Traslados:\n`;
        concepto.traslados.forEach((t) => {
          desglose += `    - Impuesto ${t.impuesto}, Tasa ${t.tasa}: $${t.importe.toFixed(2)}\n`;
        });
      }

      if (concepto.retenciones.length > 0) {
        desglose += `  Retenciones:\n`;
        concepto.retenciones.forEach((r) => {
          desglose += `    - Impuesto ${r.impuesto}, Tasa ${r.tasa}: $${r.importe.toFixed(2)}\n`;
        });
      }

      desglose += `  Subtotal acumulado: $${concepto.subtotalAcumulado.toFixed(2)}\n`;
      desglose += `  Total parcial: $${concepto.totalParcial.toFixed(2)}\n\n`;
    });

    desglose += `RESUMEN DEL CFDI:\n`;
    desglose += `  Subtotal calculado: $${result.subtotal.toFixed(2)}\n`;
    desglose += `  Traslados federales: $${result.trasladosTotales.toFixed(2)}\n`;
    desglose += `  Retenciones federales: $${result.retencionesTotales.toFixed(2)}\n`;

    if (result.impuestosLocalesTrasladados > 0 || result.impuestosLocalesRetenidos > 0) {
      desglose += `\nIMPUESTOS LOCALES:\n`;
      if (result.impuestosLocalesTrasladados > 0) {
        desglose += `  Impuestos locales trasladados: $${result.impuestosLocalesTrasladados.toFixed(2)}\n`;
      }
      if (result.impuestosLocalesRetenidos > 0) {
        desglose += `  Impuestos locales retenidos (CEDULAR): $${result.impuestosLocalesRetenidos.toFixed(2)}\n`;
      }
    }

    return desglose;
  };

  const determineRequiereCartaPorte = (xmlContent: string, tipoCFDI: string, version: string): string => {
    // ✅ PRODUCCIÓN: Carta Porte SOLO es obligatoria cuando hay EVIDENCIA COMPROBABLE de transporte
    if (version === "3.3") {
      return "NO APLICA";
    }

    const esIngreso = tipoCFDI === "I";
    const esTraslado = tipoCFDI === "T";
    const esPago = tipoCFDI === "P";
    const esEgreso = tipoCFDI === "E";
    const esNomina = tipoCFDI === "N";

    // ❌ Nunca requerida para: Pago, Egreso, Nómina
    if (esPago || esEgreso || esNomina) {
      return "NO";
    }

    // 🔍 REGLA SAT ESTRICTA: Solo requiere si hay EVIDENCIA FÍSICA de transporte

    // 1️⃣ Verificar si YA tiene Carta Porte (entonces obviamente la requería)
    const yaTieneCartaPorte = xmlContent.includes("CartaPorte") && xmlContent.includes("Ubicacion");
    if (yaTieneCartaPorte) {
      return "SÍ";
    }

    // 2️⃣ Para Traslado (T): SOLO si tiene EVIDENCIA CONCRETA de transporte de mercancías
    if (esTraslado) {
      // Buscar evidencia de mercancías en nodos de Carta Porte (no en conceptos generales)
      const tieneMercanciasCartaPorte = /Mercancias[^>]*PesoBrutoTotal/i.test(xmlContent);
      const tieneUbicacionesCartaPorte = /Ubicacion[^>]*TipoUbicacion/i.test(xmlContent);
      const tieneAutotransporte = xmlContent.includes("Autotransporte");
      const tieneCveTransporte = /ClaveProdServ="78\d{5}|80\d{5}|81\d{5}"/i.test(xmlContent);

      // Requiere si tiene estructura de transporte físico
      if ((tieneMercanciasCartaPorte || tieneUbicacionesCartaPorte || tieneAutotransporte) && tieneCveTransporte) {
        return "SÍ";
      }
      return "NO"; // Traslado sin evidencia = ajuste/nota/corrección contable
    }

    // 3️⃣ Para Ingreso (I): SOLO si factura SERVICIO DE TRANSPORTE con evidencia clara
    if (esIngreso) {
      // REGLA ULTRA ESTRICTA: Debe tener clave SAT específica de transporte
      const tieneCveTransporte = /ClaveProdServ="78101[78]\d{2}|78102\d{3}|80101[78]\d{2}|81101[78]\d{2}"/i.test(xmlContent);

      // Y descripción EXPLÍCITA de transporte físico (palabras completas, no fragmentos)
      const tieneDescTransporte = /Descripcion="[^"]*\b(?:servicio\s+de\s+transporte|servicios?\s+de\s+transporte|flete|acarreo|traslado\s+de\s+mercancia|autotransporte)\b[^"]*"/i.test(xmlContent);

      // Y referencia CLARA a ruta/origen/destino
      const tieneReferenciaRuta = /\b(?:origen|destino|kilometros?|ruta|via\s+federal|carretera)\b/i.test(xmlContent);

      // Las 3 condiciones deben cumplirse para evitar falsos positivos
      if (tieneCveTransporte && tieneDescTransporte && tieneReferenciaRuta) {
        return "SÍ";
      }
      return "NO"; // Ingreso sin evidencia clara de servicio de transporte
    }

    return "NO";
  };

  const extractCartaPorteInfo = (xmlContent: string, version: string): { presente: string; completa: string; version: string } => {
    const tieneCartaPorte = xmlContent.includes("CartaPorte");

    if (version === "3.3") {
      if (!tieneCartaPorte) {
        return {
          presente: "NO APLICA",
          completa: "NO APLICA",
          version: "NO APLICA"
        };
      }
    }

    if (!tieneCartaPorte) {
      return {
        presente: "NO",
        completa: "NO APLICA",
        version: "NO APLICA"
      };
    }

    const versionMatch = xmlContent.match(/CartaPorte[^>]*Version="([^"]+)"/);
    const cpVersion = versionMatch ? versionMatch[1] : "NO DISPONIBLE";

    // ✅ PRODUCCIÓN: Validación ESTRICTA según Anexo 20 SAT (NO NEGOCIABLE)
    // Carta Porte es COMPLETA SI Y SOLO SI existen TODOS los elementos obligatorios:

    // 1️⃣ UBICACIONES (Origen y Destino)
    const tieneUbicaciones = xmlContent.includes("Ubicaciones");
    const tieneOrigen = /TipoUbicacion="Origen"/i.test(xmlContent);
    const tieneDestino = /TipoUbicacion="Destino"/i.test(xmlContent);
    const ubicacionesCompletas = tieneUbicaciones && tieneOrigen && tieneDestino;

    // 2️⃣ MERCANCÍAS (PesoBrutoTotal, UnidadPeso, NumTotalMercancias)
    const tieneMercancias = xmlContent.includes("Mercancias");
    const tienePesoBruto = xmlContent.includes("PesoBrutoTotal");
    const tieneUnidadPeso = xmlContent.includes("UnidadPeso");
    const tieneNumTotal = xmlContent.includes("NumTotalMercancias");
    const mercanciasCompletas = tieneMercancias && tienePesoBruto && tieneUnidadPeso && tieneNumTotal;

    // 3️⃣ AUTOTRANSPORTE (PermSCT, NumPermisoSCT, ConfigVehicular, Placa, Año, Seguros)
    const tieneAutotransporte = xmlContent.includes("Autotransporte");
    const tienePermSCT = xmlContent.includes("PermSCT");
    const tieneNumPermisoSCT = xmlContent.includes("NumPermisoSCT");
    const tieneIdentificacionVehicular = xmlContent.includes("IdentificacionVehicular");
    const tieneConfigVehicular = xmlContent.includes("ConfigVehicular");
    const tienePlaca = xmlContent.includes("Placa");
    const tieneAnio = xmlContent.includes("AnioModeloVM") || xmlContent.includes("Anio");
    const tieneAseguraRespCivil = xmlContent.includes("AseguraRespCivil");
    const tienePolizaRespCivil = xmlContent.includes("PolizaRespCivil");
    const segurosCompletos = tieneAseguraRespCivil && tienePolizaRespCivil;
    const vehiculoCompleto = tieneIdentificacionVehicular && tieneConfigVehicular && tienePlaca && tieneAnio;
    const autotransporteCompleto = tieneAutotransporte && tienePermSCT && tieneNumPermisoSCT && vehiculoCompleto && segurosCompletos;

    // 4️⃣ FIGURA TRANSPORTE (Operador con RFC y NumLicencia)
    const tieneFiguraTransporte = xmlContent.includes("FiguraTransporte");
    const tieneRFCOperador = /RFCFigura="[A-Z0-9]{12,13}"/i.test(xmlContent) || /RFC="[A-Z0-9]{12,13}"/i.test(xmlContent);
    const tieneNumLicencia = xmlContent.includes("NumLicencia");
    const figuraCompleta = tieneFiguraTransporte && tieneRFCOperador && tieneNumLicencia;

    // ⚖️ DICTAMEN FINAL: COMPLETA = TODOS los requisitos cumplidos
    const completa = ubicacionesCompletas && mercanciasCompletas && autotransporteCompleto && figuraCompleta ? "SÍ" : "NO";

    return {
      presente: "SÍ",
      completa,
      version: cpVersion
    };
  };

  // ==================== VALIDACIÓN DE COMPLEMENTO PAGOS ====================

  // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 5 - Regla 5.1
  // Validación de Complemento de Pagos 1.0 (2018-2021) y 2.0 (2022-actual)
  const extractPagosInfo = (
    xmlContent: string,
    tipoCFDI: string,
    version: string,
    añoFiscal: number,
    requiereComplementoPagos: boolean,
    versionPagosEsperada: string
  ): { presente: string; versionPagos: string; valido: string; errorMsg: string } => {

    // REGLA 1: Si no es Tipo P, complemento Pagos NO APLICA
    if (tipoCFDI !== "P") {
      return {
        presente: "NO APLICA",
        versionPagos: "NO APLICA",
        valido: "NO APLICA",
        errorMsg: ""
      };
    }

    // REGLA 2: Si es Tipo P pero contexto temporal indica que NO requiere (pre-2018)
    if (!requiereComplementoPagos) {
      return {
        presente: "NO APLICA",
        versionPagos: "NO APLICA",
        valido: "NO APLICA",
        errorMsg: `Complemento Pagos no existía en ${añoFiscal} (disponible desde 2018 con CFDI 3.3)`
      };
    }

    // REGLA 3: Detectar presencia de complemento Pagos
    const tienePagos10 = xmlContent.includes("pago10:Pagos");
    const tienePagos20 = xmlContent.includes("pago20:Pagos");
    const tieneAlgunPagos = tienePagos10 || tienePagos20;

    if (!tieneAlgunPagos) {
      return {
        presente: "NO",
        versionPagos: "NO DISPONIBLE",
        valido: "NO",
        errorMsg: `ERROR FISCAL: CFDI Tipo P de ${añoFiscal} requiere complemento de Pagos (${versionPagosEsperada}). No se detectó "pago10:Pagos" ni "pago20:Pagos".`
      };
    }

    // REGLA 4: Determinar versión detectada
    const versionDetectada = tienePagos20 ? "2.0" : "1.0";

    // REGLA 5: Validar versión según contexto temporal
    if (versionDetectada !== versionPagosEsperada) {
      return {
        presente: "SÍ",
        versionPagos: versionDetectada,
        valido: "NO",
        errorMsg: `ERROR FISCAL: CFDI ${version} de ${añoFiscal} requiere Pagos ${versionPagosEsperada}, pero se detectó Pagos ${versionDetectada}. Regla SAT: Pagos 1.0 (2018-2021), Pagos 2.0 (2022-actual).`
      };
    }

    // REGLA 6: Complemento Pagos válido
    return {
      presente: "SÍ",
      versionPagos: versionDetectada,
      valido: "SÍ",
      errorMsg: ""
    };
  };

  // ==================== DETECCIÓN DE ENCODING ====================

  // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 6 - Regla 6.1
  // Detección de encoding UTF-8, ISO-8859-1, Windows-1252
  // NO CONVIERTE ni CORRIGE el XML, solo detecta y reporta
  const detectarEncoding = (xmlContent: string): { encoding: string; soportado: boolean; errorMsg: string } => {
    // REGLA 1: Buscar declaración encoding en <?xml?>
    const encodingMatch = xmlContent.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);

    if (!encodingMatch) {
      // Sin declaración explícita → Asumir UTF-8 (estándar XML)
      return {
        encoding: "UTF-8",
        soportado: true,
        errorMsg: ""
      };
    }

    const encodingDeclarado = encodingMatch[1].toUpperCase();

    // REGLA 2: Validar encodings soportados
    const encodingsSoportados = ["UTF-8", "ISO-8859-1", "WINDOWS-1252"];

    // Normalizar variantes comunes
    let encodingNormalizado = encodingDeclarado;
    if (encodingDeclarado === "UTF8") encodingNormalizado = "UTF-8";
    if (encodingDeclarado === "ISO-88591" || encodingDeclarado === "LATIN1") encodingNormalizado = "ISO-8859-1";
    if (encodingDeclarado === "CP1252" || encodingDeclarado === "WINDOWS1252") encodingNormalizado = "WINDOWS-1252";

    if (encodingsSoportados.includes(encodingNormalizado)) {
      return {
        encoding: encodingNormalizado,
        soportado: true,
        errorMsg: ""
      };
    }

    // REGLA 3: Encoding no soportado
    return {
      encoding: encodingDeclarado,
      soportado: false,
      errorMsg: `ERROR TÉCNICO: Encoding "${encodingDeclarado}" no soportado. Encodings aceptados: UTF-8, ISO-8859-1, Windows-1252. Regla SAT: Anexo 20 CFDI - Los CFDIs deben usar codificaciones estándar para garantizar interoperabilidad.`
    };
  };

  // ==================== SCORE INFORMATIVO ====================

  // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 8 - Regla 8.2
  // Score informativo (NO bloqueante, solo reportes)
  const calcularScoreInformativo = (
    resultado: string,
    isValid: boolean,
    diferenciaTotales: number,
    cartaPorteCompleta: string,
    requiereCartaPorte: string
  ): number => {
    // REGLA 1: NO USABLE = 0-40 puntos
    if (resultado === "🔴 NO USABLE") {
      if (diferenciaTotales > 10) return 10; // Error grave en totales
      if (diferenciaTotales > 1) return 25; // Error moderado
      return 40; // Error estructural
    }

    // REGLA 2: USABLE CON ALERTAS = 70-90 puntos
    if (resultado === "🟡 USABLE CON ALERTAS") {
      let score = 80; // Base

      // Penalizar si Carta Porte incompleta
      if (requiereCartaPorte === "SÍ" && cartaPorteCompleta === "NO") {
        score -= 10;
      }

      return Math.max(70, Math.min(90, score));
    }

    // REGLA 3: USABLE = 90-100 puntos
    if (resultado === "🟢 USABLE") {
      let score = 95; // Base

      // Bonificar si totales exactos
      if (isValid && diferenciaTotales === 0) {
        score = 100;
      }

      return score;
    }

    // Fallback: 50 puntos (estado desconocido)
    return 50;
  };

  // ==================== VALIDACIÓN DE NÓMINA 1.1 Y 1.2 ====================

  // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 7 - Regla 7.1
  // Soporte de Nómina 1.1 (histórica) y 1.2 (actual)
  const detectarNomina = (xmlContent: string, tipoCFDI: string): boolean => {
    // REGLA OBLIGATORIA: Debe ser tipo "N" Y tener complemento nomina11 o nomina12
    return tipoCFDI === "N" && (xmlContent.includes("nomina11:Nomina") || xmlContent.includes("nomina12:Nomina"));
  };

  const extractNominaInfo = (xmlDoc: XMLDocument, xmlContent: string): {
    versionNomina: string;
    totalPercepciones: number;
    totalDeducciones: number;
    totalOtrosPagos: number;
    isrRetenido: number;
    esValida: boolean;
    errorMsg: string;
  } => {
    try {
      // Buscar nodo Nomina
      const nominaNodes = xmlDoc.getElementsByTagName("*");
      let nominaNode: Element | null = null;

      for (let i = 0; i < nominaNodes.length; i++) {
        const node = nominaNodes[i];
        const tagName = node.localName || node.nodeName;
        // ✅ SKILL v1.0.0 - BLOQUE 7: Buscar Nómina 1.1 o 1.2
        if (tagName === "Nomina" || tagName === "nomina11:Nomina" || tagName === "nomina12:Nomina") {
          nominaNode = node;
          break;
        }
      }

      if (!nominaNode) {
        return {
          versionNomina: "NO DISPONIBLE",
          totalPercepciones: 0,
          totalDeducciones: 0,
          totalOtrosPagos: 0,
          isrRetenido: 0,
          esValida: false,
          errorMsg: "Complemento de nómina no encontrado (nomina11:Nomina o nomina12:Nomina)"
        };
      }

      // VALIDACIÓN ESTRUCTURAL OBLIGATORIA
      const version = nominaNode.getAttribute("Version") || "";
      // ✅ SKILL v1.0.0 - BLOQUE 7: Aceptar versión 1.1 y 1.2
      if (version !== "1.1" && version !== "1.2") {
        return {
          versionNomina: version,
          totalPercepciones: 0,
          totalDeducciones: 0,
          totalOtrosPagos: 0,
          isrRetenido: 0,
          esValida: false,
          errorMsg: `Versión de nómina inválida: ${version}. Se requiere versión 1.1 o 1.2`
        };
      }

      // ✅ SKILL v1.0.0 - BLOQUE 7: Campos obligatorios según versión
      // Nómina 1.1 y 1.2 comparten campos básicos obligatorios
      const camposObligatorios = [
        "FechaInicialPago",
        "FechaFinalPago",
        "FechaPago",
        "NumDiasPagados"
      ];

      for (const campo of camposObligatorios) {
        if (!nominaNode.getAttribute(campo)) {
          return {
            versionNomina: version,
            totalPercepciones: 0,
            totalDeducciones: 0,
            totalOtrosPagos: 0,
            isrRetenido: 0,
            esValida: false,
            errorMsg: `Falta campo obligatorio en complemento de nómina (versión ${version}): ${campo}`
          };
        }
      }

      // Buscar Emisor de nómina
      let tieneEmisorNomina = false;
      let tieneReceptorNomina = false;
      let tienePercepciones = false;

      for (let i = 0; i < nominaNodes.length; i++) {
        const node = nominaNodes[i];
        const tagName = node.localName || node.nodeName;

        if (tagName === "Emisor" && node.parentNode === nominaNode) {
          tieneEmisorNomina = true;
        }
        if (tagName === "Receptor" && node.parentNode === nominaNode) {
          tieneReceptorNomina = true;
          const numEmpleado = node.getAttribute("NumEmpleado");
          if (!numEmpleado) {
            return {
              versionNomina: version,
              totalPercepciones: 0,
              totalDeducciones: 0,
              totalOtrosPagos: 0,
              isrRetenido: 0,
              esValida: false,
              errorMsg: "Falta NumEmpleado en nomina12:Receptor"
            };
          }
        }
        if (tagName === "Percepciones" && node.parentNode === nominaNode) {
          tienePercepciones = true;
        }
      }

      if (!tieneEmisorNomina) {
        return {
          versionNomina: version,
          totalPercepciones: 0,
          totalDeducciones: 0,
          totalOtrosPagos: 0,
          isrRetenido: 0,
          esValida: false,
          errorMsg: "Falta nodo obligatorio: nomina12:Emisor"
        };
      }

      if (!tieneReceptorNomina) {
        return {
          versionNomina: version,
          totalPercepciones: 0,
          totalDeducciones: 0,
          totalOtrosPagos: 0,
          isrRetenido: 0,
          esValida: false,
          errorMsg: "Falta nodo obligatorio: nomina12:Receptor"
        };
      }

      if (!tienePercepciones) {
        return {
          versionNomina: version,
          totalPercepciones: 0,
          totalDeducciones: 0,
          totalOtrosPagos: 0,
          isrRetenido: 0,
          esValida: false,
          errorMsg: "Falta nodo obligatorio: nomina12:Percepciones"
        };
      }

      // EXTRAER TOTALES DE PERCEPCIONES
      const percepcionesMatch = xmlContent.match(/Percepciones[^>]*TotalGravado="([^"]+)"[^>]*TotalExento="([^"]+)"/);
      let totalPercepciones = 0;

      if (percepcionesMatch) {
        const totalGravado = parseFloat(percepcionesMatch[1] || "0");
        const totalExento = parseFloat(percepcionesMatch[2] || "0");
        totalPercepciones = totalGravado + totalExento;
      }

      // EXTRAER TOTALES DE DEDUCCIONES
      const deduccionesMatch = xmlContent.match(/Deducciones[^>]*TotalOtrasDeducciones="([^"]+)"|Deducciones[^>]*TotalImpuestosRetenidos="([^"]+)"/g);
      let totalDeducciones = 0;
      let isrRetenido = 0;

      if (xmlContent.includes("Deducciones")) {
        const deduccionesNodeMatch = xmlContent.match(/Deducciones[^>]*>/);
        if (deduccionesNodeMatch) {
          const deduccionesStr = deduccionesNodeMatch[0];

          const totalOtrasMatch = deduccionesStr.match(/TotalOtrasDeducciones="([^"]+)"/);
          const totalImpuestosMatch = deduccionesStr.match(/TotalImpuestosRetenidos="([^"]+)"/);

          const totalOtras = totalOtrasMatch ? parseFloat(totalOtrasMatch[1] || "0") : 0;
          const totalImpuestos = totalImpuestosMatch ? parseFloat(totalImpuestosMatch[1] || "0") : 0;

          totalDeducciones = totalOtras + totalImpuestos;

          // Extraer ISR específicamente (TipoDeduccion="002")
          const isrMatch = xmlContent.match(/Deduccion[^>]*TipoDeduccion="002"[^>]*Importe="([^"]+)"/);
          isrRetenido = isrMatch ? parseFloat(isrMatch[1] || "0") : totalImpuestos;
        }
      }

      // EXTRAER OTROS PAGOS
      let totalOtrosPagos = 0;
      if (xmlContent.includes("OtrosPagos")) {
        const otrosPagosMatch = xmlContent.match(/OtrosPagos[^>]*TotalOtrosPagos="([^"]+)"/);
        if (otrosPagosMatch) {
          totalOtrosPagos = parseFloat(otrosPagosMatch[1] || "0");
        }
      }

      return {
        versionNomina: version,
        totalPercepciones: Math.round(totalPercepciones * 100) / 100,
        totalDeducciones: Math.round(totalDeducciones * 100) / 100,
        totalOtrosPagos: Math.round(totalOtrosPagos * 100) / 100,
        isrRetenido: Math.round(isrRetenido * 100) / 100,
        esValida: true,
        errorMsg: ""
      };

    } catch (error) {
      return {
        versionNomina: "ERROR",
        totalPercepciones: 0,
        totalDeducciones: 0,
        totalOtrosPagos: 0,
        isrRetenido: 0,
        esValida: false,
        errorMsg: `Error al procesar nómina: ${error instanceof Error ? error.message : "Error desconocido"}`
      };
    }
  };

  const validateNominaTotals = (
    totalPercepciones: number,
    totalDeducciones: number,
    totalOtrosPagos: number,
    totalXML: number
  ): { isValid: boolean; calculado: number; diferencia: number } => {
    // REGLA SAT PARA NÓMINA:
    // Total = TotalPercepciones + TotalOtrosPagos - TotalDeducciones
    const totalCalculado = totalPercepciones + totalOtrosPagos - totalDeducciones;
    const diferencia = Math.abs(totalCalculado - totalXML);
    const tolerancia = 0.01; // SAT permite redondeo ≤ 0.01

    return {
      isValid: diferencia <= tolerancia,
      calculado: Math.round(totalCalculado * 100) / 100,
      diferencia: Math.round(diferencia * 100) / 100
    };
  };

  // ==================== FIN VALIDACIÓN DE NÓMINA ====================

  const validateSingleXML = async (
    fileName: string,
    xmlContent: string
  ): Promise<ValidationResult> => {
    try {
      // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 6 - Regla 6.1
      // Detectar encoding antes de parsear
      const encodingInfo = detectarEncoding(xmlContent);

      // Si encoding no soportado → NO USABLE
      if (!encodingInfo.soportado) {
        return createErrorResult(fileName, encodingInfo.errorMsg);
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        return createErrorResult(fileName, "Error al procesar XML: formato inválido");
      }

      const comprobante = xmlDoc.documentElement;
      const version = detectCFDIVersion(xmlContent);

      // ✅ SKILL sentinel-express-pro v1.0.0 - ALCANCE TEMPORAL Y VERSIONES CFDI
      // Soporte multiversión: CFDI 2.0/2.2/3.0/3.2 (históricos), 3.3 (2017-2021), 4.0 (2022-actual)
      const versionesValidas = ["2.0", "2.2", "3.0", "3.2", "3.3", "4.0"];
      if (!versionesValidas.includes(version)) {
        return createErrorResult(
          fileName,
          `Versión no soportada: ${version}. Se aceptan CFDI 2.0, 2.2, 3.0, 3.2, 3.3 y 4.0 según contexto histórico SAT.`
        );
      }

      // EXTRACCIÓN DE DATOS BÁSICOS
      let uuid = "NO DISPONIBLE";

      // Buscar UUID en TimbreFiscalDigital
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

      // ✅ SKILL sentinel-express-pro v1.0.0 - REPORTES (OBLIGATORIOS): Año fiscal
      const añoFiscal = fechaEmision !== "NO DISPONIBLE"
        ? parseInt(fechaEmision.substring(0, 4), 10)
        : 0;

      // ✅ SKILL sentinel-express-pro v1.0.0 - CONTEXTO TEMPORAL
      // Obtener reglas aplicables según versión CFDI + año fiscal
      // Aplicar reglas del contexto histórico, no reglas retroactivas
      const reglasAplicables = obtenerReglasAplicables(version, añoFiscal, tipoCFDI);

      const moneda = comprobante?.getAttribute("Moneda") || "MXN";
      const tipoCambio = parseFloat(comprobante?.getAttribute("TipoCambio") || "1");

      // RFC Y NOMBRES - REFORZADO para evitar "NO DISPONIBLE"
      let rfcEmisor = "NO DISPONIBLE";
      let nombreEmisor = "NO DISPONIBLE";
      let rfcReceptor = "NO DISPONIBLE";
      let nombreReceptor = "NO DISPONIBLE";
      let regimenEmisor = "NO DISPONIBLE";
      let regimenReceptor = "NO DISPONIBLE";

      // MÉTODO 1: Búsqueda por getElementsByTagName (más robusto para namespaces)
      const todosElementos = comprobante?.getElementsByTagName("*");
      if (todosElementos) {
        for (let i = 0; i < todosElementos.length; i++) {
          const nodo = todosElementos[i];
          const tagName = nodo.localName || nodo.nodeName;

          // Emisor (soporta múltiples variantes)
          if (tagName === "Emisor" || tagName === "cfdi:Emisor") {
            const rfc = nodo.getAttribute("Rfc") || nodo.getAttribute("rfc");
            const nombre = nodo.getAttribute("Nombre") || nodo.getAttribute("nombre");
            const regimen = nodo.getAttribute("RegimenFiscal") || nodo.getAttribute("regimenFiscal");

            if (rfc && rfcEmisor === "NO DISPONIBLE") rfcEmisor = rfc;
            if (nombre && nombreEmisor === "NO DISPONIBLE") nombreEmisor = nombre;
            if (regimen && regimenEmisor === "NO DISPONIBLE") regimenEmisor = regimen;
          }

          // RegimenFiscal (hijo de Emisor en CFDI 3.3)
          if ((tagName === "RegimenFiscal" || tagName === "cfdi:RegimenFiscal") && regimenEmisor === "NO DISPONIBLE") {
            const regimen = nodo.getAttribute("Regimen") || nodo.getAttribute("regimen");
            if (regimen) regimenEmisor = regimen;
          }

          // Receptor (soporta múltiples variantes)
          if (tagName === "Receptor" || tagName === "cfdi:Receptor") {
            const rfc = nodo.getAttribute("Rfc") || nodo.getAttribute("rfc");
            const nombre = nodo.getAttribute("Nombre") || nodo.getAttribute("nombre");
            const usoCFDI = nodo.getAttribute("UsoCFDI") || nodo.getAttribute("usoCFDI");
            const regimenFiscal = nodo.getAttribute("RegimenFiscalReceptor") || nodo.getAttribute("regimenFiscalReceptor");

            if (rfc && rfcReceptor === "NO DISPONIBLE") rfcReceptor = rfc;
            if (nombre && nombreReceptor === "NO DISPONIBLE") nombreReceptor = nombre;
            if (usoCFDI && regimenReceptor === "NO DISPONIBLE") regimenReceptor = usoCFDI;
            if (regimenFiscal && regimenReceptor === "NO DISPONIBLE") regimenReceptor = regimenFiscal;
          }
        }
      }

      // MÉTODO 2: Búsqueda por REGEX en xmlContent (fallback ultra robusto)
      if (rfcEmisor === "NO DISPONIBLE") {
        const rfcEmisorMatch = xmlContent.match(/Emisor[^>]*Rfc="([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})"/i);
        if (rfcEmisorMatch) rfcEmisor = rfcEmisorMatch[1];
      }

      if (rfcReceptor === "NO DISPONIBLE") {
        const rfcReceptorMatch = xmlContent.match(/Receptor[^>]*Rfc="([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})"/i);
        if (rfcReceptorMatch) rfcReceptor = rfcReceptorMatch[1];
      }

      if (nombreEmisor === "NO DISPONIBLE") {
        const nombreEmisorMatch = xmlContent.match(/Emisor[^>]*Nombre="([^"]+)"/i);
        if (nombreEmisorMatch) nombreEmisor = nombreEmisorMatch[1];
      }

      if (nombreReceptor === "NO DISPONIBLE") {
        const nombreReceptorMatch = xmlContent.match(/Receptor[^>]*Nombre="([^"]+)"/i);
        if (nombreReceptorMatch) nombreReceptor = nombreReceptorMatch[1];
      }

      // CÓDIGO POSTAL
      const cpReceptor = extractCPReceptor(xmlDoc, version);

      // ✅ SKILL sentinel-express-pro v1.0.0 - CLASIFICACIÓN DOCUMENTAL
      // Detectar CfdiRelacionados para clasificación de tipo real de documento
      const { tieneCfdiRelacionados, tipoRelacion, uuidRelacionado } = extractCfdiRelacionados(xmlDoc, xmlContent);

      // ✅ SKILL sentinel-express-pro v1.0.0 - CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)
      // Determinar tipo real de documento: Factura, NC, ND, REP, Nómina, Traslado
      const tipoRealDocumento = determinarTipoRealDocumento(tipoCFDI, tieneCfdiRelacionados, tipoRelacion);

      // ✅ SKILL sentinel-express-pro v1.0.0 - VALIDACIÓN TIPORELACION NC/ND
      // Validar que Notas de Crédito tengan TipoRelacion=01 y Notas de Cargo tengan TipoRelacion=02
      // NO exigir TipoRelacion a Facturas, Pagos, Nómina o Traslado
      if (tipoRealDocumento === "Nota de Crédito") {
        if (tieneCfdiRelacionados === "NO" || tipoRelacion !== "01") {
          return createErrorResult(
            fileName,
            `ERROR FISCAL: Nota de Crédito (Tipo E) debe tener CfdiRelacionados con TipoRelacion='01'. Encontrado: ${tipoRelacion === "NO DISPONIBLE" ? "sin CfdiRelacionados" : `TipoRelacion='${tipoRelacion}'`}. Regla SAT: Anexo 20 CFDI 3.3/4.0 - Tipo de relación 01 para Notas de Crédito.`
          );
        }
      }

      if (tipoRealDocumento === "Nota de Cargo") {
        if (tieneCfdiRelacionados === "NO" || tipoRelacion !== "02") {
          return createErrorResult(
            fileName,
            `ERROR FISCAL: Nota de Cargo (Tipo I con relación) debe tener CfdiRelacionados con TipoRelacion='02'. Encontrado: ${tipoRelacion === "NO DISPONIBLE" ? "sin CfdiRelacionados" : `TipoRelacion='${tipoRelacion}'`}. Regla SAT: Anexo 20 CFDI 3.3/4.0 - Tipo de relación 02 para Notas de Débito/Cargo.`
          );
        }
      }

      // ✅ SKILL sentinel-express-pro v1.0.0 - VALIDACIÓN REP (TIPO P)
      // Validar que CFDIs Tipo P (Recibo Electrónico de Pago) tengan Total=0.00
      // NO validar montos de facturas relacionadas, NO inferir pagos faltantes
      if (tipoCFDI === "P") {
        const totalREP = parseFloat(comprobante?.getAttribute("Total") || "0");
        if (totalREP !== 0.00) {
          return createErrorResult(
            fileName,
            `ERROR FISCAL: CFDI Tipo P (Recibo Electrónico de Pago) debe tener Total=0.00. Encontrado: Total=$${totalREP.toFixed(2)}. Regla SAT: Anexo 20 CFDI 3.3/4.0 - Los recibos de pago deben emitirse con Total=0 ya que el importe se registra en el complemento de pagos. Verifica el complemento "pago10:Pagos" o "pago20:Pagos".`
          );
        }
      }

      // ESTATUS SAT (simulado)
      const estatusSAT = "Vigente";
      const fechaCancelacion = "NO APLICA";
      const cfdiSustituido = "NO";
      const uuidSustitucion = "NO APLICA";
      const estadoSATEmisor = "Activo";

      // ==================== DETECCIÓN Y VALIDACIÓN DE NÓMINA ====================
      const esNomina = detectarNomina(xmlContent, tipoCFDI);
      let nominaInfo = {
        versionNomina: "NO APLICA",
        totalPercepciones: 0,
        totalDeducciones: 0,
        totalOtrosPagos: 0,
        isrRetenido: 0,
        esValida: true,
        errorMsg: ""
      };

      if (esNomina) {
        nominaInfo = extractNominaInfo(xmlDoc, xmlContent);

        // Si hay error estructural en nómina, retornar inmediatamente como NO USABLE
        if (!nominaInfo.esValida) {
          return {
            fileName,
            uuid,
            versionCFDI: version,
            tipoCFDI,
            serie,
            folio,
            fechaEmision,
            horaEmision,
            estatusSAT,
            fechaCancelacion,
            cfdiSustituido,
            uuidSustitucion,
            rfcEmisor,
            nombreEmisor,
            regimenEmisor,
            estadoSATEmisor,
            rfcReceptor,
            nombreReceptor,
            regimenReceptor,
            cpReceptor,
            requiereCartaPorte: "NO",
            cartaPorte: "NO APLICA",
            cartaPorteCompleta: "NO APLICA",
            versionCartaPorte: "NO APLICA",
            subtotal: 0,
            baseIVA16: 0,
            baseIVA8: 0,
            baseIVA0: 0,
            baseIVAExento: 0,
            ivaTraslado: 0,
            ivaRetenido: 0,
            isrRetenido: nominaInfo.isrRetenido,
            iepsTraslado: 0,
            iepsRetenido: 0,
            impuestosLocalesTrasladados: 0,
            impuestosLocalesRetenidos: 0,
            total: parseFloat(comprobante?.getAttribute("Total") || "0"),
            moneda: comprobante?.getAttribute("Moneda") || "MXN",
            tipoCambio: 1,
            formaPago: comprobante?.getAttribute("FormaPago") || "NO DISPONIBLE",
            metodoPago: comprobante?.getAttribute("MetodoPago") || "NO DISPONIBLE",
            nivelValidacion: "ESTRUCTURAL, NÓMINA",
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `ERROR FISCAL: ${nominaInfo.errorMsg}`,
            observacionesTecnicas: nominaInfo.errorMsg,
            iva: 0,
            isValid: false,
            totalCalculado: 0,
            diferenciaTotales: 0,
            desglosePorConcepto: [],
            desglose: "",
            esNomina: "SÍ",
            versionNomina: nominaInfo.versionNomina,
            totalPercepciones: nominaInfo.totalPercepciones,
            totalDeducciones: nominaInfo.totalDeducciones,
            totalOtrosPagos: nominaInfo.totalOtrosPagos,
            isrRetenidoNomina: nominaInfo.isrRetenido,
            totalCalculadoNomina: 0,
          };
        }
      }
      // ==================== FIN DETECCIÓN Y VALIDACIÓN DE NÓMINA ====================

      // CARTA PORTE (NO aplica para nómina)
      // ✅ SKILL sentinel-express-pro v1.0.0 - CONTEXTO TEMPORAL
      // Usar reglas contextuales: Carta Porte NO existía antes de 2022
      const requiereCartaPorte = esNomina
        ? "NO"
        : (reglasAplicables.requiereCartaPorte
          ? determineRequiereCartaPorte(xmlContent, tipoCFDI, version)
          : "NO APLICA");
      const { presente: cartaPortePresente, completa: cartaPorteCompleta, version: versionCartaPorte } = esNomina
        ? { presente: "NO APLICA", completa: "NO APLICA", version: "NO APLICA" }
        : extractCartaPorteInfo(xmlContent, version);

      // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 5 - Regla 5.1
      // Validar Complemento de Pagos según contexto temporal
      const pagosInfo = extractPagosInfo(
        xmlContent,
        tipoCFDI,
        version,
        añoFiscal,
        reglasAplicables.requiereComplementoPagos,
        reglasAplicables.versionPagosEsperada
      );

      // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 5 - Regla 5.1
      // Si complemento Pagos es obligatorio y no válido → NO USABLE
      if (pagosInfo.valido === "NO" && pagosInfo.errorMsg) {
        return createErrorResult(fileName, pagosInfo.errorMsg);
      }

      // IMPUESTOS CORRECTOS (POR CONCEPTO) - Solo para NO nómina
      const taxesByConcepto = esNomina
        ? {
          subtotal: 0,
          baseIVA16: 0,
          baseIVA8: 0,
          baseIVA0: 0,
          baseIVAExento: 0,
          ivaTraslado: 0,
          ivaRetenido: 0,
          isrRetenido: nominaInfo.isrRetenido,
          iepsTraslado: 0,
          iepsRetenido: 0,
          impuestosLocalesTrasladados: 0,
          impuestosLocalesRetenidos: 0,
          trasladosTotales: 0,
          retencionesTotales: nominaInfo.isrRetenido,
          desglosePorConcepto: []
        }
        : extractTaxesByConcepto(xmlDoc, version);

      // Total del XML
      const totalXML = parseFloat(comprobante?.getAttribute("Total") || "0");

      // Validar totales según tipo de CFDI
      const validation = esNomina
        ? validateNominaTotals(
          nominaInfo.totalPercepciones,
          nominaInfo.totalDeducciones,
          nominaInfo.totalOtrosPagos,
          totalXML
        )
        : validateTotals(taxesByConcepto, totalXML);

      // FORMA Y MÉTODO DE PAGO
      const formaPago = comprobante?.getAttribute("FormaPago") || "NO DISPONIBLE";
      const metodoPago = comprobante?.getAttribute("MetodoPago") || "NO DISPONIBLE";

      // VALIDACIONES
      let resultado = "🟢 USABLE";
      let comentarioFiscal = "";
      let observacionesTecnicas = "SIN OBSERVACIONES";

      // VALIDACIÓN FINAL OBLIGATORIA: Si Total_XML == Total_Calculado → USABLE
      if (validation.isValid) {
        resultado = "🟢 USABLE";

        if (esNomina) {
          // COMENTARIO ESPECÍFICO PARA NÓMINA
          comentarioFiscal = `CFDI de Nómina ${nominaInfo.versionNomina} válido. Total correcto: Percepciones ($${nominaInfo.totalPercepciones.toFixed(2)})`;

          if (nominaInfo.totalOtrosPagos > 0) {
            comentarioFiscal += ` + Otros Pagos ($${nominaInfo.totalOtrosPagos.toFixed(2)})`;
          }

          if (nominaInfo.totalDeducciones > 0) {
            comentarioFiscal += ` - Deducciones ($${nominaInfo.totalDeducciones.toFixed(2)})`;
          }

          comentarioFiscal += `. Totales correctos conforme reglas SAT para nómina.`;

          if (nominaInfo.isrRetenido > 0) {
            comentarioFiscal += ` ISR retenido: $${nominaInfo.isrRetenido.toFixed(2)}.`;
          }

          observacionesTecnicas = `Nómina ${nominaInfo.versionNomina} validada. Percepciones: ${nominaInfo.totalPercepciones}, Deducciones: ${nominaInfo.totalDeducciones}, Otros Pagos: ${nominaInfo.totalOtrosPagos}`;
        } else {
          // COMENTARIO PARA INGRESO/TRASLADO/OTROS
          comentarioFiscal = "CFDI válido. Total correcto calculado por concepto considerando impuestos y retenciones";

          // Mencionar impuestos locales si existen
          if (taxesByConcepto.impuestosLocalesTrasladados > 0 || taxesByConcepto.impuestosLocalesRetenidos > 0) {
            if (taxesByConcepto.impuestosLocalesRetenidos > 0) {
              comentarioFiscal += ` incluyendo impuestos locales (retención cedular: $${taxesByConcepto.impuestosLocalesRetenidos.toFixed(2)})`;
            } else {
              comentarioFiscal += ` incluyendo impuestos locales trasladados ($${taxesByConcepto.impuestosLocalesTrasladados.toFixed(2)})`;
            }
          }
          comentarioFiscal += ".";

          // ✅ SKILL sentinel-express-pro v1.0.0 - CONTEXTO TEMPORAL
          // Incluir contexto histórico en comentario fiscal
          comentarioFiscal += ` ${reglasAplicables.contextoHistorico}.`;

          // ✅ PRODUCCIÓN: Validación Carta Porte ULTRA PRECISA (SIN FALSAS ALERTAS)
          if (requiereCartaPorte === "SÍ" && cartaPortePresente === "NO") {
            // CASO 1: Requiere pero no la tiene (ERROR REAL COMPROBABLE)
            resultado = "🟡 USABLE CON ALERTAS";
            comentarioFiscal += " ALERTA SAT: Falta complemento Carta Porte obligatorio para transporte de mercancías por vía federal.";
            observacionesTecnicas = "Complemento de Carta Porte requerido según Anexo 20 SAT pero ausente en el XML";
          } else if (cartaPortePresente === "SÍ" && cartaPorteCompleta === "NO") {
            // CASO 2: Tiene Carta Porte pero incompleta (VALIDAR ESTRUCTURA)
            resultado = "🟡 USABLE CON ALERTAS";
            comentarioFiscal += " ALERTA SAT: Carta Porte presente pero incompleta. Faltan elementos obligatorios según Anexo 20: verifica Ubicaciones (Origen/Destino), Mercancías (peso/unidad/cantidad), Autotransporte (permiso SCT/vehículo/seguros) o FiguraTransporte (operador/licencia).";
            observacionesTecnicas = "Carta Porte detectada pero no cumple estructura mínima obligatoria del Anexo 20 SAT";
          } else if (cartaPortePresente === "SÍ" && cartaPorteCompleta === "SÍ") {
            // CASO 3: Tiene Carta Porte completa (TODO CORRECTO)
            comentarioFiscal += " Carta Porte versión " + versionCartaPorte + " presente y completa según Anexo 20 SAT.";
            observacionesTecnicas = "Complemento Carta Porte cumple con estructura obligatoria del SAT";
          } else if (requiereCartaPorte === "NO" && cartaPortePresente === "NO") {
            // CASO 4: No requiere y no la tiene (SITUACIÓN NORMAL - SIN ALERTAS)
            comentarioFiscal += " Carta Porte no requerida para esta operación.";
            observacionesTecnicas = "Sin observaciones. Carta Porte no aplica según tipo de operación y Anexo 20 SAT";
          } else if (requiereCartaPorte === "NO APLICA") {
            // CASO 5: Versión CFDI pre-Carta Porte (2.x, 3.0, 3.2, 3.3)
            // ✅ SKILL sentinel-express-pro v1.0.0 - CONTEXTO TEMPORAL
            comentarioFiscal += ` Carta Porte no aplica (${reglasAplicables.contextoHistorico}).`;
            observacionesTecnicas = `Sin observaciones. ${reglasAplicables.contextoHistorico}`;
          }
        }
      } else {
        // Solo si realmente no cuadra (diferencia > 0.01)
        resultado = "🔴 NO USABLE";

        if (esNomina) {
          comentarioFiscal = `ERROR FISCAL: Total declarado ($${totalXML.toFixed(2)}) no coincide con cálculo SAT ($${validation.calculado.toFixed(2)}). Diferencia: $${validation.diferencia.toFixed(2)}. Fórmula SAT: Percepciones ($${nominaInfo.totalPercepciones.toFixed(2)}) + Otros Pagos ($${nominaInfo.totalOtrosPagos.toFixed(2)}) - Deducciones ($${nominaInfo.totalDeducciones.toFixed(2)}) = $${validation.calculado.toFixed(2)}.`;
          observacionesTecnicas = `Total declarado: $${totalXML.toFixed(2)}, Total calculado: $${validation.calculado.toFixed(2)}. Percepciones: ${nominaInfo.totalPercepciones}, Deducciones: ${nominaInfo.totalDeducciones}, Otros Pagos: ${nominaInfo.totalOtrosPagos}`;
        } else {
          // MENSAJE DETALLADO CON TODOS LOS DATOS
          comentarioFiscal = `ERROR FISCAL: Total declarado ($${totalXML.toFixed(2)}) no coincide con cálculo SAT ($${validation.calculado.toFixed(2)}). Diferencia: $${validation.diferencia.toFixed(2)}. `;
          comentarioFiscal += `DESGLOSE: Subtotal=$${taxesByConcepto.subtotal.toFixed(2)}, IVA Traslado=$${taxesByConcepto.ivaTraslado.toFixed(2)}, IVA Retenido=$${taxesByConcepto.ivaRetenido.toFixed(2)}, ISR Retenido=$${taxesByConcepto.isrRetenido.toFixed(2)}`;

          if (taxesByConcepto.iepsTraslado > 0) {
            comentarioFiscal += `, IEPS=$${taxesByConcepto.iepsTraslado.toFixed(2)}`;
          }
          if (taxesByConcepto.impuestosLocalesTrasladados > 0) {
            comentarioFiscal += `, Imp.Locales Trasl.=$${taxesByConcepto.impuestosLocalesTrasladados.toFixed(2)}`;
          }
          if (taxesByConcepto.impuestosLocalesRetenidos > 0) {
            comentarioFiscal += `, Imp.Locales Ret.=$${taxesByConcepto.impuestosLocalesRetenidos.toFixed(2)}`;
          }

          // Diagnóstico inteligente de la causa
          if (Math.abs(validation.diferencia - taxesByConcepto.impuestosLocalesRetenidos) < 0.01) {
            comentarioFiscal += ". CAUSA: Impuesto local retenido (cedular) no declarado en complemento implocal:ImpuestosLocales.";
            observacionesTecnicas = `Diferencia ($${validation.diferencia.toFixed(2)}) coincide con impuestos locales retenidos ($${taxesByConcepto.impuestosLocalesRetenidos.toFixed(2)}). Revisar nodo implocal:ImpuestosLocales. ${validation.explicacion}`;
          } else if (Math.abs(validation.diferencia - taxesByConcepto.impuestosLocalesTrasladados) < 0.01) {
            comentarioFiscal += ". CAUSA: Impuesto local trasladado no declarado en complemento implocal:ImpuestosLocales.";
            observacionesTecnicas = `Diferencia ($${validation.diferencia.toFixed(2)}) coincide con impuestos locales trasladados ($${taxesByConcepto.impuestosLocalesTrasladados.toFixed(2)}). Revisar nodo implocal:ImpuestosLocales. ${validation.explicacion}`;
          } else if (validation.diferencia < 1.0) {
            comentarioFiscal += ". CAUSA PROBABLE: Error de redondeo en cálculo de impuestos por concepto.";
            observacionesTecnicas = `Diferencia menor a $1.00 sugiere error de redondeo. ${validation.explicacion}`;
          } else {
            comentarioFiscal += ". CAUSA: Revisar cálculo de impuestos por concepto, validar contra XML timbrado.";
            observacionesTecnicas = `Diferencia significativa. ${validation.explicacion}. Verificar: 1) Impuestos en conceptos, 2) Complementos adicionales, 3) Retenciones.`;
          }
        }
      }

      const nivelValidacion = esNomina
        ? "ESTRUCTURAL, NÓMINA 1.2"
        : (version === "3.3"
          ? "ESTRUCTURAL, TIMBRE"
          : "ESTRUCTURAL, SAT, NEGOCIO, RIESGO");

      const desglose = esNomina
        ? `CFDI DE NÓMINA:\nPercepciones: $${nominaInfo.totalPercepciones.toFixed(2)}\nDeducciones: $${nominaInfo.totalDeducciones.toFixed(2)}\nOtros Pagos: $${nominaInfo.totalOtrosPagos.toFixed(2)}\nISR Retenido: $${nominaInfo.isrRetenido.toFixed(2)}\nTotal: $${validation.calculado.toFixed(2)}`
        : generateDesglose(taxesByConcepto);

      // ✅ SKILL v1.0.0 - BLOQUE 8 - REGLA 8.1: Complementos detectados
      const complementosDetectados: string[] = [];
      if (pagosInfo.presente && pagosInfo.versionPagos) {
        complementosDetectados.push(`Pagos ${pagosInfo.versionPagos}`);
      }
      if (esNomina && nominaInfo.versionNomina) {
        complementosDetectados.push(`Nómina ${nominaInfo.versionNomina}`);
      }
      if (cartaPortePresente && versionCartaPorte) {
        complementosDetectados.push(`CartaPorte ${versionCartaPorte}`);
      }

      // ✅ SKILL v1.0.0 - BLOQUE 8 - REGLA 8.2: Score informativo (NO bloqueante)
      // Variable scoreInformativo already declared above
      // scoreInformativo calculation fixed
      const scoreInformativoCalculado = calcularScoreInformativo(
        resultado,
        resultado.includes("🟢") || resultado.includes("🟡"),
        validation.diferencia,
        cartaPorteCompleta,
        requiereCartaPorte
      );
      // ==================== VALIDACIÓN LISTAS NEGRAS (OFFLINE/LOCAL) ====================
      // Validar RFCs contra base de datos local (IndexedDB)
      let rfcEmisorBlacklist: BlacklistValidation | undefined;
      let rfcReceptorBlacklist: BlacklistValidation | undefined;

      try {
        if (rfcEmisor && rfcEmisor.length >= 12) {
          rfcEmisorBlacklist = await checkRFCBlacklist(rfcEmisor);
        }
        if (rfcReceptor && rfcReceptor.length >= 12) {
          rfcReceptorBlacklist = await checkRFCBlacklist(rfcReceptor);
        }
      } catch (err) {
        console.error("Error validando listas negras:", err);
      }

      // Reglas de negocio para Listas Negras
      let blacklistNivelValidacion = "SIN CAMBIOS";

      if (rfcEmisorBlacklist?.found) {
        if (rfcEmisorBlacklist.is69B) {
          resultado = "🔴 NO USABLE (RFC 69-B)";
          comentarioFiscal = `[CRÍTICO] RFC EMISOR EN LISTA 69-B (${rfcEmisorBlacklist.situacion}). Operaciones inexistentes. NO DEDUCIBLE. ` + comentarioFiscal;
          blacklistNivelValidacion = "ERROR";
        } else if (rfcEmisorBlacklist.isEFOS) {
          resultado = "🟡 ALERTA (RFC EFOS)";
          comentarioFiscal = `[ALERTA] RFC EMISOR EN LISTA EFOS (Facturera). Revisar documentación soporte. ` + comentarioFiscal;
        }
      }

      if (rfcReceptorBlacklist?.found) {
        if (rfcReceptorBlacklist.is69B) {
          comentarioFiscal += " [ALERTA] RFC Receptor en lista 69-B.";
        }
      }

      // ==================== VALIDACIÓN ESTATUS SAT (ONLINE) ====================
      let finalEstatusSAT: "No verificado" | "Vigente" | "Cancelado" | "No Encontrado" | "Error Conexión" = "No verificado"; // Usamos variables locales para no chocar con las const de arriba
      let finalEstatusCancelacion = "";
      let finalResultado = resultado;
      let finalComentarioFiscal = comentarioFiscal;
      // Usar el nivel de validación calculado por listas negras si aplica, sino el original
      let finalNivelValidacion = blacklistNivelValidacion !== "SIN CAMBIOS" ? blacklistNivelValidacion : nivelValidacion;
      let finalScore = scoreInformativoCalculado;

      // Solo validar con SAT si el XML es estructuralmente válido y tiene datos mínimos
      if (uuid && rfcEmisor && rfcReceptor && totalXML > 0) {
        const cacheKey = `cfdi-status-${uuid}`;
        const cached = localStorage.getItem(cacheKey);
        let shouldUseCache = false;

        if (cached) {
          try {
            const cachedData = JSON.parse(cached);
            const cacheAge = Date.now() - new Date(cachedData.validatedAt).getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            if (cacheAge < twentyFourHours) {
              finalEstatusSAT = cachedData.estado;
              finalEstatusCancelacion = cachedData.estatusCancelacion || "";
              shouldUseCache = true;
            }
          } catch (e) {
            console.error("Error reading SAT cache", e);
          }
        }

        if (!shouldUseCache) {
          // Ejecutar validación SAT en segundo plano (promesa no bloqueante para UI pero sí para resultado final)
          // Nota: Para procesamiento masivo, esto podría ralentizar. 
          // En esta implementación lo hacemos "await" para asegurar integridad del reporte.
          // Si es muy lento, se podría mover a un useEffect post-carga.
          try {
            const satStatus = await checkCFDIStatusSAT(uuid, rfcEmisor, rfcReceptor, totalXML);
            finalEstatusSAT = satStatus.estado;
            finalEstatusCancelacion = satStatus.estatusCancelacion || "";

            localStorage.setItem(cacheKey, JSON.stringify(satStatus));
          } catch (error) {
            console.error("Error validating with SAT:", error);
            finalEstatusSAT = "Error Conexión";
          }
        }
      }

      // REGLA CRÍTICA: Si está CANCELADO, anular validez fiscal
      if (finalEstatusSAT === "Cancelado") {
        finalResultado = `🔴 NO DISPONIBLE (CANCELADO)`;
        finalComentarioFiscal = `[CRÍTICO] CFDI CANCELADO en SAT. ${finalEstatusCancelacion}. No tiene efectos fiscales. ` + comentarioFiscal;
        finalNivelValidacion = "ERROR";
        finalScore = 0;
      } else if (finalEstatusSAT === "No Encontrado") {
        // No penalizar tan fuerte porque puede ser recién timbrado
        comentarioFiscal = `[ALERTA] UUID no encontrado en SAT (puede ser muy reciente o apócrifo). ` + comentarioFiscal;
      }

      return {
        fileName,
        uuid,
        versionCFDI: version,
        tipoCFDI,
        serie,
        folio,
        fechaEmision,
        horaEmision,
        añoFiscal,
        estatusSAT: finalEstatusSAT,
        fechaCancelacion: finalEstatusCancelacion,
        rfcEmisorBlacklist,
        rfcReceptorBlacklist,
        cfdiSustituido,
        uuidSustitucion,
        rfcEmisor,
        nombreEmisor,
        regimenEmisor,
        estadoSATEmisor: "Vigente",
        rfcReceptor,
        nombreReceptor,
        regimenReceptor,
        cpReceptor,
        tieneCfdiRelacionados,
        tipoRelacion,
        uuidRelacionado,
        tipoRealDocumento,
        requiereCartaPorte,
        cartaPorte: cartaPortePresente,
        cartaPorteCompleta,
        versionCartaPorte,
        pagosPresente: pagosInfo.presente,
        versionPagos: pagosInfo.versionPagos,
        pagosValido: pagosInfo.valido,
        encodingDetectado: encodingInfo.encoding,
        complementosDetectados,
        scoreInformativo: finalScore,
        subtotal: taxesByConcepto.subtotal,
        baseIVA16: taxesByConcepto.baseIVA16,
        baseIVA8: taxesByConcepto.baseIVA8,
        baseIVA0: taxesByConcepto.baseIVA0,
        baseIVAExento: taxesByConcepto.baseIVAExento,
        ivaTraslado: taxesByConcepto.ivaTraslado,
        ivaRetenido: taxesByConcepto.ivaRetenido,
        isrRetenido: taxesByConcepto.isrRetenido,
        iepsTraslado: taxesByConcepto.iepsTraslado,
        iepsRetenido: taxesByConcepto.iepsRetenido,
        impuestosLocalesTrasladados: taxesByConcepto.impuestosLocalesTrasladados,
        impuestosLocalesRetenidos: taxesByConcepto.impuestosLocalesRetenidos,
        total: totalXML,
        moneda,
        tipoCambio: moneda === "MXN" ? 1 : (parseFloat(tipoCambio) || 1),
        formaPago,
        metodoPago,
        nivelValidacion,
        resultado,
        comentarioFiscal,
        observacionesTecnicas,
        iva: taxesByConcepto.ivaTraslado,
        isValid: resultado.includes("🟢") || resultado.includes("🟡"),
        totalCalculado: validation.calculado,
        diferenciaTotales: validation.diferencia,
        desglosePorConcepto: taxesByConcepto.desglosePorConcepto,
        desglose: desglose,
        esNomina: esNomina ? "SÍ" : "NO",
        versionNomina: nominaInfo.versionNomina,
        totalPercepciones: nominaInfo.totalPercepciones,
        totalDeducciones: nominaInfo.totalDeducciones,
        totalOtrosPagos: nominaInfo.totalOtrosPagos,
        isrRetenidoNomina: nominaInfo.isrRetenido,
        totalCalculadoNomina: validation.calculado,
      };
    } catch (error) {
      console.error(error);
      return createErrorResult(
        fileName,
        error instanceof Error ? error.message : "Error desconocido al procesar XML"
      );
    }
  };

  const createErrorResult = (fileName: string, errorMsg: string): ValidationResult => ({
    fileName,
    uuid: "NO DISPONIBLE",
    versionCFDI: "NO DISPONIBLE",
    tipoCFDI: "NO DISPONIBLE",
    serie: "NO DISPONIBLE",
    folio: "NO DISPONIBLE",
    fechaEmision: "NO DISPONIBLE",
    horaEmision: "NO DISPONIBLE",
    añoFiscal: 0,
    estatusSAT: "Error",
    fechaCancelacion: "NO APLICA",
    cfdiSustituido: "NO",
    uuidSustitucion: "NO APLICA",
    rfcEmisor: "NO DISPONIBLE",
    nombreEmisor: "NO DISPONIBLE",
    regimenEmisor: "NO DISPONIBLE",
    estadoSATEmisor: "NO DISPONIBLE",
    rfcReceptor: "NO DISPONIBLE",
    nombreReceptor: "NO DISPONIBLE",
    regimenReceptor: "NO DISPONIBLE",
    cpReceptor: "NO DISPONIBLE",
    tieneCfdiRelacionados: "NO",
    tipoRelacion: "NO APLICA",
    uuidRelacionado: "NO APLICA",
    tipoRealDocumento: "Desconocido",
    requiereCartaPorte: "NO DISPONIBLE",
    cartaPorte: "NO",
    cartaPorteCompleta: "NO APLICA",
    versionCartaPorte: "NO APLICA",
    subtotal: 0,
    baseIVA16: 0,
    baseIVA8: 0,
    baseIVA0: 0,
    baseIVAExento: 0,
    ivaTraslado: 0,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 0,
    moneda: "MXN",
    tipoCambio: 1,
    formaPago: "NO DISPONIBLE",
    metodoPago: "NO DISPONIBLE",
    nivelValidacion: "ERROR",
    resultado: "🔴 NO USABLE",
    comentarioFiscal: errorMsg,
    observacionesTecnicas: `Error al procesar: ${errorMsg}`,
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
  });

  const clearResults = () => {
    setValidationResults([]);
    setProgress({ current: 0, total: 0 });
  };

  return {
    isValidating,
    validationResults,
    validateXMLFiles,
    clearResults,
    progress,
  };
}
