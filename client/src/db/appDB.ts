import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Company {
    id: string;
    name: string;
    rfc: string;
    giro?: string;
    createdAt: number;
}

export interface ValidationHistory {
    id: string;
    companyId: string;
    timestamp: number;
    fileName: string;
    xmlCount: number;
    usableCount: number;
    alertCount: number;
    errorCount: number;
    totalAmount: number;
    results: any[];
    globalNotes?: string;
}

// P0-B: caché de sesión activa (antes vivía en localStorage bajo la clave
// "sentinel_session_cache" — ver useSessionCache.ts). IndexedDB tiene una
// cuota muchísimo mayor (cientos de MB a GB, según navegador) que
// localStorage (~5-10 MB por origen), por lo que sí puede retener el
// resultado completo — incluido el XML crudo necesario para reexportar tras
// restaurar una sesión — sin arriesgar QuotaExceededError con lotes de miles
// de CFDI reales.
export interface SessionCacheEntry {
    companyId: string;
    timestamp: number;
    results: any[]; // ValidationResult[] completo, incluido xmlContent
    status: 'complete' | 'partial';
}

interface SentinelSchema extends DBSchema {
    companies: {
        key: string;
        value: Company;
    };
    history: {
        key: string;
        value: ValidationHistory;
        indexes: { 'by-company': string };
    };
    sessionCache: {
        key: string; // companyId
        value: SessionCacheEntry;
    };
}

let dbPromise: Promise<IDBPDatabase<SentinelSchema>> | null = null;

function getIDB() {
    if (!dbPromise) {
        dbPromise = openDB<SentinelSchema>('SentinelAppLocalDB', 2, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore('companies', { keyPath: 'id' });
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('by-company', 'companyId');
                }
                if (oldVersion < 2 && !db.objectStoreNames.contains('sessionCache')) {
                    db.createObjectStore('sessionCache', { keyPath: 'companyId' });
                }
            },
        });
    }
    return dbPromise;
}

export const appDB = {
    // Companies
    async getCompanies(): Promise<Company[]> {
        const db = await getIDB();
        return db.getAll('companies');
    },
    async addCompany(company: Company) {
        const db = await getIDB();
        await db.put('companies', company);
    },
    async deleteCompany(id: string) {
        const db = await getIDB();
        await db.delete('companies', id);
        // Also clear history for this company
        const history = await this.getHistoryByCompany(id);
        for (const entry of history) {
            await this.deleteHistory(entry.id);
        }
    },

    // History
    async saveHistory(entry: ValidationHistory) {
        const db = await getIDB();
        await db.put('history', entry);
    },
    async getHistoryByCompany(companyId: string): Promise<ValidationHistory[]> {
        const db = await getIDB();
        return db.getAllFromIndex('history', 'by-company', companyId);
    },
    async deleteHistory(id: string) {
        const db = await getIDB();
        await db.delete('history', id);
    },
    async clearHistory(companyId: string) {
        const db = await getIDB();
        const entries = await this.getHistoryByCompany(companyId);
        const tx = db.transaction('history', 'readwrite');
        for (const entry of entries) {
            await tx.store.delete(entry.id);
        }
        await tx.done;
    },

    // P0-B: Session cache (reemplaza el antiguo localStorage["sentinel_session_cache"]).
    // db.put() es una transacción atómica: si falla (p.ej. cuota agotada), la
    // transacción se revierte por completo — el registro anterior, si existía,
    // permanece intacto. Nunca se hace un delete-antes-de-put en dos pasos.
    async saveSessionCache(entry: SessionCacheEntry): Promise<void> {
        const db = await getIDB();
        await db.put('sessionCache', entry);
    },
    async getSessionCache(companyId: string): Promise<SessionCacheEntry | undefined> {
        const db = await getIDB();
        return db.get('sessionCache', companyId);
    },
    async clearSessionCache(companyId: string): Promise<void> {
        const db = await getIDB();
        await db.delete('sessionCache', companyId);
    },
};
