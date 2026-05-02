import { useState } from "react";
import { UploadedFile } from "@/components/UploadZone";
import { checkCFDIStatusSAT } from "@/utils/satStatusValidator";
import { checkRFCBlacklist, BlacklistValidation } from "@/utils/blacklistValidator"; // Nuevo

import {
  ValidationResult,
  ConceptoDesglose,
  detectCFDIVersion,
  parseXMLDate,
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
  validateNominaTotals,
  classifyCFDI,
  extractReceptorInfo
} from "@/lib/cfdiEngine";


export function useXMLValidator() {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // ✅ PRODUCCIÓN: Procesamiento por LOTES para evitar congelamiento
  const validateXMLFiles = async (files: UploadedFile[], giroEmpresa?: string, onProgressUpdate?: (current: number, total: number) => void) => {
    setIsValidating(true);
    setProgress({ current: 0, total: files.length });

    const BATCH_SIZE = 20; // Procesar 20 XMLs por lote
    const BATCH_DELAY = 50; // 50ms entre lotes para no bloquear UI
    const XML_TIMEOUT = 30000; // 30 segundos máximo por XML (SAT puede ser lento)

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
            validateSingleXML(file.name, file.content, giroEmpresa),
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
              : "Error al procesar archivo",
            giroEmpresa
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


  // ==================== FIN VALIDACIÓN DE NÓMINA ====================

  const validateSingleXML = async (
    fileName: string,
    xmlContent: string,
    giroEmpresa?: string
  ): Promise<ValidationResult> => {
    try {
      // ✅ SKILL sentinel-express-pro v1.0.0 - BLOQUE 6 - Regla 6.1
      // Detectar encoding antes de parsear
      const encodingInfo = detectarEncoding(xmlContent);

      // Si encoding no soportado → NO USABLE
      if (!encodingInfo.soportado) {
        return createErrorResult(fileName, encodingInfo.errorMsg, giroEmpresa);
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        return createErrorResult(fileName, "Error al procesar XML: formato inválido", giroEmpresa);
      }

      const comprobante = xmlDoc.documentElement;
      const version = detectCFDIVersion(xmlContent);

      // ✅ SKILL sentinel-express-pro v1.0.0 - ALCANCE TEMPORAL Y VERSIONES CFDI
      // Soporte multiversión: CFDI 2.0/2.2/3.0/3.2 (históricos), 3.3 (2017-2021), 4.0 (2022-actual)
      const versionesValidas = ["2.0", "2.2", "3.0", "3.2", "3.3", "4.0"];
      if (!versionesValidas.includes(version)) {
        return createErrorResult(
          fileName,
          `Versión no soportada: ${version}. Se aceptan CFDI 2.0, 2.2, 3.0, 3.2, 3.3 y 4.0 según contexto histórico SAT.`,
          giroEmpresa
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
      let regimenEmisor = "NO DISPONIBLE";

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
        }
      }

      // RECEPTOR INFO (Centralizado en Motor)
      const receptorInfo = extractReceptorInfo(xmlDoc);
      let rfcReceptor = receptorInfo.rfc;
      let nombreReceptor = receptorInfo.nombre;
      let regimenReceptor = receptorInfo.regimenFiscal;
      let usoCFDI = receptorInfo.usoCFDI;

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
      const { tieneCfdiRelacionados, tipoRelacion, uuidRelacionado, uuids_relacionados } = extractCfdiRelacionados(xmlDoc, xmlContent);

      // ✅ SKILL sentinel-express-pro v1.0.0 - CLASIFICACIÓN DOCUMENTAL (EXPLÍCITA)
      // Determinar tipo real de documento: Factura, NC, ND, REP, Nómina, Traslado
      const tipoRealDocumento = determinarTipoRealDocumento(tipoCFDI, tieneCfdiRelacionados, tipoRelacion);

      // ✅ SKILL sentinel-express-pro v1.0.0 - VALIDACIÓN TIPORELACION NC/ND
      // Validar que Notas de Crédito tengan TipoRelacion=01 y Notas de Cargo tengan TipoRelacion=02
      // NO exigir TipoRelacion a Facturas, Pagos, Nómina o Traslado
      if (tipoRealDocumento === "Nota de Crédito") {
        if (tieneCfdiRelacionados === "NO" || tipoRelacion !== "01") {
          return createWarningResult(
            fileName,
            `Nota de Crédito sin TipoRelacion=01. Encontrado: ${tipoRelacion === "NO DISPONIBLE" ? "sin CfdiRelacionados" : `TipoRelacion='${tipoRelacion}'`}.`,
            {
              uuid, tipoCFDI, serie, folio, fechaEmision, horaEmision, añoFiscal,
              rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor,
              tipoRealDocumento: "Nota de Crédito",
              tieneCfdiRelacionados, tipoRelacion, uuidRelacionado, uuids_relacionados,
              giroEmpresa,
            }
          );
        }
      }

      if (tipoRealDocumento === "Nota de Cargo") {
        if (tieneCfdiRelacionados === "NO" || tipoRelacion !== "02") {
          return createWarningResult(
            fileName,
            `Nota de Cargo sin TipoRelacion=02. Encontrado: ${tipoRelacion === "NO DISPONIBLE" ? "sin CfdiRelacionados" : `TipoRelacion='${tipoRelacion}'`}.`,
            {
              uuid, tipoCFDI, serie, folio, fechaEmision, horaEmision, añoFiscal,
              rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor,
              tipoRealDocumento: "Nota de Cargo",
              tieneCfdiRelacionados, tipoRelacion, uuidRelacionado, uuids_relacionados,
              giroEmpresa,
            }
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
            añoFiscal,
            estatusSAT,
            fechaCancelacion,
            rfcEmisorBlacklist: { isEFOS: false, is69B: false, found: false },
            rfcReceptorBlacklist: { isEFOS: false, is69B: false, found: false },
            cfdiSustituido,
            uuidSustitucion,
            rfcEmisor,
            nombreEmisor,
            regimenEmisor,
            estadoSATEmisor,
            rfcReceptor,
            nombreReceptor,
            regimenReceptor,
            usoCFDI,
            cpReceptor,
            tieneCfdiRelacionados,
            tipoRelacion,
            uuidRelacionado,
            uuids_relacionados,
            tipoRealDocumento: "Nómina",
            requiereCartaPorte: "NO",
            cartaPorte: "NO APLICA",
            cartaPorteCompleta: "NO APLICA",
            versionCartaPorte: "NO APLICA",
            pagosPresente: "NO",
            versionPagos: "NO APLICA",
            pagosValido: "NO APLICA",
            encodingDetectado: "UTF-8",
            complementosDetectados: ["Nómina"],
            scoreInformativo: 50,
            subtotal: 0,
            baseIVA16: 0,
            baseIVA8: 0,
            baseIVA0: 0,
            baseIVAExento: 0,
            baseNoObjeto: 0,
            baseObjetoSinDesglose: 0,
            clasificacionFiscal: "SIN_IMPUESTOS",
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
            nivelValidacion: "NÓMINA - ESTRUCTURA INVÁLIDA",
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `Complemento de Nómina no encontrado o ilegible. ${nominaInfo.errorMsg}. Verificar que el XML contenga el nodo nomina12:Nomina.`,
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
            observacionesContador: ""
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
      // PPD sin complemento Pagos → 🟡 ALERTA (el CFDI existe, falta el REP)
      if (pagosInfo.valido === "NO" && pagosInfo.errorMsg) {
        return createWarningResult(
          fileName,
          `CFDI PPD sin Complemento de Pagos (REP). ${pagosInfo.errorMsg}.`,
          {
            uuid, tipoCFDI, serie, folio, fechaEmision, horaEmision, añoFiscal,
            rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor,
            tipoRealDocumento,
            metodoPago: comprobante?.getAttribute("MetodoPago") || "PPD",
            total: parseFloat(comprobante?.getAttribute("Total") || "0"),
            giroEmpresa,
          }
        );
      }

      // IMPUESTOS CORRECTOS (POR CONCEPTO) - Solo para NO nómina
      const taxesByConcepto = esNomina
        ? {
          subtotal: 0,
          baseIVA16: 0,
          baseIVA8: 0,
          baseIVA0: 0,
          baseIVAExento: 0,
          baseNoObjeto: 0,
          baseObjetoSinDesglose: 0,
          clasificacionFiscal: "SIN_IMPUESTOS",
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

      // VALIDACIONES CENTRALIZADAS (ENGINE)
      const cartaPorteInfo = { presente: cartaPortePresente, completa: cartaPorteCompleta, version: versionCartaPorte };
      const classification = classifyCFDI(
        xmlContent,
        version,
        tipoCFDI,
        taxesByConcepto,
        validation,
        esNomina,
        nominaInfo,
        pagosInfo,
        cartaPorteInfo,
        requiereCartaPorte,
        reglasAplicables.contextoHistorico,
        giroEmpresa
      );

      let resultado = classification.resultado;
      let comentarioFiscal = classification.comentarioFiscal;
      let nivelValidacion = classification.nivelValidacion;

      // Guardar copia original del motor antes de ajustes SAT/Listas Negras
      const resultadoMotor = resultado;
      const comentarioMotor = comentarioFiscal;

      let observacionesTecnicas = "Sincronizado con Motor Fiscal v1.1";

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
          resultado = "🔴 NO USABLE";
          comentarioFiscal = `[CRÍTICO] RFC EMISOR EN LISTA 69-B (${rfcEmisorBlacklist.situacion}). Operaciones inexistentes. NO DEDUCIBLE. ` + comentarioFiscal;
          blacklistNivelValidacion = "ERROR";
        } else if (rfcEmisorBlacklist.isEFOS) {
          resultado = "🟡 ALERTA";
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
          try {
            const satStatus = await checkCFDIStatusSAT(uuid, rfcEmisor, rfcReceptor, totalXML);
            finalEstatusSAT = satStatus.estado;
            finalEstatusCancelacion = satStatus.estatusCancelacion || "";

            localStorage.setItem(cacheKey, JSON.stringify(satStatus));
          } catch (error) {
            console.error("Error validating with SAT:", error);
            finalEstatusSAT = "Error Conexión";
            finalEstatusCancelacion = "Error de red / Timeout";
          }
        }
      }

      const ultimoRefrescoSAT = new Date().toISOString();

      // REGLA CRÍTICA: Si está CANCELADO, anular validez fiscal
      if (finalEstatusSAT === "Cancelado") {
        finalResultado = `🔴 NO USABLE`;
        finalComentarioFiscal = `[CRÍTICO] CFDI CANCELADO en SAT. ${finalEstatusCancelacion}. No tiene efectos fiscales. ` + comentarioMotor;
        finalNivelValidacion = "ERROR";
        finalScore = 0;
      } else if (finalEstatusSAT === "No Encontrado") {
        finalComentarioFiscal = `[ALERTA] UUID no encontrado en SAT (puede ser muy reciente o apócrifo). ` + comentarioMotor;
      } else if (finalEstatusSAT === "Error Conexión") {
        // No penalizar pero avisar
        finalComentarioFiscal = `[AVISO] No se pudo verificar estatus en SAT (Timeout). ` + comentarioMotor;
      } else {
        // En Vigente o No verificado, usamos el comentario base del motor
        finalComentarioFiscal = comentarioMotor;
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
        scoreInformativo: finalScore,
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
        moneda: comprobante?.getAttribute("Moneda") || "MXN",
        tipoCambio: 1,
        formaPago: comprobante?.getAttribute("FormaPago") || "NO DISPONIBLE",
        metodoPago: comprobante?.getAttribute("MetodoPago") || "NO DISPONIBLE",
        nivelValidacion: finalNivelValidacion,
        resultado: finalResultado,
        comentarioFiscal: finalComentarioFiscal,
        observacionesTecnicas: comentarioFiscal,
        iva: taxesByConcepto.ivaTraslado,
        isValid: validation.isValid,
        totalCalculado: validation.calculado,
        diferenciaTotales: validation.diferencia,
        desglosePorConcepto: taxesByConcepto.desglosePorConcepto,
        desglose: JSON.stringify(taxesByConcepto.desglosePorConcepto),
        esNomina: esNomina ? "SÍ" : "NO",
        giroEmpresa: giroEmpresa, // ✅ Nuevo campo guardado
        versionNomina: nominaInfo.versionNomina,
        totalPercepciones: nominaInfo.totalPercepciones,
        totalDeducciones: nominaInfo.totalDeducciones,
        totalOtrosPagos: nominaInfo.totalOtrosPagos,
        isrRetenidoNomina: nominaInfo.isrRetenido,
        totalCalculadoNomina: validation.calculado,
        observacionesContador: "",
        resultadoMotor,
        comentarioMotor,
        ultimoRefrescoSAT
      };
    } catch (error) {
      console.error(error);
      return createErrorResult(
        fileName,
        error instanceof Error ? error.message : "Error desconocido al procesar XML",
        giroEmpresa
      );
    }
  };

  const createErrorResult = (
    fileName: string, 
    errorMsg: string, 
    giroEmpresa?: string,
    errorGrave: boolean = true,
    warning: boolean = false
  ): ValidationResult => {
    let resultado = "🟢 USABLE";
    if (errorGrave) {
      resultado = "🔴 NO USABLE";
    } else if (warning) {
      resultado = "🟡 ALERTA";
    }

    return {
      fileName,
      uuid: "NO DISPONIBLE",
      resultadoMotor: resultado,
      comentarioMotor: errorMsg,
      giroEmpresa,
    ultimoRefrescoSAT: new Date().toISOString(),
    versionCFDI: "NO DISPONIBLE",
    tipoCFDI: "NO DISPONIBLE",
    serie: "NO DISPONIBLE",
    folio: "NO DISPONIBLE",
    fechaEmision: "NO DISPONIBLE",
    horaEmision: "NO DISPONIBLE",
    añoFiscal: 0,
    estatusSAT: "Error",
    fechaCancelacion: "NO APLICA",
    rfcEmisorBlacklist: { isEFOS: false, is69B: false, found: false },
    rfcReceptorBlacklist: { isEFOS: false, is69B: false, found: false },
    cfdiSustituido: "NO",
    uuidSustitucion: "NO APLICA",
    rfcEmisor: "NO DISPONIBLE",
    nombreEmisor: "NO DISPONIBLE",
    regimenEmisor: "NO DISPONIBLE",
    estadoSATEmisor: "NO DISPONIBLE",
    rfcReceptor: "NO DISPONIBLE",
    nombreReceptor: "NO DISPONIBLE",
    regimenReceptor: "NO DISPONIBLE",
    usoCFDI: "NO DISPONIBLE",
    cpReceptor: "NO DISPONIBLE",
    tieneCfdiRelacionados: "NO",
    tipoRelacion: "NO APLICA",
    uuidRelacionado: "NO APLICA",
    uuids_relacionados: [],
    tipoRealDocumento: "Desconocido",
    requiereCartaPorte: "NO DISPONIBLE",
    cartaPorte: "NO",
    cartaPorteCompleta: "NO APLICA",
    versionCartaPorte: "NO APLICA",
    pagosPresente: "NO",
    versionPagos: "NO APLICA",
    pagosValido: "NO APLICA",
    encodingDetectado: "UTF-8",
    complementosDetectados: [],
    scoreInformativo: 0,
    subtotal: 0,
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
    total: 0,
    moneda: "MXN",
    tipoCambio: 1,
    formaPago: "NO DISPONIBLE",
    metodoPago: "NO DISPONIBLE",
    nivelValidacion: "ERROR",
    resultado: resultado,
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
    observacionesContador: "",
  };
};

  // 🟡 Para casos con datos válidos pero con alertas fiscales (NC, PPD sin REP, etc.)
  type WarningBase = Pick<
    ValidationResult,
    | "uuid"
    | "tipoCFDI"
    | "serie"
    | "folio"
    | "fechaEmision"
    | "horaEmision"
    | "añoFiscal"
    | "rfcEmisor"
    | "nombreEmisor"
    | "rfcReceptor"
    | "nombreReceptor"
    | "tipoRealDocumento"
  >;

  const createWarningResult = (
    fileName: string,
    warningMsg: string,
    base: WarningBase & Partial<ValidationResult>
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
