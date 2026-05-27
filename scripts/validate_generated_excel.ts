import * as XLSX from 'xlsx';
import path from 'node:path';

const xlsx = (XLSX as any).default || (XLSX as any);
const input = process.argv[2];

if (!input) {
  console.error('Uso: npx tsx scripts/validate_generated_excel.ts <archivo.xlsx>');
  process.exit(1);
}

const workbook = xlsx.readFile(path.resolve(input));
const rows = (sheetName: string) =>
  xlsx.utils.sheet_to_json(workbook.Sheets[sheetName] || {}, { defval: '' }) as Record<string, any>[];

const diagnostico = rows('Diagnostico_CFDI');
const ubicaciones = rows('DETALLE CP UBICACIONES');
const mercancias = rows('DETALLE CARTA PORTE MERCANCIAS');
const figuras = rows('DETALLE CARTA PORTE FIGURAS');
const matriz = rows('MATRIZ DE RASTREABILIDAD');

const allCells = workbook.SheetNames.flatMap((sheetName: string) => {
  const sheet = workbook.Sheets[sheetName];
  return Object.keys(sheet)
    .filter(key => !key.startsWith('!'))
    .map(key => String(sheet[key]?.v ?? ''));
});

const count = <T>(data: T[], predicate: (row: T) => boolean) => data.filter(predicate).length;
const hasValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return Boolean(text && text !== 'NO VIENE EN XML' && text !== 'NO APLICA' && text !== 'SIN REGISTROS');
};
const satNoConfirmado = (row: Record<string, any>) =>
  /NO CONFIRMADO|FALLA/i.test(`${row.Estatus_SAT || row.Estatus_CFDI || ''} ${row.Resultado_Validacion_SAT || ''}`);

const criticalColumns = [
  'UUID',
  'Archivo_XML',
  'Version_CFDI',
  'Estatus_SAT',
  'Resultado_Validacion_SAT',
  'Carta_Porte_Presente',
  'Version_Carta_Porte',
];

const conteos = {
  'Total XML procesados': diagnostico.length,
  'Total XML con Carta Porte': count(diagnostico, row => row.Carta_Porte_Presente === 'SI' || row.Tiene_Carta_Porte === 'SI'),
  'Total Version_Carta_Porte = 4.0': count(diagnostico, row => String(row.Version_Carta_Porte) === '4.0'),
  'Total ubicaciones extraidas': count(ubicaciones, row => hasValue(row.IDUbicacion) || hasValue(row.RFCRemitenteDestinatario) || hasValue(row.CodigoPostal)),
  'Total mercancias extraidas': count(mercancias, row => hasValue(row.Descripcion_Mercancia) || hasValue(row.BienesTransp)),
  'Total operadores extraidos': count(figuras, row => hasValue(row.RFCFigura) || hasValue(row.NombreFigura) || hasValue(row.NumLicencia)),
  'Total celdas con SÃ': count(allCells, cell => cell.includes('SÃ')),
  'Total celdas con SÍ': count(allCells, cell => cell.includes('SÍ')),
  'Total celdas criticas vacias': diagnostico.reduce((sum, row) => {
    return sum + criticalColumns.filter(column => String(row[column] ?? '').trim() === '').length;
  }, 0),
  'Total registros SAT no confirmado': count(diagnostico, satNoConfirmado),
  'Total registros que digan Valido a nivel SAT cuando SAT no fue confirmado': count(matriz, row =>
    /Valido a nivel SAT|V[aá]lido a nivel SAT/i.test(String(row.Estatus_Documental || row.Diagnostico || '')) && satNoConfirmado(row)
  ),
};

console.log(JSON.stringify({ archivo: path.resolve(input), conteos }, null, 2));
