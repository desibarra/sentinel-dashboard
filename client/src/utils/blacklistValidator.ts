import { getBlacklistsByRFC, getMetadata } from "@/db/blacklistDB";

export interface BlacklistValidation {
    rfc?: string;
    isEFOS: boolean;
    is69B: boolean;
    found: boolean;
    notSynced?: boolean; // true cuando la base local no está cargada
    tipo?: 'EFOS' | '69B';
    fechaPublicacion?: string;
    razonSocial?: string;
    situacion?: string;
    multiEstado?: boolean; // true cuando el RFC tiene más de una situación sin poder determinar la vigente
    source?: string;
}

/**
 * Verifica si la base local de listas negras está cargada en IndexedDB.
 * Devuelve true si hay registros disponibles.
 */
export async function isBlacklistSynced(): Promise<boolean> {
    try {
        const meta = await getMetadata();
        if (!meta) return false;
        const total = (meta.efosCount || 0) + (meta.list69BCount || 0);
        return total > 0;
    } catch {
        return false;
    }
}

/**
 * Consulta el RFC en la base de datos local (IndexedDB).
 * Si la base no está cargada, retorna notSynced=true en lugar de found=false
 * para distinguir "sin coincidencia" de "sin datos disponibles".
 * Si el RFC tiene varias situaciones registradas sin poder determinar la vigente,
 * retorna situacion="Situación múltiple; requiere revisión" y multiEstado=true.
 */
export async function checkRFCBlacklist(rfc: string): Promise<BlacklistValidation> {
    if (!rfc || rfc.length < 12) {
        return { isEFOS: false, is69B: false, found: false };
    }

    const rfcNorm = rfc.trim().toUpperCase();

    try {
        // Verificar primero si la base local tiene datos
        const synced = await isBlacklistSynced();
        if (!synced) {
            return {
                rfc: rfcNorm,
                isEFOS: false,
                is69B: false,
                found: false,
                notSynced: true,
            };
        }

        // Consultar IndexedDB local (puede haber varios registros por RFC — historial completo)
        const records = await getBlacklistsByRFC(rfcNorm);

        if (!records || records.length === 0) {
            return { rfc: rfcNorm, isEFOS: false, is69B: false, found: false, notSynced: false };
        }

        const is69B = records.some((r) => r.tipo === '69B');
        const isEFOS = records.some((r) => r.tipo === 'EFOS');
        const tipo: 'EFOS' | '69B' = is69B ? '69B' : 'EFOS';

        // Situaciones distintas (ignorando vacíos)
        const situaciones = Array.from(new Set(
            records
                .map((r) => (r.situacion || '').trim().toLowerCase())
                .filter((s) => s.length > 0)
        ));

        if (situaciones.length > 1) {
            // ── Multi-estado: resolver por fecha de publicación oficial ──
            // Se conserva el historial completo en la base, pero la situación vigente
            // se determina comparando las fechas oficiales de cada resolución.
            const withDates = records
                .filter((r) => r.fechaPublicacion && r.situacion)
                .map((r) => ({ situacion: r.situacion!, fecha: r.fechaPublicacion!, razon: r.razonSocial }));

            if (withDates.length === 0) {
                // Ninguna fecha disponible → no se puede determinar
                const primerRazon = records.find((r) => r.razonSocial)?.razonSocial;
                return {
                    rfc: rfcNorm,
                    isEFOS,
                    is69B,
                    found: true,
                    notSynced: false,
                    multiEstado: true,
                    tipo,
                    situacion: "Situación múltiple; requiere revisión",
                    razonSocial: primerRazon,
                    source: 'IndexedDB local — Fecha oficial no verificada',
                };
            }

            // Encontrar la fecha máxima
            const maxFecha = withDates.reduce((max, r) => r.fecha > max ? r.fecha : max, withDates[0].fecha);

            // Registros en la fecha máxima
            const latest = withDates.filter((r) => r.fecha === maxFecha);
            const latestSituaciones = Array.from(new Set(latest.map((r) => r.situacion.toLowerCase())));

            if (latestSituaciones.length > 1) {
                // Empate en la fecha máxima con situaciones distintas → ambiguo
                const primerRazon = records.find((r) => r.razonSocial)?.razonSocial;
                return {
                    rfc: rfcNorm,
                    isEFOS,
                    is69B,
                    found: true,
                    notSynced: false,
                    multiEstado: true,
                    tipo,
                    situacion: "Situación múltiple; requiere revisión",
                    razonSocial: primerRazon,
                    source: 'IndexedDB local — Fecha oficial no verificada',
                };
            }

            // Resolución vigente determinada: usar la situación con la fecha más reciente
            const vigente = latest[0];
            return {
                rfc: rfcNorm,
                isEFOS,
                is69B,
                found: true,
                notSynced: false,
                multiEstado: false,
                tipo,
                situacion: vigente.situacion,
                razonSocial: vigente.razon,
                fechaPublicacion: vigente.fecha,
                source: 'IndexedDB local — Fecha oficial no verificada',
            };
        }

        // Situación única (o todas iguales)
        const first = records[0];

        return {
            rfc: first.rfc,
            isEFOS,
            is69B,
            found: true,
            notSynced: false,
            tipo,
            situacion: first.situacion,
            razonSocial: first.razonSocial,
            fechaPublicacion: first.fechaPublicacion,
            source: 'IndexedDB local — Fecha oficial no verificada',
        };
    } catch (error) {
        console.error('[BlacklistValidator] Error consultando IndexedDB:', error);
        // Ante error, no afirmar "sin coincidencia" — marcar como no consultado
        return { rfc: rfcNorm, isEFOS: false, is69B: false, found: false, notSynced: true };
    }
}

export function validateRFCFormat(rfc: string): { valid: boolean; error?: string } {
    const rfcPattern = /^([A-ZÑ&]{3,4}) ?(?:- ?)?(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])) ?(?:- ?)?([A-Z\d]{2})([A\d])$/;

    if (!rfcPattern.test(rfc)) {
        return { valid: false, error: "Formato inválido" };
    }

    return { valid: true };
}