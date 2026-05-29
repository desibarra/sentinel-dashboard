import xlsx from 'xlsx';

const wb = xlsx.readFile('C:\\\\Users\\\\desib\\\\Documents\\\\sentinel-express\\\\backups\\\\sentinel_express_auditoria_real_20260526\\\\validacion_conteos_exportador.xlsx');

let errs = [];

// Check encoding
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(ws);
  for (const row of json) {
    const str = JSON.stringify(row);
    if (str.includes('documentaciA³n')) errs.push('Found documentaciA³n in ' + sheetName);
    if (str.includes('devoluciA³n')) errs.push('Found devoluciA³n in ' + sheetName);
    if (str.includes('SÃ ')) errs.push('Found SÃ  in ' + sheetName);
    if (str.includes('SÃ')) errs.push('Found SÃ in ' + sheetName);
  }
}

// Alertas duplicadas
const wsAlertas = wb.Sheets['ALERTAS FORENSES'];
if (wsAlertas) {
  const alertas = xlsx.utils.sheet_to_json(wsAlertas);
  const map = {};
  for (const row of alertas) {
    const key = `${row.UUID}-${row.Regla}-${row.Tipo_Alerta}`;
    if (map[key]) errs.push('Duplicate alert: ' + key);
    map[key] = true;
  }
}

// Datos Faltantes
const wsFaltantes = wb.Sheets['ANEXO DATOS FALTANTES'];
if (wsFaltantes) {
  const faltantes = xlsx.utils.sheet_to_json(wsFaltantes);
  for (const row of faltantes) {
    if (row.Datos_Faltantes && row.Datos_Faltantes.includes('Fuente externa')) {
       errs.push('Fuente externa in Datos Faltantes: ' + row.UUID);
    }
    if (row.Datos_Faltantes && row.Datos_Faltantes !== 'Sin faltantes crÃ\u00ADticos' && row.Datos_Faltantes !== 'Sin faltantes criticos') {
       const parts = row.Datos_Faltantes.split(' | ');
       const uniqueParts = new Set(parts);
       if (parts.length !== uniqueParts.size) {
         errs.push('Duplicate in Datos Faltantes: ' + row.Datos_Faltantes);
       }
    }
  }
}

// Version CP
const wsCP = wb.Sheets['DETALLE CARTA PORTE MERCANCIAS'];
if (wsCP) {
  const cps = xlsx.utils.sheet_to_json(wsCP);
  for (const row of cps) {
    if (String(row.Version_Carta_Porte) === '4.0') {
      errs.push('Version_Carta_Porte 4.0 found: ' + row.UUID);
    }
  }
}

console.log('Errors (' + errs.length + '):', errs);
if (errs.length === 0) console.log('All validations passed successfully!');
