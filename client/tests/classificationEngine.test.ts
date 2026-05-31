import { describe, it, expect } from 'vitest';
import { 
    clasificarPorRFCBase, 
    detectarRFCFrecuente, 
    determinarRolContraparte,
    ValidationResultExtended
} from '../src/lib/classificationEngine';
import { ValidationResult } from '../src/lib/cfdiEngine';

describe('classificationEngine', () => {

    const mockResult = (emisor: string, receptor: string, tipo: string = 'I'): ValidationResult => ({
        rfcEmisor: emisor,
        rfcReceptor: receptor,
        tipoCFDI: tipo,
        // Mock remaining fields
        fileName: '', uuid: '', versionCFDI: '', serie: '', folio: '',
        fechaEmision: '', horaEmision: '', añoFiscal: 2022, estatusSAT: '',
        fechaCancelacion: '', cfdiSustituido: '', uuidSustitucion: '',
        nombreEmisor: '', regimenEmisor: '', estadoSATEmisor: '',
        nombreReceptor: '', regimenReceptor: '', usoCFDI: '', cpReceptor: '',
        tieneCfdiRelacionados: '', tipoRelacion: '', uuidRelacionado: '', uuids_relacionados: [],
        tipoRealDocumento: '', requiereCartaPorte: '', cartaPorte: '', cartaPorteCompleta: '', versionCartaPorte: '',
        pagosPresente: '', versionPagos: '', pagosValido: '', encodingDetectado: '', complementosDetectados: [],
        scoreInformativo: 0, subtotal: 0, baseIVA16: 0, baseIVA8: 0, baseIVA0: 0, baseIVAExento: 0, baseNoObjeto: 0,
        baseObjetoSinDesglose: 0, clasificacionFiscal: '', ivaTraslado: 0, ivaRetenido: 0, isrRetenido: 0,
        iepsTraslado: 0, iepsRetenido: 0, impuestosLocalesTrasladados: 0, impuestosLocalesRetenidos: 0,
        total: 0, moneda: '', tipoCambio: 0, formaPago: '', metodoPago: '', nivelValidacion: '',
        resultado: '', comentarioFiscal: '', observacionesTecnicas: '', iva: 0, isValid: true,
        totalCalculado: 0, diferenciaTotales: 0, desglosePorConcepto: [], desglose: '',
        esNomina: '', versionNomina: '', totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0,
        isrRetenidoNomina: 0, totalCalculadoNomina: 0, descuentoGlobal: 0, condicionesDePago: ''
    } as ValidationResult);

    it('detectarRFCFrecuente should ignore XAXX and find most frequent', () => {
        const results = [
            mockResult('RFC1', 'XAXX010101000'),
            mockResult('RFC1', 'RFC2'),
            mockResult('RFC3', 'RFC1'),
        ];
        expect(detectarRFCFrecuente(results)).toBe('RFC1');
    });

    it('clasificarPorRFCBase - EMITIDO', () => {
        const results = [mockResult('RFCBASE', 'RFC2')];
        const res = clasificarPorRFCBase(results, 'RFCBASE');
        expect(res[0].clasificacion).toBe('EMITIDO');
        expect(res[0].rolContraparte).toBe('CLIENTE');
        expect(res[0].tipoFinanciero).toBe('INGRESO');
    });

    it('clasificarPorRFCBase - RECIBIDO', () => {
        const results = [mockResult('RFC2', 'RFCBASE')];
        const res = clasificarPorRFCBase(results, 'RFCBASE');
        expect(res[0].clasificacion).toBe('RECIBIDO');
        expect(res[0].rolContraparte).toBe('PROVEEDOR');
        expect(res[0].tipoFinanciero).toBe('GASTO');
    });

    it('clasificarPorRFCBase - AJENO', () => {
        const results = [mockResult('RFC3', 'RFC4')];
        const res = clasificarPorRFCBase(results, 'RFCBASE');
        expect(res[0].clasificacion).toBe('AJENO');
        expect(res[0].rolContraparte).toBe('DESCONOCIDO');
        expect(res[0].tipoFinanciero).toBe('NO_RELACIONADO');
    });

    it('clasificarPorRFCBase - AMBIGUO', () => {
        const results = [mockResult('', 'RFC4')];
        const res = clasificarPorRFCBase(results, 'RFCBASE');
        expect(res[0].clasificacion).toBe('AMBIGUO');
    });

    it('clasificarPorRFCBase - REP as REVISIÓN', () => {
        const results = [mockResult('RFCBASE', 'RFC2', 'P')];
        const res = clasificarPorRFCBase(results, 'RFCBASE');
        expect(res[0].clasificacion).toBe('EMITIDO');
        expect(res[0].tipoFinanciero).toBe('REVISIÓN'); // Payment complements should be revision
    });

    it('change RFC base recalculates classification', () => {
        const results = [mockResult('RFC1', 'RFC2')];
        // User guesses RFC1
        let classified = clasificarPorRFCBase(results, 'RFC1');
        expect(classified[0].clasificacion).toBe('EMITIDO');
        
        // User corrects to RFC2
        classified = clasificarPorRFCBase(results, 'RFC2');
        expect(classified[0].clasificacion).toBe('RECIBIDO');
    });

});
