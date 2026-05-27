import { Company, ValidationHistory } from "@/db/appDB";

// Empresa de demo 1
const DEMO_COMPANY_1: Company = {
    id: "demo-company-aaa",
    name: "Empresa Demo Mentores Estratégicos SA de CV",
    rfc: "AAA010101AAA",
    giro: "Comercio al por menor",
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
};

// Empresa de demo 2
const DEMO_COMPANY_2: Company = {
    id: "demo-company-bbb",
    name: "Corporativo Ejemplo Norte SA de CV",
    rfc: "BBB020202BBB",
    giro: "Servicios profesionales",
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
};

const now = Date.now();
const MONTH = 30 * 24 * 60 * 60 * 1000;

// Historial de validaciones de ejemplo (resultados realistas)
const DEMO_HISTORY_1: ValidationHistory = {
    id: "demo-hist-001",
    companyId: "demo-company-aaa",
    timestamp: now - MONTH,
    fileName: "Facturas_Enero_2026.zip (47 archivos)",
    xmlCount: 47,
    usableCount: 42,
    alertCount: 3,
    errorCount: 2,
    totalAmount: 1_245_680.50,
    results: [
        {
            uuid: "6B8D14F2-3AE7-4C0A-A1E1-550F1D8C6001",
            fileName: "factura_001.xml",
            rfcEmisor: "XAXX010101000",
            nombreEmisor: "Proveedor Nacional SA de CV",
            rfcReceptor: "AAA010101AAA",
            tipoCFDI: "I",
            tipoRealDocumento: "Factura",
            fechaEmision: "2026-01-05",
            versionCFDI: "4.0",
            total: 58_000.00,
            ivaTraslado: 8_000.00,
            subtotal: 50_000.00,
            resultado: "🟢 USABLE",
            estatusSAT: "Vigente",
            moneda: "MXN",
            comentarioFiscal: "CFDI válido. Totales correctos. Sin errores fiscales.",
        },
        {
            uuid: "7C9E25A3-4BF8-5D1B-B2F2-661G2E9D7112",
            fileName: "factura_002.xml",
            rfcEmisor: "MABS801231K78",
            nombreEmisor: "Servicios Técnicos del Norte SC",
            rfcReceptor: "AAA010101AAA",
            tipoCFDI: "I",
            tipoRealDocumento: "Factura",
            fechaEmision: "2026-01-12",
            versionCFDI: "4.0",
            total: 23_200.00,
            ivaTraslado: 3_200.00,
            subtotal: 20_000.00,
            resultado: "🟡 ALERTA",
            estatusSAT: "Vigente",
            moneda: "MXN",
            comentarioFiscal: "RFC Emisor presente en lista EFOS. Revise documentación soporte adicional.",
        },
        {
            uuid: "8D0F36B4-5CG9-6E2C-C3G3-772H3F0E8223",
            fileName: "nc_enero_003.xml",
            rfcEmisor: "XAXX010101000",
            nombreEmisor: "Proveedor Nacional SA de CV",
            rfcReceptor: "AAA010101AAA",
            tipoCFDI: "E",
            tipoRealDocumento: "Nota de Crédito",
            fechaEmision: "2026-01-20",
            versionCFDI: "4.0",
            total: -5_800.00,
            ivaTraslado: -800.00,
            subtotal: -5_000.00,
            resultado: "🔴 NO USABLE",
            estatusSAT: "Cancelado",
            moneda: "MXN",
            comentarioFiscal: "CFDI CANCELADO en el SAT. No tiene efectos fiscales.",
        },
    ],
    globalNotes: "Revisión mensual Enero 2026. 3 CFDIs con alertas requieren atención.",
};

const DEMO_HISTORY_2: ValidationHistory = {
    id: "demo-hist-002",
    companyId: "demo-company-aaa",
    timestamp: now - 7 * 24 * 60 * 60 * 1000,
    fileName: "Facturas_Febrero_2026.zip (31 archivos)",
    xmlCount: 31,
    usableCount: 29,
    alertCount: 1,
    errorCount: 1,
    totalAmount: 892_340.00,
    results: [],
    globalNotes: "Revisión quincenal Febrero 2026. Período limpio.",
};

export const DEMO_COMPANIES: Company[] = [DEMO_COMPANY_1, DEMO_COMPANY_2];
export const DEMO_HISTORY: ValidationHistory[] = [DEMO_HISTORY_1, DEMO_HISTORY_2];

/**
 * Precarga los datos de demo en la base de datos local (IndexedDB).
 * Solo se ejecuta si la BD está vacía para no sobrescribir datos reales.
 */
export async function loadDemoDataIfEmpty(appDB: any): Promise<void> {
    try {
        const existingCompanies = await appDB.getCompanies();
        if (existingCompanies.length === 0) {
            for (const company of DEMO_COMPANIES) {
                await appDB.addCompany(company);
            }
            for (const history of DEMO_HISTORY) {
                await appDB.saveHistory(history);
            }
            console.log("[DEMO] Datos de demo precargados exitosamente.");
        }
    } catch (err) {
        console.warn("[DEMO] No se pudieron cargar datos de demo:", err);
    }
}
