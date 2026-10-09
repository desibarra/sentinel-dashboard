import { replaceBlacklistRecordsBulk, getMetadata, updateMetadata, type BlacklistRecord } from "@/db/blacklistDB";

export type Listado69BPayload = { fechaOficial: string | null; registros: any[] };
export type Listado69BServidor = { fechaOficial: string | null; verificadoEl: string | null; origen?: string; ultimoError?: string | null };
export type CargaListado69B = {
    registros: number; rfcUnicos: number; omitidos: number; fechaOficial: string | null;
    presuntos: number; definitivos: number; desvirtuados: number; sentenciaFavorable: number;
};

const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Descarga el listado: primero el que mantiene el servidor (actualizado del SAT), si no, el incluido en la app. */
export async function descargarListado69B(): Promise<Listado69BPayload & { fuente: string }> {
    for (const url of ["/api/blacklist/69b", "/69b.json"]) {
        try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) continue;
            const parsed = await res.json();
            if (Array.isArray(parsed)) return { fechaOficial: null, registros: parsed, fuente: url };
            if (parsed && Array.isArray(parsed.registros)) {
                return { fechaOficial: typeof parsed.fechaOficial === "string" && parsed.fechaOficial ? parsed.fechaOficial : null, registros: parsed.registros, fuente: url };
            }
        } catch { /* se intenta la siguiente fuente */ }
    }
    throw new Error("No se pudo obtener el listado 69-B (servidor ni archivo incluido).");
}

/** Normaliza y reemplaza atómicamente el listado en IndexedDB; conserva varias situaciones por RFC. */
export async function cargarListado69B(payload: Listado69BPayload, verificadoEl: string | null = null): Promise<CargaListado69B> {
    const seenPair = new Set<string>();
    const rfcSet = new Set<string>();
    const records: BlacklistRecord[] = [];
    const porSituacion = { presunto: new Set<string>(), definitivo: new Set<string>(), desvirtuado: new Set<string>(), sentencia: new Set<string>() };
    let omitidos = 0;
    for (const row of payload.registros) {
        if (!row || typeof row.rfc !== "string") { omitidos++; continue; }
        const rfc = row.rfc.trim().toUpperCase();
        if (!RFC_PATTERN.test(rfc)) { omitidos++; continue; }
        const situacion = String(row.situacion || "").trim();
        const pairKey = `${rfc}::${situacion.toUpperCase()}`;
        if (seenPair.has(pairKey)) { omitidos++; continue; }
        seenPair.add(pairKey);
        rfcSet.add(rfc);
        const sit = situacion.toLowerCase();
        const bucket = (Object.keys(porSituacion) as (keyof typeof porSituacion)[]).find(k => sit.includes(k));
        if (bucket) porSituacion[bucket].add(rfc);
        records.push({
            rfc,
            tipo: row.tipo === "EFOS" ? "EFOS" : "69B",
            razonSocial: row.razonSocial || undefined,
            situacion: situacion || undefined,
            fechaPublicacion: row.fechaPublicacion || undefined,
        });
    }
    if (!records.length) throw new Error("Ningún registro del listado 69-B pasó la validación de formato.");
    await replaceBlacklistRecordsBulk(records);
    const stats = {
        presuntos: porSituacion.presunto.size, definitivos: porSituacion.definitivo.size,
        desvirtuados: porSituacion.desvirtuado.size, sentenciaFavorable: porSituacion.sentencia.size,
    };
    await updateMetadata({
        key: "lastUpdate", cargadoEl: new Date().toISOString(), fechaOficial: payload.fechaOficial, verificadoEl,
        efosCount: 0, list69BCount: records.length, totalRFC: rfcSet.size, ...stats,
    });
    return { registros: records.length, rfcUnicos: rfcSet.size, omitidos, fechaOficial: payload.fechaOficial, ...stats };
}

/**
 * Mantiene el listado de este dispositivo al día con el que verifica el servidor.
 * Recarga si el corte oficial cambió (o no hay lista); si solo cambió la fecha de
 * verificación, actualiza ese dato. Devuelve true si cambió algo que afecta el cruce.
 */
export async function sincronizarListado69B(): Promise<{ cambio: boolean; servidor: Listado69BServidor | null }> {
    let servidor: Listado69BServidor | null = null;
    try {
        const res = await fetch("/api/blacklist/69b/meta", { cache: "no-store" });
        if (res.ok && (res.headers.get("content-type") || "").includes("json")) servidor = await res.json();
    } catch { /* sin servidor: se usa la lista local o la incluida */ }
    const local = await getMetadata().catch(() => null);
    const sinLista = !local || !(local.list69BCount || local.efosCount);
    const corteNuevo = Boolean(servidor?.fechaOficial && (!local?.fechaOficial || servidor.fechaOficial > local.fechaOficial));
    if (sinLista || corteNuevo) {
        const payload = await descargarListado69B();
        await cargarListado69B(payload, payload.fuente.startsWith("/api/") ? servidor?.verificadoEl ?? null : null);
        return { cambio: true, servidor };
    }
    if (local && servidor?.verificadoEl && servidor.fechaOficial === local.fechaOficial && servidor.verificadoEl !== local.verificadoEl) {
        await updateMetadata({ ...local, verificadoEl: servidor.verificadoEl });
        return { cambio: true, servidor };
    }
    return { cambio: false, servidor };
}
