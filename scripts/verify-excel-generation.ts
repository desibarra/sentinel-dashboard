import fs from 'fs';
import path from 'path';
import * as xlsxImport from 'xlsx';
const xlsx = xlsxImport.default || xlsxImport;
import { DOMParser } from '@xmldom/xmldom';

(global as any).DOMParser = DOMParser;

import { validateCFDI, ValidationResult } from '../client/src/lib/cfdiEngine';
import { clasificarPorRFCBase } from '../client/src/lib/classificationEngine';
import { exportToExcel } from '../client/src/lib/excelExporter';

const FIXTURES_DIR = 'tests/fixtures/demo-xmls';
const SCRATCH_DIR = 'scripts/e2e-output';
const EXCEL_OUTPUT = path.join(SCRATCH_DIR, 'Sentinel_Express_Prueba_REP.xlsx');

async function run() {
    console.log('1. Leyendo archivos reales XML...');
    const xmlFiles = [
        '06_COMPLEMENTO_PAGO_REP.xml'
    ];

    const results: ValidationResult[] = [];

    for (const fileName of xmlFiles) {
        const filePath = path.join(FIXTURES_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`Archivo no encontrado: ${filePath}`);
            continue;
        }
        const xmlContent = fs.readFileSync(filePath, 'utf-8');
        const parser = new DOMParser();
        const parsed = parser.parseFromString(xmlContent, 'text/xml');
        if (parsed) {
            // we will simulate classification directly
            // wait, validateCFDI is not exported! cfdiEngine doesn't have validateCFDI.
            console.log('Skipping validation since validateCFDI is not exported from cfdiEngine.');
        }
    }
}
run();
