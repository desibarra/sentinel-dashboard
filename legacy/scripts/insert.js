const fs = require('fs');
const enginePath = 'client/src/lib/cfdiEngine.ts';
let engine = fs.readFileSync(enginePath, 'utf8');

const newCode = \

export interface TrazabilidadFiscalInfo {
    // Para Hoja 1: Ingresos SAT
    fechaCobro: string;
    folioTransferencia: string;
    banco: string;
    identificadorBancario: string;
    observacionSAT: string;

    // Para Hoja 2: Tasa 0%
    destinoExtranjero: string;
    tienePedimento: string;
    pedimento: string;
    tieneDoda: string;
    numeroDodaIntegracion: string;
    soporteComercioExterior: string;
    diagnosticoTasa0: string;
    accionRecomendadaTasa0: string;

    // Para Hoja 3: IVA Acreditable
    ivaAcreditable: number;
    fechaPago: string;
    diagnosticoIvaAcreditable: string;
    accionRecomendadaIvaAcreditable: string;

    // Para Hoja 4: Datos Faltantes
    tieneCartaPorte: string;
    tienePlacasUnidad: string;
    tieneRemolque: string;
    tieneOperador: string;
    tieneOrigen: string;
    tieneDestino: string;
    tieneMercancias: string;
    tienePesoDistancia: string;
    tieneEntryNumber: string;
    datosFaltantes: string;
    fuenteExternaRequerida: string;
    diagnosticoDatosFaltantes: string;
    accionRecomendadaDatosFaltantes: string;
    auditableSoloConXML: string;

    // Para Hoja 5: Matriz de Rastreabilidad y Resumen Principal
    estadoDeCuenta: string;
    nivelExpediente: string;
    estatusDocumental: string;
    riesgo: string;
    accionRecomendadaMatriz: string;
}

export const evaluarTrazabilidad = (xmlDoc: XMLDocument, xmlContent: string, r: any): TrazabilidadFiscalInfo => {
    const comprobante = xmlDoc.documentElement;
    const exportacion = comprobante?.getAttribute("Exportacion") || "NO DISPONIBLE";
    
    // Extraccin de conceptos
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

    // Extraccin Logstica
    let tieneCartaPorte = "No";
    let tienePlacasUnidad = "No";
    let tieneRemolque = "No";
    let tieneOperador = "No";
    let tieneOrigen = "No";
    let tieneDestino = "No";
    let tieneMercancias = "No";
    let tienePesoDistancia = "No";
    
    const cartaPorteNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "CartaPorte");
    if (cartaPorteNodes.length > 0) {
        tieneCartaPorte = "Sí";
        const cpNode = cartaPorteNodes[0];
        
        const ubicaciones = cpNode.getElementsByTagName("*");
        for (let i = 0; i < ubicaciones.length; i++) {
            const u = ubicaciones[i];
            const name = u.localName || u.nodeName;
            if (name === "Ubicacion") {
                const tipo = u.getAttribute("TipoUbicacion");
                if (tipo === "Origen") tieneOrigen = "Sí";
                if (tipo === "Destino") tieneDestino = "Sí";
            }
            if (name === "Autotransporte") {
                const ident = u.getElementsByTagName("*");
                for (let j = 0; j < ident.length; j++) {
                    const idn = ident[j];
                    if ((idn.localName || idn.nodeName) === "IdentificacionVehicular") {
                        if (idn.getAttribute("PlacaVM") || idn.getAttribute("Placa")) tienePlacasUnidad = "Sí";
                    }
                    if ((idn.localName || idn.nodeName) === "Remolque") {
                        if (idn.getAttribute("Placa")) tieneRemolque = "Sí";
                    }
                }
            }
            if (name === "Mercancias") {
                tieneMercancias = "Sí";
                if (u.getAttribute("PesoBrutoTotal")) tienePesoDistancia = "Sí";
            }
            if (name === "TiposFigura" || name === "FiguraTransporte") {
                const figs = u.getElementsByTagName("*");
                for (let j = 0; j < figs.length; j++) {
                    const fig = figs[j];
                    if ((fig.localName || fig.nodeName) === "TiposFigura" && fig.getAttribute("TipoFigura") === "01") tieneOperador = "Sí";
                    if ((fig.localName || fig.nodeName) === "Operador") tieneOperador = "Sí";
                }
            }
        }
    }
    
    if (tieneOrigen === "No" && xmlContent.includes('TipoUbicacion="Origen"')) tieneOrigen = "Sí (Detectado)";
    if (tieneDestino === "No" && xmlContent.includes('TipoUbicacion="Destino"')) tieneDestino = "Sí (Detectado)";
    if (tienePlacasUnidad === "No" && (xmlContent.match(/PlacaVM="[^"]+"/) || xmlContent.match(/Placa="[^"]+"/))) tienePlacasUnidad = "Sí (Detectado)";
    if (tienePesoDistancia === "No" && xmlContent.match(/PesoBrutoTotal="[^"]+"/)) tienePesoDistancia = "Sí (Detectado)";
    if (tieneMercancias === "No" && xmlContent.includes("NumTotalMercancias")) tieneMercancias = "Sí (Detectado)";
    if (tieneOperador === "No" && (xmlContent.includes('TipoFigura="01"') || xmlContent.includes('<cartaporte:Operador'))) tieneOperador = "Sí (Detectado)";

    // Extraccin Aduanera
    let pedimentosStr = "";
    let tienePedimento = "No";
    if (xmlContent.includes("NumeroPedimento") || xmlContent.includes("NumPedimento") || xmlContent.includes("DocumentoAduanero") || xmlContent.includes("ComercioExterior")) {
        tienePedimento = "Sí";
        const pedMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g) || xmlContent.match(/NumPedimento="([^"]+)"/g);
        if (pedMatch) {
            pedimentosStr = pedMatch.map(m => m.split('"')[1]).join(", ");
        } else {
            pedimentosStr = "Detectado (sin detalle)";
        }
    } else {
        pedimentosStr = "REQUIERE CAPTURA/IMPORTACIÓN";
    }

    let tieneDoda = "No";
    let numeroDodaIntegracion = "REQUIERE CAPTURA/IMPORTACIÓN";
    const dodaRegex = /(?:DODA|PITA|num(?:ero)?\s*de\s*integracion)[\s-:]*([A-Z0-9]{10,25})/i;
    const matchDoda = xmlContent.match(dodaRegex);
    if (matchDoda) {
        tieneDoda = "Sí (posible DODA detectado)";
        numeroDodaIntegracion = matchDoda[1];
    }

    let tieneEntryNumber = "No";
    if (/Entry[\s-:]*([A-Z0-9]{8,15})/i.test(xmlContent) || xmlContent.includes("Entry Number")) {
        tieneEntryNumber = "Sí";
    }

    // Identificacin bancaria
    let identificadorBancario = "REQUIERE CAPTURA/IMPORTACIÓN";
    if (xmlContent.includes("CtaOrdenante") || xmlContent.includes("CtaBeneficiario")) {
        identificadorBancario = "Sí (Detectado en CEP)";
    }
    
    // Evaluaciones (Valores por defecto)
    let soporteComercioExterior = "REQUIERE CAPTURA/IMPORTACIÓN";
    let destinoExtranjero = r.rfcReceptor && r.rfcReceptor.startsWith("XEXX") ? "SÍ" : "NO";
    
    // Reglas Fiscales
    let diagnosticoTasa0 = "NO APLICA";
    let accionRecomendadaTasa0 = "NO APLICA";
    if (r.baseIVA0 > 0) {
        if (exportacion === "01") {
            let faltas = [];
            if (tieneOrigen === "No") faltas.push("Origen");
            if (destinoExtranjero === "NO") faltas.push("Destino extranjero");
            if (tieneCartaPorte === "No") faltas.push("Carta Porte");
            if (tienePedimento === "No") faltas.push("Pedimento");
            if (faltas.length > 0) {
                diagnosticoTasa0 = "RIESGO EN TASA 0% / REQUIERE SOPORTE";
                accionRecomendadaTasa0 = "Falta: " + faltas.join(", ");
            } else {
                diagnosticoTasa0 = "SOPORTADO";
                accionRecomendadaTasa0 = "Ninguna";
            }
        } else {
            diagnosticoTasa0 = "Tasa 0% Nacional";
            accionRecomendadaTasa0 = "Verificar evidencia de entrega";
        }
    }

    let ivaAcreditable = (r.tipoCFDI === "E" || (r.tipoCFDI === "I" && r.rfcReceptor !== "Desconocido")) ? r.ivaTraslado : 0;
    let diagnosticoIvaAcreditable = ivaAcreditable > 0 ? (identificadorBancario.includes("Sí") ? "ACREDITAMIENTO SOPORTADO" : "FALTA CRUCE CON ESTADO DE CUENTA") : "NO APLICA";
    let accionRecomendadaIvaAcreditable = ivaAcreditable > 0 && !identificadorBancario.includes("Sí") ? "Asociar transferencia o CEP" : "Ninguna";

    let datosFaltantes = "Ninguno";
    let fuenteExternaRequerida = "NO";
    let diagnosticoDatosFaltantes = "XML Básico";
    let accionRecomendadaDatosFaltantes = "Ninguna";
    let auditableSoloConXML = "SÍ";

    let nivelExpediente = "SOPORTE FISCAL PARCIAL";
    let estatusDocumental = "Válido a nivel SAT";
    let riesgo = "MEDIO";
    let accionRecomendadaMatriz = "Ninguna";

    if (tienePedimento === "No" && (tieneDoda.includes("Sí") || exportacion !== "01")) {
        // Podria requerir
    }

    const esFleteOCartaPorte = tieneCartaPorte === "Sí" || /flete|transporte|acarreo/i.test(conceptoPrincipal) || 
                        Array.from(comprobante?.getElementsByTagName("*") || []).some(n => (n.localName || n.nodeName) === "Concepto" && /^78101[78]\d{2}|^78102\d{3}/.test(n.getAttribute("ClaveProdServ")||""));

    if (esFleteOCartaPorte) {
        if (tieneCartaPorte === "No") {
            diagnosticoDatosFaltantes = "FALTA CARTA PORTE";
            datosFaltantes = "Complemento Carta Porte";
            fuenteExternaRequerida = "SÍ (Soporte Transportista)";
            accionRecomendadaDatosFaltantes = "Solicitar Carta Porte al emisor";
            auditableSoloConXML = "NO";
        } else if (tieneOrigen === "Sí" && tieneDestino === "Sí") {
            diagnosticoDatosFaltantes = "Carta Porte Logística Completa";
            nivelExpediente = "SOPORTE FISCAL Y LOGÍSTICO PARCIAL";
            auditableSoloConXML = "SÍ (Logística)";
        }
    }

    if (tienePedimento === "Sí") {
        if (!tieneDoda.includes("Sí")) {
            diagnosticoDatosFaltantes = "FALTA DODA / NÚMERO DE INTEGRACIÓN";
            datosFaltantes = "DODA";
            fuenteExternaRequerida = "SÍ (Agente Aduanal)";
            accionRecomendadaDatosFaltantes = "Cruzar pedimento con agente aduanal";
            auditableSoloConXML = "NO";
            nivelExpediente = "SOPORTE ADUANERO PARCIAL";
            riesgo = "MEDIO-ALTO";
        } else {
            nivelExpediente = "SOPORTE ADUANERO ROBUSTO";
            diagnosticoDatosFaltantes = "Pedimento y DODA detectados";
            auditableSoloConXML = "SÍ (Con VUCEM)";
            riesgo = "BAJO";
        }
    } else if (exportacion === "01" || r.baseIVA0 > 0) {
        if (tienePedimento === "No") {
            diagnosticoDatosFaltantes = "FALTA PEDIMENTO / REQUIERE AGENTE ADUANAL";
            fuenteExternaRequerida = "SÍ (Agente Aduanal)";
            datosFaltantes = "Pedimento";
            accionRecomendadaDatosFaltantes = "Obtener pedimento para soportar exportación";
            auditableSoloConXML = "NO";
        }
    }

    if (nivelExpediente === "SOPORTE ADUANERO ROBUSTO" && identificadorBancario.includes("Sí")) {
        nivelExpediente = "EXPEDIENTE SOPORTADO";
        estatusDocumental = "Completo";
        riesgo = "NULO";
        accionRecomendadaMatriz = "Archivar para auditoría";
    }

    if (r.baseIVA0 > 0 && tienePedimento === "No") {
        nivelExpediente = "RIESGO EN TASA 0% / REQUIERE SOPORTE";
        riesgo = "ALTO";
        estatusDocumental = "Incompleto";
        accionRecomendadaMatriz = "Completar expediente aduanero";
    }
    
    if (nivelExpediente === "SOPORTE FISCAL PARCIAL" && !identificadorBancario.includes("Sí")) {
        accionRecomendadaMatriz = "FALTA CRUCE CON ESTADO DE CUENTA";
    }

    return {
        fechaCobro: "REQUIERE CAPTURA/IMPORTACIÓN",
        folioTransferencia: "REQUIERE CAPTURA/IMPORTACIÓN",
        banco: "REQUIERE CAPTURA/IMPORTACIÓN",
        identificadorBancario,
        observacionSAT: r.estatusSAT,

        destinoExtranjero,
        tienePedimento,
        pedimento: pedimentosStr,
        tieneDoda,
        numeroDodaIntegracion,
        soporteComercioExterior,
        diagnosticoTasa0,
        accionRecomendadaTasa0,

        ivaAcreditable,
        fechaPago: "REQUIERE CAPTURA/IMPORTACIÓN",
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
        datosFaltantes,
        fuenteExternaRequerida,
        diagnosticoDatosFaltantes,
        accionRecomendadaDatosFaltantes,
        auditableSoloConXML,

        estadoDeCuenta: "REQUIERE CAPTURA/IMPORTACIÓN",
        nivelExpediente,
        estatusDocumental,
        riesgo,
        accionRecomendadaMatriz
    };
};
\;

engine = engine.replace('export const detectCFDIVersion', newCode + '\nexport const detectCFDIVersion');
// Agregando trazabilidadInfo al ValidationResult interface
engine = engine.replace('deletedAt?: string;', 'deletedAt?: string;\n    trazabilidadInfo?: TrazabilidadFiscalInfo;');

fs.writeFileSync(enginePath, engine, 'utf8');
console.log("Modificado cfdiEngine");
