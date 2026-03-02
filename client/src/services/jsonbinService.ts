/**
 * Servicio para interactuar con JSONBin.io
 * Almacena y gestiona los tokens de demo en la nube.
 */

const MASTER_KEY = import.meta.env.VITE_JSONBIN_MASTER_KEY;
const BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID;
const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

export interface ManagedToken {
    id: string;
    token: string;
    label: string;
    expiresAt: string; // YYYY-MM-DD
    createdAt: string; // ISO
    active: boolean;
    demoCompanyName: string;
    demoCompanyRFC: string;
    // Tracking de uso
    accessCount?: number;    // Cuántas veces abrieron el link
    lastAccessed?: string;   // ISO - fecha del último acceso
}

interface BinData {
    tokens: ManagedToken[];
}

async function fetchBin(): Promise<BinData> {
    const res = await fetch(`${BASE_URL}/latest`, {
        headers: {
            "X-Master-Key": MASTER_KEY,
            "X-Bin-Meta": "false",
        },
    });
    if (!res.ok) throw new Error(`JSONBin error: ${res.status}`);
    return res.json();
}

async function updateBin(data: BinData): Promise<void> {
    const res = await fetch(BASE_URL, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "X-Master-Key": MASTER_KEY,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`JSONBin update error: ${res.status}`);
}

export const jsonbinService = {
    /** Obtiene todos los tokens del bin */
    async getTokens(): Promise<ManagedToken[]> {
        const data = await fetchBin();
        return data.tokens || [];
    },

    /** Crea un nuevo token */
    async createToken(token: Omit<ManagedToken, "id" | "createdAt">): Promise<ManagedToken> {
        const data = await fetchBin();
        const newToken: ManagedToken = {
            ...token,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            createdAt: new Date().toISOString(),
        };
        data.tokens = [...(data.tokens || []), newToken];
        await updateBin(data);
        return newToken;
    },

    /** Activa o desactiva un token */
    async toggleToken(id: string, active: boolean): Promise<void> {
        const data = await fetchBin();
        data.tokens = data.tokens.map(t =>
            t.id === id ? { ...t, active } : t
        );
        await updateBin(data);
    },

    /** Elimina un token permanentemente */
    async deleteToken(id: string): Promise<void> {
        const data = await fetchBin();
        data.tokens = data.tokens.filter(t => t.id !== id);
        await updateBin(data);
    },

    /** Valida un token y registra el acceso en 2 peticiones (GET + PUT) */
    async validateToken(tokenCode: string): Promise<ManagedToken | null> {
        try {
            // 1 GET: leemos el bin completo
            const data = await fetchBin();
            const tokens = data.tokens || [];

            const found = tokens.find(
                t => t.token.toLowerCase() === tokenCode.toLowerCase() && t.active
            );
            if (!found) return null;

            // Verificar expiración
            const expiry = new Date(found.expiresAt + "T23:59:59");
            if (new Date() > expiry) return null;

            // Actualizar contador en los datos ya leídos (sin otro GET)
            const updatedToken = {
                ...found,
                accessCount: (found.accessCount || 0) + 1,
                lastAccessed: new Date().toISOString(),
            };
            data.tokens = tokens.map(t => t.id === found.id ? updatedToken : t);

            // 1 PUT: guardamos todo en un solo paso
            updateBin(data).catch(() => { }); // En background, no bloquea el login

            return updatedToken;
        } catch {
            return null;
        }
    },

    /** Tracking manual (por si se necesita en otro contexto) */
    async trackTokenAccess(id: string): Promise<void> {
        const data = await fetchBin();
        data.tokens = data.tokens.map(t =>
            t.id === id
                ? {
                    ...t,
                    accessCount: (t.accessCount || 0) + 1,
                    lastAccessed: new Date().toISOString(),
                }
                : t
        );
        await updateBin(data);
    },
};

