const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const ADMIN_PW = process.env.ADMIN_TOKENS_PASSWORD;
const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

async function fetchBin() {
    const res = await fetch(`${BASE_URL}/latest`, { headers: { "X-Master-Key": MASTER_KEY!, "X-Bin-Meta": "false" } });
    if (!res.ok) throw new Error("JSONBin GET error");
    return res.json();
}

async function updateBin(data: any) {
    const res = await fetch(BASE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": MASTER_KEY! },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("JSONBin PUT error");
}

export const handler = async (event: any) => {
    try {
        const password = event.headers["x-admin-password"];
        if (!password || password !== ADMIN_PW) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
        }

        if (event.httpMethod === "GET") {
            const data = await fetchBin();
            return { statusCode: 200, body: JSON.stringify(data.tokens || []) };
        }

        if (event.httpMethod === "POST") {
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
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
