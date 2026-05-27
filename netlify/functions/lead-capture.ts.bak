const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

async function fetchBin() {
    const res = await fetch(`${BASE_URL}/latest`, { headers: { "X-Master-Key": MASTER_KEY || "", "X-Bin-Meta": "false" } });
    if (!res.ok) throw new Error(`JSONBin GET error: Status ${res.status}`);
    return res.json();
}

async function updateBin(data: any) {
    const res = await fetch(BASE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": MASTER_KEY || "" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`JSONBin PUT error: Status ${res.status}`);
}

export const handler = async (event: any) => {
    try {
        if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

        const body = JSON.parse(event.body || "{}");
        const { nombre, empresa, email, telefono, cfdi_mensuales, origen, token } = body;
        
        if (!email || !telefono) return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos requeridos" }) };

        console.log(`[LeadCapture] JSONBIN_API_KEY existe: ${!!MASTER_KEY}`);
        console.log(`[LeadCapture] JSONBIN_BIN_ID existe: ${!!BIN_ID}`);

        let data: any = { tokens: [] };
        let jsonbinError: string | null = null;
        let existingToken: any = null;

        try {
            data = await fetchBin();
            data.tokens = data.tokens || [];
            existingToken = data.tokens.find((t: any) => t.leadEmail === email || t.leadPhone === telefono);
        } catch (e: any) {
            console.log(`[LeadCapture] Error en JSONBin GET: ${e.message}`);
            jsonbinError = e.message;
        }

        if (existingToken) {
            const expiry = new Date(existingToken.expiresAt + "T23:59:59");
            if (new Date() < expiry && existingToken.active) {
                // Return existing
                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ 
                        success: true,
                        saved: !jsonbinError,
                        warning: jsonbinError ? "Lead no validado correctamente (JSONBin caído), acceso permitido con token anterior" : undefined,
                        token: existingToken.token, 
                        events: ["duplicate_detected", "token_reused"] 
                    }) 
                };
            }
        }

        // Generate new token or use provided one
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const code = token || Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        
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

        if (!jsonbinError) {
            try {
                data.tokens.push(newToken);
                await updateBin(data);
            } catch (e: any) {
                console.log(`[LeadCapture] Error en JSONBin PUT: ${e.message}`);
                jsonbinError = e.message;
            }
        }

        let saved = true;
        let warning = undefined;
        if (jsonbinError) {
            saved = false;
            warning = "Lead no guardado temporalmente, acceso permitido";
            console.log(`[LeadCapture] Respaldo activado: Devolviendo acceso sin persistencia debido a: ${jsonbinError}`);
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({
                success: true,
                saved,
                warning,
                token: code, 
                events: existingToken ? ["duplicate_detected", "token_generated"] : ["lead_registered", "token_generated"] 
            }) 
        };

    } catch (e: any) {
        console.error(`[LeadCapture] Error inesperado en el backend: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
