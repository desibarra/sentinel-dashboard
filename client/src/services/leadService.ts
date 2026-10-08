/**
 * leadService.ts
 * Servicio para procesar leads mediante backend
 */

export interface Lead {
    nombre: string;
    empresa: string;
    email: string;
    telefono: string;
    cfdi_mensuales?: string;
    fecha_registro: string;
    origen: "sentinel_express";
}

// Claves de localStorage
export const LEAD_REGISTERED_KEY = "sentinel_lead_registered";
export const XML_COUNT_KEY = "sentinel_xml_count";
export const XML_LIMIT = 200;

export async function saveLeadToServer(lead: Lead): Promise<{ ok: boolean; token?: string; events?: string[]; error?: string }> {
    try {
        const response = await fetch("/api/functions/lead-capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lead),
        });
        const result: unknown = await response.json();
        if (!response.ok) {
            const message = typeof result === "object" && result !== null && "error" in result
                && typeof result.error === "string"
                ? result.error
                : `El servidor rechazó el registro (HTTP ${response.status}).`;
            return { ok: false, error: message };
        }
        if (typeof result !== "object" || result === null
            || !("token" in result) || typeof result.token !== "string") {
            return { ok: false, error: "El servidor devolvió una respuesta de registro inválida." };
        }
        return { ok: true, token: result.token, events: ["lead_registered", "token_generated_pending"] };
    } catch (error) {
        console.error("[LeadService] Error registrando el lead:", error);
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Error de red registrando la solicitud."
        };
    }
}

/**
 * Incrementa el contador de XMLs procesados en localStorage y devuelve el
 * nuevo total. Este contador es puramente informativo (no debe bloquear ni
 * afectar los resultados del lote): si localStorage no está disponible, se
 * degrada a devolver el conteo en memoria sin lanzar — un fallo aquí, llamado
 * justo después de validar un lote completo, no debe tirar los resultados ya
 * obtenidos.
 */
export function incrementXMLCount(count: number): number {
    const current = getXMLCount();
    const newCount = current + count;
    try {
        localStorage.setItem(XML_COUNT_KEY, String(newCount));
    } catch (e) {
        console.warn("[LeadService] No se pudo persistir el contador de XML (localStorage no disponible):", e);
    }
    return newCount;
}

/** Lee el contador de XMLs procesados desde localStorage */
export function getXMLCount(): number {
    try {
        return parseInt(localStorage.getItem(XML_COUNT_KEY) ?? "0", 10);
    } catch {
        return 0;
    }
}

/** Indica si el usuario ya pasó el límite gratuito */
export function isXMLLimitReached(): boolean {
    return getXMLCount() >= XML_LIMIT;
}

/** Indica si el usuario ya completó el formulario de lead capture */
export function isLeadRegistered(): boolean {
    return localStorage.getItem(LEAD_REGISTERED_KEY) === "true";
}

/** Marca al usuario como registrado en localStorage */
export function markLeadRegistered(): void {
    localStorage.setItem(LEAD_REGISTERED_KEY, "true");
}
