import { getDB } from "./db.js";

export type TokenStoreName = "sentinel-tokens" | "jsonbin-tokens";

let writeQueue = Promise.resolve();

export async function getStoredToken(storeName: TokenStoreName, tokenKey: string): Promise<Record<string, any> | null> {
    const db = await getDB();
    const row = await db.get<{ data: string }>(
        "SELECT data FROM application_tokens WHERE store_name = ? AND token_key = ?",
        storeName,
        tokenKey
    );
    return row ? JSON.parse(row.data) as Record<string, any> : null;
}

export async function listStoredTokens(storeName: TokenStoreName): Promise<Record<string, any>[]> {
    const db = await getDB();
    const rows = await db.all<{ data: string }[]>(
        "SELECT data FROM application_tokens WHERE store_name = ? ORDER BY rowid",
        storeName
    );
    return rows.map(row => JSON.parse(row.data) as Record<string, any>);
}

export async function saveStoredToken(storeName: TokenStoreName, tokenKey: string, data: Record<string, any>): Promise<void> {
    const db = await getDB();
    await db.run(
        `INSERT INTO application_tokens (store_name, token_key, data) VALUES (?, ?, ?)
         ON CONFLICT(store_name, token_key) DO UPDATE SET data = excluded.data`,
        storeName,
        tokenKey,
        JSON.stringify(data)
    );
}

export async function insertStoredToken(storeName: TokenStoreName, tokenKey: string, data: Record<string, any>): Promise<boolean> {
    const db = await getDB();
    const result = await db.run(
        "INSERT OR IGNORE INTO application_tokens (store_name, token_key, data) VALUES (?, ?, ?)",
        storeName,
        tokenKey,
        JSON.stringify(data)
    );
    return result.changes === 1;
}

export async function deleteStoredToken(storeName: TokenStoreName, tokenKey: string): Promise<boolean> {
    const db = await getDB();
    const result = await db.run(
        "DELETE FROM application_tokens WHERE store_name = ? AND token_key = ?",
        storeName,
        tokenKey
    );
    return result.changes === 1;
}

export async function updateStoredToken(
    storeName: TokenStoreName,
    tokenKey: string,
    update: (token: Record<string, any>) => Record<string, any> | null
): Promise<Record<string, any> | null> {
    let resolveResult!: (value: Record<string, any> | null) => void;
    let rejectResult!: (reason: unknown) => void;
    const result = new Promise<Record<string, any> | null>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });

    writeQueue = writeQueue.then(async () => {
        const db = await getDB();
        await db.exec("BEGIN IMMEDIATE");
        try {
            const current = await getStoredToken(storeName, tokenKey);
            if (!current) {
                await db.exec("COMMIT");
                resolveResult(null);
                return;
            }

            const updated = update(current);
            if (updated) {
                await db.run(
                    "UPDATE application_tokens SET data = ? WHERE store_name = ? AND token_key = ?",
                    JSON.stringify(updated),
                    storeName,
                    tokenKey
                );
            } else {
                await db.run(
                    "DELETE FROM application_tokens WHERE store_name = ? AND token_key = ?",
                    storeName,
                    tokenKey
                );
            }
            await db.exec("COMMIT");
            resolveResult(updated);
        } catch (error) {
            await db.exec("ROLLBACK");
            rejectResult(error);
        }
    }).catch(error => {
        rejectResult(error);
    });

    return result;
}
