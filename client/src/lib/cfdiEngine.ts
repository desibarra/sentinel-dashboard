
import { BlacklistValidation } from "@/utils/blacklistValidator";

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
    uuids_relacionados: string[]; // ✅ Nuevo para soporte multi-UUID
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
    observacionesContador: string;
}

export const detectCFDIVersion = (xmlContent: string): string => {
    const versionMatch = xmlContent.match(/Version="([^"]+)"/);
    return versionMatch ? versionMatch[1] : "DESCONOCIDA";
};

export const parseXMLDate = (dateStr: string): { fecha: string; hora: string } => {
    if (!dateStr) return { fecha: "NO DISPONIBLE", hora: "NO DISPONIBLE" };
    const parts = dateStr.split("T");
    const fecha = parts[0] || "NO DISPONIBLE";
    const hora = parts[1]?.substring(0, 8) || "NO DISPONIBLE";
    return { fecha, hora };
};

export const extractCPReceptor = (xmlDoc: XMLDocument, version: string): string => {
    const todosNodos = xmlDoc.documentElement?.getElementsByTagName("*");
    if (todosNodos) {
        for (let i = 0; i < todosNodos.length; i++) {
            const nodo = todosNodos[i];
            const tagName = nodo.localName || nodo.nodeName;
            if (version === "4.0" && (tagName === "Receptor" || tagName === "cfdi:Receptor")) {
                const cp = nodo.getAttribute("DomicilioFiscalReceptor");
                if (cp) return cp;
            }
            if (nodo.hasAttribute("CodigoPostal")) return nodo.getAttribute("CodigoPostal") || "NO DISPONIBLE";
            if (nodo.hasAttribute("codigoPostal")) return nodo.getAttribute("codigoPostal") || "NO DISPONIBLE";
        }
    }
    return "NO DISPONIBLE";
};

export const extractCfdiRelacionados = (xmlDoc: XMLDocument, xmlContent: string): {
    tieneCfdiRelacionados: string;
    tipoRelacion: string;
    uuidRelacionado: string;
    uuids_relacionados: string[];
} => {
    const tieneCfdiRelacionados = xmlContent.includes("CfdiRelacionados");
    if (!tieneCfdiRelacionados) {
        return {
            tieneCfdiRelacionados: "NO",
            tipoRelacion: "NO APLICA",
            uuidRelacionado: "NO APLICA",
            uuids_relacionados: []
        };
    }
    let tipoRelacion = "NO DISPONIBLE";
    const tipoRelacionMatch = xmlContent.match(/TipoRelacion="(\d{2})"/);
    if (tipoRelacionMatch) tipoRelacion = tipoRelacionMatch[1];

    // Extraer todos los UUIDs relacionados
    const uuids_relacionados: string[] = [];
    const uuidRegex = /CfdiRelacionado[^>]*UUID="([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})"/gi;
    let match;
    while ((match = uuidRegex.exec(xmlContent)) !== null) {
        uuids_relacionados.push(match[1].toUpperCase());
    }

    const uuidRelacionado = uuids_relacionados.length > 0 ? uuids_relacionados[0] : "NO DISPONIBLE";

    return {
        tieneCfdiRelacionados: "SÍ",
        tipoRelacion,
        uuidRelacionado,
        uuids_relacionados
    };
};

export const determinarTipoRealDocumento = (tipoCFDI: string, tieneCfdiRelacionados: string, tipoRelacion: string): string => {
    if (tipoCFDI === "I" && tieneCfdiRelacionados === "SÍ" && tipoRelacion === "02") return "Nota de Cargo";
    if (tipoCFDI === "E" && tieneCfdiRelacionados === "SÍ" && tipoRelacion === "01") return "Nota de Crédito";
    if (tipoCFDI === "E") return "Egreso";
    if (tipoCFDI === "P") return "Pago (REP)";
    if (tipoCFDI === "N") return "Nómina";
    if (tipoCFDI === "T") return "Traslado";
    if (tipoCFDI === "I") return "Factura";
    return "Desconocido";
};

export const obtenerReglasAplicables = (version: string, añoFiscal: number, tipoCFDI: string) => {
    if (["2.0", "2.2", "3.0", "3.2"].includes(version)) {
        return { requiereCartaPorte: false, requiereComplementoPagos: false, versionPagosEsperada: "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios"], contextoHistorico: `CFDI ${version} (${añoFiscal}): Reglas históricas SAT ${añoFiscal}, sin Carta Porte ni Pagos` };
    }
    if (version === "3.3") {
        return { requiereCartaPorte: false, requiereComplementoPagos: añoFiscal >= 2018 && tipoCFDI === "P", versionPagosEsperada: añoFiscal >= 2018 ? "1.0" : "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado"], contextoHistorico: `CFDI 3.3 (${añoFiscal}): Reglas SAT ${añoFiscal}, ${añoFiscal >= 2018 ? 'Pagos 1.0 disponible' : 'Pre-Pagos'}, sin Carta Porte` };
    }
    if (version === "4.0") {
        return { requiereCartaPorte: ["T", "I"].includes(tipoCFDI), requiereComplementoPagos: tipoCFDI === "P", versionPagosEsperada: tipoCFDI === "P" ? "2.0" : "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado", "carta-porte"], contextoHistorico: `CFDI 4.0 (${añoFiscal}): Reglas SAT vigentes ${añoFiscal}, Carta Porte obligatoria según tipo, Pagos 2.0` };
    }
    return { requiereCartaPorte: false, requiereComplementoPagos: false, versionPagosEsperada: "NO APLICA", validacionesAplicables: ["estructural"], contextoHistorico: `Versión ${version} no reconocida, validación mínima` };
};

export const extractTaxesByConcepto = (xmlDoc: XMLDocument, version: string) => {
    let subtotalCalculado = 0, baseIVA16 = 0, baseIVA8 = 0, baseIVA0 = 0, baseIVAExento = 0;
    let trasladosTotales = 0, retencionesTotales = 0, ivaTraslado = 0, ivaRetenido = 0, isrRetenido = 0, iepsTraslado = 0, iepsRetenido = 0, impuestosLocalesTrasladados = 0, impuestosLocalesRetenidos = 0;
    const desglosePorConcepto: ConceptoDesglose[] = [];
    const comprobante = xmlDoc.documentElement;
    const conceptos = comprobante?.getElementsByTagName("*");
    let conceptoNumero = 0;
    if (conceptos) {
        for (let i = 0; i < conceptos.length; i++) {
            const nodo = conceptos[i];
            if ((nodo.localName || nodo.nodeName) !== "Concepto") continue;
            conceptoNumero++;
            const importe = parseFloat(nodo.getAttribute("Importe") || "0");
            subtotalCalculado += importe;
            const trasladosConcepto: any[] = [], retencionesConcepto: any[] = [];
            const impuestosConcepto = Array.from(nodo.children).find(h => (h.localName || h.nodeName) === "Impuestos");
            if (impuestosConcepto) {
                const children = Array.from(impuestosConcepto.getElementsByTagName("*"));
                children.forEach((nodoImpuesto: any) => {
                    const tagImpuesto = nodoImpuesto.localName || nodoImpuesto.nodeName;
                    if (tagImpuesto === "Traslado") {
                        const tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0", base = parseFloat(nodoImpuesto.getAttribute("Base") || "0"), importeTraslado = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), impuesto = nodoImpuesto.getAttribute("Impuesto") || "002";
                        trasladosTotales += importeTraslado;
                        trasladosConcepto.push({ impuesto, tasa, importe: importeTraslado });
                        if (impuesto === "002") {
                            if (tasa === "0.16" || tasa === "0.160000") baseIVA16 += base;
                            else if (tasa === "0.08" || tasa === "0.080000") baseIVA8 += base;
                            else if (tasa === "0.00" || tasa === "0.000000") baseIVA0 += base;
                            ivaTraslado += importeTraslado;
                        } else if (impuesto === "003") iepsTraslado += importeTraslado;
                    } else if (tagImpuesto === "Retencion") {
                        const impuesto = nodoImpuesto.getAttribute("Impuesto") || "002", importeRetencion = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0";
                        retencionesTotales += importeRetencion;
                        retencionesConcepto.push({ impuesto, tasa, importe: importeRetencion });
                        if (impuesto === "002") ivaRetenido += importeRetencion;
                        else if (impuesto === "001") isrRetenido += importeRetencion;
                        else if (impuesto === "003") iepsRetenido += importeRetencion;
                    }
                });
            }
            const totalParcial = importe + trasladosConcepto.reduce((sum, t) => sum + t.importe, 0) - retencionesConcepto.reduce((sum, r) => sum + r.importe, 0);
            desglosePorConcepto.push({ numero: conceptoNumero, importe, traslados: trasladosConcepto, retenciones: retencionesConcepto, subtotalAcumulado: subtotalCalculado, totalParcial });
        }
    }
    const todosNodos = comprobante?.getElementsByTagName("*");
    if (todosNodos) {
        for (let i = 0; i < todosNodos.length; i++) {
            const nodo = todosNodos[i];
            if ((nodo.localName || nodo.nodeName) === "ImpuestosLocales") {
                const totalTrasladados = nodo.getAttribute("TotaldeTraslados") || nodo.getAttribute("TotalImpuestosLocalesTrasladados");
                const totalRetenidos = nodo.getAttribute("TotaldeRetenciones") || nodo.getAttribute("TotalImpuestosLocalesRetenidos");
                if (totalTrasladados) impuestosLocalesTrasladados += parseFloat(totalTrasladados);
                if (totalRetenidos) impuestosLocalesRetenidos += parseFloat(totalRetenidos);
                Array.from(nodo.children).forEach((hijo: any) => {
                    const hijoTag = hijo.localName || hijo.nodeName;
                    if (hijoTag === "TrasladosLocales") {
                        const imp = parseFloat(hijo.getAttribute("Importe") || "0");
                        if (imp > 0 && !totalTrasladados) impuestosLocalesTrasladados += imp;
                    } else if (hijoTag === "RetencionesLocales") {
                        const imp = parseFloat(hijo.getAttribute("Importe") || "0");
                        if (imp > 0 && !totalRetenidos) impuestosLocalesRetenidos += imp;
                    }
                });
                break;
            }
        }
    }
    return {
        subtotal: Math.round(subtotalCalculado * 100) / 100, baseIVA16: Math.round(baseIVA16 * 100) / 100, baseIVA8: Math.round(baseIVA8 * 100) / 100, baseIVA0: Math.round(baseIVA0 * 100) / 100, baseIVAExento: Math.round(baseIVAExento * 100) / 100,
        ivaTraslado: Math.round(ivaTraslado * 100) / 100, ivaRetenido: Math.round(ivaRetenido * 100) / 100, isrRetenido: Math.round(isrRetenido * 100) / 100, iepsTraslado: Math.round(iepsTraslado * 100) / 100, iepsRetenido: Math.round(iepsRetenido * 100) / 100,
        impuestosLocalesTrasladados: Math.round(impuestosLocalesTrasladados * 100) / 100, impuestosLocalesRetenidos: Math.round(impuestosLocalesRetenidos * 100) / 100, trasladosTotales: Math.round(trasladosTotales * 100) / 100, retencionesTotales: Math.round(retencionesTotales * 100) / 100, desglosePorConcepto
    };
};

export const validateTotals = (taxesByConcepto: any, totalXML: number) => {
    const totalCalculado = taxesByConcepto.subtotal + taxesByConcepto.trasladosTotales - taxesByConcepto.retencionesTotales + taxesByConcepto.impuestosLocalesTrasladados - taxesByConcepto.impuestosLocalesRetenidos;
    const diferencia = Math.abs(totalCalculado - totalXML);
    const tolerancia = 0.01;
    return { isValid: diferencia <= tolerancia, calculado: Math.round(totalCalculado * 100) / 100, diferencia: Math.round(diferencia * 100) / 100, explicacion: "" };
};

export const generateDesglose = (result: any): string => {
    let desglose = "DESGLOSE POR CONCEPTO:\n\n";
    result.desglosePorConcepto.forEach((concepto: any) => {
        desglose += `Concepto ${concepto.numero}\n  Importe: $${concepto.importe.toFixed(2)}\n`;
    });
    return desglose;
};

export const determineRequiereCartaPorte = (xmlContent: string, tipoCFDI: string, version: string): string => {
    if (version === "3.3") return "NO APLICA";
    if (["P", "E", "N"].includes(tipoCFDI)) return "NO";
    if (xmlContent.includes("CartaPorte") && xmlContent.includes("Ubicacion")) return "SÍ";
    if (tipoCFDI === "T") {
        if (xmlContent.includes("Autotransporte") && /ClaveProdServ="78\d{5}|80\d{5}|81\d{5}"/i.test(xmlContent)) return "SÍ";
        return "NO";
    }
    if (tipoCFDI === "I") {
        const tieneCve = /ClaveProdServ="78101[78]\d{2}|78102\d{3}|80101[78]\d{2}|81101[78]\d{2}"/i.test(xmlContent);
        const tieneDesc = /Descripcion="[^"]*\b(?:servicio\s+de\s+transporte|flete|acarreo|autotransporte)\b[^"]*"/i.test(xmlContent);
        const tieneRuta = /\b(?:origen|destino|kilometros?|ruta|via\s+federal|carretera)\b/i.test(xmlContent);
        if (tieneCve && tieneDesc && tieneRuta) return "SÍ";
        return "NO";
    }
    return "NO";
};

export const extractCartaPorteInfo = (xmlContent: string, version: string) => {
    const tiene = xmlContent.includes("CartaPorte");
    if (version === "3.3" && !tiene) return { presente: "NO APLICA", completa: "NO APLICA", version: "NO APLICA" };
    if (!tiene) return { presente: "NO", completa: "NO APLICA", version: "NO APLICA" };
    const vMatch = xmlContent.match(/CartaPorte[^>]*Version="([^"]+)"/);
    const cpVersion = vMatch ? vMatch[1] : "NO DISPONIBLE";
    const uComp = xmlContent.includes("Ubicaciones") && /TipoUbicacion="Origen"/i.test(xmlContent) && /TipoUbicacion="Destino"/i.test(xmlContent);
    const mComp = xmlContent.includes("Mercancias") && xmlContent.includes("PesoBrutoTotal") && xmlContent.includes("UnidadPeso") && xmlContent.includes("NumTotalMercancias");
    const aComp = xmlContent.includes("Autotransporte") && xmlContent.includes("PermSCT") && xmlContent.includes("NumPermisoSCT") && xmlContent.includes("IdentificacionVehicular") && xmlContent.includes("ConfigVehicular") && xmlContent.includes("Placa") && (xmlContent.includes("AnioModeloVM") || xmlContent.includes("Anio")) && xmlContent.includes("AseguraRespCivil") && xmlContent.includes("PolizaRespCivil");
    const fComp = xmlContent.includes("FiguraTransporte") && (/RFCFigura="[A-Z0-9]{12,13}"/i.test(xmlContent) || /RFC="[A-Z0-9]{12,13}"/i.test(xmlContent)) && xmlContent.includes("NumLicencia");
    return { presente: "SÍ", completa: uComp && mComp && aComp && fComp ? "SÍ" : "NO", version: cpVersion };
};

export const extractPagosInfo = (xmlContent: string, tipoCFDI: string, version: string, añoFiscal: number, requiere: boolean, vEsperada: string) => {
    if (tipoCFDI !== "P") return { presente: "NO APLICA", versionPagos: "NO APLICA", valido: "NO APLICA", errorMsg: "" };
    if (!requiere) return { presente: "NO APLICA", versionPagos: "NO APLICA", valido: "NO APLICA", errorMsg: `Complemento Pagos no existía en ${añoFiscal}` };
    const tieneP10 = xmlContent.includes("pago10:Pagos"), tieneP20 = xmlContent.includes("pago20:Pagos");
    if (!tieneP10 && !tieneP20) return { presente: "NO", versionPagos: "NO DISPONIBLE", valido: "NO", errorMsg: `Falta complemento de Pagos (${vEsperada})` };
    const vDet = tieneP20 ? "2.0" : "1.0";
    if (vDet !== vEsperada) return { presente: "SÍ", versionPagos: vDet, valido: "NO", errorMsg: `Requiere Pagos ${vEsperada}, detectado ${vDet}` };
    return { presente: "SÍ", versionPagos: vDet, valido: "SÍ", errorMsg: "" };
};

export const detectarEncoding = (xmlContent: string) => {
    const match = xmlContent.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
    if (!match) return { encoding: "UTF-8", soportado: true };
    const enc = match[1].toUpperCase();
    const supported = ["UTF-8", "ISO-8859-1", "WINDOWS-1252"].includes(enc.replace("UTF8", "UTF-8").replace("LATIN1", "ISO-8859-1"));
    return { encoding: enc, soportado: supported, errorMsg: supported ? "" : `Encoding ${enc} no soportado` };
};

export const calcularScoreInformativo = (resultado: string, isValid: boolean, dif: number, cpComp: string, reqCP: string) => {
    if (resultado.includes("🔴")) return dif > 10 ? 10 : (dif > 1 ? 25 : 40);
    if (resultado.includes("🟡")) return reqCP === "SÍ" && cpComp === "NO" ? 70 : 80;
    return isValid && dif === 0 ? 100 : 95;
};

export const detectarNomina = (xmlContent: string, tipoCFDI: string) => tipoCFDI === "N" && (xmlContent.includes("nomina11:Nomina") || xmlContent.includes("nomina12:Nomina"));

export const extractNominaInfo = (xmlDoc: XMLDocument, xmlContent: string) => {
    const nodes = Array.from(xmlDoc.getElementsByTagName("*"));
    const node = nodes.find(n => (n.localName || n.nodeName).includes("Nomina"));
    if (!node) return { versionNomina: "NO DISPONIBLE", esValida: false, errorMsg: "No hay nodo Nómina" };
    const version = node.getAttribute("Version") || "1.2";
    const pMatch = xmlContent.match(/Percepciones[^>]*TotalGravado="([^"]+)"[^>]*TotalExento="([^"]+)"/);
    const totalP = pMatch ? parseFloat(pMatch[1] || "0") + parseFloat(pMatch[2] || "0") : 0;
    const dNode = xmlContent.match(/Deducciones[^>]*TotalOtrasDeducciones="([^"]+)"|Deducciones[^>]*TotalImpuestosRetenidos="([^"]+)"/);
    const totalD = dNode ? parseFloat(dNode[1] || "0") + parseFloat(dNode[2] || "0") : 0;
    const oMatch = xmlContent.match(/OtrosPagos[^>]*TotalOtrosPagos="([^"]+)"/);
    const totalO = oMatch ? parseFloat(oMatch[1] || "0") : 0;
    return { versionNomina: version, totalPercepciones: totalP, totalDeducciones: totalD, totalOtrosPagos: totalO, isrRetenido: 0, esValida: true, errorMsg: "" };
};

export const validateNominaTotals = (p: number, d: number, o: number, total: number) => {
    const calc = p + o - d;
    return { isValid: Math.abs(calc - total) <= 0.01, calculado: Math.round(calc * 100) / 100, diferencia: Math.abs(calc - total) };
};
