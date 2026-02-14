import { openDB, IDBPDatabase, DBSchema } from 'idb';

export interface Company {
    id: string;
    name: string;
    rfc: string;
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
    results: any[]; // Store subset of results for recalculation if needed
    globalNotes?: string;
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
}

const DB_NAME = 'SentinelAppDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SentinelSchema>> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB<SentinelSchema>(DB_NAME, DB_VERSION, {
            upgrade(db: IDBPDatabase<SentinelSchema>) {
                db.createObjectStore('companies', { keyPath: 'id' });
                const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                historyStore.createIndex('by-company', 'companyId');
            },
        });
    }
    return dbPromise;
}

export const appDB = {
    // Companies
    async getCompanies(): Promise<Company[]> {
        const db = await getDB();
        return db.getAll('companies');
    },
    async addCompany(company: Company) {
        const db = await getDB();
        return db.put('companies', company);
    },
    async deleteCompany(id: string) {
        const db = await getDB();
        return db.delete('companies', id);
    },

    // History
    async saveHistory(entry: ValidationHistory) {
        const db = await getDB();
        return db.put('history', entry);
    },
    async getHistoryByCompany(companyId: string): Promise<ValidationHistory[]> {
        const db = await getDB();
        return db.getAllFromIndex('history', 'by-company', companyId);
    },
    async deleteHistory(id: string) {
        const db = await getDB();
        return db.delete('history', id);
    },
    async clearHistory(companyId: string) {
        const db = await getDB();
        const tx = db.transaction('history', 'readwrite');
        const index = tx.store.index('by-company');
        let cursor = await index.openCursor(IDBKeyRange.only(companyId));
        while (cursor) {
            cursor.delete();
            cursor = await cursor.continue();
        }
        await tx.done;
    }
};
