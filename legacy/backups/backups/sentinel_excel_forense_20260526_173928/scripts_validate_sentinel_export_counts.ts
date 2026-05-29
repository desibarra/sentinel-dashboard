import * as XLSX from 'xlsx';
import path from 'node:path';
import { exportToExcel } from '../client/src/lib/excelExporter';

const xlsx = (XLSX as any).default || (XLSX as any);
const output = path.resolve('backups/sentinel_express_auditoria_real_20260526/validacion_conteos_exportador.xlsx');
const cpVariants = ['SÍ', 'SI', 'sí', 'S?', true, 'true', '1'];

const results = Array.from({ length: 364 }, (_, i) => ({
  fileName: `XML_${String(i + 1).padStart(3, '0')}.xml`,
  uuid: `UUID-${String(i + 1).padStart(3, '0')}`,
  versionCFDI: '4.0',
  tipoCFDI: 'I',
  serie: 'A',
  folio: String(i + 1),
  fechaEmision: '2024-01-01',
  horaEmision: '12:00:00',
  estatusSAT: 'Error Conexión',
  fechaCancelacion: '',
  cfdiSustituido: 'NO',
  uuidSustitucion: '',
  rfcEmisor: 'AAA010101AAA',
  nombreEmisor: 'EMISOR PRUEBA',
  regimenEmisor: '601',
  estadoSATEmisor: 'ACTIVO',
  rfcReceptor: 'BBB010101BBB',
  nombreReceptor: 'RECEPTOR PRUEBA',
  regimenReceptor: '601',
  usoCFDI: 'G03',
  cpReceptor: '64000',
  esNomina: 'NO',
  versionNomina: '',
  requiereCartaPorte: i < 258 ? 'SÍ' : 'NO',
  cartaPorte: i < 258 ? cpVariants[i % cpVariants.length] : 'NO',
  cartaPorteCompleta: i < 258 ? 'SÍ' : 'NO',
  versionCartaPorte: i < 258 ? '3.1' : 'NO APLICA',
  subtotal: 1000,
  totalPercepciones: 0,
  totalDeducciones: 0,
  totalOtrosPagos: 0,
  isrRetenidoNomina: 0,
  desglosePorConcepto: [{ descripcion: 'SERVICIO PRUEBA', objetoImp: '02' }],
  clasificacionFiscal: 'GRAVADO',
  baseNoObjeto: 0,
  baseObjetoSinDesglose: 0,
  baseIVA16: i < 144 ? 0 : 1000,
  baseIVA8: 0,
  baseIVA0: i < 144 ? 1000 : 0,
  baseIVAExento: 0,
  ivaTraslado: i < 144 ? 0 : 160,
  ivaRetenido: 0,
  isrRetenido: 0,
  iepsTraslado: 0,
  iepsRetenido: 0,
  impuestosLocalesTrasladados: 0,
  impuestosLocalesRetenidos: 0,
  totalCalculadoNomina: 0,
  totalCalculado: i < 144 ? 1000 : 1160,
  total: i < 144 ? 1000 : 1160,
  diferenciaTotales: 0,
  moneda: 'MXN',
  tipoCambio: 1,
  formaPago: '03',
  metodoPago: 'PUE',
  nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
  resultado: 'NO USABLE',
  comentarioFiscal: '',
  observacionesTecnicas: '',
  observacionesContador: '',
  giroEmpresa: 'NO DEFINIDO',
  uuids_relacionados: [],
}) as any);

exportToExcel(results, output);

const workbook = xlsx.readFile(output);
const rows = (name: string) => xlsx.utils.sheet_to_json(workbook.Sheets[name] || {}, { defval: '' }) as any[];
const count = (data: any[], predicate: (row: any) => boolean) => data.filter(predicate).length;

const diagnostico = rows('Diagnostico_CFDI');
const anexo = rows('ANEXO DATOS FALTANTES');
const tasa0 = rows('CEDULA TASA 0%');
const matriz = rows('MATRIZ DE RASTREABILIDAD');

const conteos = {
  'Estatus_SAT = Error Conexión': count(diagnostico, row => row.Estatus_SAT === 'Error Conexión'),
  'Estatus_SAT = ESTATUS SAT NO CONFIRMADO': count(diagnostico, row => row.Estatus_SAT === 'ESTATUS SAT NO CONFIRMADO'),
  'Resultado_Validacion_SAT = FALLA TECNICA DE CONSULTA': count(diagnostico, row => row.Resultado_Validacion_SAT === 'FALLA TECNICA DE CONSULTA'),
  'Accion_Recomendada_SAT distinta de Ninguna': count(diagnostico, row => row.Accion_Recomendada_SAT && row.Accion_Recomendada_SAT !== 'Ninguna'),
  'Carta_Porte_Presente = SÍ en Diagnostico_CFDI': count(diagnostico, row => row.Carta_Porte_Presente === 'SÍ'),
  'Tiene_Carta_Porte = SÍ en ANEXO DATOS FALTANTES': count(anexo, row => row.Tiene_Carta_Porte === 'SÍ'),
  'Diagnostico_Tasa_0 distinto de NO APLICA': count(tasa0, row => row.Diagnostico_Tasa_0 && row.Diagnostico_Tasa_0 !== 'NO APLICA'),
  'Acción_Recomendada en CEDULA TASA 0% distinta de NO APLICA': count(tasa0, row => row.Accion_Recomendada && row.Accion_Recomendada !== 'NO APLICA'),
  'Datos_Faltantes distinto de NO APLICA': count(anexo, row => row.Datos_Faltantes && row.Datos_Faltantes !== 'NO APLICA'),
  'Nivel_De_Expediente distinto de NO APLICA': count(matriz, row => row.Nivel_De_Expediente && row.Nivel_De_Expediente !== 'NO APLICA'),
};

console.log(JSON.stringify({ output, conteos }, null, 2));
