export type TokenStatus = 'pending' | 'active' | 'suspended' | 'expired';

export interface TokenData {
    id: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    cfdiVolume: string;
    
    // Campos legacy
    nombre?: string;
    fullName?: string;
    empresa?: string;
    businessName?: string;
    despacho?: string;
    telefono?: string;
    volumenCfdi?: string;

    status: TokenStatus;
    createdAt: string;
    activatedAt?: string;
    expiresAt?: string;
    // --- TELEMETRÍA MÍNIMA VENDIBLE ---
    loginsCount?: number;
    lastLoginAt?: string;
    dashboardOpensCount?: number;
    satQueriesCount?: number;
    lastSatQueryAt?: string;
}

const ADMIN_ENDPOINT = "/api/functions/admin-proxy";
const VALIDATE_ENDPOINT = "/api/functions/validate-token";
const TRACK_ENDPOINT = "/.netlify/functions/track-event";

export const tokenService = {
    /** 
     * Valida el token con el nuevo sistema de Blobs. 
     * Retorna { valid, reason, ...tokenData } 
     */
    async validateToken(token: string) {
        try {
            const res = await fetch(`${VALIDATE_ENDPOINT}?token=${encodeURIComponent(token)}`);
            if (!res.ok) {
                // If 404, the backend returns { valid: false, reason: "not_found" }
                const data = await res.json().catch(() => null);
                if (data) return data;
                return { valid: false, reason: "server_error" };
            }
            return await res.json();
        } catch (err) {
            return { valid: false, reason: "network_error" };
        }
    },

    /** Registra eventos de telemetría comercial de forma asíncrona (fire-and-forget) */
    trackEvent(token: string, eventName: 'dashboard_opened') {
        if (!token) return;
        fetch(TRACK_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-sentinel-token": token
            },
            body: JSON.stringify({ eventName })
        }).catch(() => { /* Fallo silencioso de telemetría */ });
    },

    /** Obtiene todos los tokens para el panel de admin */
    async getTokens(password: string): Promise<{ authenticated: boolean, blobError?: boolean, errorDetails?: string, tokens: TokenData[] }> {
        const res = await fetch(ADMIN_ENDPOINT, {
            headers: { "x-admin-password": password }
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw { status: res.status, code: errBody.code || "UNKNOWN", error: errBody.error || "Unknown Error" };
        }
        return await res.json();
    },

    /** Ejecuta una acción de gestión sobre un token */
    async updateTokenAction(tokenId: string, action: 'activate' | 'suspend' | 'reactivate' | 'expire' | 'extend' | 'delete', days: number, password: string): Promise<{ success: boolean, token?: TokenData }> {
        const res = await fetch(ADMIN_ENDPOINT, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "x-admin-password": password 
            },
            body: JSON.stringify({ action, tokenId, days })
        });
        if (!res.ok) {
            throw new Error(`Error: ${res.status}`);
        }
        return await res.json();
    }
};
