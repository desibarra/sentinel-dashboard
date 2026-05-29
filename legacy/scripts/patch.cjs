const fs = require('fs');

let engine = fs.readFileSync('client/src/lib/cfdiEngine.ts', 'utf8');

const startIdx = engine.indexOf('export const evaluarTrazabilidad =');
const endIdx = engine.indexOf('export const detectCFDIVersion =');

const newEngine = `export const evaluarTrazabilidad = (xmlDoc: XMLDocument, xmlContent: string, r: any): TrazabilidadFiscalInfo => {
    const comprobante = xmlDoc.documentElement;
    const exportacion = comprobante?.getAttribute("Exportacion") || "NO DISPONIBLE";
    
    let conceptoPrincipal = "";
    let maxImporte = -1;
    const conceptos = comprobante?.getElementsByTagName("*");
    if (conceptos) {
        for (let i = 0; i < conceptos.length; i++) {
            const nodo = conceptos[i];
            if ((nodo.localName || nodo.nodeName) === "Concepto") {
                const desc = nodo.getAttribute("Descripcion") || "";
                const imp = parseFloat(nodo.getAttribute("Importe") || "0");
                if (imp > maxImporte) {
                    maxImporte = imp;
                    conceptoPrincipal = desc;
                }
            }
        }
    }

    let tieneCartaPorte = r.cartaPorte === "SÃ" ? "SÃ" : "No";
    let tienePlacasUnidad = "No";
    let tieneRemolque = "No";
    let tieneOperador = "No";
    let tieneOrigen = "No";
    let tieneDestino = "No";
    let tieneMercancias = "No";
    let tienePesoDistancia = "No";

    let placas = "NO VIENE EN XML";
    let remolques = "NO VIENE EN XML";
    let rfcOperador = "NO VIENE EN XML";
    let peso = "NO VIENE EN XML";
    let distancia = "NO VIENE EN XML";
    let permisoSCT = "NO VIENE EN XML";
    let transporteInternacional = "NO VIENE EN XML";
    
    const cartaPorteNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "CartaPorte");
    if (cartaPorteNodes.length > 0) {
        tieneCartaPorte = "SÃ";
        const cpNode = cartaPorteNodes[0];
        
        if (cpNode.getAttribute("TranspInternac")) {
            transporteInternacional = cpNode.getAttribute("TranspInternac") || "NO VIENE EN XML";
        }

        const ubicaciones = cpNode.getElementsByTagName("*");
        for (let i = 0; i < ubicaciones.length; i++) {
            const u = ubicaciones[i];
            const name = u.localName || u.nodeName;
            if (name === "Ubicacion") {
                const tipo = u.getAttribute("TipoUbicacion");
                if (tipo === "Origen") tieneOrigen = "SÃ";
                if (tipo === "Destino") tieneDestino = "SÃ";
                if (u.getAttribute("DistanciaRecorrida")) distancia = u.getAttribute("DistanciaRecorrida") + " km";
            }
            if (name === "Autotransporte") {
                if (u.getAttribute("PermSCT")) permisoSCT = u.getAttribute("PermSCT") || "NO VIENE EN XML";
                const ident = u.getElementsByTagName("*");
                for (let j = 0; j < ident.length; j++) {
                    const idn = ident[j];
                    if ((idn.localName || idn.nodeName) === "IdentificacionVehicular") {
                        if (idn.getAttribute("PlacaVM") || idn.getAttribute("Placa")) {
                            tienePlacasUnidad = "SÃ";
                            placas = idn.getAttribute("PlacaVM") || idn.getAttribute("Placa") || placas;
                        }
                    }
                    if ((idn.localName || idn.nodeName) === "Remolque") {
                        if (idn.getAttribute("Placa")) {
                            tieneRemolque = "SÃ";
                            remolques = idn.getAttribute("Placa") || remolques;
                        }
                    }
                }
            }
            if (name === "Mercancias") {
                tieneMercancias = "SÃ";
                if (u.getAttribute("PesoBrutoTotal")) {
                    tienePesoDistancia = "SÃ";
                    peso = u.getAttribute("PesoBrutoTotal") + " " + (u.getAttribute("UnidadPeso") || "kg");
                }
            }
            if (name === "TiposFigura" || name === "FiguraTransporte") {
                const figs = u.getElementsByTagName("*");
                for (let j = 0; j < figs.length; j++) {
                    const fig = figs[j];
                    if ((fig.localName || fig.nodeName) === "TiposFigura" && fig.getAttribute("TipoFigura") === "01") {
                        tieneOperador = "SÃ";
                        if (fig.getAttribute("RFCFigura")) rfcOperador = fig.getAttribute("RFCFigura") || rfcOperador;
                    }
                    if ((fig.localName || fig.nodeName) === "Operador") {
                        tieneOperador = "SÃ";
                        if (fig.getAttribute("RFC")) rfcOperador = fig.getAttribute("RFC") || rfcOperador;
                    }
                }
            }
        }
    }
    
    let pedimentosStr = "";
    let tienePedimento = "No";
    if (xmlContent.includes("NumeroPedimento") || xmlContent.includes("NumPedimento") || xmlContent.includes("DocumentoAduanero") || xmlContent.includes("ComercioExterior")) {
        tienePedimento = "SÃ";
        const pedMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g) || xmlContent.match(/NumPedimento="([^"]+)"/g);
        if (pedMatch) {
            pedimentosStr = Array.from(new Set(pedMatch.map(m => m.split('"')[1]))).join(" | ");
        } else {
            pedimentosStr = "Detectado (sin detalle)";
        }
    } else {
        pedimentosStr = "REQUIERE IMPORTACION";
    }

    let tieneDoda = "No";
    let numeroDodaIntegracion = "REQUIERE IMPORTACION";
    const dodaRegex = /(?:DODA|PITA|num(?:ero)?\\s*de\\s*integracion)[\\s-:]*([A-Z0-9]{10,25})/i;
    const matchDoda = xmlContent.match(dodaRegex);
    if (matchDoda) {
        tieneDoda = "SÃ";
        numeroDodaIntegracion = matchDoda[1];
    }

    let tieneEntryNumber = "No";
    if (/Entry[\\s-:]*([A-Z0-9]{8,15})/i.test(xmlContent) || xmlContent.includes("Entry Number")) {
        tieneEntryNumber = "SÃ";
    }

    let identificadorBancario = "REQUIERE IMPORTACION";
    if (xmlContent.includes("CtaOrdenante") || xmlContent.includes("CtaBeneficiario")) {
        identificadorBancario = "SÃ (Detectado en CEP)";
    }
    
    let soporteComercioExterior = "REQUIERE IMPORTACION";
    let destinoExtranjero = r.rfcReceptor && r.rfcReceptor.startsWith("XEXX") ? "SÃ" : "NO";
    
    let diagnosticoTasa0 = "NO APLICA";
    let accionRecomendadaTasa0 = "NO APLICA";
    
    if (r.baseIVA0 > 0) {
        if (tieneCartaPorte === "SÃ" && tienePedimento === "No") {
            diagnosticoTasa0 = "Tiene soporte logÃ­stico parcial; requiere pedimento y documentos de comercio exterior.";
            accionRecomendadaTasa0 = "Recabar pedimento";
        } else if (tieneCartaPorte === "No") {
            diagnosticoTasa0 = "No cuenta con soporte logÃ­stico en XML; requiere Carta Porte o evidencia externa.";
            accionRecomendadaTasa0 = "Recabar Carta Porte";
        } else if (tieneOrigen !== "SÃ" && tieneDestino !== "SÃ") {
            diagnosticoTasa0 = "No se acredita en el XML el origen/destino requerido para tasa 0%.";
            accionRecomendadaTasa0 = "Recabar prueba de origen/destino";
        } else if (identificadorBancario.includes("REQUIERE")) {
            diagnosticoTasa0 = "Requiere identificaciÃ³n bancaria del cobro.";
            accionRecomendadaTasa0 = "Cruzar con Estado de Cuenta";
        } else {
            diagnosticoTasa0 = "Tasa 0% aparentemente soportada en XML.";
            accionRecomendadaTasa0 = "Ninguna";
        }
    }

    let ivaAcreditable = (r.tipoCFDI === "E" || (r.tipoCFDI === "I" && r.rfcReceptor !== "Desconocido")) ? r.ivaTraslado : 0;
    let diagnosticoIvaAcreditable = ivaAcreditable > 0 ? (identificadorBancario.includes("SÃ") ? "ACREDITAMIENTO SOPORTADO" : "FALTA CRUCE CON ESTADO DE CUENTA") : "NO APLICA";
    let accionRecomendadaIvaAcreditable = ivaAcreditable > 0 && !identificadorBancario.includes("SÃ") ? "Asociar transferencia o CEP" : "NO APLICA";

    let datosFaltantes = "Ninguno";
    let fuenteExternaRequerida = "NO APLICA";
    let diagnosticoDatosFaltantes = "XML BÃ¡sico";
    let accionRecomendadaDatosFaltantes = "Ninguna";
    let auditableSoloConXML = "SÃ";
    
    let estatusSATReal = r.estatusSAT;
    if (r.estatusSAT === "Error ConexiÃ³n" || r.estatusSAT?.includes("Error") || r.estatusSAT?.includes("timeout") || r.estatusSAT?.includes("CORS")) {
        estatusSATReal = "ESTATUS SAT NO CONFIRMADO";
    }

    let nivelExpediente = "Fiscal bÃ¡sico";
    let estatusDocumental = "VÃ¡lido a nivel SAT";
    let riesgo = "MEDIO";
    let accionRecomendadaMatriz = "Ninguna";

    const esFleteOCartaPorte = tieneCartaPorte === "SÃ" || /flete|transporte|acarreo/i.test(conceptoPrincipal) || 
                        Array.from(comprobante?.getElementsByTagName("*") || []).some(n => (n.localName || n.nodeName) === "Concepto" && /^78101[78]\\d{2}|^78102\\d{3}/.test(n.getAttribute("ClaveProdServ")||""));

    if (esFleteOCartaPorte) {
        if (tieneCartaPorte === "No") {
            nivelExpediente = "Requiere logÃ­stica externa";
            datosFaltantes = "Falta Carta Porte";
            fuenteExternaRequerida = "Transportista";
            diagnosticoDatosFaltantes = "Falta BOL si se usarÃ¡ como documento de rastreabilidad.";
            accionRecomendadaDatosFaltantes = "Solicitar Carta Porte al emisor";
            accionRecomendadaMatriz = "Solicitar Carta Porte al emisor";
        } else if (tieneOrigen === "SÃ" && tieneDestino === "SÃ") {
            nivelExpediente = tienePedimento === "No" ? "Fiscal + logÃ­stica parcial" : "Fiscal + logÃ­stica completa";
        } else {
            nivelExpediente = "Fiscal + logÃ­stica parcial";
        }
    }

    if (tienePedimento === "SÃ") {
        if (tieneDoda === "No") {
            nivelExpediente = "Requiere DODA";
            datosFaltantes = "Falta nÃºmero DODA.";
            fuenteExternaRequerida = "Agente Aduanal";
            diagnosticoDatosFaltantes = "Falta nÃºmero DODA en el XML.";
            accionRecomendadaDatosFaltantes = "Cruzar pedimento con agente aduanal";
        } else {
            nivelExpediente = "Expediente soportado parcialmente";
        }
    } else if (exportacion === "01" || exportacion === "02" || r.baseIVA0 > 0) {
        if (tienePedimento === "No") {
            nivelExpediente = "Requiere pedimento";
            datosFaltantes = "Falta pedimento.";
            fuenteExternaRequerida = "Agente Aduanal";
            diagnosticoDatosFaltantes = "Requiere pedimento o documento aduanero equivalente.";
            accionRecomendadaDatosFaltantes = "Obtener pedimento";
        }
    }

    if (estatusSATReal === "ESTATUS SAT NO CONFIRMADO") {
        accionRecomendadaMatriz = "Reintentar validaciÃ³n SAT o validar con acuse/portal externo.";
        accionRecomendadaDatosFaltantes = accionRecomendadaMatriz;
    }

    if (!identificadorBancario.includes("SÃ") && r.tipoCFDI === 'I' && r.total > 0) {
        if (datosFaltantes === "Ninguno") datosFaltantes = "Falta identificaciÃ³n bancaria.";
        else datosFaltantes += " | Falta identificaciÃ³n bancaria.";
        fuenteExternaRequerida = "Estado de Cuenta";
        diagnosticoDatosFaltantes = "Se requiere cruzar con el Estado de Cuenta.";
        accionRecomendadaDatosFaltantes = "Vincular pago con el Estado de Cuenta";
    }

    return {
        fechaCobro: "REQUIERE CAPTURA",
        folioTransferencia: "REQUIERE CAPTURA",
        banco: "REQUIERE CAPTURA",
        identificadorBancario,
        observacionSAT: estatusSATReal,

        exportacion,
        destinoExtranjero,
        tienePedimento,
        pedimento: pedimentosStr,
        tieneDoda,
        numeroDodaIntegracion,
        soporteComercioExterior,
        diagnosticoTasa0,
        accionRecomendadaTasa0,

        ivaAcreditable,
        fechaPago: "REQUIERE CAPTURA",
        diagnosticoIvaAcreditable,
        accionRecomendadaIvaAcreditable,

        tieneCartaPorte,
        tienePlacasUnidad,
        tieneRemolque,
        tieneOperador,
        tieneOrigen,
        tieneDestino,
        tieneMercancias,
        tienePesoDistancia,
        tieneEntryNumber,
        placas,
        remolques,
        rfcOperador,
        peso,
        distancia,
        permisoSCT,
        transporteInternacional,
        
        datosFaltantes,
        fuenteExternaRequerida,
        diagnosticoDatosFaltantes,
        accionRecomendadaDatosFaltantes,
        auditableSoloConXML,

        estadoDeCuenta: "REQUIERE IMPORTACION",
        nivelExpediente,
        estatusDocumental,
        riesgo,
        accionRecomendadaMatriz
    };
};
\n\n`

engine = engine.substring(0, startIdx) + newEngine + engine.substring(endIdx);
fs.writeFileSync('client/src/lib/cfdiEngine.ts', engine, 'utf8');

console.log("Patched cfdiEngine.ts perfectly with proper accents!");
