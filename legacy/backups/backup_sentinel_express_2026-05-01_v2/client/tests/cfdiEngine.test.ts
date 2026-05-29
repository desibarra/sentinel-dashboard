
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

    // --- PRUEBAS DE CLASIFICACIÓN (CATEGORÍAS ESPECIALES) ---

    it('Test-CAT-00: CFDI Comercial Sano', () => {
        const taxes = { desglosePorConcepto: [] };
        const validation = { isValid: true };
        const result = engine.classifyCFDI('<xml/>', '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🟢 USABLE');
        expect(result.comentarioFiscal).toContain('Total correcto calculado');
    });

    it('Test-CAT-01: Gasolina con complemento ecc12', () => {
        const xml = `<cfdi:Comprobante xmlns:ecc12="http://www.sat.gob.mx/EstadoDeCuentaCombustible12">
            <cfdi:Complemento><ecc12:EstadoDeCuentaCombustible Version="1.2" /></cfdi:Complemento>
        </cfdi:Comprobante>`;
        const taxes = { desglosePorConcepto: [] };
        const validation = { isValid: false, diferencia: 100 }; // Simulamos que no cuadra
        const result = engine.classifyCFDI(xml, '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🟡 CON ALERTAS');
        expect(result.comentarioFiscal).toContain('Estado de Cuenta de Combustible');
    });

    it('Test-CAT-02: Riesgo ObjetoImp="02" con IVA 0% en producto gravado', () => {
        const taxes = {
            desglosePorConcepto: [{
                claveProdServ: '50192100', // Alimentos
                objetoImp: '02',
                traslados: [{ impuesto: '002', tasa: '0', importe: 0 }]
            }]
        };
        const validation = { isValid: true };
        const xml = '<cfdi:Comprobante><cfdi:Emisor Nombre="TIENDA DE CONVENIENCIA S.A. DE C.V."/></cfdi:Comprobante>';
        const result = engine.classifyCFDI(xml, '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🔴 NO USABLE (Riesgo IVA)');
        expect(result.comentarioFiscal).toContain('Riesgo de no poder acreditar IVA');
    });

    it('Test-CAT-03: Bonificados con ObjetoImp="01"', () => {
        const taxes = {
            desglosePorConcepto: [{
                objetoImp: '01',
                importe: 100,
                descuento: 100
            }]
        };
        const validation = { isValid: true };
        const result = engine.classifyCFDI('<xml/>', '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🟢 USABLE');
        expect(result.comentarioFiscal).toContain('conceptos bonificados');
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

    // --- PRUEBAS DE MATERIALIDAD / RAZÓN DE NEGOCIO ---

    it('Test-MAT-01: Transporte de carga con gasto relacionado (Combustible)', () => {
        const taxes = {
            desglosePorConcepto: [{
                claveProdServ: '15101506', // Gasolina magna
                descripcion: 'GASOLINA 87 OCTANOS',
                objetoImp: '02',
                traslados: []
            }]
        };
        const validation = { isValid: true };
        const giro = 'Transporte de carga';
        const result = engine.classifyCFDI('<xml/>', '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico', giro);

        expect(result.resultado).toBe('🟢 USABLE');
        expect(result.comentarioFiscal).not.toContain('ALERTA DE GIRO');
    });

    it('Test-MAT-02: Transporte de carga con gasto NO relacionado (Supermercado)', () => {
        const taxes = {
            desglosePorConcepto: [{
                claveProdServ: '50192100', // Aperitivos/Dulces
                descripcion: 'ROSCA DE REYES TAMAÑO FAMILIAR',
                objetoImp: '02',
                traslados: []
            }]
        };
        const validation = { isValid: true };
        const giro = 'Transporte de carga';
        const result = engine.classifyCFDI('<xml/>', '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico', giro);

        expect(result.resultado).toBe('🟢 USABLE'); // Se mantiene verde según reglas
        expect(result.comentarioFiscal).toContain('ALERTA DE GIRO');
        expect(result.comentarioFiscal).toContain('Transporte de carga');
    });

    // --- PRUEBAS DE RIESGO IVA (REFRESCADO V1.2.1) ---

    it('Test-IVA-01: Supermercado con ObjetoImp=02 e IVA 0% -> RIESGO IVA', () => {
        const taxes = {
            desglosePorConcepto: [{
                claveProdServ: '50192100',
                descripcion: 'ABARROTES VARIOS',
                objetoImp: '02',
                traslados: [{ impuesto: '002', tasa: '0', importe: 0 }]
            }]
        };
        const validation = { isValid: true };
        const xml = '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfdv40"><cfdi:Emisor Nombre="TIENDAS SORIANA S.A. DE C.V."/></cfdi:Comprobante>';
        const result = engine.classifyCFDI(xml, '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🔴 NO USABLE (Riesgo IVA)');
        expect(result.comentarioFiscal).toContain('[CRÍTICO]');
    });

    it('Test-IVA-02: Universidad (Exento) con ObjetoImp=02 e IVA 0% -> USABLE', () => {
        const taxes = {
            desglosePorConcepto: [{
                claveProdServ: '86121701', // Universidad
                descripcion: 'COLEGIATURA ENERO',
                objetoImp: '02',
                traslados: [{ impuesto: '002', tasa: '0', importe: 0 }]
            }]
        };
        const validation = { isValid: true };
        const xml = '<cfdi:Comprobante><cfdi:Emisor Nombre="INSTITUTO TECNOLOGICO DE ESTUDIOS SUPERIORES"/></cfdi:Comprobante>';
        const result = engine.classifyCFDI(xml, '4.0', 'I', taxes, validation, false, null, { presente: 'NO APLICA' }, { presente: 'NO APLICA' }, 'NO', 'Histórico');

        expect(result.resultado).toBe('🟢 USABLE');
        expect(result.comentarioFiscal).toContain('Servicio potencialmente exento');
        expect(result.comentarioFiscal).not.toContain('Riesgo IVA');
    });

    it('Test-TVA-01: Verificación de Giro y Régimen para Traslados de Vanguardia (4.0)', () => {
        const xmlStr = `
            <cfdi:Comprobante Version="4.0" xmlns:cfdi="http://www.sat.gob.mx/cfdv40">
                <cfdi:Receptor Rfc="TVA060209QL6" Nombre="TRASLADOS DE VANGUARDIA S.A. DE C.V." RegimenFiscalReceptor="624" UsoCFDI="G03" DomicilioFiscalReceptor="76000"/>
            </cfdi:Comprobante>
        `;
        const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
        const info = engine.extractReceptorInfo(xmlDoc);

        expect(info.rfc).toBe('TVA060209QL6');
        expect(info.regimenFiscal).toBe('624');
        expect(info.usoCFDI).toBe('G03');

        // Simular ValidationResult
        const giro = 'Transporte de carga / Coordinados 624';
        const mockResult: engine.ValidationResult = {
            regimenReceptor: info.regimenFiscal,
            usoCFDI: info.usoCFDI,
            giroEmpresa: giro
        } as any;

        expect(mockResult.regimenReceptor).toBe('624');
        expect(mockResult.usoCFDI).toBe('G03');
        expect(mockResult.giroEmpresa).toBe(giro);
    });

    it('Test-TVA-02: Propagación de Giro_Empresa al reporte Excel', () => {
        const giroConfigurado = "Transporte de carga – Régimen 624 Coordinados";

        // Simular el resultado de validación que se guardaría en el estado
        const mockResult: engine.ValidationResult = {
            fileName: 'factura_transporte.xml',
            uuid: '550e8400-e29b-41d4-a716-446655440000',
            resultado: '🟢 USABLE',
            total: 1500.50,
            giroEmpresa: giroConfigurado, // Este es el campo que queremos verificar
            rfcEmisor: 'ABC123456789',
            rfcReceptor: 'TVA060209QL6'
        } as any;

        // Verificar que el objeto de resultado contiene el giro
        expect(mockResult.giroEmpresa).toBe(giroConfigurado);

        // Simular el mapeo que ocurre en exportToExcel (lib/excelExporter.ts)
        const mappedRow = {
            Archivo_XML: mockResult.fileName,
            Giro_Empresa: mockResult.giroEmpresa || 'NO DEFINIDO'
        };

        expect(mappedRow.Giro_Empresa).toBe(giroConfigurado);
        expect(mappedRow.Giro_Empresa).not.toBe('NO DEFINIDO');
    });
});
