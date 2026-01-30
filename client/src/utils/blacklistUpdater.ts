import { addBlacklistRecordsBulk, BlacklistRecord, getMetadata, updateMetadata, BlacklistMetadata } from "@/db/blacklistDB";

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

            // Heurística simple para detectar formato CSV SAT
            // Esperamos: RFC (columna 0) o RFC, Razon Social, Situacion...

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
                        fechaPublicacion: new Date().toISOString(),
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
                await addBlacklistRecordsBulk(records);

                // Update Metadata
                const currentMeta = await getMetadata() || {
                    key: 'lastUpdate',
                    efosLastUpdate: '',
                    list69BLastUpdate: '',
                    efosCount: 0,
                    list69BCount: 0
                };

                if (tipo === 'EFOS') {
                    currentMeta.efosLastUpdate = new Date().toISOString();
                    currentMeta.efosCount = (currentMeta.efosCount || 0) + records.length; // Incremental simple logic
                } else {
                    currentMeta.list69BLastUpdate = new Date().toISOString();
                    currentMeta.list69BCount = (currentMeta.list69BCount || 0) + records.length;
                }

                await updateMetadata(currentMeta);

                resolve({
                    success: true,
                    efosCount: currentMeta.efosCount,
                    list69BCount: currentMeta.list69BCount,
                    totalProcessed: processedCount,
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
