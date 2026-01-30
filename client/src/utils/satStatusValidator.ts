import { toast } from "sonner";

interface CFDIStatusSAT {
    estado: 'Vigente' | 'Cancelado' | 'No Encontrado';
    esCancelable: string;
    estatusCancelacion: string;
    codigoEstatus: string;
    validatedAt: Date;
}

/**
 * Consulta el estatus de un CFDI en el Web Service público del SAT
 * Utiliza un proxy para evitar CORS:
 * - Local: Vite proxy (/api/sat)
 * - Prod: Netlify redirect (/api/sat)
 */
export async function checkCFDIStatusSAT(
    uuid: string,
    rfcEmisor: string,
    rfcReceptor: string,
    total: number
): Promise<CFDIStatusSAT> {
    const soapRequest = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
       <soapenv:Header/>
       <soapenv:Body>
          <tem:Consulta>
             <tem:expresionImpresa><![CDATA[?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${total.toFixed(6)}&id=${uuid}]]></tem:expresionImpresa>
          </tem:Consulta>
       </soapenv:Body>
    </soapenv:Envelope>
  `;

    try {
        // Usamos el proxy configurado en vite.config.ts y netlify.toml
        const response = await fetch("/api/sat/ConsultaCFDIService.svc", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
            },
            body: soapRequest
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const getTagValue = (tagName: string) => {
            const elements = xmlDoc.getElementsByTagName(tagName);
            return elements.length > 0 ? elements[0].textContent || "" : "";
        };

        // Mapeo seguro de campos con namespaces (a veces vienen con 'a:', a veces sin prefijo)
        const codigoEstatus = getTagValue("CodigoEstatus") || getTagValue("a:CodigoEstatus");
        const estado = getTagValue("Estado") || getTagValue("a:Estado");
        const esCancelable = getTagValue("EsCancelable") || getTagValue("a:EsCancelable");
        const estatusCancelacion = getTagValue("EstatusCancelacion") || getTagValue("a:EstatusCancelacion");

        return {
            estado: (estado === "Vigente" || estado === "Cancelado") ? estado : "No Encontrado",
            esCancelable,
            estatusCancelacion,
            codigoEstatus,
            validatedAt: new Date()
        };

    } catch (error) {
        console.error("Error consultando SAT:", error);
        return {
            estado: "No Encontrado",
            esCancelable: "Error de conexión",
            estatusCancelacion: "No disponible",
            codigoEstatus: "Error de red",
            validatedAt: new Date()
        };
    }
}
