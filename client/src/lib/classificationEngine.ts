import { ValidationResult } from "./cfdiEngine";

export type ClasificacionFiscal = 'EMITIDO' | 'RECIBIDO' | 'AJENO' | 'AMBIGUO';
export type RolContraparte = 'CLIENTE' | 'PROVEEDOR' | 'DESCONOCIDO';
export type TipoFinanciero = 'INGRESO' | 'GASTO' | 'REVISIÓN' | 'NO_RELACIONADO';

export interface ValidationResultExtended extends ValidationResult {
    clasificacion: ClasificacionFiscal;
    rfcBaseConfirmado: string;
    rfcContraparte: string;
    rolContraparte: RolContraparte;
    tipoFinanciero: TipoFinanciero;
}

/**
 * Heurística para sugerir el RFC Base más probable.
 * Retorna el RFC que más se repite como emisor o receptor.
 */
export function detectarRFCFrecuente(resultados: ValidationResult[]): string {
    if (!resultados || resultados.length === 0) return "";
    
    const freqs: Record<string, number> = {};
    for (const r of resultados) {
        if (r.rfcEmisor) freqs[r.rfcEmisor] = (freqs[r.rfcEmisor] || 0) + 1;
        if (r.rfcReceptor) freqs[r.rfcReceptor] = (freqs[r.rfcReceptor] || 0) + 1;
    }
    
    let max = 0;
    let rfcFrecuente = "";
    for (const [rfc, count] of Object.entries(freqs)) {
        if (count > max && rfc !== "Desconocido" && rfc !== "XAXX010101000" && rfc !== "XEXX010101000") {
            max = count;
            rfcFrecuente = rfc;
        }
    }
    return rfcFrecuente;
}

/**
 * Determina el rol de la contraparte basado en el RFC Base.
 */
export function determinarRolContraparte(rfcBase: string, emisor: string, receptor: string): { rfcContraparte: string, rol: RolContraparte, tipoFinanciero: TipoFinanciero } {
    if (!rfcBase) return { rfcContraparte: "DESCONOCIDO", rol: "DESCONOCIDO", tipoFinanciero: "NO_RELACIONADO" };
    
    if (rfcBase === emisor) {
        return { rfcContraparte: receptor || "DESCONOCIDO", rol: "CLIENTE", tipoFinanciero: "INGRESO" };
    }
    if (rfcBase === receptor) {
        return { rfcContraparte: emisor || "DESCONOCIDO", rol: "PROVEEDOR", tipoFinanciero: "GASTO" };
    }
    
    return { rfcContraparte: "AJENO", rol: "DESCONOCIDO", tipoFinanciero: "NO_RELACIONADO" };
}

/**
 * Función pura que clasifica un arreglo de ValidationResult según un RFC Base.
 */
export function clasificarPorRFCBase(resultados: ValidationResult[], rfcBase: string): ValidationResultExtended[] {
    if (!rfcBase) {
        // Fallback: si no hay RFC base, devolvemos como ambiguo/sin clasificar.
        return resultados.map(r => ({
            ...r,
            clasificacion: 'AMBIGUO',
            rfcBaseConfirmado: '',
            rfcContraparte: 'DESCONOCIDO',
            rolContraparte: 'DESCONOCIDO',
            tipoFinanciero: 'NO_RELACIONADO'
        }));
    }

    return resultados.map(r => {
        let clasificacion: ClasificacionFiscal = 'AMBIGUO';
        
        if (!r.rfcEmisor || !r.rfcReceptor) {
            clasificacion = 'AMBIGUO';
        } else if (r.rfcEmisor === rfcBase) {
            clasificacion = 'EMITIDO';
        } else if (r.rfcReceptor === rfcBase) {
            clasificacion = 'RECIBIDO';
        } else {
            clasificacion = 'AJENO';
        }
        
        const { rfcContraparte, rol, tipoFinanciero } = determinarRolContraparte(rfcBase, r.rfcEmisor, r.rfcReceptor);
        
        // Ajuste fino del tipo financiero según el comprobante
        let tipoFinancieroFinal = tipoFinanciero;
        if (clasificacion !== 'AJENO' && clasificacion !== 'AMBIGUO') {
            if (r.tipoCFDI === 'P' || r.tipoCFDI === 'T' || r.tipoCFDI === 'E') {
                tipoFinancieroFinal = 'REVISIÓN';
            }
        }

        return {
            ...r,
            clasificacion,
            rfcBaseConfirmado: rfcBase,
            rfcContraparte,
            rolContraparte: rol,
            tipoFinanciero: tipoFinancieroFinal
        };
    });
}
