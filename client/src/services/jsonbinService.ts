export interface ManagedToken {
    id: string;
    token: string;
    label: string;
    expiresAt: string; // YYYY-MM-DD
    createdAt: string; // ISO
    active: boolean;
    demoCompanyName: string;
    demoCompanyRFC: string;
    // Tracking de uso
    accessCount?: number;
    lastAccessed?: string;
    // Lead info (optional)
    leadName?: string;
    leadEmail?: string;
    leadPhone?: string;
    leadCfdi?: string;
    leadOrigen?: string;
}

const ADMIN_ENDPOINT = "/api/functions/admin-proxy";
const PUBLIC_ENDPOINT = "/api/functions/token-validate";

export const jsonbinService = {
    /** Obtiene todos los tokens. Retorna también si JSONBin está deshabilitado. */
    async getTokens(password: string): Promise<{ tokens: ManagedToken[], disabled?: boolean }> {
        const res = await fetch(ADMIN_ENDPOINT, {
            headers: { "x-admin-password": password }
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw { status: res.status, error: errBody.error || "Unknown Error" };
        }
        const data = await res.json();
        if (Array.isArray(data)) {
            return { tokens: data };
        }
        return data;
    },

    /** Crea un nuevo token */
    async createToken(token: Omit<ManagedToken, "id" | "createdAt">, password: string): Promise<ManagedToken> {
        const res = await fetch(ADMIN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify({ action: "create", payload: token })
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw { status: res.status, error: errBody.error || "Unknown Error" };
        }
        return res.json();
    },

    /** Activa o desactiva un token */
    async toggleToken(id: string, active: boolean, password: string): Promise<void> {
        const res = await fetch(ADMIN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify({ action: "toggle", payload: { id, active } })
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw { status: res.status, error: errBody.error || "Unknown Error" };
        }
    },

    /** Elimina un token permanentemente */
    async deleteToken(id: string, password: string): Promise<void> {
        const res = await fetch(ADMIN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify({ action: "delete", payload: { id } })
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw { status: res.status, error: errBody.error || "Unknown Error" };
        }
    },

    /** Valida un token (PÚBLICO) */
    async validateToken(tokenCode: string): Promise<ManagedToken | null> {
        try {
            const res = await fetch(PUBLIC_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "validate", payload: { tokenCode } })
            });
            if (!res.ok) return null;
            return res.json();
        } catch {
            return null;
        }
    },

    /** Tracking manual (PÚBLICO) */
    async trackTokenAccess(id: string): Promise<void> {
        await fetch(PUBLIC_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "track", payload: { id } })
        });
    },
};
