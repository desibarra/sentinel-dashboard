import { DEMO_TOKENS, DemoToken } from "@/config/tokenConfig";

export interface TokenValidationResult {
    valid: boolean;
    expired: boolean;
    tokenData: DemoToken | null;
    daysRemaining: number;
    expiryDateFormatted: string;
}

/**
 * Lee el ?token= de la URL actual y lo valida contra la lista de tokens configurados.
 */
export function validateURLToken(): TokenValidationResult {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");

    if (!tokenParam) {
        return { valid: false, expired: false, tokenData: null, daysRemaining: 0, expiryDateFormatted: "" };
    }

    const tokenData = DEMO_TOKENS.find(
        (t) => t.token.toLowerCase() === tokenParam.toLowerCase()
    );

    if (!tokenData) {
        return { valid: false, expired: false, tokenData: null, daysRemaining: 0, expiryDateFormatted: "" };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expiry = new Date(tokenData.expiresAt + "T00:00:00");

    const msRemaining = expiry.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    const expired = daysRemaining < 0;

    const expiryDateFormatted = expiry.toLocaleDateString("es-MX", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return {
        valid: true,
        expired,
        tokenData,
        daysRemaining,
        expiryDateFormatted,
    };
}

/**
 * Persiste el token de demo en sessionStorage para mantener la sesión
 * mientras el cliente navega por la app sin el ?token= en la URL.
 */
export function persistDemoSession(tokenData: DemoToken): void {
    sessionStorage.setItem("demo_token", JSON.stringify(tokenData));
}

/**
 * Recupera la sesión de demo (si existe en sessionStorage).
 */
export function getDemoSession(): DemoToken | null {
    const stored = sessionStorage.getItem("demo_token");
    if (!stored) return null;
    try {
        const tokenData: DemoToken = JSON.parse(stored);
        // Re-validar que no haya expirado
        const expiry = new Date(tokenData.expiresAt + "T00:00:00");
        if (new Date() > expiry) {
            sessionStorage.removeItem("demo_token");
            return null;
        }
        return tokenData;
    } catch {
        return null;
    }
}

/**
 * Limpia la sesión de demo.
 */
export function clearDemoSession(): void {
    sessionStorage.removeItem("demo_token");
}
