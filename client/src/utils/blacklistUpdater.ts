import { replaceBlacklistRecordsBulk, BlacklistRecord, getMetadata, updateMetadata } from "@/db/blacklistDB";

export interface UpdateResult {
    success: boolean;
    efosCount: number;
    list69BCount: number;
    totalProcessed: number;
    errors: string[];
}

export async function processBlacklistFile(
    file: File,
    tipo: 'EFOS' | '69B'
): Promise<UpdateResult> {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) {
                resolve({ success: false, efosCount: 0, list69BCount: 0, totalProcessed: 0, errors: ["Archivo vacío"] });
                return;
            }

            const lines = text.split(/\r?\n/);
            const records: BlacklistRecord[] = [];
            const errors: string[] = [];

            let processedCount = 0;

            for (const line of lines) {
                if (!line.trim() || line.startsWith("RFC") || line.startsWith("No.")) continue; // Header skip

                const parts = line.split(/,|\|/); // Comma or pipe delimiter

                let rfc = "";
                let razonSocial = "";
                let situacion = "";

                // Intentar extraer RFC válido
                // Formato 69-B (CSV oficial): No., RFC, Nombre...
                if (parts.length >= 2) {
                    const possibleRFC = parts[1].trim(); // Columna 2 usualmente en oficial
                    if (possibleRFC.match(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/)) {
                        rfc = possibleRFC;
                        razonSocial = parts[2]?.trim() || "";
                        situacion = parts[3]?.trim() || "";
                    } else if (parts[0].trim().match(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/)) {
                        // Formato simple: RFC, Nombre
                        rfc = parts[0].trim();
                        razonSocial = parts[1]?.trim() || "";
                    }
                } else {
                    // Línea simple solo RFC
                    const cleanLine = line.trim();
                    if (cleanLine.match(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/)) {
                        rfc = cleanLine;
                    }
                }

                if (rfc) {
                    records.push({
                        rfc,
                        tipo,
                        razonSocial,
                        situacion: situacion || "Listado Definitivo"
                    });
                    processedCount++;
                }
            }

            if (records.length === 0) {
                resolve({ success: false, efosCount: 0, list69BCount: 0, totalProcessed: 0, errors: ["No se encontraron RFCs válidos"] });
                return;
            }

            try {
                // Reemplazo atómico: si falla, se conserva la copia anterior válida.
                const inserted = await replaceBlacklistRecordsBulk(records);

                const rfcSet = new Set(records.map(r => r.rfc));
                const conPresunto = new Set<string>();
                const conDefinitivo = new Set<string>();
                const conDesvirtuado = new Set<string>();
                const conSentencia = new Set<string>();

                for (const r of records) {
                    const sit = (r.situacion || '').toLowerCase();
                    if (sit.includes('presunto')) conPresunto.add(r.rfc);
                    else if (sit.includes('definitivo')) conDefinitivo.add(r.rfc);
                    else if (sit.includes('desvirtuado')) conDesvirtuado.add(r.rfc);
                    else if (sit.includes('sentencia')) conSentencia.add(r.rfc);
                }

                const now = new Date().toISOString();
                await updateMetadata({
                    key: 'lastUpdate',
                    cargadoEl: now,
                    fechaOficial: null, // carga manual: la fecha oficial no está comprobada
                    efosCount: records.filter(r => r.tipo === 'EFOS').length,
                    list69BCount: records.filter(r => r.tipo === '69B').length,
                    totalRFC: rfcSet.size,
                    presuntos: conPresunto.size,
                    definitivos: conDefinitivo.size,
                    desvirtuados: conDesvirtuado.size,
                    sentenciaFavorable: conSentencia.size,
                });

                resolve({
                    success: true,
                    efosCount: records.filter(r => r.tipo === 'EFOS').length,
                    list69BCount: records.filter(r => r.tipo === '69B').length,
                    totalProcessed: inserted,
                    errors
                });

            } catch (err) {
                resolve({ success: false, efosCount: 0, list69BCount: 0, totalProcessed: 0, errors: ["Error guardando en BD"] });
            }
        };

        reader.onerror = () => {
            resolve({ success: false, efosCount: 0, list69BCount: 0, totalProcessed: 0, errors: ["Error leyendo archivo"] });
        };

        reader.readAsText(file); // Default UTF-8
    });
}