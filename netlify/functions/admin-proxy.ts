import { getStore } from "@netlify/blobs";

export const handler = async (event: any) => {
    console.log("[AdminProxy] Function called");
    console.log(`[AdminProxy] Method: ${event.httpMethod}`);
    
    try {
        const ADMIN_PASSWORD = process.env.ADMIN_TOKENS_PASSWORD;
        console.log(`[AdminProxy] ADMIN_TOKENS_PASSWORD existe: ${!!ADMIN_PASSWORD}`);
        
        if (!ADMIN_PASSWORD) {
            console.log("[AdminProxy] Faltan variables de entorno");
            return { statusCode: 500, body: JSON.stringify({ code: "MISSING_ADMIN_PASSWORD", error: "Falta ADMIN_TOKENS_PASSWORD en el servidor" }) };
        }

        const passwordHeader = event.headers["x-admin-password"] || "";
        console.log(`[AdminProxy] Longitud password recibida: ${passwordHeader.length}`);
        console.log(`[AdminProxy] Longitud password configurada: ${ADMIN_PASSWORD.length}`);
        
        const isMatch = passwordHeader === ADMIN_PASSWORD;
        console.log(`[AdminProxy] ¿Contraseñas coinciden?: ${isMatch}`);

        if (!isMatch) {
            return { statusCode: 401, body: JSON.stringify({ code: "INVALID_PASSWORD", error: "Unauthorized" }) };
        }

        let store;
        try {
            store = getStore("sentinel-tokens");
        } catch (e: any) {
            console.error(`[AdminProxy] Error al inicializar Blobs: ${e.message}`);
            return { statusCode: 200, body: JSON.stringify({ authenticated: true, blobError: true, errorDetails: e.message, tokens: [] }) };
        }

        if (event.httpMethod === "GET") {
            try {
                const { blobs } = await store.list();
                const tokens = [];
                
                for (const blob of blobs) {
                    const tokenData = await store.get(blob.key, { type: "json" });
                    if (tokenData) {
                        tokens.push(tokenData);
                    }
                }
                
                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ authenticated: true, blobError: false, tokens }) 
                };
            } catch (e: any) {
                console.error(`[AdminProxy] Error al leer Blobs (GET): ${e.message}`);
                return { statusCode: 200, body: JSON.stringify({ authenticated: true, blobError: true, errorDetails: e.message, tokens: [] }) };
            }
        }

        if (event.httpMethod === "POST") {
            const body = JSON.parse(event.body || "{}");
            const { action, tokenId, days } = body;
            
            if (!tokenId) {
                return { statusCode: 400, body: JSON.stringify({ error: "Token ID required" }) };
            }

            const tokenData: any = await store.get(tokenId, { type: "json" });
            if (!tokenData) {
                return { statusCode: 404, body: JSON.stringify({ error: "Token not found" }) };
            }

            const now = new Date();

            if (action === "activate") {
                const expiresAt = new Date(now.getTime() + (days || 30) * 24 * 60 * 60 * 1000);
                tokenData.status = "active";
                tokenData.activatedAt = now.toISOString();
                tokenData.expiresAt = expiresAt.toISOString();
            } else if (action === "suspend") {
                tokenData.status = "suspended";
            } else if (action === "reactivate") {
                tokenData.status = "active";
            } else if (action === "expire") {
                tokenData.status = "expired";
            } else if (action === "extend") {
                if (!tokenData.expiresAt) {
                    return { statusCode: 400, body: JSON.stringify({ error: "Token was never activated" }) };
                }
                const oldExpiry = new Date(tokenData.expiresAt);
                const newExpiry = new Date(oldExpiry.getTime() + (days || 30) * 24 * 60 * 60 * 1000);
                tokenData.expiresAt = newExpiry.toISOString();
            } else if (action === "delete") {
                await store.delete(tokenId);
                return { statusCode: 200, body: JSON.stringify({ success: true, deleted: true }) };
            } else {
                return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
            }

            await store.setJSON(tokenId, tokenData);

            return { 
                statusCode: 200, 
                body: JSON.stringify({ success: true, token: tokenData }) 
            };
        }

        return { statusCode: 405, body: "Method Not Allowed" };

    } catch (e: any) {
        console.error(`[AdminProxy] Error: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
