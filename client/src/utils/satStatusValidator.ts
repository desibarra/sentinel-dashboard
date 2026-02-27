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
        const response = await fetch("/api/sat/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uuid, rfcEmisor, rfcReceptor, total }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Error HTTP: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const estadoNode =
            xmlDoc.getElementsByTagName("a:Estado")[0] ||
            xmlDoc.getElementsByTagName("Estado")[0];

        const estadoRaw = estadoNode?.textContent || "No Encontrado";

        const estadoNormalizado =
            estadoRaw === "Vigente" || estadoRaw === "Cancelado"
                ? estadoRaw
                : "No Encontrado";

        return {
            estado: estadoNormalizado,
            esCancelable: "N/A",
            estatusCancelacion: "N/A",
            codigoEstatus: "N/A",
            validatedAt: new Date()
        };
    } catch (error) {
        console.warn("Falla en validación SAT:", error);
        return {
            estado: "Error Conexión",
            esCancelable: "N/A",
            estatusCancelacion: "N/A",
            codigoEstatus: "N/A",
            validatedAt: new Date()
        };
    }
}
