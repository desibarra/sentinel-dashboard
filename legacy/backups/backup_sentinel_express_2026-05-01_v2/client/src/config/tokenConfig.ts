/**
 * ============================================================
 * CONFIGURACIÓN DE TOKENS DE ACCESO - Sentinel Express Pro
 * ============================================================
 * 
 * Para generar un nuevo token de demo para un cliente:
 * 1. Agrega un nuevo objeto al arreglo DEMO_TOKENS
 * 2. Define el token (código que el cliente usará en la URL)
 * 3. Define la fecha de expiración en formato YYYY-MM-DD
 * 4. Guarda el archivo y haz git push
 *
 * Ejemplo de URL para el cliente:
 *   https://leafy-longma-cc440e.netlify.app/?token=DEMO2026
 *
 * ============================================================
 */

export interface DemoToken {
    /** Código del token - va en la URL como ?token=ESTE_VALOR */
    token: string;
    /** Nombre descriptivo del cliente o campaña */
    label: string;
    /** Fecha de expiración en formato YYYY-MM-DD */
    expiresAt: string;
    /** RFC de la empresa de demo que se preselecciona */
    demoCompanyRFC: string;
    /** Nombre de la empresa de demo */
    demoCompanyName: string;
}

export const DEMO_TOKENS: DemoToken[] = [
    {
        token: "DEMO2026",
        label: "Demo General 2026",
        expiresAt: "2026-04-30",
        demoCompanyRFC: "AAA010101AAA",
        demoCompanyName: "Empresa Demo Mentores Estratégicos SA de CV",
    },
    {
        token: "CLIENTE01",
        label: "Prueba Cliente Prospecto 1",
        expiresAt: "2026-03-31",
        demoCompanyRFC: "BBB020202BBB",
        demoCompanyName: "Corporativo Ejemplo Norte SA de CV",
    },
    // ➕ Agrega más tokens aquí siguiendo el mismo formato
];
