const fs = require('fs');
const content = \
export interface DodaInfo {
    archivo: string;
    uuid: string;
    serie: string;
    folio: string;
    fecha: string;
    tipoCFDI: string;
    rfcEmisor: string;
    nombreEmisor: string;
    rfcReceptor: string;
    nombreReceptor: string;
    conceptoPrincipal: string;
    importe: number;
    total: number;
    exportacion: string;
    tieneCartaPorte: string;
    versionCartaPorte: string;
    cartaPorteCompleta: string;
    transporteInternacional: string;
    placasUnidad: string;
    remolques: string;
    origen: string;
    destino: string;
    mercanciaPrincipal: string;
    peso: string;
    tienePedimento: string;
    pedimentosEncontrados: string;
    fuentePedimento: string;
    pedimentoValidoFormato: string;
    pedimentoUsadoCruceDoda: string;
    tieneDoda: string;
    numeroDodaIntegracion: string;
    fuenteDatoDoda: string;
    nivelConfianzaDoda: string;
    diagnosticoDoda: string;
    accionRecomendada: string;
    alertaIvaCero: string;
    conclusion: string;
}

export const generarDiagnosticoDODA = (xmlDoc: XMLDocument, xmlContent: string, r: any): DodaInfo => {
    const comprobante = xmlDoc.documentElement;
    const exportacion = comprobante?.getAttribute("Exportacion") || "NO DISPONIBLE";
    
    let conceptoPrincipal = "";
    let importe = 0;
    const conceptos = comprobante?.getElementsByTagName("*");
    if (conceptos) {
        for (let i = 0; i < conceptos.length; i++) {
            const nodo = conceptos[i];
            if ((nodo.localName || nodo.nodeName) === "Concepto") {
                const desc = nodo.getAttribute("Descripcion") || "";
                const imp = parseFloat(nodo.getAttribute("Importe") || "0");
                if (imp > importe) {
                    importe = imp;
                    conceptoPrincipal = desc;
                }
            }
        }
    }

    let tieneCartaPorte = "No";
    let versionCartaPorte = "NO APLICA";
    let transporteInternacional = "No";
    let placasUnidad = "";
    let remolquesArr: string[] = [];
    let origen = "";
    let destino = "";
    let mercanciaPrincipal = "";
    let peso = "";
    
    const cartaPorteNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "CartaPorte");
    if (cartaPorteNodes.length > 0) {
        tieneCartaPorte = "Sí";
        const cpNode = cartaPorteNodes[0];
        versionCartaPorte = cpNode.getAttribute("Version") || "NO DISPONIBLE";
        transporteInternacional = cpNode.getAttribute("TranspInternac") || "No";

        const ubicaciones = cpNode.getElementsByTagName("*");
        for (let i = 0; i < ubicaciones.length; i++) {
            const u = ubicaciones[i];
            const name = u.localName || u.nodeName;
            if (name === "Ubicacion") {
                const tipo = u.getAttribute("TipoUbicacion");
                const rfc = u.getAttribute("RFCRemitenteDestinatario") || u.getAttribute("IDUbicacion") || "";
                if (tipo === "Origen" && !origen) origen = rfc;
                if (tipo === "Destino" && !destino) destino = rfc;
            }
            if (name === "Autotransporte") {
                const ident = u.getElementsByTagName("*");
                for (let j = 0; j < ident.length; j++) {
                    const idn = ident[j];
                    if ((idn.localName || idn.nodeName) === "IdentificacionVehicular") {
                        placasUnidad = idn.getAttribute("PlacaVM") || idn.getAttribute("Placa") || "";
                    }
                    if ((idn.localName || idn.nodeName) === "Remolque") {
                        const placaRemolque = idn.getAttribute("Placa") || "";
                        if (placaRemolque) remolquesArr.push(placaRemolque);
                    }
                }
            }
            if (name === "Mercancias") {
                peso = u.getAttribute("PesoBrutoTotal") || "";
                const mercNodes = u.getElementsByTagName("*");
                let maxPeso = 0;
                for (let j = 0; j < mercNodes.length; j++) {
                    const m = mercNodes[j];
                    if ((m.localName || m.nodeName) === "Mercancia") {
                        const desc = m.getAttribute("Descripcion") || "";
                        const p = parseFloat(m.getAttribute("PesoEnKg") || "0");
                        if (p > maxPeso) {
                            maxPeso = p;
                            mercanciaPrincipal = desc;
                        }
                    }
                }
            }
        }
    }
    
    if (!origen && xmlContent.includes('TipoUbicacion="Origen"')) origen = "Detectado (sin detalle)";
    if (!destino && xmlContent.includes('TipoUbicacion="Destino"')) destino = "Detectado (sin detalle)";
    if (!placasUnidad) {
        const placaMatch = xmlContent.match(/PlacaVM="([^"]+)"/) || xmlContent.match(/Placa="([^"]+)"/);
        if (placaMatch) placasUnidad = placaMatch[1];
    }
    if (!peso) {
        const pesoMatch = xmlContent.match(/PesoBrutoTotal="([^"]+)"/);
        if (pesoMatch) peso = pesoMatch[1];
    }
    const remolques = remolquesArr.length > 0 ? remolquesArr.join(", ") : "No detectados";

    const pedimentos = new Set<string>();
    let fuentePedimento = "No encontrado";
    
    const aduaneraNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "InformacionAduanera");
    aduaneraNodes.forEach(n => {
        const p = n.getAttribute("NumeroPedimento");
        if (p) { pedimentos.add(p); fuentePedimento = "cfdi:InformacionAduanera"; }
    });
    
    const cpPedimentoNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "Pedimentos" || (n.localName || n.nodeName) === "DocumentoAduanero");
    cpPedimentoNodes.forEach(n => {
        const p = n.getAttribute("Pedimento") || n.getAttribute("NumPedimento") || n.getAttribute("NumeroPedimento");
        if (p) { pedimentos.add(p); if(fuentePedimento === "No encontrado") fuentePedimento = "Carta Porte"; }
    });
    
    const cceNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "ComercioExterior");
    if (cceNodes.length > 0) {
        const pedMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g);
        if (pedMatch) {
            pedMatch.forEach(m => {
                const num = m.split('"')[1];
                if (num) { pedimentos.add(num); if(fuentePedimento === "No encontrado") fuentePedimento = "Comercio Exterior"; }
            });
        }
    }
    
    if (pedimentos.size === 0) {
        const fallbackMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g);
        if (fallbackMatch) {
            fallbackMatch.forEach(m => {
                const num = m.split('"')[1];
                if (num) { pedimentos.add(num); fuentePedimento = "Texto XML"; }
            });
        }
    }

    const arrPedimentos = Array.from(pedimentos);
    const pedimentosEncontrados = arrPedimentos.length > 0 ? arrPedimentos.join(", ") : "Ninguno";
    const tienePedimento = arrPedimentos.length > 0 ? "Sí" : "No";
    
    let pedimentoValidoFormato = "NO APLICA";
    if (arrPedimentos.length > 0) {
        const invalidos = arrPedimentos.filter(p => {
            const clean = p.replace(/\s|-/g, "");
            return !/^\\d{15,21}$/.test(clean);
        });
        if (invalidos.length > 0) {
            pedimentoValidoFormato = "PEDIMENTO DETECTADO, REQUIERE VALIDACIÓN";
        } else {
            pedimentoValidoFormato = "VÁLIDO";
        }
    }

    let tieneDoda = "No";
    let numeroDodaIntegracion = "No encontrado";
    let fuenteDatoDoda = "No encontrado";
    let nivelConfianzaDoda = "Nulo";

    const dodaRegex = /(?:DODA|PITA|num(?:ero)?\\s*de\\s*integracion)[\\s-:]*([A-Z0-9]{10,25})/i;
    const matchDoda = xmlContent.match(dodaRegex);
    if (matchDoda) {
        tieneDoda = "Sí";
        numeroDodaIntegracion = matchDoda[1];
        nivelConfianzaDoda = "Alto";
        
        if (xmlContent.includes("<cfdi:Addenda") && xmlContent.substring(xmlContent.indexOf("<cfdi:Addenda")).includes(matchDoda[0])) {
            fuenteDatoDoda = "Addenda";
        } else if (conceptoPrincipal.includes(matchDoda[0])) {
            fuenteDatoDoda = "Concepto CFDI";
        } else {
            fuenteDatoDoda = "Texto crudo XML";
        }
    }
    
    let diagnosticoDoda = "";
    let accionRecomendada = "";
    let conclusion = "";

    if (tieneDoda === "Sí") {
        diagnosticoDoda = "APTO PARA MONITOREO DODA";
        accionRecomendada = "Usar número DODA extraído para validación aduanal";
        conclusion = "Este XML contiene DODA explícito o número de integración. Es apto para monitoreo directo.";
    } else if (tienePedimento === "Sí") {
        if (tieneCartaPorte === "Sí") {
            diagnosticoDoda = "REQUIERE CRUCE CON REPORTE ADUANAL / RELACIÓN LOGÍSTICA DISPONIBLE";
            accionRecomendada = "Cruzar pedimento con reporte aduanal para obtener DODA";
            conclusion = "Este XML contiene número de pedimento y Carta Porte, pero no contiene número DODA ni número de integración. Puede usarse para relación logística, pero no puede monitorearse directamente como DODA hasta cruzarlo con el reporte del agente aduanal.";
        } else {
            diagnosticoDoda = "REQUIERE CRUCE CON REPORTE ADUANAL";
            accionRecomendada = "Cruzar pedimento con reporte aduanal para obtener DODA";
            conclusion = "Este XML contiene número de pedimento, pero no contiene número DODA ni número de integración ni Carta Porte. Por lo tanto, no puede monitorearse directamente como DODA hasta cruzarlo con el reporte del agente aduanal.";
        }
    } else if (tieneCartaPorte === "Sí" && placasUnidad && (origen || destino)) {
        diagnosticoDoda = "APTO SOLO PARA RELACIÓN LOGÍSTICA";
        accionRecomendada = "Solicitar DODA al agente aduanal o transportista";
        conclusion = "Este XML contiene Carta Porte y datos logísticos, pero no contiene número DODA ni número de integración ni pedimento. Puede usarse para relación logística, pero requiere cruce con pedimento o reporte aduanal para monitoreo DODA.";
    } else {
        const esFlete = /flete|transporte|acarreo/i.test(conceptoPrincipal) || 
                        Array.from(comprobante?.getElementsByTagName("*") || []).some(n => (n.localName || n.nodeName) === "Concepto" && /^78101[78]\\d{2}|^78102\\d{3}/.test(n.getAttribute("ClaveProdServ")||""));
        if (esFlete) {
            diagnosticoDoda = "NO APTO PARA MONITOREO DODA DIRECTO";
            accionRecomendada = "Solicitar comprobante con pedimento o DODA al agente";
            conclusion = "Este XML corresponde a una factura de flete o transporte, pero no contiene Complemento Carta Porte, pedimento ni número de integración DODA. Por lo tanto, Sentinel Express no puede obtener ni monitorear el DODA directamente con este XML.";
        } else {
            diagnosticoDoda = "NO APLICA";
            accionRecomendada = "Ninguna";
            conclusion = "XML de gasto regular. No se detectan indicadores de transporte o comercio exterior.";
        }
    }

    let alertaIvaCero = "No aplica";
    if (exportacion === "01") {
        const tieneIva0 = r.baseIVA0 > 0;
        if (tieneIva0) {
            alertaIvaCero = "REVISAR SOPORTE FISCAL DE IVA 0%";
        }
    }

    return {
        archivo: r.fileName,
        uuid: r.uuid,
        serie: r.serie,
        folio: r.folio,
        fecha: r.fechaEmision,
        tipoCFDI: r.tipoCFDI,
        rfcEmisor: r.rfcEmisor,
        nombreEmisor: r.nombreEmisor,
        rfcReceptor: r.rfcReceptor,
        nombreReceptor: r.nombreReceptor,
        conceptoPrincipal,
        importe,
        total: r.total,
        exportacion,
        tieneCartaPorte,
        versionCartaPorte,
        cartaPorteCompleta: r.cartaPorteCompleta,
        transporteInternacional,
        placasUnidad,
        remolques,
        origen,
        destino,
        mercanciaPrincipal,
        peso,
        tienePedimento,
        pedimentosEncontrados,
        fuentePedimento,
        pedimentoValidoFormato,
        pedimentoUsadoCruceDoda: tienePedimento === "Sí" ? "Pendiente" : "N/A",
        tieneDoda,
        numeroDodaIntegracion,
        fuenteDatoDoda,
        nivelConfianzaDoda,
        diagnosticoDoda,
        accionRecomendada,
        alertaIvaCero,
        conclusion
    };
};
\;
fs.appendFileSync('client/src/lib/cfdiEngine.ts', '\n' + content, 'utf8');
