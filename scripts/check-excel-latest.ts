import * as xlsx from 'xlsx';

const excelPath = 'scripts/e2e-output/sentinel_export_test.xlsx';

console.log(`Leyendo Excel: ${excelPath}`);
const workbook = xlsx.readFile(excelPath, { sheetRows: 15 }); // Read only first 15 rows to check headers
console.log(`Hojas (${workbook.SheetNames.length}):`, workbook.SheetNames.join(', '));

// Check DETALLE COMPLEMENTOS PAGO
const repSheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('PAGO') || n.toUpperCase().includes('REP'));
if (repSheetName) {
    console.log(`Encontrada hoja de REP: ${repSheetName}`);
    // Read the full sheet for REP to check if there are records
    const wbFull = xlsx.readFile(excelPath, { sheets: repSheetName });
    const repData = xlsx.utils.sheet_to_json(wbFull.Sheets[repSheetName], { header: 1 }) as any[];
    console.log(`Filas en hoja REP: ${repData.length}`);
} else {
    console.log(`No se encontró hoja de REP.`);
}

// Read full Auditoria Forense to check CFDI types
console.log('Leyendo hoja Auditoría Forense para conteos de Tipo_CFDI...');
const wbForense = xlsx.readFile(excelPath, { sheets: 'DETALLE FORENSE POR CFDI' });
const forenseData = xlsx.utils.sheet_to_json(wbForense.Sheets['DETALLE FORENSE POR CFDI']) as any[];
console.log(`Filas de datos en Auditoría Forense: ${forenseData.length}`);
const repCount = forenseData.filter(r => r['Tipo_CFDI'] === 'P' || r['Tipo_CFDI'] === 'Pago' || r['Tipo De Comprobante'] === 'P' || r['Tipo_De_Comprobante'] === 'P').length;
console.log(`Cantidad de comprobantes Tipo P (REP) detectados en Auditoría Forense: ${repCount}`);

// Check columns in Diagnostico_CFDI and DETALLE FORENSE POR CFDI (which is Auditoría Forense?)
const checkColumns = (sheetName: string) => {
    if (!workbook.Sheets[sheetName]) {
        console.log(`No se encontró hoja: ${sheetName}`);
        return;
    }
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[];
    let headers: string[] = [];
    
    // Si la hoja tiene encabezados visuales (como las plantillas de 9 filas), data[9] tiene los encabezados
    // Pero si se generó con json_to_sheet limpio, data[0] tiene los encabezados
    if (data.length > 9 && data[9] && data[9].includes('UUID')) {
        headers = data[9];
    } else if (data.length > 0) {
        headers = data[0];
    }
    
    console.log(`Columnas en ${sheetName}:`);
    const cols = ['Descuento_Global', 'Descuento_Conceptos', 'Diferencia_Descuento', 'Condiciones_Pago', 'CondicionesDePago'];
    cols.forEach(c => {
        console.log(`  - ${c}: ${headers.includes(c) ? 'PRESENTE' : 'AUSENTE'}`);
    });
};

checkColumns('Diagnostico_CFDI');
checkColumns('DETALLE FORENSE POR CFDI');

