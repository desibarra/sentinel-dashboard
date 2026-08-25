/**
 * useSessionCache
 * ---------------
 * Persiste los resultados del análisis de CFDI activo durante la sesión (TTL
 * 30 min), por empresa.
 *
 * P0-B: antes vivía en localStorage bajo una única clave global
 * "sentinel_session_cache", serializando el arreglo COMPLETO de resultados
 * — que sí incluye xmlContent, pese a que el comentario original decía lo
 * contrario — lo que excedía fácilmente la cuota de localStorage (~5-10 MB)
 * con lotes de miles de XML reales, provocando QuotaExceededError y, en el
 * peor caso, la pérdida silenciosa de la sesión (el código borraba la clave
 * antes de reintentar, y si el reintento también fallaba no quedaba nada).
 *
 * Ahora se persiste en IndexedDB (appDB.ts, store "sessionCache", una cuota
 * muchísimo mayor) y NUNCA se toca localStorage para el payload — cada
 * escritura es una transacción atómica de IndexedDB: si falla, la sesión
 * anterior válida permanece intacta (no hay borrado-antes-de-escribir).
 *
 * Privacidad: todo esto sigue siendo 100% local al navegador — ningún XML se
 * envía al servidor.
 */

import { toast } from "sonner";
import { ValidationResult } from "@/lib/cfdiEngine";
import { appDB, SessionCacheEntry } from "@/db/appDB";

const TTL_MS = 30 * 60 * 1000; // 30 minutos

// Migración: clave del antiguo caché en localStorage. Se limpia de forma
// segura la primera vez que se usa este módulo, sin tocar IndexedDB del
// 69-B (base de datos completamente distinta: "SentinelBlacklists").
const LEGACY_STORAGE_KEY = "sentinel_session_cache";
let legacyMigrationDone = false;
function migrateLegacyLocalStorageCacheOnce(): void {
    if (legacyMigrationDone) return;
    legacyMigrationDone = true;
    try {
        if (typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_STORAGE_KEY) !== null) {
            // El formato antiguo no es compatible (guardaba TODO en localStorage,
            // incluido el XML crudo); no se migra su contenido — se descarta de
            // forma segura. El usuario simplemente re-sube el lote si lo necesita.
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            console.info('[SessionCache] Caché antiguo de localStorage ("sentinel_session_cache") migrado/limpiado. La sesión activa ahora se persiste en IndexedDB.');
        }
    } catch {
        // localStorage bloqueado/no disponible — no es crítico, se ignora.
    }
}

export interface SessionCache {
    companyId: string;
    timestamp: number;
    results: ValidationResult[];
}

export type SessionCacheStatus = 'complete' | 'partial' | 'corrupt' | 'quota_exceeded' | 'unavailable';

/** Guarda resultados en IndexedDB (incluye xmlContent — necesario para reexportar tras restaurar). */
export async function saveSessionCache(companyId: string, results: ValidationResult[]): Promise<SessionCacheStatus> {
    migrateLegacyLocalStorageCacheOnce();
    const entry: SessionCacheEntry = {
        companyId,
        timestamp: Date.now(),
        results,
        status: 'complete',
    };
    try {
        await appDB.saveSessionCache(entry);
        return 'complete';
    } catch (e: any) {
        // P0-B (requisito 11): un fallo de persistencia se reporta de forma clara
        // y NUNCA se propaga hacia el resultado SAT/fiscal de ningún registro —
        // esta función es la única responsable de la caché de sesión y no toca
        // estatusSAT/resultado de ValidationResult en ningún punto.
        const isQuota = e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message || ''));
        if (isQuota) {
            console.warn('[SessionCache] Cuota de IndexedDB agotada — la sesión anterior (si existía) se conserva intacta.', e);
            toast.warning('No se pudo guardar el respaldo de esta sesión (almacenamiento local lleno). El análisis en pantalla sigue disponible; si recargas la página tendrás que re-subir los XML.', { duration: 8000 });
            return 'quota_exceeded';
        }
        console.warn('[SessionCache] No se pudo guardar la sesión en IndexedDB.', e);
        toast.warning('No se pudo guardar el respaldo de esta sesión. El análisis en pantalla sigue disponible.', { duration: 8000 });
        return 'unavailable';
    }
}

/**
 * Restaura resultados si:
 * - El TTL no ha expirado (< 30 min)
 * - El companyId coincide con la empresa solicitada (siempre cierto: se
 *   consulta por companyId directamente, cada empresa tiene su propia
 *   entrada — a diferencia del diseño anterior de clave única global).
 * Retorna null si no hay caché válido; también distingue una entrada
 * corrupta (forma inesperada) de una simplemente ausente o expirada.
 */
export async function loadSessionCache(companyId: string): Promise<SessionCache | null> {
    migrateLegacyLocalStorageCacheOnce();
    try {
        const entry = await appDB.getSessionCache(companyId);
        if (!entry) return null;

        if (!Array.isArray(entry.results) || typeof entry.timestamp !== 'number') {
            console.warn('[SessionCache] Entrada corrupta detectada para la empresa', companyId, '— se descarta.');
            await appDB.clearSessionCache(companyId).catch(() => {});
            return null;
        }

        if (Date.now() - entry.timestamp > TTL_MS) {
            await appDB.clearSessionCache(companyId).catch(() => {});
            return null;
        }

        if (entry.companyId !== companyId) return null;

        return { companyId: entry.companyId, timestamp: entry.timestamp, results: entry.results };
    } catch (e) {
        console.warn("[SessionCache] Error al leer caché de IndexedDB", e);
        return null;
    }
}

/** Elimina el caché de una empresa (cambio de empresa, nuevos XMLs, limpieza manual). */
export async function clearSessionCache(companyId: string): Promise<void> {
    try {
        await appDB.clearSessionCache(companyId);
    } catch (e) {
        console.warn('[SessionCache] Error al limpiar caché de IndexedDB', e);
    }
}

/** Devuelve cuántos minutos quedan de vida al caché de una empresa (o 0 si no hay/expiró). */
export async function getCacheAge(companyId: string): Promise<number> {
    try {
        const entry = await appDB.getSessionCache(companyId);
        if (!entry || typeof entry.timestamp !== 'number') return 0;
        const ageMs = Date.now() - entry.timestamp;
        return Math.round(ageMs / 60000);
    } catch {
        return 0;
    }
}
