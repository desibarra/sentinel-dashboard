/**
 * useSessionCache
 * ---------------
 * Persiste los resultados del análisis de CFDI en localStorage durante la sesión activa.
 * Nunca almacena el XML original — solo los ValidationResult procesados.
 * TTL: 30 minutos desde el último análisis.
 */

import { ValidationResult } from "@/lib/cfdiEngine";

const STORAGE_KEY = "sentinel_session_cache";
const TTL_MS = 30 * 60 * 1000; // 30 minutos

export interface SessionCache {
    companyId: string;
    timestamp: number;
    results: ValidationResult[];
}

/** Guarda resultados en localStorage (sin los XML crudos). */
export function saveSessionCache(companyId: string, results: ValidationResult[]): void {
    try {
        const payload: SessionCache = {
            companyId,
            timestamp: Date.now(),
            results,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // Si localStorage está lleno, no interrumpir el flujo
        console.warn("SessionCache: no se pudo guardar (localStorage lleno o bloqueado)", e);
    }
}

/**
 * Restaura resultados si:
 * - El TTL no ha expirado (< 30 min)
 * - El companyId coincide con la empresa activa
 * Retorna null si no hay caché válido.
 */
export function loadSessionCache(companyId: string): SessionCache | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const cache: SessionCache = JSON.parse(raw);

        // Validar TTL
        if (Date.now() - cache.timestamp > TTL_MS) {
            clearSessionCache();
            return null;
        }

        // Validar empresa
        if (cache.companyId !== companyId) {
            return null;
        }

        return cache;
    } catch (e) {
        console.warn("SessionCache: error al leer caché", e);
        return null;
    }
}

/** Elimina el caché (cambio de empresa, nuevos XMLs, limpieza manual). */
export function clearSessionCache(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
        // silencioso
    }
}

/** Devuelve cuántos minutos quedan de vida al caché actual (o 0 si expiró). */
export function getCacheAge(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return 0;
        const cache: SessionCache = JSON.parse(raw);
        const ageMs = Date.now() - cache.timestamp;
        return Math.round(ageMs / 60000);
    } catch {
        return 0;
    }
}
