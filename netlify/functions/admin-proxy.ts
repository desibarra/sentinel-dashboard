const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const ADMIN_PW = process.env.ADMIN_TOKENS_PASSWORD;
const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

async function fetchBin() {
    const res = await fetch(`${BASE_URL}/latest`, { headers: { "X-Master-Key": MASTER_KEY || "", "X-Bin-Meta": "false" } });
    if (!res.ok) throw new Error(`JSONBIN_ERROR:${res.status}`);
    return res.json();
}

async function updateBin(data: any) {
    const res = await fetch(BASE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": MASTER_KEY || "" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`JSONBIN_ERROR:${res.status}`);
}

export const handler = async (event: any) => {
    try {
        console.log(`[AdminProxy] ADMIN_TOKENS_PASSWORD existe: ${!!ADMIN_PW}`);
        console.log(`[AdminProxy] JSONBIN_MASTER_KEY existe: ${!!MASTER_KEY}`);
        console.log(`[AdminProxy] JSONBIN_BIN_ID existe: ${!!BIN_ID}`);

        const password = event.headers["x-admin-password"];
        if (!password || password !== ADMIN_PW) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
        }

        const isJsonBinConfigured = !!(MASTER_KEY && BIN_ID);

        if (event.httpMethod === "GET") {
            if (!isJsonBinConfigured) {
                return { 
                    statusCode: 200, 
                    headers: { "x-jsonbin-disabled": "true" },
                    body: JSON.stringify([]) 
                };
            }
            const data = await fetchBin();
            return { 
                statusCode: 200, 
                headers: { "x-jsonbin-disabled": "false" },
                body: JSON.stringify(data.tokens || []) 
            };
        }

        if (event.httpMethod === "POST") {
            if (!isJsonBinConfigured) {
                return { statusCode: 403, body: JSON.stringify({ error: "JSONBIN_NOT_CONFIGURED" }) };
            }
            const body = JSON.parse(event.body || "{}");
            const { action, payload } = body;
            const data = await fetchBin();
            data.tokens = data.tokens || [];

            if (action === "create") {
                const newToken = { ...payload, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
                data.tokens.push(newToken);
                await updateBin(data);
                return { statusCode: 200, body: JSON.stringify(newToken) };
            }
            if (action === "toggle") {
                const { id, active } = payload;
                data.tokens = data.tokens.map((t: any) => t.id === id ? { ...t, active } : t);
                await updateBin(data);
                return { statusCode: 200, body: JSON.stringify({ success: true }) };
            }
            if (action === "delete") {
                const { id } = payload;
                data.tokens = data.tokens.filter((t: any) => t.id !== id);
                await updateBin(data);
                return { statusCode: 200, body: JSON.stringify({ success: true }) };
            }
        }
        return { statusCode: 400, body: "Bad Request" };
    } catch (e: any) {
        if (e.message.startsWith("JSONBIN_ERROR")) {
            console.error(`[AdminProxy] Error de conexión con JSONBin: ${e.message}`);
            return { statusCode: 502, body: JSON.stringify({ error: "JSONBIN_CONNECTION_ERROR", details: e.message }) };
        }
        console.error(`[AdminProxy] Error interno del servidor: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: "INTERNAL_ERROR", details: e.message }) };
    }
};
