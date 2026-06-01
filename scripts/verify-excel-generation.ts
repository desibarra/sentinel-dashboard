import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { parseXML } from '../client/src/lib/xmlParser';
import { validateCFDI, ValidationResult } from '../client/src/lib/cfdiEngine';
import { clasificarPorRFCBase } from '../client/src/lib/classificationEngine';
import { exportToExcel } from '../client/src/lib/excelExporter';

const FIXTURES_DIR = 'tests/fixtures/demo-xmls';
const SCRATCH_DIR = 'scripts/e2e-output';
const EXCEL_OUTPUT = path.join(SCRATCH_DIR, 'Sentinel_Express_Prueba_Local.xlsx');

async function run() {
    console.log('1. Leyendo archivos reales XML...');
    const xmlFiles = [
        '01_FACTURA_CORRECTA.xml',
        '02_ALERTA_EFOS_LISTA_NEGRA.xml',
        '03_ALERTA_FALTA_CARTA_PORTE.xml',
        '04_FACTURA_CON_CARTA_PORTE_OK.xml',
        '05_ERROR_TOTALES_DESCUADRE.xml',
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
        const parsed = parseXML(xmlContent);
        if (parsed) {
            const result = await validateCFDI(parsed, fileName, 'Servicios');
            results.push(result);
        }
    }

    console.log(`2. Archivos procesados por el motor: ${results.length}`);

    console.log('3. Clasificando por RFC Base (Módulo 2A)...');
    const rfcBase = 'LAN7008173R5'; // Example RFC
    const clasificados = clasificarPorRFCBase(results, rfcBase);

    console.log('4. Generando Excel mediante excelExporter.ts...');
    const company = { id: 'test', name: 'Empresa Test', rfc: rfcBase, giro: 'Servicios', createdAt: new Date() };
    
    // We mock window and document for the exporter since it relies on XLSX which can work in Node,
    // but exportToExcel uses DOM methods to save the file (like createElement('a')).
    // We will slightly adjust if we want to save it in Node.
    // Wait, excelExporter.ts uses XLSX.writeFile in some versions or XLSX.write and then FileSaver.
    // Let's check how exportToExcel is implemented. 
    // Usually it calls XLSX.writeFile(wb, "name.xlsx"); which works in Node!
    
    try {
        exportToExcel(clasificados, company, EXCEL_OUTPUT);
        console.log(`Excel generado con éxito en: ${EXCEL_OUTPUT}`);
    } catch (e: any) {
        // If it fails because of DOM (e.g. document is not defined), we'll do it manually
        console.warn('Error al exportar directamente (posible dependencia DOM):', e.message);
        
        // Manual export for Node
        const XLSX = xlsx;
        const wb = XLSX.utils.book_new();
        // ... we can just check the raw results ...
    }

    if (fs.existsSync(EXCEL_OUTPUT)) {
        console.log('5. Validando el contenido del Excel...');
        const workbook = xlsx.readFile(EXCEL_OUTPUT);
        console.log(`- Hojas en Excel (${workbook.SheetNames.length}):`, workbook.SheetNames.slice(0, 5).join(', ') + '...');
        
        const mainSheet = workbook.Sheets['Auditoría Forense'];
        if (!mainSheet) {
            console.error('No se encontró la hoja "Auditoría Forense"');
            return;
        }
        
        const jsonData = xlsx.utils.sheet_to_json(mainSheet, { header: 1 }) as string[][];
        if (jsonData.length > 9) {
            const headers = jsonData[9]; // Fila 10
            console.log('- Cabeceras encontradas:', headers.length);
            
            const colChecks = [
                'Descuento_Global',
                'Descuento_Conceptos',
                'Diferencia_Descuento',
                'CondicionesDePago',
                'Clasificacion_M2A',
                'RFC_Base_M2A',
                'RFC_Contraparte_M2A',
                'Rol_Contraparte_M2A',
                'Tipo_Financiero_M2A'
            ];
            
            console.log('Verificando columnas principales:');
            colChecks.forEach(c => {
                console.log(`   * ${c}: ${headers.includes(c) ? 'PRESENTE' : 'AUSENTE'}`);
            });
        }
        
        const rows = xlsx.utils.sheet_to_json(mainSheet, { range: 9 }) as any[];
        rows.forEach((r, idx) => {
            if (r.Tipo_CFDI === 'P') {
                console.log(`   -> Fila ${idx+1} [REP]: Estatus_SAT = ${r.Estatus_SAT} (Esperado: NO APLICA o no Vigente)`);
            }
            if (r.Tipo_CFDI === 'E') {
                console.log(`   -> Fila ${idx+1} [Egreso]: Accion_Recomendada = ${r.Accion_Recomendada}`);
                if (r.Accion_Recomendada && r.Accion_Recomendada.includes('MAT-06')) {
                    console.log('      ¡MAT-06 detectado correctamente!');
                }
            }
        });
        
    } else {
        console.error('El archivo Excel no se creó.');
    }
}

run();
