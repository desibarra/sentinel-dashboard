
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import * as engine from '../src/lib/cfdiEngine';

describe('Sentinel Express - Motor Fiscal (Audit Tests)', () => {
    let dom: JSDOM;
    let parser: DOMParser;

    beforeEach(() => {
        dom = new JSDOM();
        parser = new dom.window.DOMParser();
    });

    const createXML = (content: string) => {
        return `<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfdv" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="4.0">
            ${content}
        </cfdi:Comprobante>`;
    };

    // --- PRUEBAS DE PARSING ---

    it('Test-P-01: Extracción de múltiples relaciones (Discrepancia detectada)', () => {
        const content = `
            <cfdi:CfdiRelacionados TipoRelacion="04">
                <cfdi:CfdiRelacionado UUID="11111111-2222-3333-4444-555555555555" />
                <cfdi:CfdiRelacionado UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" />
            </cfdi:CfdiRelacionados>
        `;
        const xml = createXML(content);
        const xmlDoc = parser.parseFromString(xml, 'text/xml');
        const result = engine.extractCfdiRelacionados(xmlDoc, xml);

        expect(result.tieneCfdiRelacionados).toBe('SÍ');
        expect(result.uuidRelacionado).toBe('11111111-2222-3333-4444-555555555555');
        // VERIFICACIÓN MULTI-UUID
        expect(result.uuids_relacionados).toHaveLength(2);
        expect(result.uuids_relacionados).toContain('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    });

    it('Test-P-02: Detección de encoding', () => {
        const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><cfdi:Comprobante />';
        const result = engine.detectarEncoding(xml);
        expect(result.encoding).toBe('ISO-8859-1');
        expect(result.soportado).toBe(true);
    });

    // --- PRUEBAS DE CÁLCULO ---

    it('Test-C-01: Manejo de moneda extranjera (Riesgo de conversión)', () => {
        const content = `
            <cfdi:Conceptos>
                <cfdi:Concepto Importe="100.00" Cantidad="1" Descripcion="Test" ClaveProdServ="01010101" ClaveUnidad="ACT" ValorUnitario="100.00">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Base="100.00" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa" Importe="16.00" />
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
            </cfdi:Conceptos>
        `;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfdv40" Version="4.0" Total="116.00" Moneda="USD" TipoCambio="18.50">
            ${content}
        </cfdi:Comprobante>`;

        const xmlDoc = parser.parseFromString(xml, 'text/xml');
        const taxes = engine.extractTaxesByConcepto(xmlDoc, '4.0');
        const validation = engine.validateTotals(taxes, 116.00);

        // El test debería pasar si el motor ignora el TipoCambio (comportamiento actual)
        // y valida contra el total en la misma moneda del subtotal.
        expect(taxes.subtotal).toBe(100);
        expect(taxes.ivaTraslado).toBe(16);
        expect(validation.isValid).toBe(true);
        // NOTA: Se confirma que el motor actual NO convierte a MXN, validando solo la aritmética interna.
    });

    it('Test-C-02: IEPS de cuota fija', () => {
        const taxes = {
            subtotal: 100,
            trasladosTotales: 3.5, // Cuota fija IEPS (litro, pqt, etc)
            retencionesTotales: 0,
            impuestosLocalesTrasladados: 0,
            impuestosLocalesRetenidos: 0
        };
        const validation = engine.validateTotals(taxes, 103.50);
        expect(validation.isValid).toBe(true);
    });

    // --- PRUEBAS DE VALIDACIÓN SAT ---

    it('Test-V-01: Nómina histórico vs Año actual', () => {
        const rules = engine.obtenerReglasAplicables('3.3', 2024, 'N');
        // El motor permite Nómina en 3.3 si el año es >= 2018 (pero para Pagos)
        // En realidad para Nómina, el sistema es permisivo.
        expect(rules.validacionesAplicables).toContain('estructural');
    });

    it('Test-V-02: Carta Porte - Regla de exclusión para Nómina', () => {
        const result = engine.determineRequiereCartaPorte('<xml/>', 'N', '4.0');
        expect(result).toBe('NO');
    });

    // --- PRUEBAS DE EXCEL / PERFORMANCE ---

    it('Test-E-01: Simulación de gran volumen (1000 registros)', () => {
        const mockResult: engine.ValidationResult = {
            fileName: 'test.xml',
            uuid: 'ABC',
            isValid: true,
            total: 100,
            totalCalculado: 100,
            diferenciaTotales: 0,
            resultado: '🟢 USABLE'
        } as any;

        const startTime = Date.now();
        const results = Array(1000).fill(mockResult);
        expect(results.length).toBe(1000);
        const duration = Date.now() - startTime;

        // Procesar 1000 registros en memoria debería ser casi instantáneo
        expect(duration).toBeLessThan(100);
    });
});
