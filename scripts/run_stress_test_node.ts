import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from '@xmldom/xmldom';

import { exportToExcel } from '../client/src/lib/excelExporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STRESS_DIR = path.resolve(__dirname, '../stress-xmls');

// Mock browser globals
global.DOMParser = DOMParser;
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null
};
global.sessionStorage = global.localStorage;
global.fetch = async () => ({
    ok: true,
    json: async () => ({
        Estado: 'Vigente',
        EsCancelable: 'Cancelable sin aceptación',
        EstatusCancelacion: ''
    })
});


async function runNodeStressTest() {
    console.log("=== STARTING NODE ENGINE STRESS TEST ===");
    
    if (!fs.existsSync(STRESS_DIR)) {
        console.error("Stress directory not found.");
        process.exit(1);
    }
    const fileNames = fs.readdirSync(STRESS_DIR).filter(f => f.endsWith('.xml'));
    console.log(`Loading ${fileNames.length} XML files into memory...`);

    const xmlData = [];
    let loadStart = Date.now();
    for (const f of fileNames) {
        xmlData.push({
            name: f,
            content: fs.readFileSync(path.join(STRESS_DIR, f), 'utf-8')
        });
    }
    console.log(`Loaded in ${Date.now() - loadStart}ms.`);
    
    const initialMem = process.memoryUsage();
    console.log(`Initial Heap Used: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);

    console.log("=== PARSING & VALIDATING ===");
    const { useXMLValidator } = await import('../client/src/hooks/useXMLValidator');
    // useXMLValidator returns { validateXMLFiles }? No, it returns validateXMLFiles and other things.
    // Let's check useXMLValidator.ts... actually it returns an object, or just export function useXMLValidator() that returns an object... wait!
    // In `useXMLValidator.ts` line 1029 (from memory or earlier view): it returns { validateXMLFiles, isValidating, validationResults, progress }
    // Let's just destructure validateXMLFiles from the call!
    const { validateXMLFiles } = useXMLValidator();
    
    const valStart = Date.now();
    
    // We mock the files list
    const fakeFiles = xmlData.map(d => ({
        name: d.name,
        size: Buffer.byteLength(d.content, 'utf8'),
        type: 'text/xml',
        content: d.content
    }));
    
    const results = await validateXMLFiles(fakeFiles, "Empresa Stress", (curr, total) => {
        if (curr % 500 === 0) console.log(`Processed ${curr}/${total}...`);
    });
    
    const valEnd = Date.now();
    console.log(`Validation finished in ${valEnd - valStart}ms (${((valEnd - valStart) / fileNames.length).toFixed(2)}ms per file).`);

    
    const midMem = process.memoryUsage();
    console.log(`Peak Validation Heap Used: ${(midMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    
    // Check results
    const successCount = results.filter(r => r.resultado === '🟢 USABLE').length;
    const alertCount = results.filter(r => r.resultado === '🟡 ALERTA').length;
    const errCount = results.filter(r => r.resultado && r.resultado.includes('NO USABLE')).length;
    const readErr = results.filter(r => r.resultado === '🔴 ERROR LECTURA').length;
    
    console.log(`Resultados: USABLE: ${successCount}, ALERTA: ${alertCount}, RECHAZADO: ${errCount}, ERROR LECTURA: ${readErr}`);
    
    console.log("=== GENERATING EXCEL ===");
    const exportStart = Date.now();
    try {
        const outPath = path.resolve(__dirname, '../stress_test_export_node.xlsx');
        
        // This will save directly if in Node?
        exportToExcel(results, outPath);
        
        console.log(`Excel generated in ${Date.now() - exportStart}ms at ${outPath}`);
        
        const endMem = process.memoryUsage();
        console.log(`Final Heap Used: ${(endMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (err) {
        console.error("Excel generation failed:", err);
    }
}

runNodeStressTest().catch(console.error);
