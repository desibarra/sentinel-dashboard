import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDB } from "../server/db.js";

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

async function main(): Promise<void> {
    const password = await readHidden("Contraseña nueva para admin (mínimo 12 caracteres): ");
    if (password.length < 12) {
        throw new Error("La contraseña debe tener al menos 12 caracteres.");
    }

    const confirmation = await readHidden("Confirma la contraseña: ");
    if (password !== confirmation) {
        throw new Error("Las contraseñas no coinciden.");
    }

    const db = await getDB();
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        await db.exec("BEGIN IMMEDIATE");
        try {
            const existing = await db.get<{ id: string }>(
                "SELECT id FROM users WHERE username = ?",
                "admin"
            );
            if (existing) {
                throw new Error("El usuario admin ya existe; no se realizaron cambios.");
            }

            await db.run(
                "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                nanoid(),
                "admin",
                passwordHash,
                "admin",
                Date.now()
            );
            await db.exec("COMMIT");
        } catch (error) {
            await db.exec("ROLLBACK");
            throw error;
        }
    } finally {
        await db.close();
    }

    console.log("Usuario admin creado.");
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "No se pudo crear el usuario admin.");
    process.exitCode = 1;
});
