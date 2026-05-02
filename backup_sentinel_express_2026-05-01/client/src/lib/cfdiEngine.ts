
import { BlacklistValidation } from "@/utils/blacklistValidator";
import { evaluarMaterialidadGasto } from "./materialityRules";

export interface ConceptoDesglose {
    numero: number;
    importe: number;
    descuento: number;
    objetoImp: string;
    claveProdServ: string;
    descripcion: string;
    traslados: Array<{ impuesto: string; tasa: string; importe: number; base: number }>;
    retenciones: Array<{ impuesto: string; tasa: string; importe: number; base: number }>;
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
    usoCFDI: string;
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
    baseNoObjeto: number;          // ObjetoImp=01: No objeto de impuesto
    baseObjetoSinDesglose: number; // ObjetoImp=03: Objeto pero sin desglose obligatorio
    clasificacionFiscal: string;   // Clasificación explícita: GRAVADO/EXENTO/NO_OBJETO/OBJETO_SIN_DESGLOSE/MIXTO
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
    observacionesContador?: string;
    resultadoMotor?: string; // Sin considerar SAT
    comentarioMotor?: string; // Sin considerar SAT
    ultimoRefrescoSAT?: string; // ISO Date de cuándo se verificó por última vez
    giroEmpresa?: string; // ✅ Nuevo: Giro declarado de la empresa para análisis de materialidad
    deleted?: boolean;
    deletedAt?: string;
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

export const extractReceptorInfo = (xmlDoc: XMLDocument): { rfc: string; nombre: string; regimenFiscal: string; usoCFDI: string } => {
    let rfc = "NO DISPONIBLE";
    let nombre = "NO DISPONIBLE";
    let regimenFiscal = "NO DISPONIBLE";
    let usoCFDI = "NO DISPONIBLE";

    // Buscar nodo receptor
    const todosElementos = xmlDoc.documentElement?.getElementsByTagName("*");
    if (todosElementos) {
        for (let i = 0; i < todosElementos.length; i++) {
            const nodo = todosElementos[i];
            const tagName = nodo.localName || nodo.nodeName;

            if (tagName === "Receptor" || tagName === "cfdi:Receptor") {
                rfc = nodo.getAttribute("Rfc") || nodo.getAttribute("rfc") || rfc;
                nombre = nodo.getAttribute("Nombre") || nodo.getAttribute("nombre") || nombre;
                usoCFDI = nodo.getAttribute("UsoCFDI") || nodo.getAttribute("usoCFDI") || usoCFDI;
                regimenFiscal = nodo.getAttribute("RegimenFiscalReceptor") || nodo.getAttribute("regimenFiscalReceptor") || regimenFiscal;
                break;
            }
        }
    }

    return { rfc, nombre, regimenFiscal, usoCFDI };
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
    // ✅ CFDI 4.0 - ObjetoImp: acumuladores por clasificación fiscal
    let baseNoObjeto = 0;          // ObjetoImp="01": No objeto de impuesto
    let baseObjetoSinDesglose = 0; // ObjetoImp="03": Objeto pero sin desglose obligatorio
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
            const descuento = parseFloat(nodo.getAttribute("Descuento") || "0");
            // ✅ REGLA FISCAL CORRECTA CFDI 4.0:
            // La clasificación depende EXCLUSIVAMENTE de ObjetoImp, NO de la existencia del nodo Impuestos.
            // Valores SAT oficiales:
            //   "01" = No objeto de impuesto  → base va a baseNoObjeto (NO_OBJETO)
            //   "02" = Sí objeto de impuesto   → evaluar nodo Impuestos.Traslados
            //   "03" = Objeto sin desglose      → base va a baseObjetoSinDesglose
            // En CFDI 3.3 el atributo no existe; default "02" para compatibilidad.
            const objetoImp = nodo.getAttribute("ObjetoImp") || (version === "4.0" ? "01" : "02");
            const claveProdServ = nodo.getAttribute("ClaveProdServ") || "";
            const descripcion = nodo.getAttribute("Descripcion") || "";
            const baseConcepto = importe - descuento;

            subtotalCalculado += baseConcepto;

            // ✅ ObjetoImp="01": NO OBJETO — clasificar SIN revisar nodo Impuestos
            if (objetoImp === "01") {
                baseNoObjeto += baseConcepto;
                desglosePorConcepto.push({
                    numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion,
                    traslados: [], retenciones: [],
                    subtotalAcumulado: subtotalCalculado, totalParcial: baseConcepto
                });
                continue; // NO evaluar impuestos; son no objeto
            }

            // ✅ ObjetoImp="03": OBJETO SIN DESGLOSE — acumular base pero sin detalle de impuestos
            if (objetoImp === "03") {
                baseObjetoSinDesglose += baseConcepto;
                desglosePorConcepto.push({
                    numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion,
                    traslados: [], retenciones: [],
                    subtotalAcumulado: subtotalCalculado, totalParcial: baseConcepto
                });
                continue; // No hay desglose de impuestos exigible
            }

            // ✅ ObjetoImp="02" (o default CFDI 3.3): evaluar nodo Impuestos
            const trasladosConcepto: any[] = [], retencionesConcepto: any[] = [];
            const impuestosConcepto = Array.from(nodo.children).find(h => (h.localName || h.nodeName) === "Impuestos");

            if (impuestosConcepto) {
                const children = Array.from(impuestosConcepto.getElementsByTagName("*"));
                children.forEach((nodoImpuesto: any) => {
                    const tagImpuesto = nodoImpuesto.localName || nodoImpuesto.nodeName;
                    if (tagImpuesto === "Traslado") {
                        const tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0", base = parseFloat(nodoImpuesto.getAttribute("Base") || "0"), importeTraslado = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), impuesto = nodoImpuesto.getAttribute("Impuesto") || "002";
                        trasladosTotales += importeTraslado;
                        trasladosConcepto.push({ impuesto, tasa, importe: importeTraslado, base });
                        if (impuesto === "002") {
                            if (tasa === "0.16" || tasa === "0.160000") baseIVA16 += base;
                            else if (tasa === "0.08" || tasa === "0.080000") baseIVA8 += base;
                            else if (tasa === "0.00" || tasa === "0.000000") baseIVA0 += base;
                            else baseIVAExento += base; // Exento: ObjetoImp=02 sin tasa válida registrada
                            ivaTraslado += importeTraslado;
                        } else if (impuesto === "003") iepsTraslado += importeTraslado;
                    } else if (tagImpuesto === "Retencion") {
                        const impuesto = nodoImpuesto.getAttribute("Impuesto") || "002", importeRetencion = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0", base = parseFloat(nodoImpuesto.getAttribute("Base") || "0");
                        retencionesTotales += importeRetencion;
                        retencionesConcepto.push({ impuesto, tasa, importe: importeRetencion, base });
                        if (impuesto === "002") ivaRetenido += importeRetencion;
                        else if (impuesto === "001") isrRetenido += importeRetencion;
                        else if (impuesto === "003") iepsRetenido += importeRetencion;
                    }
                });
            } else {
                // ObjetoImp=02 pero SIN nodo Impuestos de concepto:
                // Según SAT puede ser exento real. Se registra en baseIVAExento.
                baseIVAExento += baseConcepto;
            }

            const totalParcial = baseConcepto + trasladosConcepto.reduce((sum, t) => sum + t.importe, 0) - retencionesConcepto.reduce((sum, r) => sum + r.importe, 0);
            desglosePorConcepto.push({ numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion, traslados: trasladosConcepto, retenciones: retencionesConcepto, subtotalAcumulado: subtotalCalculado, totalParcial });
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

    // ✅ Clasificación fiscal consolidada
    const baseGravadaTotal = Math.round((baseIVA16 + baseIVA8 + baseIVA0) * 100) / 100;
    const hayGravado = baseGravadaTotal > 0;
    const hayExento = baseIVAExento > 0;
    const hayNoObjeto = baseNoObjeto > 0;
    const haySinDesglose = baseObjetoSinDesglose > 0;
    const tiposActivos = [hayGravado, hayExento, hayNoObjeto, haySinDesglose].filter(Boolean).length;
    let clasificacionFiscal: string;
    if (tiposActivos > 1) clasificacionFiscal = "MIXTO";
    else if (hayGravado) clasificacionFiscal = "GRAVADO";
    else if (hayExento) clasificacionFiscal = "EXENTO";
    else if (hayNoObjeto) clasificacionFiscal = "NO_OBJETO";
    else if (haySinDesglose) clasificacionFiscal = "OBJETO_SIN_DESGLOSE";
    else clasificacionFiscal = "SIN_IMPUESTOS";

    return {
        subtotal: Math.round(subtotalCalculado * 100) / 100,
        baseIVA16: Math.round(baseIVA16 * 100) / 100,
        baseIVA8: Math.round(baseIVA8 * 100) / 100,
        baseIVA0: Math.round(baseIVA0 * 100) / 100,
        baseIVAExento: Math.round(baseIVAExento * 100) / 100,
        baseNoObjeto: Math.round(baseNoObjeto * 100) / 100,
        baseObjetoSinDesglose: Math.round(baseObjetoSinDesglose * 100) / 100,
        clasificacionFiscal,
        ivaTraslado: Math.round(ivaTraslado * 100) / 100,
        ivaRetenido: Math.round(ivaRetenido * 100) / 100,
        isrRetenido: Math.round(isrRetenido * 100) / 100,
        iepsTraslado: Math.round(iepsTraslado * 100) / 100,
        iepsRetenido: Math.round(iepsRetenido * 100) / 100,
        impuestosLocalesTrasladados: Math.round(impuestosLocalesTrasladados * 100) / 100,
        impuestosLocalesRetenidos: Math.round(impuestosLocalesRetenidos * 100) / 100,
        trasladosTotales: Math.round(trasladosTotales * 100) / 100,
        retencionesTotales: Math.round(retencionesTotales * 100) / 100,
        desglosePorConcepto
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
    if (!match) return { encoding: "UTF-8", soportado: true, errorMsg: "" };
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
    const nodes = Array.from(xmlDoc.documentElement?.getElementsByTagName("*") || []);
    const node = nodes.find(n => (n.localName || n.nodeName).includes("Nomina"));
    if (!node) return { 
        versionNomina: "NO DISPONIBLE", totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0, 
        isrRetenido: 0, subsidioCausado: 0, percepcionesGravadas: 0, percepcionesExentas: 0, diasPagados: 15,
        esValida: false, errorMsg: "No hay nodo Nómina" 
    };
    
    const version = node.getAttribute("Version") || "1.2";
    const diasPagados = parseFloat(node.getAttribute("NumDiasPagados") || "15") || 15;

    let percepcionesGravadas = 0, percepcionesExentas = 0, isrRetenido = 0, subsidioCausado = 0, totalD = 0, totalO = 0;

    const percepcionesNode = nodes.find(n => (n.localName || n.nodeName) === "Percepciones");
    if (percepcionesNode) {
        percepcionesGravadas = parseFloat(percepcionesNode.getAttribute("TotalGravado") || "0");
        percepcionesExentas = parseFloat(percepcionesNode.getAttribute("TotalExento") || "0");
    }
    const totalP = percepcionesGravadas + percepcionesExentas;

    const deduccionesNode = nodes.find(n => (n.localName || n.nodeName) === "Deducciones");
    if (deduccionesNode) {
        const otrasDeducciones = parseFloat(deduccionesNode.getAttribute("TotalOtrasDeducciones") || "0");
        const impuestosRetenidos = parseFloat(deduccionesNode.getAttribute("TotalImpuestosRetenidos") || "0");
        totalD = otrasDeducciones + impuestosRetenidos;
        
        Array.from(deduccionesNode.children).forEach((child: any) => {
            if ((child.localName || child.nodeName) === "Deduccion" && child.getAttribute("TipoDeduccion") === "002") {
                isrRetenido += parseFloat(child.getAttribute("Importe") || "0");
            }
        });
    }

    const otrosPagosNode = nodes.find(n => (n.localName || n.nodeName) === "OtrosPagos");
    if (otrosPagosNode) {
        totalO = parseFloat(otrosPagosNode.getAttribute("TotalOtrosPagos") || "0");
        const subsidioNode = nodes.find(n => (n.localName || n.nodeName) === "SubsidioAlEmpleo");
        if (subsidioNode) {
            subsidioCausado = parseFloat(subsidioNode.getAttribute("SubsidioCausado") || "0");
        }
    }

    return { 
        versionNomina: version, 
        totalPercepciones: Math.round(totalP * 100) / 100, 
        totalDeducciones: Math.round(totalD * 100) / 100, 
        totalOtrosPagos: totalO, 
        isrRetenido,
        subsidioCausado,
        percepcionesGravadas,
        percepcionesExentas,
        diasPagados,
        esValida: true, 
        errorMsg: "" 
    };
};

// Heurística simplificada de estimación de ISR (no cálculo exacto, solo proxy de validación ligera)
export const estimarISRHeuristicoMensual = (baseGravable: number, diasPagados: number): number => {
    if (baseGravable <= 0 || diasPagados <= 0) return 0;
    
    // Ingreso mensualizado base
    const ingresoMensual = (baseGravable / diasPagados) * 30.4;
    
    // Tramos heurísticos muy simplificados
    let porcentaje = 0;
    if (ingresoMensual > 40000) porcentaje = 0.25;
    else if (ingresoMensual > 20000) porcentaje = 0.18;
    else if (ingresoMensual > 10000) porcentaje = 0.12;
    else if (ingresoMensual > 7000) porcentaje = 0.08;
    else if (ingresoMensual > 0) porcentaje = 0.02;

    const isrMensual = ingresoMensual * porcentaje;
    return (isrMensual / 30.4) * diasPagados;
};

export const validateNominaTotals = (p: number, d: number, o: number, total: number) => {
    const totalCalculado = p + o - d;
    const diferencia = Math.abs(totalCalculado - total);

    // ✅ REGLA: Retornar false en isValid si hay diferencia para que classifyCFDI maneje la lógica detallada
    return { 
        isValid: diferencia <= 0.01, 
        calculado: Math.round(totalCalculado * 100) / 100, 
        diferencia: Math.round(diferencia * 100) / 100 
    };
};

export const classifyCFDI = (
    xmlContent: string,
    version: string,
    tipoCFDI: string,
    taxes: any,
    validation: any,
    esNomina: boolean,
    nominaInfo: any,
    pagosInfo: any,
    cartaPorteInfo: any,
    requiereCartaPorte: string,
    contextoHistorico: string,
    giroEmpresa?: string // ✅ Nuevo: Giro para evaluación de materialidad
): { resultado: string, comentarioFiscal: string, nivelValidacion: string } => {

    let resultado = "🟢 USABLE";
    let comentarioFiscal = "";
    let nivelValidacion = esNomina ? "ESTRUCTURAL, NÓMINA" : "ESTRUCTURAL, SAT, NEGOCIO, RIESGO";

    // 1. EXTRACCIÓN DE DATOS PARA CLASIFICACIÓN (Fallback si no vienen en pads)
    const emisorMatch = xmlContent.match(/Emisor[^>]*Nombre="([^"]+)"/i);
    const nombreEmisor = emisorMatch ? emisorMatch[1].toUpperCase() : "";

    // 2. DETECTORES PARA REGLAS DE NEGOCIO
    const tieneECC = xmlContent.includes("ecc12:EstadoDeCuentaCombustible");

    // Identificadores de Rubros Exentos "Buenos" (Educación, Salud)
    const esRubroExentoBueno = (
        /UNIVERSIDAD|COLEGIO|COLEGIATURA|INSTITUTO|ESCUELA|EDUCACI[OÓ]N/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            (c.descripcion && /Colegiatura|Servicio Educativo|Ense[ñn]anza/i.test(c.descripcion)) ||
            (c.claveProdServ && c.claveProdServ.startsWith("86")) // Servicios educativos
        ) ||
        /HOSPITAL|CLINICA|M[EÉ]DICO/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            c.claveProdServ && c.claveProdServ.startsWith("85") // Servicios de salud
        )
    );

    // Identificadores de Consumo General (Riesgo en ObjetoImp=02)
    const esConsumoGeneral = (
        /WALMART|SORIANA|CHEDRAUI|COSTCO|OXXO|7-ELEVEN|TIENDA|MISCELANEA|RESTAURANTE|BAR|CAFE|DEPARTAMENTAL|S\.A\. DE C\.V\.|COMERCIAL/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            c.claveProdServ && (
                c.claveProdServ.startsWith("50") || // Alimentos/Bebidas
                c.claveProdServ.startsWith("52") || // Cuidado doméstico
                c.claveProdServ.startsWith("53")    // Ropa/Accesorios
            )
        )
    );

    // Búsqueda de Riesgo IVA: ObjetoImp=02 con IVA 0%
    const tieneObjetoImp02IVA0 = taxes.desglosePorConcepto?.some((c: ConceptoDesglose) => {
        const esObjeto02 = c.objetoImp === "02";
        const tieneIVA0 = c.traslados?.some(t =>
            t.impuesto === "002" &&
            (t.tasa === "0" || t.tasa === "0.000000" || parseFloat(t.tasa) === 0)
        );
        return esObjeto02 && tieneIVA0;
    }) || false;

    // Búsqueda de conceptos bonificados (ObjetoImp=01 con descuento total)
    const tieneBonificadosTotalmente = taxes.desglosePorConcepto?.some((c: ConceptoDesglose) => {
        const esObjeto01 = c.objetoImp === "01";
        const esBonificadoTotal = Math.abs(c.descuento - c.importe) < 0.01 && c.importe > 0;
        return esObjeto01 && esBonificadoTotal;
    }) || false;

    // 3. LÓGICA DE PRIORIDADES (Orden: Errores Críticos > Totales > Riesgos > Informativos)

    // A. Errores Estructurales de Nómina o Pagos
    if (esNomina && nominaInfo && !nominaInfo.esValida) {
        return {
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `ERROR EN NÓMINA: ${nominaInfo.errorMsg}`,
            nivelValidacion
        };
    }

    if (pagosInfo && pagosInfo.valido === "NO") {
        return {
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `ERROR EN PAGOS: ${pagosInfo.errorMsg}`,
            nivelValidacion
        };
    }

    // B. Validación de Totales vs ECC12 (Combustibles)
    if (!validation.isValid && !tieneECC && !esNomina) {
        resultado = "🔴 NO USABLE";
        comentarioFiscal = `ERROR FISCAL: Total declarado no coincide con cálculo SAT. Diferencia de $${validation.diferencia.toFixed(2)}.`;
    } else if (tieneECC) {
        resultado = "🟡 ALERTA";
        comentarioFiscal = "CFDI con complemento de Estado de Cuenta de Combustible. La información relevante de litros, importes e impuestos viene en el complemento. Revisar deducibilidad y acreditamiento de IVA conforme a política interna.";
    }

    // AUDITORÍA FOCALIZADA EN NÓMINA HEURÍSTICA Y LIGERA
    if (esNomina && resultado !== "🔴 NO USABLE") {
        let isrEstimado = estimarISRHeuristicoMensual(nominaInfo.percepcionesGravadas, nominaInfo.diasPagados);
        let difISR = Math.abs(isrEstimado - nominaInfo.isrRetenido);
        
        let alertasFiscales: string[] = [];

        // 1. Diferencias estructurales matemáticas graves son los ÚNICOS motivos de error no-estructural en nómina
        const difTotales = validation.diferencia;
        if (difTotales > 1000) {
            resultado = "🔴 NO USABLE";
            nivelValidacion = "NÓMINA - ERROR GRAVE";
            comentarioFiscal = `ERROR FISCAL: Diferencia matemática anormal en nómina ($${difTotales.toFixed(2)}). Se detectan inconsistencias graves en estructura.`;
            return { resultado, comentarioFiscal, nivelValidacion };
        } 

        // 2. Validación Heurística de ISR
        if (difISR > 20 && nominaInfo.percepcionesGravadas > 0) { 
           alertasFiscales.push("Se detectan inconsistencias en ISR retenido que requieren revisión detallada contra estimación fiscal.");
        }

        // 3. Validación Heurística de Subsidio
        const ingresoMensualEstimado = (nominaInfo.percepcionesGravadas / nominaInfo.diasPagados) * 30.4;
        if (nominaInfo.subsidioCausado > 0 && ingresoMensualEstimado > 10000) {
            alertasFiscales.push("El subsidio aplicado podría no corresponder al nivel de ingreso mensual estimado (rango atípico).");
        }

        // 4. Validación Heurística Gravado vs Exento
        if (nominaInfo.percepcionesGravadas === 0 && (nominaInfo.percepcionesGravadas + nominaInfo.percepcionesExentas) > 0) {
            alertasFiscales.push("Percepciones clasificadas completamente como exentas. La clasificación fiscal de estas percepciones puede representar un riesgo de auditoría.");
        }

        if (alertasFiscales.length > 0) {
            resultado = "🟡 ALERTA";
            nivelValidacion = "NÓMINA - REVISIÓN";
            comentarioFiscal = "HALLAZGOS DE REVISIÓN EN NÓMINA:\n- " + alertasFiscales.join("\n- ");
        } else {
            resultado = "🟢 USABLE";
            nivelValidacion = "NÓMINA - VÁLIDA";
            comentarioFiscal = "Nómina congruente con estatus válido. Ausencia de indicadores de riesgo heurístico en cálculos de impuestos e ingresos.";
        }
    } else if (!esNomina && !tieneECC && validation.isValid) {
        // Caso Base Sano - Facturas/REP
        resultado = "🟢 USABLE";
        comentarioFiscal = "CFDI válido. Total correcto calculado por concepto considerando impuestos y retenciones. Sin inconsistencias relevantes detectadas.";
    }

    // C. Clasificación de IVA (Exento vs Riesgo) — no aplica a nómina
    if (!esNomina && resultado !== "🔴 NO USABLE" && tieneObjetoImp02IVA0) {
        if (esRubroExentoBueno) {
            // Caso Exento "Bueno" (Educación/Salud)
            resultado = "🟢 USABLE";
            comentarioFiscal = "Servicio potencialmente exento (educación/salud). CFDI estructuralmente válido; sin observaciones fiscales relevantes sobre IVA.";
        } else if (esConsumoGeneral) {
            // Caso Riesgo (Supermercados/Retail)
            resultado = "🔴 NO USABLE (Riesgo IVA)";
            const notaRiesgo = "[CRÍTICO] ObjetoImp=02 con IVA 0 % en productos típicamente gravados. Riesgo de no poder acreditar IVA o de que la deducción sea rechazada en revisión.";
            comentarioFiscal = notaRiesgo + " " + (comentarioFiscal.includes("válido") ? "" : comentarioFiscal);
        }
    }

    // D. Comentario informativo sobre clasificación fiscal por ObjetoImp — no aplica a nómina
    const baseNoObjetoVal = taxes.baseNoObjeto ?? 0;
    const baseSinDesglose = taxes.baseObjetoSinDesglose ?? 0;
    const clasificacion = taxes.clasificacionFiscal ?? "";

    if (!esNomina && resultado !== "🔴 NO USABLE") {
        if (clasificacion === "NO_OBJETO" || baseNoObjetoVal > 0) {
            // ✅ REGLA SAT: ObjetoImp=01 → NO OBJETO DE IMPUESTO. No confundir con Exento.
            comentarioFiscal += (comentarioFiscal ? " " : "")
                + `[CFDI NO OBJETO] Todos los conceptos tienen ObjetoImp=01 (No objeto de impuesto), Base NO_OBJETO=$${baseNoObjetoVal.toFixed(2)}. IVA=$0. No es exento; simplemente no está sujeto al impuesto.`;
        }
        if (baseSinDesglose > 0) {
            comentarioFiscal += (comentarioFiscal ? " " : "")
                + `[ObjetoImp=03] Incluye conceptos objeto de impuesto pero sin desglose obligatorio, Base=$${baseSinDesglose.toFixed(2)}.`;
        }
        if (tieneBonificadosTotalmente) {
            const notaBonificado = "Incluye conceptos bonificados (ObjetoImp=01 con descuento total); revisar solo para efectos de control interno.";
            comentarioFiscal += (comentarioFiscal ? " " : "") + notaBonificado;
        }
    }

    // E. Ajustes por Carta Porte
    if (resultado === "🟢 USABLE" || resultado === "🟡 ALERTA") {
        if (requiereCartaPorte === "SÍ" && cartaPorteInfo.presente === "NO") {
            resultado = "🟡 ALERTA";
            comentarioFiscal += " ALERTA: Requiere complemento Carta Porte pero no se detectó.";
        } else if (cartaPorteInfo.presente === "SÍ" && cartaPorteInfo.completa === "NO") {
            resultado = "🟡 ALERTA";
            comentarioFiscal += " ALERTA: Carta Porte incompleta.";
        }
    }

    // F. EVALUACIÓN DE MATERIALIDAD (Razón de Negocio)
    if (giroEmpresa && taxes.desglosePorConcepto) {
        const materialidad = evaluarMaterialidadGasto(giroEmpresa, taxes.desglosePorConcepto, nombreEmisor || "");
        if (materialidad.tieneRiesgo) {
            comentarioFiscal += (comentarioFiscal ? " " : "") + materialidad.mensaje;
        }
    }

    // Ajustar nivelValidacion final para nómina según resultado
    if (esNomina) {
        if (resultado.includes("🟢")) nivelValidacion = "NÓMINA - VÁLIDA";
        else if (resultado.includes("🟡")) nivelValidacion = "NÓMINA - REVISIÓN";
        // 🔴 ya se asignó arriba en el early return estructural
    }

    return { resultado, comentarioFiscal, nivelValidacion };
};
