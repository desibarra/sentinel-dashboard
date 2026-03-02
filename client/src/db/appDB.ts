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

let dbPromise: Promise<IDBPDatabase<SentinelSchema>> | null = null;

function getIDB() {
    if (!dbPromise) {
        dbPromise = openDB<SentinelSchema>('SentinelAppLocalDB', 1, {
            upgrade(db) {
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
    }
};
