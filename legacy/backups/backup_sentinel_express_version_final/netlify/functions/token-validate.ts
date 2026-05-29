const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
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
        if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

        const body = JSON.parse(event.body || "{}");
        const { action, payload } = body;
        
        const data = await fetchBin();
        const tokens = data.tokens || [];

        if (action === "validate") {
            const { tokenCode } = payload;
            const found = tokens.find((t: any) => t.token.toLowerCase() === tokenCode.toLowerCase() && t.active);
            if (!found) return { statusCode: 200, body: JSON.stringify(null) };

            const expiry = new Date(found.expiresAt + "T23:59:59");
            if (new Date() > expiry) return { statusCode: 200, body: JSON.stringify(null) };

            const updatedToken = {
                ...found,
                accessCount: (found.accessCount || 0) + 1,
                lastAccessed: new Date().toISOString(),
            };
            data.tokens = tokens.map((t: any) => t.id === found.id ? updatedToken : t);
            
            updateBin(data).catch(() => {}); // Fire and forget update
            
            return { statusCode: 200, body: JSON.stringify(updatedToken) };
        }

        if (action === "track") {
            const { id } = payload;
            data.tokens = tokens.map((t: any) => t.id === id ? { ...t, accessCount: (t.accessCount || 0) + 1, lastAccessed: new Date().toISOString() } : t);
            await updateBin(data);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 400, body: "Bad Request" };
    } catch (e: any) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
