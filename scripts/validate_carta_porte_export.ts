import { JSDOM } from 'jsdom';
import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import { evaluarTrazabilidad, extractCartaPorteInfo, ValidationResult } from '../client/src/lib/cfdiEngine';
import { exportToExcel } from '../client/src/lib/excelExporter';

const xlsx = (XLSX as any).default || (XLSX as any);
const parser = new (new JSDOM().window.DOMParser)();
(globalThis as any).DOMParser = new JSDOM().window.DOMParser;
const output = path.resolve('backups/codex_excel_cp_fix_sample/validacion_carta_porte_export.xlsx');
fs.mkdirSync(path.dirname(output), { recursive: true });

const xmls = [
  `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte20="http://www.sat.gob.mx/CartaPorte20" Version="4.0" TipoDeComprobante="I" Total="1000" Exportacion="01">
    <cfdi:Complemento>
      <cartaporte20:CartaPorte Version="2.0" TranspInternac="Sí" EntradaSalidaMerc="Salida" PaisOrigenDestino="USA" ViaEntradaSalida="01" TotalDistRec="500">
        <cartaporte20:Ubicaciones>
          <cartaporte20:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR000001" RFCRemitenteDestinatario="AAA010101AAA" NombreRemitenteDestinatario="ORIGEN SA" FechaHoraSalidaLlegada="2024-01-01T08:00:00" DistanciaRecorrida="500">
            <cartaporte20:Domicilio Calle="Origen" NumeroExterior="1" Colonia="001" Localidad="01" Municipio="001" Estado="GUA" Pais="MEX" CodigoPostal="37000" Referencia="Bodega"/>
          </cartaporte20:Ubicacion>
          <cartaporte20:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE000001" RFCRemitenteDestinatario="XEXX010101000" NombreRemitenteDestinatario="DESTINO INC" FechaHoraSalidaLlegada="2024-01-02T08:00:00">
            <cartaporte20:Domicilio Calle="Destino" NumeroExterior="2" Colonia="002" Localidad="02" Municipio="002" Estado="TX" Pais="USA" CodigoPostal="75001"/>
          </cartaporte20:Ubicacion>
        </cartaporte20:Ubicaciones>
        <cartaporte20:Mercancias PesoBrutoTotal="1200" UnidadPeso="KGM" NumTotalMercancias="2">
          <cartaporte20:Mercancia BienesTransp="12345678" Descripcion="Calzado" Cantidad="100" ClaveUnidad="H87" PesoEnKg="600" ValorMercancia="50000" Moneda="MXN"/>
          <cartaporte20:Mercancia BienesTransp="87654321" Descripcion="Insumos" Cantidad="50" ClaveUnidad="H87" PesoEnKg="600" ValorMercancia="20000" Moneda="MXN"/>
          <cartaporte20:Autotransporte PermSCT="TPAF01" NumPermisoSCT="PERM123">
            <cartaporte20:IdentificacionVehicular ConfigVehicular="C2" PlacaVM="ABC123" AnioModeloVM="2022"/>
            <cartaporte20:Seguros AseguraRespCivil="ASEGURA" PolizaRespCivil="POL123"/>
            <cartaporte20:Remolques><cartaporte20:Remolque SubTipoRem="CTR001" Placa="REM123"/></cartaporte20:Remolques>
          </cartaporte20:Autotransporte>
        </cartaporte20:Mercancias>
        <cartaporte20:FiguraTransporte>
          <cartaporte20:TiposFigura TipoFigura="01" RFCFigura="OPR010101AAA" NombreFigura="OPERADOR UNO" NumLicencia="LIC123"/>
        </cartaporte20:FiguraTransporte>
      </cartaporte20:CartaPorte>
    </cfdi:Complemento>
  </cfdi:Comprobante>`,
  `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte30="http://www.sat.gob.mx/CartaPorte30" Version="4.0" TipoDeComprobante="I" Total="2000">
    <cfdi:Complemento>
      <cartaporte30:CartaPorte Version="3.0" TranspInternac="No" TotalDistRec="80">
        <cartaporte30:Ubicaciones>
          <cartaporte30:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR000002"><cartaporte30:Domicilio Estado="GUA" Pais="MEX" CodigoPostal="37000"/></cartaporte30:Ubicacion>
          <cartaporte30:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE000002"><cartaporte30:Domicilio Estado="JAL" Pais="MEX" CodigoPostal="44000"/></cartaporte30:Ubicacion>
        </cartaporte30:Ubicaciones>
        <cartaporte30:Mercancias PesoBrutoTotal="10" UnidadPeso="KGM" NumTotalMercancias="1">
          <cartaporte30:Mercancia BienesTransp="11111111" Descripcion="Muestra" Cantidad="1" ClaveUnidad="H87" PesoEnKg="10"/>
          <cartaporte30:Autotransporte PermSCT="TPAF01" NumPermisoSCT="PERM456"><cartaporte30:IdentificacionVehicular PlacaVM="XYZ789"/></cartaporte30:Autotransporte>
        </cartaporte30:Mercancias>
      </cartaporte30:CartaPorte>
    </cfdi:Complemento>
  </cfdi:Comprobante>`,
  `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="4.0" TipoDeComprobante="I" Total="3000">
    <cfdi:Complemento>
      <cartaporte31:CartaPorte Version="3.1" TranspInternac="No">
        <cartaporte31:Ubicaciones>
          <cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR000003"><cartaporte31:Domicilio Estado="GUA" Pais="MEX" CodigoPostal="37000"/></cartaporte31:Ubicacion>
        </cartaporte31:Ubicaciones>
        <cartaporte31:Mercancias PesoBrutoTotal="20" UnidadPeso="KGM" NumTotalMercancias="1">
          <cartaporte31:Mercancia BienesTransp="22222222" Descripcion="Parcial" Cantidad="2" ClaveUnidad="H87" PesoEnKg="20"/>
        </cartaporte31:Mercancias>
      </cartaporte31:CartaPorte>
    </cfdi:Complemento>
  </cfdi:Comprobante>`,
  `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="I" Total="4000"/>`,
];

const results = xmls.map((xml, index) => {
  const xmlDoc = parser.parseFromString(xml, 'text/xml') as unknown as XMLDocument;
  const carta = extractCartaPorteInfo(xml, '4.0');
  const base = {
    fileName: `cp_${index + 1}.xml`,
    uuid: `UUID-CP-${index + 1}`,
    versionCFDI: '4.0',
    tipoCFDI: 'I',
    serie: 'CP',
    folio: String(index + 1),
    fechaEmision: '2024-01-01',
    horaEmision: '12:00:00',
    añoFiscal: 2024,
    estatusSAT: 'Error Conexión',
    fechaCancelacion: '',
    rfcEmisor: 'AAA010101AAA',
    nombreEmisor: 'EMISOR',
    regimenEmisor: '601',
    estadoSATEmisor: 'ACTIVO',
    rfcReceptor: 'BBB010101BBB',
    nombreReceptor: 'RECEPTOR',
    regimenReceptor: '601',
    usoCFDI: 'G03',
    cpReceptor: '37000',
    cfdiSustituido: 'NO',
    uuidSustitucion: '',
    tieneCfdiRelacionados: 'NO',
    tipoRelacion: 'NO APLICA',
    uuidRelacionado: 'NO APLICA',
    uuids_relacionados: [],
    tipoRealDocumento: 'Ingreso',
    requiereCartaPorte: 'SÍ',
    cartaPorte: carta.presente,
    cartaPorteCompleta: carta.completa,
    versionCartaPorte: carta.version,
    pagosPresente: 'NO',
    versionPagos: 'NO APLICA',
    pagosValido: 'NO APLICA',
    encodingDetectado: 'UTF-8',
    complementosDetectados: [],
    scoreInformativo: 0,
    subtotal: 1000,
    baseIVA16: 0,
    baseIVA8: 0,
    baseIVA0: index < 2 ? 1000 : 0,
    baseIVAExento: 0,
    baseNoObjeto: 0,
    baseObjetoSinDesglose: 0,
    clasificacionFiscal: 'GRAVADO',
    ivaTraslado: 0,
    ivaRetenido: 0,
    isrRetenido: 0,
    iepsTraslado: 0,
    iepsRetenido: 0,
    impuestosLocalesTrasladados: 0,
    impuestosLocalesRetenidos: 0,
    total: 1000,
    moneda: 'MXN',
    tipoCambio: 1,
    formaPago: '03',
    metodoPago: 'PUE',
    nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
    resultado: 'NO USABLE',
    comentarioFiscal: '',
    observacionesTecnicas: '',
    iva: 0,
    isValid: true,
    totalCalculado: 1000,
    diferenciaTotales: 0,
    desglosePorConcepto: [{ numero: 1, importe: 1000, descuento: 0, objetoImp: '02', claveProdServ: '78101800', descripcion: 'Flete', traslados: [], retenciones: [], subtotalAcumulado: 1000, totalParcial: 1000 }],
    desglose: '',
    esNomina: 'NO',
    versionNomina: '',
    totalPercepciones: 0,
    totalDeducciones: 0,
    totalOtrosPagos: 0,
    isrRetenidoNomina: 0,
    totalCalculadoNomina: 0,
  } as ValidationResult;
  base.rawXmlContent = xml;
  base.xmlContent = xml;
  return { ...base, trazabilidadInfo: evaluarTrazabilidad(xmlDoc, xml, base) };
});

exportToExcel(results, output);

const workbook = xlsx.readFile(output);
const rows = (name: string) => xlsx.utils.sheet_to_json(workbook.Sheets[name] || {}, { defval: '' }) as any[];
const diagnostico = rows('Diagnostico_CFDI');
const anexo = rows('ANEXO DATOS FALTANTES');
const matriz = rows('MATRIZ DE RASTREABILIDAD');
const detalle = rows('DETALLE CARTA PORTE MERCANCIAS');
const auditoriaTasa0 = rows('AUDITORIA IVA TASA 0%');
const count = (data: any[], predicate: (row: any) => boolean) => data.filter(predicate).length;
const allCells = workbook.SheetNames.flatMap((name: string) =>
  Object.keys(workbook.Sheets[name])
    .filter(key => !key.startsWith('!'))
    .map(key => String(workbook.Sheets[name][key]?.v ?? ''))
);

const conteos = {
  'XML con Carta Porte detectada': count(diagnostico, row => row.Carta_Porte_Presente === 'SÍ'),
  'XML con origen extraído': count(diagnostico, row => row.Origen_IDUbicacion && row.Origen_IDUbicacion !== 'NO VIENE EN XML'),
  'XML con destino extraído': count(diagnostico, row => row.Destino_IDUbicacion && row.Destino_IDUbicacion !== 'NO VIENE EN XML'),
  'XML con placas extraídas': count(diagnostico, row => row.Placa_VM && row.Placa_VM !== 'NO VIENE EN XML'),
  'XML con mercancías extraídas': new Set(detalle.map(row => row.UUID)).size,
  'XML con operador extraído': count(diagnostico, row => row.RFC_Figura && row.RFC_Figura !== 'NO VIENE EN XML'),
  'XML con distancia extraída': count(diagnostico, row => row.Total_Distancia_Recorrida && row.Total_Distancia_Recorrida !== 'NO VIENE EN XML'),
  'XML con Carta Porte pero datos incompletos': count(anexo, row => row.Tiene_Carta_Porte === 'SÍ' && /Falta origen|Falta destino|Falta placas|Falta mercancías|Falta operador|Falta distancia/.test(row.Datos_Faltantes)),
  'Filas detalle mercancías': detalle.length,
  'Matriz con Ruta_Resumen': count(matriz, row => row.Ruta_Resumen && row.Ruta_Resumen !== 'NO VIENE EN XML'),
  'Estatus_SAT = ESTATUS SAT NO CONFIRMADO': count(diagnostico, row => row.Estatus_SAT === 'ESTATUS SAT NO CONFIRMADO'),
  'Resultado_Validacion_SAT = FALLA TECNICA DE CONSULTA': count(diagnostico, row => row.Resultado_Validacion_SAT === 'FALLA TECNICA DE CONSULTA'),
  'AUDITORIA IVA TASA 0% filas': auditoriaTasa0.length,
  'AUDITORIA IVA TASA 0% con clasificación': count(auditoriaTasa0, row => row.Clasificacion_Sugerida_IVA && row.Clasificacion_Sugerida_IVA !== 'NO APLICA'),
};

console.log(JSON.stringify({ output, conteos }, null, 2));
