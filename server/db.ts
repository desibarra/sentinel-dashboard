import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.resolve(__dirname, "..", "data", "sentinel.db");

let dbInstance: Database | null = null;

export async function getDB() {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await dbInstance.exec(`PRAGMA foreign_keys = ON;`);
    await dbInstance.exec(`PRAGMA journal_mode = WAL;`);

    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rfc TEXT NOT NULL,
        giro TEXT,
        created_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        timestamp INTEGER,
        file_name TEXT,
        xml_count INTEGER,
        usable_count INTEGER,
        alert_count INTEGER,
        error_count INTEGER,
        total_amount REAL,
        results TEXT,
        global_notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS application_tokens (
        store_name TEXT NOT NULL,
        token_key TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (store_name, token_key)
      );
    `);

    // Se ha eliminado la creación del usuario por defecto 'admin123' por razones de seguridad.
  }
  return dbInstance;
}
