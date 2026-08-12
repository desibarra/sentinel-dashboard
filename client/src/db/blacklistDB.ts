const DB_NAME = 'SentinelBlacklists';
const DB_VERSION = 2;
const STORE_NAME = 'blacklists';
const METADATA_STORE = 'metadata';

export interface BlacklistRecord {
    rfc: string;
    tipo: 'EFOS' | '69B';
    fechaPublicacion?: string;
    razonSocial?: string;
    situacion?: string; // Definitivo, Presunto, Desvirtuado, Sentencia Favorable
}

export interface BlacklistStats {
    presuntos: number;
    definitivos: number;
    desvirtuados: number;
    sentenciaFavorable: number;
}

export interface BlacklistMetadata {
    key: 'lastUpdate';
    cargadoEl: string;              // Fecha de carga en este dispositivo (ISO)
    fechaOficial: string | null;    // Fecha oficial del listado SAT (null si no está comprobada)
    efosCount: number;
    list69BCount: number;
    totalRFC: number;               // RFC únicos cargados
    presuntos: number;
    definitivos: number;
    desvirtuados: number;
    sentenciaFavorable: number;
    // Campos legacy (metadata v1) para lectura tolerante de datos ya existentes en el navegador
    efosLastUpdate?: string;
    list69BLastUpdate?: string;
}

// Inicializar DB (v2: permite múltiples registros por RFC para detectar situaciones múltiples)
export async function initBlacklistDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event);
            reject("Error opening database");
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const tx = (event.target as IDBOpenDBRequest).transaction;

            // v1 → v2: el store anterior usaba RFC como key único y perdía situaciones.
            // Al migrar, se descarta para que el usuario vuelva a cargar desde 69b.json.
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('rfc', 'rfc', { unique: false });
            }

            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
            } else if (event.oldVersion < 2 && tx) {
                // Metadata v1 no distingue fecha oficial ni desglose; se limpia para evitar
                // mostrar datos que ya no corresponden a los registros cargados.
                const metaStore = tx.objectStore(METADATA_STORE);
                metaStore.clear();
            }
        };
    });
}

// Reemplazo atómico: borra e inserta en una sola transacción.
// Si la transacción aborta, IndexedDB revierte TODO, conservando la copia anterior válida.
export async function replaceBlacklistRecordsBulk(records: BlacklistRecord[]): Promise<number> {
    const db = await initBlacklistDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        store.clear();

        records.forEach(record => {
            store.put(record); // 'id' auto-genera
        });

        transaction.oncomplete = () => {
            resolve(records.length);
        };

        transaction.onabort = () => {
            const err = transaction.error;
            console.error("Bulk replace abortado:", err);
            reject("Error reemplazando registros; se conservó la copia anterior.");
        };

        transaction.onerror = (event) => {
            console.error("Bulk replace error:", event);
        };
    });
}

// Consultar todos los registros de un RFC (pueden existir varias situaciones)
export async function getBlacklistsByRFC(rfc: string): Promise<BlacklistRecord[]> {
    const db = await initBlacklistDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('rfc');
        const request = index.getAll(rfc);

        request.onsuccess = () => {
            resolve((request.result as BlacklistRecord[]) || []);
        };

        request.onerror = () => {
            reject("Error querying RFC");
        };
    });
}

// Metadata
export async function getMetadata(): Promise<BlacklistMetadata | null> {
    const db = await initBlacklistDB();
    return new Promise((resolve) => {
        const transaction = db.transaction([METADATA_STORE], 'readonly');
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.get('lastUpdate');

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

export async function updateMetadata(metadata: BlacklistMetadata): Promise<void> {
    const db = await initBlacklistDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE], 'readwrite');
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.put(metadata);

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Error updating metadata");
    });
}

// Utils
export async function clearBlacklists(): Promise<void> {
    const db = await initBlacklistDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Error clearing blacklists");
    });
}