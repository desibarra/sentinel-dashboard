import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the DB is saved in a writable path in production, like a data directory
const dataDir = process.env.NODE_ENV === "production" ? path.resolve(__dirname, "..", "data") : path.resolve(__dirname, "..", "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "sentinel.db");

let dbInstance: Database | null = null;

export async function getDB() {
  if (!dbInstance) {
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

      CREATE TABLE IF NOT EXISTS blacklist_data (
        rfc TEXT NOT NULL,
        tipo TEXT NOT NULL,
        status TEXT,
        added_at INTEGER,
        PRIMARY KEY (rfc, tipo)
      );

      CREATE TABLE IF NOT EXISTS blacklist_metadata (
        tipo TEXT PRIMARY KEY,
        last_sync INTEGER,
        hash TEXT,
        count INTEGER DEFAULT 0
      );
    `);

    // Se ha eliminado la creación del usuario por defecto 'admin123' por razones de seguridad.
  }
  return dbInstance;
}
