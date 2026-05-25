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

        const store = getStore("sentinel-tokens");
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
