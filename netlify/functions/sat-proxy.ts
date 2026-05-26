import { getStore } from "@netlify/blobs";

export const handler = async (event: any) => {
    try {
        if (event.httpMethod !== "POST") {
            return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
        }

        const token = event.headers["x-sentinel-token"];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: "No autorizado. Token faltante." }) };
        }

        // Conectar a Blobs
        let store;
        try {
            store = getStore({
                name: "sentinel-tokens",
                consistency: "strong",
                siteID: process.env.NETLIFY_SITE_ID || "45d68d70-756c-49fd-8162-9efbc826c577",
                token: process.env.NETLIFY_API_TOKEN
            });
        } catch (e: any) {
            console.error("[SAT Proxy] Error Blobs:", e.name);
            return { statusCode: 500, body: JSON.stringify({ error: "Error interno del servidor." }) };
        }

        // Validar token en backend
        const tokenData: any = await store.get(token, { type: "json" });

        if (!tokenData) {
            return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. Token inválido." }) };
        }

        if (tokenData.status === "pending") {
            return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. Token pendiente de activación." }) };
        }

        if (tokenData.status === "suspended") {
            return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. Token suspendido." }) };
        }

        if (tokenData.status === "expired") {
            return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. Token expirado." }) };
        }

        // Validar expiración por fecha
        if (tokenData.expiresAt) {
            const expiry = new Date(tokenData.expiresAt);
            if (new Date() > expiry) {
                // Auto-marcar como expirado podría ir aquí si fuera necesario
                return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. El periodo de prueba ha finalizado." }) };
            }
        }

        if (tokenData.status !== "active") {
            return { statusCode: 403, body: JSON.stringify({ error: "Acceso denegado. Estado de token no válido." }) };
        }

        // Token válido. Hacer la petición real al SAT.
        const soapBody = event.body;
        
        const satResponse = await fetch("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
            },
            body: soapBody,
        });

        if (!satResponse.ok) {
            return { 
                statusCode: 502, 
                body: JSON.stringify({ error: `El servicio del SAT no está disponible (HTTP ${satResponse.status}).` }) 
            };
        }

        const xmlText = await satResponse.text();

        // -- TELEMETRÍA MÍNIMA VENDIBLE --
        tokenData.satQueriesCount = (tokenData.satQueriesCount || 0) + 1;
        tokenData.lastSatQueryAt = new Date().toISOString();
        try {
            await store.setJSON(token, tokenData);
        } catch (err) {
            console.error("[SAT Proxy] Error guardando telemetría:", err);
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/xml; charset=utf-8"
            },
            body: xmlText
        };

    } catch (e: any) {
        console.error("[SAT Proxy] Error general:", e.name);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno procesando la solicitud." }) };
    }
};
