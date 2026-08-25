import { satQueue, SatRetryableError, SatOutcomeKind } from "@/lib/satQueue";

interface CFDIStatusSAT {
    estado: 'Vigente' | 'Cancelado' | 'No Encontrado' | 'Error Conexión';
    esCancelable: string;
    estatusCancelacion: string;
    codigoEstatus: string;
    validatedAt: Date;
}

/**
 * Consulta cruda al Web Service del SAT — sin cola, sin reintentos.
 * Lanza SatRetryableError para fallas transitorias (timeout ya lo aplica la
 * cola con Promise.race; aquí se marcan 429/5xx/red) para que satQueue.run()
 * decida si reintentar. Un estatus definitivo (Vigente/Cancelado/No
 * Encontrado) o un error no transitorio (401/403/etc.) NUNCA se reintenta.
 */
async function checkCFDIStatusSATRaw(
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

    // Obtener token activo de sessionStorage
    const storedDemo = sessionStorage.getItem("demo_token");
    let token = "";
    if (storedDemo) {
        try {
            const parsed = JSON.parse(storedDemo);
            token = parsed.token || "";
        } catch (e) { /* token inválido en sessionStorage — se envía vacío, el proxy lo rechazará */ }
    }

    let response: Response;
    try {
        // Llamada a nuestro backend seguro (sat-proxy)
        response = await fetch("/.netlify/functions/sat-proxy", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "x-sentinel-token": token
            },
            body: soapRequest,
        });
    } catch (networkErr: any) {
        // fetch() solo rechaza por fallas de red/CORS/DNS — siempre transitorio.
        throw new SatRetryableError('network', networkErr?.message || 'Fallo de red al consultar el SAT');
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            // Token inválido/expirado — no es transitorio, reintentar no ayuda.
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Acceso denegado (HTTP ${response.status})`);
        }
        if (response.status === 429) {
            throw new SatRetryableError('http_429', 'SAT: demasiadas solicitudes (429)', 429);
        }
        if (response.status >= 500) {
            throw new SatRetryableError('http_5xx', `SAT/proxy no disponible (HTTP ${response.status})`, response.status);
        }
        throw new Error(`Servicio SAT no disponible (HTTP ${response.status})`);
    }

    // Guard: Si el proxy devuelve JSON con error o HTML
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const errData = await response.json();
        throw new Error(errData.error || "Error devuelto por el servidor");
    }
    if (contentType.includes("text/html")) {
        throw new Error("El proxy devolvió HTML en lugar de XML.");
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
}

const classifySatOutcome = (value: CFDIStatusSAT): SatOutcomeKind => {
    if (value.estado === 'Vigente') return 'vigente';
    if (value.estado === 'Cancelado') return 'cancelado';
    if (value.estado === 'No Encontrado') return 'no_encontrado';
    return 'timeout_o_error';
};

/**
 * Consulta el estatus de un CFDI en el Web Service público del SAT
 * Utiliza un proxy para evitar CORS:
 * - Local: Vite proxy (/api/sat) -> https://consultaqr.facturaelectronica.sat.gob.mx
 * - Prod: Netlify redirect (/api/sat) -> https://consultaqr.facturaelectronica.sat.gob.mx
 *
 * P0-C: la llamada real pasa por satQueue — concurrencia acotada (5 por
 * defecto, configurable), timeout de 12s (antes: 5s fijo) y hasta 2
 * reintentos con backoff+jitter SOLO ante timeout/429/5xx/red. Un estatus
 * definitivo (Vigente/Cancelado/No Encontrado) se acepta en el primer
 * intento y nunca se reintenta. El contrato externo de esta función no
 * cambia: nunca lanza, siempre resuelve a un CFDIStatusSAT — un fallo tras
 * agotar reintentos se reporta como "Error Conexión", igual que antes.
 */
export async function checkCFDIStatusSAT(
    uuid: string,
    rfcEmisor: string,
    rfcReceptor: string,
    total: number
): Promise<CFDIStatusSAT> {
    try {
        return await satQueue.run(
            () => checkCFDIStatusSATRaw(uuid, rfcEmisor, rfcReceptor, total),
            classifySatOutcome
        );
    } catch (error) {
        console.warn("[SAT_VALIDATOR] Falla en consulta (tras agotar reintentos si aplicaban):", error);
        return {
            estado: "Error Conexión",
            esCancelable: "N/A",
            estatusCancelacion: "N/A",
            codigoEstatus: "N/A",
            validatedAt: new Date()
        };
    }
}
