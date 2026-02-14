
import { ConceptoDesglose } from "./cfdiEngine";

/**
 * Define categorías de ClaveProdServ para facilitar la comparación
 */
const CATEGORIES = {
    COMBUSTIBLE: ["15"], // Combustibles, lubricantes
    TRANSPORTE_LOGISTICA: ["78", "25", "24"], // Transporte, Vehículos, Empaque
    PROFESIONAL_OFICINA: ["80", "81", "44", "43"], // Gestión, Ingeniería, Suministros oficina, Telecom
    CONSTRUCCION: ["30", "72", "95"], // Materiales, Servicios de construcción
    CONSUMO_PERSONAL_SUPER: ["50", "51", "52", "53", "56", "91"], // Alimentos, Bebidas, Hogar, Entretenimiento
    SALUD: ["85", "42", "51"], // Hospitales, Instrumentos médicos, Medicamentos
};

/**
 * Evaluación suave de materialidad / razón de negocio
 */
export function evaluarMaterialidadGasto(
    giroEmpresa: string,
    desglosePorConcepto: ConceptoDesglose[],
    nombreEmisor: string
): { tieneRiesgo: boolean; mensaje: string } {
    if (!giroEmpresa || giroEmpresa === "NO DISPONIBLE") {
        return { tieneRiesgo: false, mensaje: "" };
    }

    const giro = giroEmpresa.toLowerCase();
    let conceptosDudosos: string[] = [];

    desglosePorConcepto.forEach((c) => {
        const cve = c.claveProdServ.substring(0, 2);
        const desc = c.descripcion.toLowerCase();

        // Lógica de detección cruzada

        // 1. Caso: Transporte de carga
        if (giro.includes("transporte")) {
            // Gastos de supermercado/alimentos (que no sean viáticos obvios o controlados)
            if (CATEGORIES.CONSUMO_PERSONAL_SUPER.includes(cve)) {
                // Excepción: Si la descripción sugiere limpieza o suministros mínimos industriales
                if (!desc.includes("limpieza") && !desc.includes("detergente") && !desc.includes("aceite")) {
                    conceptosDudosos.push(`${c.claveProdServ} - ${c.descripcion}`);
                }
            }
        }

        // 2. Caso: Servicios Profesionales / Oficinas
        else if (giro.includes("profesional") || giro.includes("consultoria") || giro.includes("servicios")) {
            // Refacciones pesadas o materiales de construcción pesados
            if (cve === "25" || cve === "30") {
                conceptosDudosos.push(`${c.claveProdServ} - ${c.descripcion}`);
            }
            // Supermercado (alimentos/bebidas)
            if (CATEGORIES.CONSUMO_PERSONAL_SUPER.includes(cve)) {
                // Permitimos café/papelería/agua por descripción
                if (!desc.includes("cafe") && !desc.includes("agua") && !desc.includes("papel")) {
                    conceptosDudosos.push(`${c.claveProdServ} - ${c.descripcion}`);
                }
            }
        }

        // 3. Caso: Alimentación / Restaurantes / Supermercados
        else if (giro.includes("alimento") || giro.includes("abarrote") || giro.includes("comercializadora")) {
            // Relativamente abierto, pero quizá servicios médicos o construcción mayor?
            if (cve === "85" || cve === "95") {
                conceptosDudosos.push(`${c.claveProdServ} - ${c.descripcion}`);
            }
        }

        // 4. Regla general para Supermercados/Retail (Emisores comunes como Walmart, Soriana, Oxxo)
        const emisorRetail = ["walmart", "soriana", "chedraui", "costco", "oxxo", "7-eleven"].some(r => nombreEmisor.toLowerCase().includes(r));
        if (emisorRetail && !giro.includes("alimento") && !giro.includes("comercio")) {
            // Si el giro no es comercio y compra en retail, revisamos si son productos de oficina/limpieza
            if (CATEGORIES.CONSUMO_PERSONAL_SUPER.includes(cve) && !desc.includes("papel") && !desc.includes("limpieza")) {
                // Evitamos duplicar si ya se agregó arriba
                if (!conceptosDudosos.includes(`${c.claveProdServ} - ${c.descripcion}`)) {
                    conceptosDudosos.push(`${c.claveProdServ} - ${c.descripcion}`);
                }
            }
        }
    });

    if (conceptosDudosos.length > 0) {
        return {
            tieneRiesgo: true,
            mensaje: `ALERTA DE GIRO: Algunos conceptos podrían no estar directamente relacionados con el giro declarado de la empresa ("${giroEmpresa}"). Verificar estricta indispensabilidad y documentación de soporte antes de deducir.`
        };
    }

    return { tieneRiesgo: false, mensaje: "" };
}
