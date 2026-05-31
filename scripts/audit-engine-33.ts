import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM();
const parser = new dom.window.DOMParser();

import {
    detectCFDIVersion,
    extractReceptorInfo,
    extractTaxesByConcepto,
    validateTotals,
    extractCartaPorteInfo,
    extractPagosInfo,
    evaluarTrazabilidad,
    ValidationResult
} from '../client/src/lib/cfdiEngine';

const file = 'test-cfdi-ejemplo.xml';
const xmlContent = fs.readFileSync(path.join('c:/Users/desib/Documents/sentinel-express/tests/fixtures', file), 'utf-8');
const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

const version = detectCFDIVersion(xmlContent);
const tipoCFDI = xmlDoc.documentElement?.getAttribute('TipoDeComprobante') || 'I';
const total = parseFloat(xmlDoc.documentElement?.getAttribute('Total') || '0');

// Extracciones
const receptorInfo = extractReceptorInfo(xmlDoc);
const taxes = extractTaxesByConcepto(xmlDoc, version);
const validation = validateTotals(taxes, total);

const output = {
    file,
    version,
    tipoCFDI,
    total,
    receptor: receptorInfo,
    taxes,
    isValid: validation.isValid,
    diferencia: validation.diferencia,
};

fs.writeFileSync('c:/Users/desib/Documents/sentinel-express/scripts/audit_results_33.json', JSON.stringify(output, null, 2));
console.log('Audit results 3.3 generated');
