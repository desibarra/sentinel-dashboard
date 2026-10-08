import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const databasePath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(repositoryRoot, "data", "sentinel.db");

function readHidden(prompt: string): Promise<string> {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
        return Promise.reject(new Error("Ejecuta este script desde una terminal interactiva."));
    }

    return new Promise((resolve, reject) => {
        let value = "";
        process.stdout.write(prompt);
        input.setEncoding("utf8");
        input.setRawMode(true);
        input.resume();

        const cleanup = () => {
            input.off("data", onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write("\n");
        };

        const onData = (chunk: string) => {
            for (const character of chunk) {
                if (character === "\u0003" || character === "\u0004") {
                    cleanup();
                    reject(new Error("Operación cancelada."));
                    return;
                }
                if (character === "\r" || character === "\n") {
                    cleanup();
                    resolve(value);
                    return;
                }
                if (character === "\u007f" || character === "\b") {
                    value = Array.from(value).slice(0, -1).join("");
                } else if (character >= " ") {
                    value += character;
                }
            }
        };

        input.on("data", onData);
    });
}

async function createBackup(db: Awaited<ReturnType<typeof open>>, backupPath: string): Promise<void> {
    const previousUmask = process.umask(0o077);
    try {
        await db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    } finally {
        process.umask(previousUmask);
    }
}

async function main(): Promise<void> {
    if (!fs.existsSync(databasePath)) {
        throw new Error(`No existe la base de datos: ${databasePath}`);
    }

    const password = await readHidden("Nueva contraseña para admin (mínimo 12 caracteres): ");
    if (password.length < 12) {
        throw new Error("La contraseña debe tener al menos 12 caracteres.");
    }

    const confirmation = await readHidden("Confirma la nueva contraseña: ");
    if (password !== confirmation) {
        throw new Error("Las contraseñas no coinciden.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${databasePath}.backup-${timestamp}`;
    const db = await open({ filename: databasePath, driver: sqlite3.Database });

    try {
        await createBackup(db, backupPath);
        console.log(`Backup creado: ${backupPath}`);

        await db.exec("BEGIN IMMEDIATE");
        try {
            const result = await db.run(
                "UPDATE users SET password_hash = ? WHERE username = ?",
                passwordHash,
                "admin"
            );
            if (result.changes !== 1) {
                throw new Error(`Se esperaba actualizar exactamente 1 usuario admin; filas actualizadas: ${result.changes}.`);
            }
            await db.exec("COMMIT");
        } catch (error) {
            await db.exec("ROLLBACK");
            throw error;
        }

        console.log("Contraseña de admin restablecida. No se modificaron otras filas ni tablas.");
    } finally {
        await db.close();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Error al restablecer la contraseña.");
    process.exitCode = 1;
});
