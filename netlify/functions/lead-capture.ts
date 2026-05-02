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
        const { nombre, empresa, email, telefono, cfdi_mensuales, origen } = body;
        
        if (!email || !telefono) return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos requeridos" }) };

        const data = await fetchBin();
        data.tokens = data.tokens || [];

        // Duplicate check
        const existingToken = data.tokens.find((t: any) => t.leadEmail === email || t.leadPhone === telefono);

        if (existingToken) {
            const expiry = new Date(existingToken.expiresAt + "T23:59:59");
            if (new Date() < expiry && existingToken.active) {
                // Return existing
                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ 
                        token: existingToken.token, 
                        events: ["duplicate_detected", "token_reused"] 
                    }) 
                };
            }
            // Expired or inactive, generate new
        }

        // Generate new token
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // +7 days
        
        const newToken = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            token: code,
            label: empresa,
            expiresAt: expiryDate.toISOString().split("T")[0],
            createdAt: new Date().toISOString(),
            active: true,
            demoCompanyName: empresa,
            demoCompanyRFC: "XAXX010101000",
            leadName: nombre,
            leadEmail: email,
            leadPhone: telefono,
            leadCfdi: cfdi_mensuales,
            leadOrigen: origen
        };

        data.tokens.push(newToken);
        await updateBin(data);

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                token: code, 
                events: existingToken ? ["duplicate_detected", "token_generated"] : ["lead_registered", "token_generated"] 
            }) 
        };

    } catch (e: any) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
