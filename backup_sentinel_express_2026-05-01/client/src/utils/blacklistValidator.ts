export interface BlacklistValidation {
    rfc?: string;
    isEFOS: boolean;
    is69B: boolean;
    found: boolean;
    tipo?: 'EFOS' | '69B';
    fechaPublicacion?: string;
    razonSocial?: string;
    situacion?: string;
}

export async function checkRFCBlacklist(rfc: string): Promise<BlacklistValidation> {
    if (!rfc || rfc.length < 12) {
        return { isEFOS: false, is69B: false, found: false };
    }

    try {
        const response = await fetch(`/api/blacklist/check?rfc=${encodeURIComponent(rfc)}`);
        const data = await response.json();

        if (data.found) {
            return {
                rfc: data.rfc,
                isEFOS: data.isEFOS,
                is69B: data.is69B,
                found: true,
                tipo: data.tipo,
                situacion: data.situacion
            };
        }

        return { rfc, isEFOS: false, is69B: false, found: false };
    } catch (error) {
        console.error("Blacklist check error:", error);
        return { rfc, isEFOS: false, is69B: false, found: false };
    }
}

export function validateRFCFormat(rfc: string): { valid: boolean; error?: string } {
    // Regex básico SAT
    const rfcPattern = /^([A-ZÑ&]{3,4}) ?(?:- ?)?(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])) ?(?:- ?)?([A-Z\d]{2})([A\d])$/;

    if (!rfcPattern.test(rfc)) {
        return { valid: false, error: "Formato inválido" };
    }

    // TODO: Implementar validación dígito verificador estricta si es necesario
    return { valid: true };
}
