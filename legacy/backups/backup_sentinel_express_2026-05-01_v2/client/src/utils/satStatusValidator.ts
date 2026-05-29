import { toast } from "sonner";

interface CFDIStatusSAT {
    estado: 'Vigente' | 'Cancelado' | 'No Encontrado' | 'Error Conexión';
    esCancelable: string;
    estatusCancelacion: string;
    codigoEstatus: string;
    validatedAt: Date;
}

/**
 * Consulta el estatus de un CFDI en el Web Service público del SAT
 * Utiliza un proxy para evitar CORS:
 * - Local: Vite proxy (/api/sat) -> https://consultaqr.facturaelectronica.sat.gob.mx
 * - Prod: Netlify redirect (/api/sat) -> https://consultaqr.facturaelectronica.sat.gob.mx
 */
export async function checkCFDIStatusSAT(
    uuid: string,
    rfcEmisor: string,
    rfcReceptor: string,
    total: number
): Promise<CFDIStatusSAT> {
    // Formatear total a 6 decimales como requiere el SAT
    const totalFormatted = Number(total).toFixed(6);

    // Construir sobre SOAP
    const soapRequest = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
       <soapenv:Header/>
       <soapenv:Body>
          <tem:Consulta>
             <tem:expresionImpresa><![CDATA[?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${totalFormatted}&id=${uuid}]]></tem:expresionImpresa>
          </tem:Consulta>
       </soapenv:Body>
    </soapenv:Envelope>
  `;

    try {
        // Llamada directa al WebService del SAT a través del PROXY de Netlify/Vite
        const response = await fetch("/api/sat/ConsultaCFDIService.svc", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
            },
            body: soapRequest,
        });

        if (!response.ok) {
            throw new Error(`Servicio SAT no disponible (HTTP ${response.status})`);
        }

        // Guard: Si el proxy devuelve HTML en lugar de XML (error de Netlify/backend)
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
            throw new Error("El proxy SAT devolvió HTML en lugar de XML. Verifica la configuración del redirect en netlify.toml.");
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // El SAT devuelve un XML con namespaces embebidos. Buscamos el nodo de estado.
        const estadoTag = xmlDoc.getElementsByTagName("Estado")[0] ||
            xmlDoc.getElementsByTagName("a:Estado")[0];

        const estadoRaw = estadoTag?.textContent || "No Encontrado";

        return {
            estado: estadoRaw === "Vigente" || estadoRaw === "Cancelado" ? estadoRaw : "No Encontrado",
            esCancelable: xmlDoc.getElementsByTagName("EsCancelable")[0]?.textContent || "N/A",
            estatusCancelacion: xmlDoc.getElementsByTagName("EstatusCancelacion")[0]?.textContent || "N/A",
            codigoEstatus: xmlDoc.getElementsByTagName("CodigoEstatus")[0]?.textContent || "N/A",
            validatedAt: new Date()
        };
    } catch (error) {
        console.warn("[SAT_VALIDATOR] Falla en consulta directa:", error);
        return {
            estado: "Error Conexión",
            esCancelable: "N/A",
            estatusCancelacion: "N/A",
            codigoEstatus: "N/A",
            validatedAt: new Date()
        };
    }
}
