import { getStore } from "@netlify/blobs";
import { getDB } from "../server/db.js";
import type { TokenStoreName } from "../server/tokenStore.js";

interface ImportRecord {
    storeName: TokenStoreName;
    tokenKey: string;
    data: Record<string, unknown>;
}

function requiredEnvironment(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Falta la variable de entorno ${name}; no se importó ningún registro.`);
    }
    return value;
}

async function readNetlifyBlobs(): Promise<ImportRecord[]> {
    const store = getStore({
        name: "sentinel-tokens",
        consistency: "strong",
        siteID: requiredEnvironment("NETLIFY_SITE_ID"),
        token: requiredEnvironment("NETLIFY_API_TOKEN")
    });
    const records: ImportRecord[] = [];

    for await (const page of store.list({ paginate: true })) {
        for (const blob of page.blobs) {
            const value: unknown = await store.get(blob.key, { type: "json" });
            if (typeof value !== "object" || value === null || Array.isArray(value)) {
                throw new Error(`El registro ${blob.key} de Netlify Blobs no contiene un objeto JSON.`);
            }
            records.push({ storeName: "sentinel-tokens", tokenKey: blob.key, data: value as Record<string, unknown> });
        }
    }
    return records;
}

async function readJsonBin(): Promise<ImportRecord[]> {
    const binId = requiredEnvironment("JSONBIN_BIN_ID");
    const masterKey = requiredEnvironment("JSONBIN_MASTER_KEY");
    const response = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`, {
        headers: { "X-Master-Key": masterKey, "X-Bin-Meta": "false" }
    });
    if (!response.ok) {
        throw new Error(`JSONBin respondió HTTP ${response.status}; no se importó ningún registro.`);
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
        throw new Error("JSONBin devolvió un formato inesperado.");
    }
    const envelope = payload as { tokens?: unknown; record?: { tokens?: unknown } };
    const tokens = envelope.tokens ?? envelope.record?.tokens;
    if (!Array.isArray(tokens)) {
        throw new Error("No se encontró el arreglo tokens en el bin de JSONBin.");
    }

    return tokens.map((token: unknown, index: number) => {
        if (typeof token !== "object" || token === null || Array.isArray(token)) {
            throw new Error(`El token JSONBin en la posición ${index} no es un objeto.`);
        }
        const data = token as Record<string, unknown>;
        if (typeof data.id !== "string" || !data.id) {
            throw new Error(`El token JSONBin en la posición ${index} no tiene id.`);
        }
        return { storeName: "jsonbin-tokens", tokenKey: data.id, data };
    });
}

async function main(): Promise<void> {
    const records = [...await readNetlifyBlobs(), ...await readJsonBin()];
    const db = await getDB();
    let imported = 0;
    let alreadyPresent = 0;

    await db.exec("BEGIN IMMEDIATE");
    try {
        for (const record of records) {
            const result = await db.run(
                "INSERT OR IGNORE INTO application_tokens (store_name, token_key, data) VALUES (?, ?, ?)",
                record.storeName,
                record.tokenKey,
                JSON.stringify(record.data)
            );
            if (result.changes === 1) imported += 1;
            else alreadyPresent += 1;
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    } finally {
        await db.close();
    }

    console.log(`Importación terminada: ${imported} registros nuevos; ${alreadyPresent} ya existían y no se sobrescribieron.`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : "Falló la importación de tokens.");
    process.exitCode = 1;
});
