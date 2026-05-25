import { getStore } from "@netlify/blobs";

export const handler = async (event: any) => {
    try {
        if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

        const body = JSON.parse(event.body || "{}");
        const { nombre, empresa, email, telefono, cfdi_mensuales, token } = body;
        
        if (!email || !telefono) return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos requeridos" }) };

        // Connect to Netlify Blobs store
        let store;
        try {
            store = getStore({
                name: "sentinel-tokens",
                consistency: "strong",
                siteID: process.env.NETLIFY_SITE_ID || "45d68d70-756c-49fd-8162-9efbc826c577",
                token: process.env.NETLIFY_API_TOKEN
            });
        } catch (e: any) {
            console.error("[LeadCapture] Error configurando Blobs:", e.message);
            // Si Blobs falla, no detenemos el lead capture, simplemente logeamos
        }
        
        // Generate new token or use provided one
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const code = token || Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        
        const newToken = {
            id: code,
            name: nombre || "",
            company: empresa || "",
            email,
            phone: telefono,
            cfdiVolume: cfdi_mensuales || "No especificado",
            status: "pending",
            createdAt: new Date().toISOString()
        };

        // Save to Blob store using token as key
        await store.setJSON(code, newToken);

        return { 
            statusCode: 200, 
            body: JSON.stringify({
                success: true,
                saved: true,
                token: code, 
                events: ["lead_registered", "token_generated_pending"] 
            }) 
        };

    } catch (e: any) {
        console.error(`[LeadCapture] Error en el backend: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
