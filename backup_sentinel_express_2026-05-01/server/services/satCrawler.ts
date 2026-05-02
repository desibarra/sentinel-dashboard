import { getDB } from "../db.js";
import crypto from "crypto";

const SAT_URLS = {
    'EFOS': 'http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv',
    '69B': 'http://omawww.sat.gob.mx/cifras_sat/Documents/Cancelados.csv'
};

export async function processSATList(tipo: 'EFOS' | '69B', force: boolean = false) {
    try {
        console.log(`[SAT Crawler] Iniciando sincronización para ${tipo} desde ${SAT_URLS[tipo]}`);

        // Simulating the fetch because literal direct fetch from SAT usually requires CAPTCHA or specific headers
        // Also the URLs might be down or block basic fetch. We do a standard fetch.
        const response = await fetch(SAT_URLS[tipo], {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/csv,application/vnd.ms-excel'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} en ${SAT_URLS[tipo]}`);
        }

        const buffer = await response.arrayBuffer();
        const text = new TextDecoder('latin1').decode(buffer); // SAT usually uses Latin1 or UTF-8 with BOM

        // Generate hash to check if content changed
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        const db = await getDB();

        const currentMeta = await db.get("SELECT hash FROM blacklist_metadata WHERE tipo = ?", [tipo]);

        if (!force && currentMeta && currentMeta.hash === hash) {
            console.log(`[SAT Crawler] El archivo ${tipo} no ha cambiado. Hash coincide.`);
            return { success: true, updated: false, message: "Sin cambios detectados" };
        }

        // Parse CSV. We'll use a very fast regex-based RFC extraction like the client did
        const rfcRegex = /[A-Z&Ñ]{3,4}[0-9]{6}[A-V1-9][A-Z1-9][0-9A]/gi;
        const rfcsSet = new Set<string>();

        let match;
        while ((match = rfcRegex.exec(text)) !== null) {
            rfcsSet.add(match[0].toUpperCase());
        }

        const count = rfcsSet.size;
        console.log(`[SAT Crawler] ${tipo}: Detectados ${count} RFCs únicos. Procesando en la base de datos...`);

        if (count === 0) {
            throw new Error("No se extrajo ningún RFC. Formato de archivo modificado por el SAT.");
        }

        // Atomic update in SQLite
        await db.run("BEGIN TRANSACTION");
        try {
            await db.run("DELETE FROM blacklist_data WHERE tipo = ?", [tipo]);

            const stmt = await db.prepare("INSERT INTO blacklist_data (rfc, tipo, added_at) VALUES (?, ?, ?)");
            const now = Date.now();

            for (const rfc of Array.from(rfcsSet)) {
                await stmt.run(rfc, tipo, now);
            }
            await stmt.finalize();

            await db.run(
                "INSERT INTO blacklist_metadata (tipo, last_sync, hash, count) VALUES (?, ?, ?, ?) ON CONFLICT(tipo) DO UPDATE SET last_sync=excluded.last_sync, hash=excluded.hash, count=excluded.count",
                [tipo, now, hash, count]
            );

            await db.run("COMMIT");
            console.log(`[SAT Crawler] Sincronización ${tipo} completa y guardada en BD Central.`);
            return { success: true, updated: true, count };
        } catch (dbError) {
            await db.run("ROLLBACK");
            throw dbError;
        }

    } catch (error) {
        console.error(`[SAT Crawler Error - ${tipo}]:`, error);
        return { success: false, error: (error as Error).message };
    }
}

// Scheduled job
export function startSATCrawlerCron() {
    // Run once on startup
    setTimeout(() => {
        processSATList('EFOS').catch(console.error);
        processSATList('69B').catch(console.error);
    }, 10000); // 10 seconds after startup

    // Run every 24 hours
    setInterval(() => {
        processSATList('EFOS').catch(console.error);
        processSATList('69B').catch(console.error);
    }, 24 * 60 * 60 * 1000); // 24 hours
}
