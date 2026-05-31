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

const demoDir = path.join('c:/Users/desib/Documents/sentinel-express/tests/fixtures/demo-xmls');
const files = fs.readdirSync(demoDir).filter(f => f.endsWith('.xml'));

const output = [];

for (const file of files) {
    const xmlContent = fs.readFileSync(path.join(demoDir, file), 'utf-8');
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    const version = detectCFDIVersion(xmlContent);
    const tipoCFDI = xmlDoc.documentElement?.getAttribute('TipoDeComprobante') || 'I';
    const total = parseFloat(xmlDoc.documentElement?.getAttribute('Total') || '0');
    
    // Extracciones
    const receptorInfo = extractReceptorInfo(xmlDoc);
    const taxes = extractTaxesByConcepto(xmlDoc, version);
    const validation = validateTotals(taxes, total);
    const cp = extractCartaPorteInfo(xmlContent, version);
    const pagos = extractPagosInfo(xmlContent, tipoCFDI, version, 2024, false, '');
    
    output.push({
        file,
        version,
        tipoCFDI,
        total,
        receptor: receptorInfo,
        taxes,
        isValid: validation.isValid,
        diferencia: validation.diferencia,
        cartaPorte: cp,
        pagos
    });
}

fs.writeFileSync('c:/Users/desib/Documents/sentinel-express/scripts/audit_results.json', JSON.stringify(output, null, 2));
console.log('Audit results generated in audit_results.json');
