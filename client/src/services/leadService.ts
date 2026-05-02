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
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(lead),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("[LeadService] Backend error:", response.status, text);
            return { ok: false, error: `Error ${response.status}: ${text}` };
        }

        const data = await response.json();
        return { ok: true, token: data.token, events: data.events };
    } catch (err: any) {
        console.error("[LeadService] Network error:", err);
        return { ok: false, error: err?.message ?? "Error de red" };
    }
}

/** Incrementa el contador de XMLs procesados en localStorage y devuelve el nuevo total */
export function incrementXMLCount(count: number): number {
    const current = getXMLCount();
    const newCount = current + count;
    localStorage.setItem(XML_COUNT_KEY, String(newCount));
    return newCount;
}

/** Lee el contador de XMLs procesados desde localStorage */
export function getXMLCount(): number {
    return parseInt(localStorage.getItem(XML_COUNT_KEY) ?? "0", 10);
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
