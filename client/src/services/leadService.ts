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

const encode = (data: Record<string, string>) => {
    return Object.keys(data)
        .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
        .join("&");
};

function generateToken() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function saveLeadToServer(lead: Lead): Promise<{ ok: boolean; token?: string; events?: string[]; error?: string }> {
    try {
        const tokenGenerado = generateToken();
        const formData = {
            "form-name": "sentinel-leads",
            "nombre": lead.nombre,
            "empresa": lead.empresa,
            "correo": lead.email,
            "telefono": lead.telefono,
            "cfdi": lead.cfdi_mensuales || "",
            "token": tokenGenerado,
            "origen": lead.origen,
            "fecha": lead.fecha_registro
        };

        let netlifySuccess = false;
        try {
            const resNetlify = await fetch("/", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: encode(formData)
            });
            if (resNetlify.ok) {
                netlifySuccess = true;
                console.log("[LeadService] Éxito guardando en Netlify Forms.");
            } else {
                console.warn(`[LeadService] Fallo en Netlify Forms: ${resNetlify.status}`);
            }
        } catch (e: any) {
            console.warn(`[LeadService] Error de red en Netlify Forms: ${e.message}`);
        }

        // Intento secundario a JSONBin
        let jsonbinData: any = null;
        try {
            const response = await fetch("/api/functions/lead-capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...lead, token: tokenGenerado }),
            });

            if (response.ok) {
                jsonbinData = await response.json();
                console.log("[LeadService] Respuesta de JSONBin procesada.");
            } else {
                console.warn(`[LeadService] Fallo en JSONBin: ${response.status}`);
            }
        } catch (err: any) {
            console.warn(`[LeadService] Error de red en JSONBin: ${err.message}`);
        }

        // Determinar qué token devolver
        const tokenFinal = jsonbinData?.token || tokenGenerado;
        const eventsFinal = jsonbinData?.events || (netlifySuccess ? ["lead_registered", "token_generated"] : ["lead_registration_failed", "token_fallback"]);

        // La prioridad es no bloquear el acceso
        return { ok: true, token: tokenFinal, events: eventsFinal };
    } catch (err: any) {
        console.error("[LeadService] Error fatal en flujo de registro:", err);
        const fallbackToken = generateToken();
        return { ok: true, token: fallbackToken, events: ["fallback_token_generated"] };
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
