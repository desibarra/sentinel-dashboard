import { getStore } from "@netlify/blobs";

export const handler = async (event: any) => {
    try {
        if (event.httpMethod !== "POST") {
            return { statusCode: 405, body: "Method Not Allowed" };
        }

        const token = event.headers["x-sentinel-token"];
        if (!token) {
            return { statusCode: 401, body: "Unauthorized" };
        }

        const body = JSON.parse(event.body || "{}");
        const { eventName } = body;

        if (!eventName) {
            return { statusCode: 400, body: "Bad Request" };
        }

        // Conectar a Blobs
        const store = getStore({
            name: "sentinel-tokens",
            consistency: "strong",
            siteID: process.env.NETLIFY_SITE_ID || "45d68d70-756c-49fd-8162-9efbc826c577",
            token: process.env.NETLIFY_API_TOKEN
        });

        const tokenData: any = await store.get(token, { type: "json" });
        if (!tokenData) {
            return { statusCode: 404, body: "Not Found" };
        }

        if (eventName === "dashboard_opened") {
            tokenData.dashboardOpensCount = (tokenData.dashboardOpensCount || 0) + 1;
            await store.setJSON(token, tokenData);
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (e: any) {
        // Fallo silencioso comercial
        return { statusCode: 200, body: JSON.stringify({ success: false }) };
    }
};
