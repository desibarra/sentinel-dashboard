/**
 * leadService.ts
 * Servicio para guardar prospectos (leads) en JSONBin.io
 * Cada lead se guarda en su propio bin para máxima simplicidad.
 * El dueño puede ver todos los leads desde su cuenta de JSONBin.
 */

const MASTER_KEY = import.meta.env.VITE_JSONBIN_MASTER_KEY as string;

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

/**
 * Guarda un lead enviando un POST a JSONBin.
 * Crea un nuevo bin por cada lead (simple y sin colisiones).
 */
export async function saveLeadToJSONBin(lead: Lead): Promise<{ ok: boolean; error?: string }> {
    if (!MASTER_KEY) {
        // Sin clave configurada → guardamos solo en local y continuamos
        console.warn("[LeadService] VITE_JSONBIN_MASTER_KEY no configurado. Lead solo en localStorage.");
        return { ok: true };
    }

    try {
        const response = await fetch("https://api.jsonbin.io/v3/b", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": MASTER_KEY,
                "X-Bin-Name": `SE-Lead-${lead.email}-${Date.now()}`,
                "X-Bin-Private": "true",
            },
            body: JSON.stringify(lead),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("[LeadService] JSONBin error:", response.status, text);
            return { ok: false, error: `Error ${response.status}: ${text}` };
        }

        return { ok: true };
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
