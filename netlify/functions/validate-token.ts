import { getStore } from "@netlify/blobs";

export const handler = async (event: any) => {
    try {
        // Accept both GET and POST for flexibility
        if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
            return { statusCode: 405, body: "Method Not Allowed" };
        }

        let tokenCode = "";
        
        if (event.httpMethod === "GET") {
            tokenCode = event.queryStringParameters?.token || "";
        } else {
            const body = JSON.parse(event.body || "{}");
            tokenCode = body.token || "";
        }

        if (!tokenCode) {
            return { statusCode: 400, body: JSON.stringify({ error: "Token required" }) };
        }

        let store;
        try {
            store = getStore({
                name: "sentinel-tokens",
                consistency: "strong",
                siteID: process.env.NETLIFY_SITE_ID || "45d68d70-756c-49fd-8162-9efbc826c577",
                token: process.env.NETLIFY_API_TOKEN
            });
        } catch (e: any) {
            console.error("[ValidateToken] Error configurando Blobs:", e.message);
            return { statusCode: 500, body: JSON.stringify({ error: "Error de conexión con la base de tokens" }) };
        }
        const tokenData: any = await store.get(tokenCode, { type: "json" });

        if (!tokenData) {
            return { statusCode: 404, body: JSON.stringify({ valid: false, reason: "not_found" }) };
        }

        const now = new Date();

        // Check if naturally expired based on date
        let isExpired = false;
        if (tokenData.status === "active" && tokenData.expiresAt) {
            const expiry = new Date(tokenData.expiresAt);
            if (now > expiry) {
                isExpired = true;
            }
        }

        if (tokenData.status === "pending") {
            return { statusCode: 200, body: JSON.stringify({ valid: false, reason: "pending" }) };
        }

        if (tokenData.status === "suspended") {
            return { statusCode: 200, body: JSON.stringify({ valid: false, reason: "suspended" }) };
        }

        if (tokenData.status === "expired" || isExpired) {
            return { statusCode: 200, body: JSON.stringify({ valid: false, reason: "expired" }) };
        }

        if (tokenData.status === "active" && !isExpired) {
            // -- TELEMETRÍA MÍNIMA VENDIBLE --
            tokenData.loginsCount = (tokenData.loginsCount || 0) + 1;
            tokenData.lastLoginAt = now.toISOString();
            
            // Guardar cambios sin bloquear la respuesta (fire and forget fallback o await)
            try {
                await store.setJSON(tokenCode, tokenData);
            } catch (err) {
                console.error("[ValidateToken] Error guardando telemetría:", err);
            }

            // Return safe user data for the AuthContext
            return { 
                statusCode: 200, 
                body: JSON.stringify({ 
                    valid: true,
                    token: tokenData.id,
                    label: tokenData.company || tokenData.name,
                    expiresAt: tokenData.expiresAt.split("T")[0], // Keep YYYY-MM-DD format for frontend
                    demoCompanyName: tokenData.company,
                    demoCompanyRFC: "XAXX010101000",
                }) 
            };
        }

        return { statusCode: 500, body: JSON.stringify({ error: "Unknown token state" }) };

    } catch (e: any) {
        console.error(`[ValidateToken] Error: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
    }
};
