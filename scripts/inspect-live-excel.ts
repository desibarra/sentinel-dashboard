import * as XLSX from 'xlsx';
import * as path from 'path';

const excelPath = 'dev-outputs/sentinel_live_5xmls_test.xlsx';
console.log(`Leyendo Excel real: ${excelPath}`);

const xlsxInstance = (XLSX as any).readFile ? XLSX : (XLSX as any).default;
const workbook = xlsxInstance.readFile(excelPath);
console.log(`\nHojas del libro (${workbook.SheetNames.length}):`, workbook.SheetNames.join(', '));

if (workbook.SheetNames[0] !== 'Resumen') {
  console.error("ERROR: La primera hoja no es 'Resumen'!");
} else {
  console.log("SUCCESS: La hoja 'Resumen' es la primera hoja.");
}

const wsResumen = workbook.Sheets['Resumen'];
const dataResumen = xlsxInstance.utils.sheet_to_json(wsResumen) as any[];
console.log(`\n=== HOJA RESUMEN ===`);
console.table(dataResumen);

const wsDiagnostico = workbook.Sheets['Diagnostico_CFDI'];
if (!wsDiagnostico) {
  console.error("ERROR: No se encontró la hoja Diagnostico_CFDI");
  process.exit(1);
}

const dataDiagnostico = xlsxInstance.utils.sheet_to_json(wsDiagnostico) as any[];
console.log(`\n=== REGISTROS EN DIAGNOSTICO_CFDI (${dataDiagnostico.length} filas) ===`);
dataDiagnostico.forEach((row: any, idx: number) => {
  console.log(`\nFila ${idx + 1}:`);
  console.log(`  - Archivo_XML: ${row['Archivo_XML']}`);
  console.log(`  - UUID: ${row['UUID']}`);
  console.log(`  - Tipo_CFDI: ${row['Tipo_CFDI']}`);
  console.log(`  - Metodo_Pago: ${row['Metodo_Pago']}`);
  console.log(`  - Fiscal_Risk_Level: ${row['Fiscal_Risk_Level']}`);
  console.log(`  - Fiscal_Risk_Reason: ${row['Fiscal_Risk_Reason']}`);
  console.log(`  - Payment_Method_Status: ${row['Payment_Method_Status']}`);
  console.log(`  - Payment_Complement_Status: ${row['Payment_Complement_Status']}`);
  console.log(`  - IVA_Creditability_Status: ${row['IVA_Creditability_Status']}`);
  console.log(`  - IVA_Trasladado: ${row['IVA_Trasladado']}`);
});

const dataRaw = xlsxInstance.utils.sheet_to_json(wsDiagnostico, { header: 1 }) as any[];
const headers = dataRaw[0];
console.log(`\n=== LAYOUT Y COLUMNAS DE DIAGNOSTICO_CFDI ===`);
console.log(`Total columnas: ${headers.length}`);
console.log(`Las últimas 8 columnas son:`);
headers.slice(-8).forEach((h: any, i: number) => {
  console.log(`  Columna ${headers.length - 8 + i + 1}: ${h}`);
});
