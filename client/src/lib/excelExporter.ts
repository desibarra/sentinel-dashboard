import * as XLSX from 'xlsx';
import { ValidationResult, contarEstatusSAT, reconciliarPagosPPD } from '@/lib/cfdiEngine';
import { sentinelStageLog } from '@/lib/stageLog';

// ─────────────────────────────────────────────────────────────────────────
// P0-A: Blindaje de exportación — límites reales de Excel y saneamiento
// de celdas. Ningún objeto/array/nodo XML/proxy debe llegar a SheetJS: todo
// pasa por sanitizeCellValue() y se escribe con aoa_to_sheet (matrices de
// primitivos + encabezados explícitos), nunca con json_to_sheet directo
// sobre datos no verificados.
// ─────────────────────────────────────────────────────────────────────────
const EXCEL_MAX_ROWS_TOTAL = 1048576; // límite real de Excel (incluye encabezado)
const EXCEL_MAX_DATA_ROWS = EXCEL_MAX_ROWS_TOTAL - 1;
const EXCEL_MAX_COLS = 16384; // límite real de Excel
const EXCEL_MAX_CELL_CHARS = 32767; // límite real de Excel por celda

type PlainRow = Record<string, any>;
export type ExportProgressStage = 'building' | 'done' | 'error';
export interface ExportProgressEvent {
  sheet: string;
  stage: ExportProgressStage;
  sheetIndex: number;
  totalSheets: number;
  error?: string;
  affectedRows?: number;
  // Exportación de lotes grandes (paquete de varios archivos): además del
  // progreso de hoja dentro de un archivo, informa en cuál archivo del
  // paquete va la exportación. Ausentes en el modo de archivo único (no
  // cambia el contrato existente para lotes pequeños/medianos).
  fileIndex?: number;
  fileTotal?: number;
  fileName?: string;
}
export type ExportProgressCallback = (event: ExportProgressEvent) => void;

// Exportación cancelable (instrucción 7/8): un token mutable simple — más
// fácil de controlar en pruebas que un AbortController real — que Dashboard
// marca en `cancelled = true` cuando el usuario cancela. Se revisa entre
// archivo y entre hoja; cancelar NUNCA borra los archivos ya descargados ni
// la sesión guardada.
export interface ExportCancelToken { cancelled: boolean }

// ─────────────────────────────────────────────────────────────────────────
// Reportes parciales (requisito 3 de la revisión): si una hoja falla, el
// archivo nunca debe presentarse como un reporte completo sin más. Se
// registra cada falla con su alcance, y si una hoja FISCAL CRÍTICA falla, el
// archivo final se recorta a un reporte de diagnóstico (no se entrega el
// reporte completo con esa omisión oculta entre 24 hojas).
// ─────────────────────────────────────────────────────────────────────────
const CRITICAL_SHEETS = new Set([
  'Resumen',
  'Diagnostico_CFDI',
  'CEDULA INGRESOS SAT',
  'CEDULA IVA TRASLADADO',
  'CEDULA IVA ACREDITABLE',
  'CEDULA NO CLASIFICADOS',
]);

export interface ExportSheetFailure {
  sheet: string;
  error: string;
  affectedRows: number | 'N/D';
  critical: boolean;
}
export type ExportStatus = 'complete' | 'partial' | 'critical_failure' | 'cancelled';
export interface ExportStatusInfo {
  status: ExportStatus;
  failures: ExportSheetFailure[];
  // Presentes SOLO en modo paquete multi-archivo (lotes grandes). Ausentes
  // (undefined) en el modo de archivo único — Dashboard.tsx distingue los
  // dos modos por la presencia de `isMultiFile`.
  isMultiFile?: boolean;
  filesWritten?: string[];
  totalFiles?: number;
  failedAtFile?: number;
  // true si se usó File System Access API (escritura con confirmación real).
  // false/ausente si se usó el mecanismo de descarga de navegador — en ese
  // caso `filesWritten` es la lista de archivos ENVIADOS al navegador para
  // descargar, no una confirmación de que se guardaron: el navegador puede
  // bloquear descargas múltiples sin que JavaScript se entere.
  writesConfirmed?: boolean;
  reconciliacion?: {
    totalProcesados: number;
    uuidExportados: number;
    erroresLectura: number;
    duplicadosControlados: number;
    cuadra: boolean; // totalProcesados === uuidExportados + erroresLectura + duplicadosControlados
  };
}

// Convierte cualquier valor a un primitivo seguro para una celda de Excel.
// Objetos/arrays/nodos DOM/proxies nunca se entregan tal cual a SheetJS:
// se serializan de forma explícita y visible, nunca se pierden en silencio.
const sanitizeCellValue = (value: unknown): string | number | boolean | Date | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value;
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (Array.isArray(value)) {
    str = value.map(v => (v === null || v === undefined ? '' : String(v))).join(' | ');
  } else if (typeof value === 'object') {
    try { str = JSON.stringify(value); } catch { str = String(value); }
  } else {
    str = String(value);
  }
  if (str.length > EXCEL_MAX_CELL_CHARS) {
    const suffix = ` …[TRUNCADO — ${str.length} caracteres originales]`;
    const cut = Math.max(0, EXCEL_MAX_CELL_CHARS - suffix.length);
    str = str.slice(0, cut) + suffix;
  }
  return str;
};

// Encabezados: se toman de la primera fila (mismo criterio que usaba json_to_sheet
// por defecto) y se completan con cualquier clave adicional vista en filas
// posteriores, para no perder columnas silenciosamente si una fila trae más
// campos que la primera.
const collectHeaders = (rows: PlainRow[]): string[] => {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const seen = new Set(headers);
  for (let i = 1; i < rows.length; i++) {
    const keys = Object.keys(rows[i]);
    for (const k of keys) {
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
  }
  if (headers.length > EXCEL_MAX_COLS) {
    const kept = headers.slice(0, EXCEL_MAX_COLS - 1);
    kept.push('MAS_COLUMNAS_TRUNCADAS');
    return kept;
  }
  return headers;
};

const rowsToAOA = (rows: PlainRow[], headers: string[]): any[][] => {
  const aoa: any[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map(h => (h === 'MAS_COLUMNAS_TRUNCADAS' ? 'SI' : sanitizeCellValue(row[h]))));
  }
  return aoa;
};

const safeSheetName = (name: string): string => {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned || 'Hoja').slice(0, 31);
};

const uniqueSheetName = (wb: any, name: string): string => {
  const base = safeSheetName(name);
  if (!wb.SheetNames?.includes(base)) return base;
  let i = 2;
  let candidate = `${base.slice(0, 28)}_${i}`;
  while (wb.SheetNames?.includes(candidate)) {
    i++;
    candidate = `${base.slice(0, 28)}_${i}`;
  }
  return candidate;
};

interface SheetChunk { ws: any; name: string; rows: PlainRow[]; index: number; total: number }

// Construye una o varias hojas (según el límite de 1,048,576 filas de Excel)
// a partir de datos ya saneados. Nunca recibe objetos/nodos crudos: todo
// pasa por rowsToAOA/sanitizeCellValue antes de tocar aoa_to_sheet.
// Nota: un arreglo vacío produce una hoja vacía (mismo comportamiento que el
// json_to_sheet([]) original) — el llamador decide si quiere un placeholder
// "SIN REGISTROS" (algunas cédulas, como CEDULA NO CLASIFICADOS, esperan
// legítimamente 0 filas cuando no hay registros de ese tipo en el lote).
const buildSafeSheets = (data: PlainRow[], baseName: string, origin?: string): SheetChunk[] => {
  const safeData = data || [];
  const headers = collectHeaders(safeData);
  const chunkCount = Math.max(1, Math.ceil(safeData.length / EXCEL_MAX_DATA_ROWS));
  const chunks: SheetChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const rows = safeData.slice(i * EXCEL_MAX_DATA_ROWS, (i + 1) * EXCEL_MAX_DATA_ROWS);
    const aoa = rowsToAOA(rows, headers);
    const ws = (XLSX as any).utils.aoa_to_sheet(aoa, origin ? { origin } : undefined);
    const name = chunkCount > 1 ? `${baseName}_${i + 1}` : baseName;
    chunks.push({ ws, name, rows, index: i, total: chunkCount });
  }
  return chunks;
};

const appendSheetChunks = (wb: any, chunks: SheetChunk[]) => {
  for (const c of chunks) {
    (XLSX as any).utils.book_append_sheet(wb, c.ws, uniqueSheetName(wb, c.name));
  }
};

// Variante de buildSafeSheets para hojas con una fila de título en A1 y los
// datos a partir de A2 (patrón usado por las cédulas de IVA). El título se
// repite en cada fragmento si la hoja llega a dividirse.
const buildTitledSheetChunks = (data: PlainRow[], baseName: string, title: string): SheetChunk[] => {
  const chunks = buildSafeSheets(data, baseName, 'A2');
  for (const c of chunks) {
    (XLSX as any).utils.sheet_add_aoa(c.ws, [[title]], { origin: 'A1' });
  }
  return chunks;
};

const SAT_RETRY_ACTION = 'Reintentar validación SAT';
const SAT_FAILURE_PATTERN = /(error|conexión|timeout|failed|network|sat\s+no\s+respondió|no\s+respondió|cors|no\s+confirmado|no\s+verificado)/i;

const normalizeSiNo = (value: unknown): 'SI' | 'NO' => {
  if (value === true) return 'SI';
  if (value === false || value === null || value === undefined) return 'NO';
  const normalized = String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return ['SI', 'TRUE', '1'].includes(normalized) ? 'SI' : 'NO';
};

const normalizeI18nSiNo = (value: unknown): string => {
  const str = String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (str === 'SI' || str === 'SÍ') return 'SI';
  if (str === 'NO') return 'NO';
  return str === '' || str === 'NO VIENE EN XML' ? 'NO VIENE EN XML' : str;
};

const isSatTechnicalFailure = (value: unknown) => SAT_FAILURE_PATTERN.test(String(value ?? ''));

// Columnas de dirección del CFDI (corrección de espejos contables) reutilizables
// en todas las hojas que usan getSatExportFields.
const direccionFields = (r: ValidationResult) => ({
  Direccion_CFDI: r.direccionCFDI || 'REQUIERE_REVISION',
  RFC_Empresa_Evaluada: r.rfcEmpresaEvaluada || '',
  Naturaleza_Para_Empresa: r.naturalezaParaEmpresa || 'N/A',
  Impacto_IVA: r.impactoIVA || 'N/A',
  Motivo_Clasificacion: r.motivoClasificacion || 'N/A',
});

export const getSatExportFields = (r: ValidationResult) => {
  const rawStatus = r.trazabilidadInfo?.observacionSAT || r.estatusSAT || '';
  const statusNorm = String(rawStatus || '').trim();

  // ✅ CORRECCIÓN DE CONTRADICCIÓN: un CFDI cancelado NUNCA debe reportarse como
  // "VALIDACION OK". Falla técnica o estatus no confirmado => NO VALIDADO SAT.
  if (isSatTechnicalFailure(statusNorm) || !statusNorm) {
    return {
      Estatus_SAT: statusNorm || 'ESTATUS SAT NO CONFIRMADO',
      Resultado_Validacion_SAT: 'NO VALIDADO SAT',
      Accion_Recomendada_SAT: SAT_RETRY_ACTION,
      ...direccionFields(r),
    };
  }

  if (statusNorm === 'Cancelado') {
    return {
      Estatus_SAT: 'Cancelado',
      Resultado_Validacion_SAT: 'CANCELADO',
      Accion_Recomendada_SAT: 'CANCELAR EFECTOS FISCALES / NO UTILIZAR',
      ...direccionFields(r),
    };
  }

  if (statusNorm === 'Vigente') {
    return {
      Estatus_SAT: 'Vigente',
      Resultado_Validacion_SAT: 'VIGENTE',
      Accion_Recomendada_SAT: 'SIN ACCION (VIGENTE)',
      ...direccionFields(r),
    };
  }

  // REP (Tipo P): excluido por diseño de la consulta SAT (Total=0.00) — NO es
  // un fallo ni un estatus pendiente. Nunca debe leerse como "NO VALIDADO SAT".
  if (statusNorm === 'No Aplica (REP)') {
    return {
      Estatus_SAT: 'NO APLICA — REP',
      Resultado_Validacion_SAT: 'EXCLUIDO DE CONSULTA SAT',
      Accion_Recomendada_SAT: 'NINGUNA (excluido por diseño; validar por estructura/relación/69-B)',
      ...direccionFields(r),
    };
  }

  if (statusNorm === 'No Encontrado') {
    return {
      Estatus_SAT: 'No Encontrado',
      Resultado_Validacion_SAT: 'NO VALIDADO SAT',
      Accion_Recomendada_SAT: 'REINTENTAR CONSULTA SAT',
      ...direccionFields(r),
    };
  }

  // Error Conexión u otro estatus no conclusivo
  return {
    Estatus_SAT: statusNorm,
    Resultado_Validacion_SAT: 'NO VALIDADO SAT',
    Accion_Recomendada_SAT: SAT_RETRY_ACTION,
    ...direccionFields(r),
  };
};

const getCartaPortePresente = (r: ValidationResult) => {
  const diagnostico = normalizeSiNo(r.cartaPorte);
  const detail = cp(r);
  
  const tieneVersionReal = detail && detail.version && !['NO VIENE EN XML', 'NO APLICA'].includes(detail.version);
  const tieneEvidencia = detail && (
    (detail.origenes && detail.origenes.length > 0) || 
    (detail.destinos && detail.destinos.length > 0) || 
    (detail.mercancias && detail.mercancias.length > 0) || 
    (detail.autotransporte !== null) ||
    (detail.figuras && detail.figuras.length > 0)
  );

  return (diagnostico === 'SI' || tieneVersionReal || tieneEvidencia) ? 'SI' : 'NO';
};

const hasValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return Boolean(text && text !== 'NO' && text !== 'No' && text !== 'NO APLICA' && text !== 'NO VIENE EN XML');
};

const cp = (r: ValidationResult) => r?.trazabilidadInfo?.cartaPorteDetalle ?? null;

const joinClean = (...values: unknown[]) =>
  values.map(value => String(value ?? '').trim()).filter(hasValue).join(' | ') || 'NO VIENE EN XML';

const formatAddress = (ubicacion: any) =>
  joinClean(
    ubicacion?.calle,
    ubicacion?.numeroExterior,
    ubicacion?.numeroInterior,
    ubicacion?.colonia,
    ubicacion?.localidad,
    ubicacion?.municipio,
    ubicacion?.estado,
    ubicacion?.pais,
    ubicacion?.codigoPostal,
    ubicacion?.referencia
  );

const routeSummary = (r: ValidationResult) => {
  const mainOrigen = cp(r)?.origenes?.[0];
  const mainDestino = cp(r)?.destinos?.[0];
  const origen = joinClean(mainOrigen?.municipio, mainOrigen?.estado, mainOrigen?.pais);
  const destino = joinClean(mainDestino?.municipio, mainDestino?.estado, mainDestino?.pais);
  if (!hasValue(origen) && !hasValue(destino)) return 'NO VIENE EN XML';
  return `${origen} -> ${destino}`;
};

const isZeroRate = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text === '0' || text === '0.0' || text === '0.00' || text === '0.000000' || Number(text) === 0;
};

const tasa0Traslados = (concepto: any) =>
  concepto?.traslados?.filter((t: any) => t.impuesto === '002' && isZeroRate(t.tasa)) || [];

const isTasa0Concept = (concepto: any) =>
  tasa0Traslados(concepto).length > 0 || (concepto?.objetoImp === '02' && tasa0Traslados(concepto).length > 0);

const getTasa0Base = (concepto: any) => {
  const baseTraslado = tasa0Traslados(concepto).reduce((sum: number, t: any) => sum + Number(t.base || 0), 0);
  if (baseTraslado > 0) return baseTraslado;
  const neto = Number(concepto?.importe || 0) - Number(concepto?.descuento || 0);
  return neto > 0 ? neto : Number(concepto?.importe || 0);
};

const getTasa0Iva = (concepto: any) => {
  return tasa0Traslados(concepto).reduce((sum: number, t: any) => sum + Number(t.importe || 0), 0);
};

const getTasa0Detection = (r: ValidationResult, concepto: any) => {
  const traslados = tasa0Traslados(concepto);
  const hasExplicitBase = traslados.some((t: any) => Number(t.base || 0) > 0);
  if (concepto?.__metodoDeteccionTasa0 === 'BASE_IVA_0') {
    return { metodo: 'BASE_IVA_0', observacion: 'Base tomada de r.baseIVA0' };
  }
  if (concepto?.__metodoDeteccionTasa0 === 'CLASIFICACION_FISCAL') {
    return { metodo: 'CLASIFICACION_FISCAL', observacion: 'Base estimada con importe del concepto por falta de base explícita' };
  }
  if (hasExplicitBase && concepto?.objetoImp === '02') {
    return { metodo: 'OBJETOIMP_02_TASA_0', observacion: 'Base detectada desde traslado IVA tasa 0' };
  }
  if (hasExplicitBase) {
    return { metodo: 'TRASLADO_TASA_0', observacion: 'Base detectada desde traslado IVA tasa 0' };
  }
  if (traslados.length > 0 || concepto?.objetoImp === '02' || r.clasificacionFiscal === 'TASA_0') {
    return { metodo: 'FALLBACK_IMPORTE_CONCEPTO', observacion: 'Base estimada con importe del concepto por falta de base explícita' };
  }
  return { metodo: 'FALLBACK_IMPORTE_CONCEPTO', observacion: 'Revisar XML: tasa 0 detectada sin base clara' };
};

const classifyTasa0Iva = (r: ValidationResult) => {
  const faltantes = getDatosFaltantes(r);
  const hasCp = getCartaPortePresente(r) === 'SI';
  const hasPedimento = normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'SI';
  const hasDoda = normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'SI';
  const internacional = /si|sí|salida|entrada|usa|can|mex/i.test(joinClean(cp(r)?.transporteInternacional, cp(r)?.entradaSalidaMercancia, cp(r)?.paisOrigenDestino));

  if (hasPedimento && hasDoda && (!hasCp || !getCartaPorteMissing(r).length)) {
    return {
      clasificacion: 'TASA 0% SOPORTADA',
      riesgo: 'BAJO',
      motivo: 'Cuenta con soporte aduanero y no presenta faltantes críticos de trazabilidad.',
      soporte: 'Conservar pedimento, DODA, Carta Porte y comprobante bancario.',
      accion: 'Archivar expediente y cruzar con contabilidad.',
    };
  }
  if (internacional || hasCp || hasPedimento) {
    return {
      clasificacion: 'TASA 0% CON SOPORTE PARCIAL',
      riesgo: 'MEDIO',
      motivo: faltantes,
      soporte: 'Pedimento/DODA, Carta Porte completa, BOL o evidencia logística e identificación bancaria.',
      accion: 'Completar soporte faltante antes de cerrar la auditoría.',
    };
  }
  return {
    clasificacion: 'TASA 0% SIN SOPORTE SUFICIENTE',
    riesgo: 'ALTO',
    motivo: faltantes,
    soporte: 'Fundamento de tasa 0%, evidencia de exportación/acto gravado a tasa 0, contrato, entrega y pago.',
    accion: 'Solicitar expediente fiscal y documental; reclasificar riesgo si no se acredita la tasa 0%.',
  };
};

const getCartaPorteMissing = (r: ValidationResult) => {
  if (getCartaPortePresente(r) !== 'SI') return [];
  const detail = cp(r);
  const mainOrigen = detail?.origenes?.[0];
  const mainDestino = detail?.destinos?.[0];
  const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];

  const faltantes: string[] = [];
  if (!hasValue(mainOrigen?.idUbicacion) && !hasValue(mainOrigen?.rfcRemitenteDestinatario) && !hasValue(mainOrigen?.codigoPostal)) faltantes.push('Falta origen');
  if (!hasValue(mainDestino?.idUbicacion) && !hasValue(mainDestino?.rfcRemitenteDestinatario) && !hasValue(mainDestino?.codigoPostal)) faltantes.push('Falta destino');
  if (!hasValue(detail?.autotransporte?.placaVM)) faltantes.push('Falta placas');
  if (!detail?.mercancias?.length) faltantes.push('Falta mercancías');
  if (!hasValue(operador?.rfcFigura) && !hasValue(operador?.nombreFigura) && !hasValue(operador?.numLicencia)) faltantes.push('Falta operador');
  if (!hasValue(detail?.totalDistanciaRecorrida)) faltantes.push('Falta distancia');
  return faltantes;
};

const getDatosFaltantes = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.datosFaltantes;
  const faltantes: string[] = [...getCartaPorteMissing(r)];

  if (existing && existing !== 'Ninguno' && existing !== 'NO APLICA') faltantes.push(...String(existing).split('|').map(v => v.trim()).filter(Boolean));
  if (getCartaPortePresente(r) === 'NO') faltantes.push('Carta Porte');
  if (normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'NO') faltantes.push('Falta pedimento');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'NO') faltantes.push('Falta DODA');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneEntryNumber) === 'NO') faltantes.push('Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SI')) faltantes.push('Falta identificación bancaria');
  if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) faltantes.push('Fuente externa requerida');

  return faltantes.length ? Array.from(new Set(faltantes)).join(' | ') : 'Sin faltantes críticos';
};

const getNivelExpediente = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.nivelExpediente;
  if (existing && existing !== 'NO APLICA') return existing;
  return getDatosFaltantes(r) === 'Sin faltantes críticos'
    ? 'Fiscal + logística completa'
    : getCartaPortePresente(r) === 'SI'
      ? 'Expediente parcialmente soportado'
      : 'Expediente incompleto';
};

const nodeName = (node: Element) => (node.localName || node.nodeName || '').split(':').pop() || '';

// Memoria en navegador (item 4 de la revisión): 4 funciones distintas
// re-parseaban el mismo XML de forma independiente (hasta 4x por documento).
// `cache` es opcional y de vida corta — se crea justo antes de las 4 hojas
// que necesitan el XML crudo y se descarta justo después (ver
// buildDiagnosticoWorkbook), para no retener N documentos DOM parseados
// simultáneamente durante todo el export, solo durante esa fase puntual.
type XmlDocCache = Map<ValidationResult, XMLDocument | null>;
const parseXml = (r: ValidationResult, cache?: XmlDocCache): XMLDocument | null => {
  if (cache?.has(r)) return cache.get(r)!;
  const doc = (!r.xmlContent || typeof DOMParser === 'undefined')
    ? null
    : new DOMParser().parseFromString(r.xmlContent, 'text/xml');
  cache?.set(r, doc);
  return doc;
};

const nodes = (root: Document | Element | null, name: string): Element[] =>
  root ? Array.from(root.getElementsByTagName('*')).filter(n => nodeName(n) === name) : [];

const firstNode = (root: Document | Element | null, name: string) => nodes(root, name)[0];

const attrRaw = (node: Element | undefined | null, name: string) => {
  const value = node?.getAttribute(name);
  return value === null || value === undefined || value === '' ? 'NO VIENE EN XML' : value;
};

const addRawAttr = (rows: any[], r: ValidationResult, seccion: string, node: Element | undefined | null, atributo: string, campo: string, hoja: string, normalizado?: unknown, obs = '') => {
  rows.push({
    Archivo_XML: r.fileName,
    UUID: r.uuid,
    Seccion_XML: seccion,
    Nodo_XML: node ? nodeName(node) : seccion,
    Atributo_XML: atributo,
    Valor_Crudo_XML: node ? attrRaw(node, atributo) : 'NO VIENE EN XML',
    Valor_Normalizado: normalizado ?? (node ? attrRaw(node, atributo) : 'NO VIENE EN XML'),
    Campo_Destino_Excel: campo,
    Hoja_Destino: hoja,
    Observacion_Extraccion: obs,
  });
};

// P0-A (requisito 4): dump forense recursivo del complemento CartaPorte.
// Blindado contra documentos con complejidad real fuera de lo trivial:
// - detecta ciclos (WeakSet de nodos visitados — nunca debería ocurrir en un
//   DOM bien formado, pero se protege igual);
// - profundidad máxima razonada (la CartaPorte real no supera ~8 niveles);
// - solo recorre nodos hijos de CartaPorte esperados fiscalmente (allow-list),
//   no cualquier elemento XML;
// - tope de filas total por documento — si se alcanza, se agrega UNA fila de
//   aviso visible (nunca un truncamiento silencioso) que remite a las hojas
//   de detalle (DETALLE CARTA PORTE MERCANCIAS/UBICACIONES/FIGURAS), donde
//   la información completa sigue disponible sin límite artificial.
const RECURSIVE_ATTRS_MAX_DEPTH = 10;
const RECURSIVE_ATTRS_MAX_ROWS_PER_DOC = 400;
const CARTA_PORTE_EXPECTED_CHILDREN = new Set([
  'Ubicaciones', 'Ubicacion', 'Domicilio',
  'Mercancias', 'Mercancia', 'DetalleMercancia', 'CantidadTransporta',
  'Autotransporte', 'IdentificacionVehicular', 'Seguros', 'Remolques', 'Remolque',
  'FiguraTransporte', 'TiposFigura', 'Operadores', 'Operador', 'PartesTransporte',
  'Notificaciones', 'Domicilio',
]);

const addRecursiveAttrs = (
  rows: any[],
  r: ValidationResult,
  sectionPrefix: string,
  node: Element | null | undefined,
  hoja: string,
  visited: WeakSet<Element> = new WeakSet(),
  depth = 0,
  budget: { rowsUsed: number; truncated: boolean } = { rowsUsed: 0, truncated: false }
) => {
  if (!r || !node) return;
  if (budget.truncated) return;
  if (visited.has(node)) return; // ciclo detectado — nunca debería ocurrir en un DOM bien formado
  visited.add(node);

  if (budget.rowsUsed >= RECURSIVE_ATTRS_MAX_ROWS_PER_DOC || depth > RECURSIVE_ATTRS_MAX_DEPTH) {
    if (!budget.truncated) {
      budget.truncated = true;
      addRawAttr(
        rows, r, sectionPrefix, null, 'ESTRUCTURA_EXTENSA', 'aviso', hoja,
        `Estructura CartaPorte más extensa de lo habitual: extracción forense cruda detenida en ${budget.rowsUsed} filas para este documento. ` +
        `El detalle completo de mercancías/ubicaciones/figuras sigue disponible sin límite en las hojas "DETALLE CARTA PORTE MERCANCIAS", "DETALLE CP UBICACIONES" y "DETALLE CARTA PORTE FIGURAS".`,
        'Ver hoja de detalle correspondiente'
      );
    }
    return;
  }

  const attrs = node.attributes;
  if (attrs) {
    for (let i = 0; i < attrs.length; i++) {
      if (budget.rowsUsed >= RECURSIVE_ATTRS_MAX_ROWS_PER_DOC) break;
      const attr = attrs[i];
      addRawAttr(rows, r, sectionPrefix, node, attr.name, attr.name, hoja, attr.value);
      budget.rowsUsed++;
    }
  }
  const children = node.children;
  if (children) {
    const childCounts = new Map<string, number>();
    for (let i = 0; i < children.length; i++) {
      if (budget.rowsUsed >= RECURSIVE_ATTRS_MAX_ROWS_PER_DOC) break;
      const child = children[i];
      const childName = nodeName(child);
      // Solo se recorren nodos esperados del complemento CartaPorte (fiscales
      // conocidos), no cualquier elemento — evita dumps de estructuras ajenas.
      if (!CARTA_PORTE_EXPECTED_CHILDREN.has(childName)) continue;
      const count = (childCounts.get(childName) || 0) + 1;
      childCounts.set(childName, count);
      addRecursiveAttrs(rows, r, `${sectionPrefix} -> ${childName}[${count}]`, child, hoja, visited, depth + 1, budget);
    }
  }
};

const extractRawXmlRows = (results: ValidationResult[], cache?: XmlDocCache) => results.flatMap(r => {
  const doc = parseXml(r, cache);
  const rows: any[] = [];
  const comp = doc?.documentElement;
  const emisor = firstNode(doc, 'Emisor');
  const receptor = firstNode(doc, 'Receptor');
  [
    'Version', 'Serie', 'Folio', 'Fecha', 'FormaPago', 'MetodoPago', 'Moneda', 'TipoCambio',
    'SubTotal', 'Descuento', 'Total', 'Exportacion', 'TipoDeComprobante', 'LugarExpedicion', 'CondicionesDePago'
  ].forEach(a => addRawAttr(rows, r, 'COMPROBANTE', comp, a, a, 'DETALLE FORENSE POR CFDI'));
  ['Rfc', 'Nombre', 'RegimenFiscal'].forEach(a => addRawAttr(rows, r, 'EMISOR', emisor, a, a, 'DETALLE FORENSE POR CFDI'));
  ['Rfc', 'Nombre', 'RegimenFiscalReceptor', 'UsoCFDI', 'DomicilioFiscalReceptor'].forEach(a => addRawAttr(rows, r, 'RECEPTOR', receptor, a, a, 'DETALLE FORENSE POR CFDI'));
  nodes(doc, 'Concepto').forEach((concepto, i) => {
    ['ClaveProdServ', 'NoIdentificacion', 'Cantidad', 'ClaveUnidad', 'Unidad', 'Descripcion', 'ValorUnitario', 'Importe', 'Descuento', 'ObjetoImp'].forEach(a =>
      addRawAttr(rows, r, `CONCEPTOS[${i + 1}]`, concepto, a, a, 'DETALLE CONCEPTOS XML')
    );
  });
  [...nodes(doc, 'Traslado'), ...nodes(doc, 'Retencion')].forEach((imp, i) => {
    ['Base', 'Impuesto', 'TipoFactor', 'TasaOCuota', 'Importe'].forEach(a =>
      addRawAttr(rows, r, `IMPUESTOS_CONCEPTO[${i + 1}]`, imp, a, a, 'DETALLE IMPUESTOS CONCEPTO')
    );
  });
  const impuestosGlobales = nodes(doc, 'Impuestos').find(n => n.parentElement && nodeName(n.parentElement) === 'Comprobante');
  ['TotalImpuestosTrasladados', 'TotalImpuestosRetenidos'].forEach(a => addRawAttr(rows, r, 'IMPUESTOS_GLOBALES', impuestosGlobales, a, a, 'DETALLE FORENSE POR CFDI'));
  nodes(doc, 'CfdiRelacionados').forEach((rel, i) => addRawAttr(rows, r, `CFDI_RELACIONADOS[${i + 1}]`, rel, 'TipoRelacion', 'TipoRelacion', 'DETALLE FORENSE POR CFDI'));
  nodes(doc, 'CfdiRelacionado').forEach((rel, i) => addRawAttr(rows, r, `CFDI_RELACIONADO[${i + 1}]`, rel, 'UUID', 'UUID relacionado', 'DETALLE FORENSE POR CFDI'));
  
  const carta = firstNode(doc, 'CartaPorte');
  if (carta) {
    addRecursiveAttrs(rows, r, 'COMPLEMENTO_CARTA_PORTE_RAW', carta, 'EXTRACCION CRUDA XML');
    
    // Explicit legacy mappings for safety
    ['Version', 'TranspInternac', 'EntradaSalidaMerc', 'PaisOrigenDestino', 'ViaEntradaSalida', 'TotalDistRec'].forEach(a => addRawAttr(rows, r, 'COMPLEMENTO_CARTA_PORTE', carta, a, a, 'DETALLE FORENSE POR CFDI'));
    nodes(carta, 'Ubicacion').forEach((u, i) => {
      ['TipoUbicacion', 'IDUbicacion', 'RFCRemitenteDestinatario', 'NombreRemitenteDestinatario', 'FechaHoraSalidaLlegada', 'DistanciaRecorrida'].forEach(a =>
        addRawAttr(rows, r, `CARTA_PORTE_UBICACION[${i + 1}]`, u, a, a, 'DETALLE CARTA PORTE UBICACIONES')
      );
      const dom = firstNode(u, 'Domicilio');
      ['Calle', 'NumeroExterior', 'NumeroInterior', 'Colonia', 'Localidad', 'Municipio', 'Estado', 'Pais', 'CodigoPostal', 'Referencia'].forEach(a =>
        addRawAttr(rows, r, `CARTA_PORTE_DOMICILIO[${i + 1}]`, dom, a, a, 'DETALLE CARTA PORTE UBICACIONES')
      );
    });
    const mercancias = firstNode(carta, 'Mercancias');
    ['PesoBrutoTotal', 'UnidadPeso', 'NumTotalMercancias'].forEach(a => addRawAttr(rows, r, 'CARTA_PORTE_MERCANCIAS', mercancias, a, a, 'DETALLE CARTA PORTE MERCANCIAS'));
    nodes(mercancias, 'Mercancia').forEach((m, i) => {
      ['BienesTransp', 'Descripcion', 'Cantidad', 'ClaveUnidad', 'PesoEnKg', 'ValorMercancia', 'Moneda', 'FraccionArancelaria', 'UUIDComercioExt', 'NumPedimento'].forEach(a =>
        addRawAttr(rows, r, `CARTA_PORTE_MERCANCIA[${i + 1}]`, m, a, a, 'DETALLE CARTA PORTE MERCANCIAS')
      );
    });
    const auto = firstNode(carta, 'Autotransporte');
    ['PermSCT', 'NumPermisoSCT'].forEach(a => addRawAttr(rows, r, 'AUTOTRANSPORTE', auto, a, a, 'DETALLE FORENSE POR CFDI'));
    const vehiculo = firstNode(auto, 'IdentificacionVehicular');
    ['ConfigVehicular', 'PlacaVM', 'AnioModeloVM'].forEach(a => addRawAttr(rows, r, 'IDENTIFICACION_VEHICULAR', vehiculo, a, a, 'DETALLE FORENSE POR CFDI'));
    nodes(auto, 'Remolque').forEach((rem, i) => ['SubTipoRem', 'Placa'].forEach(a => addRawAttr(rows, r, `REMOLQUE[${i + 1}]`, rem, a, a, 'DETALLE CARTA PORTE FIGURAS')));
    const seguros = firstNode(auto, 'Seguros');
    ['AseguraRespCivil', 'PolizaRespCivil'].forEach(a => addRawAttr(rows, r, 'SEGUROS', seguros, a, a, 'DETALLE FORENSE POR CFDI'));
    
    const figurasNodos = [
      ...nodes(carta, 'TiposFigura'),
      ...nodes(carta, 'FiguraTransporte'),
      ...nodes(carta, 'Operadores'),
      ...nodes(carta, 'Operador')
    ];
    figurasNodos.forEach((fig, i) => {
      ['TipoFigura', 'RFCFigura', 'NombreFigura', 'NumLicencia', 'ResidenciaFiscal', 'NumRegIdTrib', 'RFCOperador', 'NombreOperador'].forEach(a =>
        addRawAttr(rows, r, `FIGURA_TRANSPORTE[${i + 1}]`, fig, a, a, 'DETALLE CARTA PORTE FIGURAS')
      );
    });
  }
  
  nodes(doc, 'Pago').forEach((pago, i) => ['FechaPago', 'FormaDePagoP', 'MonedaP', 'Monto'].forEach(a => addRawAttr(rows, r, `PAGO[${i + 1}]`, pago, a, a, 'DETALLE COMPLEMENTOS PAGO')));
  nodes(doc, 'DoctoRelacionado').forEach((docRel, i) => ['IdDocumento', 'Folio', 'Serie', 'MonedaDR', 'MetodoDePagoDR', 'NumParcialidad', 'ImpSaldoAnt', 'ImpPagado', 'ImpSaldoInsoluto'].forEach(a => addRawAttr(rows, r, `PAGO_DOCTO[${i + 1}]`, docRel, a, a, 'DETALLE COMPLEMENTOS PAGO')));
  nodes(doc, 'TrasladoP').forEach((tp, i) => ['BaseP', 'ImpuestoP', 'TipoFactorP', 'TasaOCuotaP', 'ImporteP'].forEach(a => addRawAttr(rows, r, `PAGO_TRASLADO[${i + 1}]`, tp, a, a, 'DETALLE COMPLEMENTOS PAGO')));
  if (!rows.length) addRawAttr(rows, r, 'XML', null, 'XML', 'rawXmlContent', 'EXTRACCION CRUDA XML', 'NO VIENE EN XML', 'XML crudo no disponible en resultado');
  return rows;
});

const buildConceptRows = (results: ValidationResult[]) => results.flatMap(r => (r.desglosePorConcepto || []).map((c: any, i: number) => {
  const cantidad = c.cantidad !== null && c.cantidad !== undefined ? Number(c.cantidad) : 0;
  const valorUnitario = c.valorUnitario !== null && c.valorUnitario !== undefined ? Number(c.valorUnitario) : 0;
  const importe = c.importe !== null && c.importe !== undefined ? Number(c.importe) : 0;

  const importeVerificado = Math.round(cantidad * valorUnitario * 100) / 100;
  const diferencia = Math.round((importe - importeVerificado) * 100) / 100;

  return {
    Archivo_XML: r.fileName,
    UUID: r.uuid,
    Indice_Nodo: i + 1,
    Nodo_XML: 'Concepto',
    ClaveProdServ: c.claveProdServ || 'NO VIENE EN XML',
    Concepto: c.descripcion || 'NO VIENE EN XML',
    Cantidad: c.cantidad !== null && c.cantidad !== undefined ? c.cantidad : 'NO VIENE EN XML',
    NoIdentificacion: c.noIdentificacion || 'NO VIENE EN XML',
    ValorUnitario: c.valorUnitario !== null && c.valorUnitario !== undefined ? c.valorUnitario : 'NO VIENE EN XML',
    Importe: c.importe ?? 0,
    Descuento: c.descuento ?? 0,
    ObjetoImp: c.objetoImp || 'NO VIENE EN XML',
    Importe_Verificado: c.cantidad !== null && c.valorUnitario !== null && c.cantidad !== undefined && c.valorUnitario !== undefined ? importeVerificado : 'NO VIENE EN XML',
    Diferencia_Importe_Concepto: c.cantidad !== null && c.valorUnitario !== null && c.cantidad !== undefined && c.valorUnitario !== undefined ? diferencia : 'NO VIENE EN XML',
    Observacion: 'Extraído de desglose fiscal del XML',
  };
}));

const buildTaxRows = (results: ValidationResult[]) => results.flatMap(r => (r.desglosePorConcepto || []).flatMap((c: any, i: number) => {
  const mapTax = (t: any, tipo: 'Traslado' | 'Retencion') => {
    let tasaDetectada = 'INDETERMINADO';
    if (c.objetoImp === '01') {
      tasaDetectada = 'NO OBJETO';
    } else {
      const tfUp = String(t.tipoFactor || '').toUpperCase();
      const imp = String(t.impuesto || '');
      const tNum = Number(t.tasa);
      const isRet = tipo === 'Retencion';

      if (imp === '002' && tfUp === 'TASA' && tNum === 0.16) {
        tasaDetectada = 'IVA_16%';
      } else if (imp === '002' && tfUp === 'TASA' && tNum === 0) {
        tasaDetectada = 'IVA_0%';
      } else if (imp === '002' && tfUp === 'EXENTO') {
        tasaDetectada = 'IVA_EXENTO';
      } else if (imp === '001' && tfUp === 'TASA' && tNum === 0.04 && isRet) {
        tasaDetectada = 'ISR_RETENIDO_4%_AUTOTRANSPORTE';
      } else if (imp === '002' && isRet) {
        tasaDetectada = 'IVA_RETENIDO';
      } else if (imp === '001' && isRet) {
        tasaDetectada = 'ISR_RETENIDO';
      }
    }

    return {
      Archivo_XML: r.fileName,
      UUID: r.uuid,
      Indice_Concepto: i + 1,
      ClaveProdServ: c.claveProdServ || 'NO VIENE EN XML',
      Descripcion_Concepto: c.descripcion || 'NO VIENE EN XML',
      ObjetoImp: c.objetoImp || 'NO VIENE EN XML',
      Tipo_Impuesto: tipo,
      Base: t.base ?? 0,
      Impuesto: t.impuesto || 'NO VIENE EN XML',
      TipoFactor: t.tipoFactor || 'NO VIENE EN XML',
      TasaOCuota: t.tasa || 'NO VIENE EN XML',
      Importe: t.importe ?? 0,
      Es_IVA: t.impuesto === '002' ? 'SI' : 'NO',
      Es_ISR: t.impuesto === '001' ? 'SI' : 'NO',
      Tasa_Detectada: tasaDetectada,
      Observacion: tipo === 'Traslado' ? 'Impuesto por concepto' : 'Retención por concepto'
    };
  };

  return [
    ...(c.traslados || []).map((t: any) => mapTax(t, 'Traslado')),
    ...(c.retenciones || []).map((t: any) => mapTax(t, 'Retencion'))
  ];
}));

const getMesName = (fecha: string) => {
  const parts = String(fecha || '').split('-');
  const m = parts[1];
  if (!m) return 'INDETERMINADO';
  const meses: Record<string, string> = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  return meses[m] || 'INDETERMINADO';
};

const buildRetencionesRows = (results: ValidationResult[]) => {
  const rows: any[] = [];
  results.forEach(r => {
    const tieneFleteConcept = (r.desglosePorConcepto || []).some((c: any) => {
      const cps = String(c.claveProdServ || '');
      const desc = String(c.descripcion || '').toLowerCase();
      return cps.startsWith('7810') || desc.includes('flete') || desc.includes('acarreo') || desc.includes('transporte');
    });

    const hasActualRetenciones = (r.desglosePorConcepto || []).some((c: any) => (c.retenciones || []).length > 0);

    (r.desglosePorConcepto || []).forEach((c: any, i: number) => {
      (c.retenciones || []).forEach((ret: any) => {
        const tNum = Number(ret.tasa);
        let clasif = 'OTRA_RETENCION';
        if (ret.impuesto === '001' && tNum === 0.04) {
          clasif = 'ISR_RETENIDO_4%_AUTOTRANSPORTE';
        } else if (ret.impuesto === '001') {
          clasif = 'ISR_RETENIDO';
        } else if (ret.impuesto === '002') {
          clasif = 'IVA_RETENIDO';
        } else if (ret.impuesto === '003') {
          clasif = 'IEPS_RETENIDO';
        }

        const mes = getMesName(r.fechaEmision);

        rows.push({
          UUID: r.uuid,
          Fecha: r.fechaEmision,
          RFC_Emisor: r.rfcEmisor,
          RFC_Receptor: r.rfcReceptor,
          Tipo_CFDI: r.tipoCFDI,
          Base_Retencion: ret.base ?? 0,
          Impuesto: ret.impuesto || '001',
          TipoFactor: ret.tipoFactor || 'Tasa',
          TasaOCuota: ret.tasa || '0.000000',
          Importe_Retenido: ret.importe ?? 0,
          Clasificacion_Retencion: clasif,
          Mes: mes,
          Observacion: 'Retención declarada en XML',
          Accion_Recomendada: 'Ninguna'
        });
      });
    });

    if (r.tipoCFDI === 'I' && tieneFleteConcept && !hasActualRetenciones) {
      const mes = getMesName(r.fechaEmision);
      const firstConcept = (r.desglosePorConcepto || []).find((c: any) => {
        const cps = String(c.claveProdServ || '');
        const desc = String(c.descripcion || '').toLowerCase();
        return cps.startsWith('7810') || desc.includes('flete') || desc.includes('acarreo') || desc.includes('transporte');
      });

      rows.push({
        UUID: r.uuid,
        Fecha: r.fechaEmision,
        RFC_Emisor: r.rfcEmisor,
        RFC_Receptor: r.rfcReceptor,
        Tipo_CFDI: r.tipoCFDI,
        Base_Retencion: firstConcept ? (firstConcept.importe - (firstConcept.descuento || 0)) : r.subtotal,
        Impuesto: '001',
        TipoFactor: 'Tasa',
        TasaOCuota: '0.040000',
        Importe_Retenido: 0,
        Clasificacion_Retencion: 'RETENCION_OMITIDA_APARENTE',
        Mes: mes,
        Observacion: 'CFDI de transporte/fletes sin retenciones detectadas en XML',
        Accion_Recomendada: 'Validar si aplica retención de ISR 4% (o IVA 4% según corresponda)'
      });
    }
  });

  return rows.length ? rows : [{ UUID: 'SIN REGISTROS', Fecha: 'NO APLICA', RFC_Emisor: 'NO APLICA', RFC_Receptor: 'NO APLICA', Tipo_CFDI: 'NO APLICA', Base_Retencion: 0, Impuesto: 'NO APLICA', TipoFactor: 'NO APLICA', TasaOCuota: 'NO APLICA', Importe_Retenido: 0, Clasificacion_Retencion: 'SIN REGISTROS', Mes: 'NO APLICA', Observacion: 'Ninguna retención detectada', Accion_Recomendada: 'Ninguna' }];
};

const applyRetencionesSheetDefaults = (ws: any, dataRows: any[]) => {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = (XLSX as any).utils.decode_range(ref);

  ws['!autofilter'] = { ref: (XLSX as any).utils.encode_range({ s: { r: 9, c: range.s.c }, e: { r: range.e.r, c: range.e.c } }) };
  ws['!panes'] = { ySplit: 10, topLeftCell: 'A11', activePane: 'bottomLeft', state: 'frozen' };

  let totalIsrRetenido = 0;
  let totalIvaRetenido = 0;
  let totalIsr4 = 0;
  const cfdiWithRet = new Set<string>();
  const cfdiOmitted = new Set<string>();

  dataRows.forEach(row => {
    if (row.UUID === 'SIN REGISTROS') return;
    const importRet = Number(row.Importe_Retenido || 0);
    if (row.Clasificacion_Retencion === 'RETENCION_OMITIDA_APARENTE') {
      cfdiOmitted.add(row.UUID);
    } else {
      cfdiWithRet.add(row.UUID);
      if (row.Impuesto === '001') {
        totalIsrRetenido += importRet;
        if (row.Clasificacion_Retencion === 'ISR_RETENIDO_4%_AUTOTRANSPORTE') {
          totalIsr4 += importRet;
        }
      } else if (row.Impuesto === '002') {
        totalIvaRetenido += importRet;
      }
    }
  });

  const summaryBlock = [
    ['RESUMEN DE RETENCIONES FISCALES'],
    ['Total ISR retenido', Math.round(totalIsrRetenido * 100) / 100],
    ['Total IVA retenido', Math.round(totalIvaRetenido * 100) / 100],
    ['Total retención ISR 4% Autotransporte', Math.round(totalIsr4 * 100) / 100],
    ['CFDI con retención', cfdiWithRet.size],
    ['CFDI sin retención (aparentemente aplica)', cfdiOmitted.size],
  ];

  (XLSX as any).utils.sheet_add_aoa(ws, summaryBlock, { origin: 'A1' });

  const cellA1 = ws['A1'];
  if (cellA1) cellA1.s = { font: { bold: true, color: { rgb: '1F4788' }, sz: 12 }, fill: { fgColor: { rgb: 'EBF1FA' } }, alignment: { horizontal: 'left' } };

  const headerCols: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[(XLSX as any).utils.encode_cell({ r: 9, c })];
    if (cell) {
      headerCols.push(String(cell.v || ''));
      cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4788' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    }
  }
  ws['!cols'] = headerCols.map(h => ({ wch: Math.min(Math.max(h.length + 4, 14), 42) }));
};

// P0-A (requisito 6): resumen truncado con aviso explícito — nunca un
// .join() sin límite. La lista completa siempre sigue disponible en la hoja
// de detalle correspondiente (una fila por elemento, con UUID), así que no
// se pierde información: solo se evita concatenar miles de valores en una
// sola celda de texto (que rompería el límite de 32,767 caracteres de Excel).
const summarizeList = (items: unknown[] | undefined | null, max: number, detailSheetName: string): string => {
  const clean = (items || []).map(v => String(v ?? '').trim()).filter(Boolean);
  if (!clean.length) return 'NO VIENE EN XML';
  if (clean.length <= max) return clean.join(' | ');
  return `${clean.slice(0, max).join(' | ')} | +${clean.length - max} más (ver hoja "${detailSheetName}")`;
};

const buildForensicRows = (results: ValidationResult[]) => results.map(r => {
  const detail = cp(r);
  const mainOrigen = detail?.origenes?.[0];
  const mainDestino = detail?.destinos?.[0];
  const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];

  return {
    Archivo_XML: r.fileName,
    UUID: r.uuid,
    Version_CFDI: r.versionCFDI,
    Tipo_CFDI: r.tipoCFDI,
    Serie: r.serie,
    Folio: r.folio,
    Fecha_Emision: r.fechaEmision,
    Hora_Emision: r.horaEmision,
    LugarExpedicion: r.cpReceptor || 'NO VIENE EN XML',
    ...getSatExportFields(r),
    RFC_Emisor: r.rfcEmisor,
    Nombre_Emisor: r.nombreEmisor,
    Regimen_Fiscal_Emisor: r.regimenEmisor,
    RFC_Receptor: r.rfcReceptor,
    Nombre_Receptor: r.nombreReceptor,
    Regimen_Fiscal_Receptor: r.regimenReceptor,
    Uso_CFDI: r.usoCFDI,
    CP_Receptor: r.cpReceptor,
    SubTotal: r.subtotal,
    Descuento_Conceptos: (r.desglosePorConcepto || []).reduce((sum: number, c: any) => sum + Number(c.descuento || 0), 0),
    Descuento_Global: r.descuentoGlobal ?? 0,
    Diferencia_Descuento: Math.round(Math.abs((r.descuentoGlobal ?? 0) - (r.desglosePorConcepto || []).reduce((sum: number, c: any) => sum + Number(c.descuento || 0), 0)) * 100) / 100,
    Total: r.total,
    Moneda: r.moneda,
    TipoCambio: r.tipoCambio,
    MetodoPago: r.metodoPago,
    FormaPago: r.formaPago,
    CondicionesDePago: r.condicionesDePago || 'NO VIENE EN XML',
    Base_IVA_16: r.baseIVA16,
    Base_IVA_0: r.baseIVA0,
    Base_IVA_Exento: r.baseIVAExento,
    IVA_Trasladado: r.ivaTraslado,
    IVA_Retenido: r.ivaRetenido,
    ISR_Retenido: r.isrRetenido,
    Total_Impuestos_Trasladados: r.ivaTraslado + r.iepsTraslado + r.impuestosLocalesTrasladados,
    Total_Impuestos_Retenidos: r.ivaRetenido + r.isrRetenido + r.iepsRetenido + r.impuestosLocalesRetenidos,
    // Antes truncaba en silencio a 5 sin aviso; ahora usa summarizeList igual
    // que el resto de los resúmenes — nunca pérdida sin marcar (requisito 1).
    Conceptos_Resumen: summarizeList((r.desglosePorConcepto || []).map((c: any) => c.descripcion), 5, 'DETALLE CONCEPTOS XML'),
    CartaPorte_Presente: getCartaPortePresente(r),
    CartaPorte_Version: detail?.version || r.versionCartaPorte,
    CartaPorte_Completa: r.cartaPorteCompleta,
    TransporteInternacional: normalizeI18nSiNo(detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional),
    EntradaSalidaMercancia: detail?.entradaSalidaMercancia || 'NO VIENE EN XML',
    PaisOrigenDestino: detail?.paisOrigenDestino || 'NO VIENE EN XML',
    TotalDistanciaRecorrida: detail?.totalDistanciaRecorrida || 'NO VIENE EN XML',
    Origen_Resumen: formatAddress(mainOrigen),
    Destino_Resumen: formatAddress(mainDestino),
    Mercancias_Resumen: summarizeList(detail?.mercancias?.map((m: any) => m.descripcion), 5, 'DETALLE CARTA PORTE MERCANCIAS'),
    Unidad_Placas: detail?.autotransporte?.placaVM || 'NO VIENE EN XML',
    Remolques_Resumen: summarizeList(detail?.autotransporte?.remolques?.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)), 5, 'DETALLE CARTA PORTE FIGURAS'),
    Operador_Resumen: joinClean(operador?.rfcFigura, operador?.nombreFigura, operador?.numLicencia),
    Pedimentos_Detectados: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
    Pago_Presente: r.pagosPresente || 'NO',
    CFDI_Relacionados: r.uuids_relacionados?.length ? summarizeList(r.uuids_relacionados, 20, 'EXTRACCION CRUDA XML') : 'NO APLICA',
    Nivel_Trazabilidad: getNivelExpediente(r),
    Datos_Faltantes: getDatosFaltantes(r),
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'Integrar soporte documental y validar manualmente riesgos detectados',
  };
});

const buildCartaPorteMercancias = (results: ValidationResult[]) =>
  (results ?? []).flatMap(r => {
    const detail = cp(r);
    const mercs = detail?.mercancias ?? [];
    if (mercs.length === 0) return [];
    return mercs.map((m: any, index: number) => ({
      Archivo_XML: r?.fileName || 'NO VIENE EN XML',
      UUID: r?.uuid || 'NO VIENE EN XML',
      Indice_Nodo: index + 1,
      Nodo_XML: 'Mercancia',
      bienesTransp: m.bienesTransp || 'NO VIENE EN XML',
      descripcion: m.descripcion || 'NO VIENE EN XML',
      cantidad: m.cantidad || 'NO VIENE EN XML',
      claveUnidad: m.claveUnidad || 'NO VIENE EN XML',
      unidad: m.unidad || 'NO VIENE EN XML',
      pesoEnKg: m.pesoEnKg || 'NO VIENE EN XML',
      valorMercancia: m.valorMercancia || 'NO VIENE EN XML',
      moneda: m.moneda || 'NO VIENE EN XML',
      fraccionArancelaria: m.fraccionArancelaria || 'NO VIENE EN XML',
      uuidComercioExt: m.uuidComercioExt || 'NO VIENE EN XML',
      materialPeligroso: m.materialPeligroso || 'NO VIENE EN XML',
      cveMaterialPeligroso: m.cveMaterialPeligroso || 'NO VIENE EN XML',
      embalaje: m.embalaje || 'NO VIENE EN XML',
      Observacion: 'Mercancía de Carta Porte extraída',
    }));
  });

const buildCartaPorteUbicaciones = (results: ValidationResult[]) =>
  (results ?? []).flatMap(r => {
    const detail = cp(r);
    const origenes = detail?.origenes ?? [];
    const destinos = detail?.destinos ?? [];
    const list = [...origenes, ...destinos];
    if (list.length === 0) return [];
    return list.map((u: any, index: number) => ({
      Archivo_XML: r?.fileName || 'NO VIENE EN XML',
      UUID: r?.uuid || 'NO VIENE EN XML',
      Indice_Nodo: index + 1,
      Nodo_XML: 'Ubicacion',
      tipoUbicacion: u.tipoUbicacion || 'NO VIENE EN XML',
      idUbicacion: u.idUbicacion || 'NO VIENE EN XML',
      rfcRemitenteDestinatario: u.rfcRemitenteDestinatario || 'NO VIENE EN XML',
      nombreRemitenteDestinatario: u.nombreRemitenteDestinatario || 'NO VIENE EN XML',
      fechaHoraSalidaLlegada: u.fechaHoraSalidaLlegada || 'NO VIENE EN XML',
      calle: u.calle || 'NO VIENE EN XML',
      numeroExterior: u.numeroExterior || 'NO VIENE EN XML',
      numeroInterior: u.numeroInterior || 'NO VIENE EN XML',
      colonia: u.colonia || 'NO VIENE EN XML',
      localidad: u.localidad || 'NO VIENE EN XML',
      municipio: u.municipio || 'NO VIENE EN XML',
      estado: u.estado || 'NO VIENE EN XML',
      pais: u.pais || 'NO VIENE EN XML',
      codigoPostal: u.codigoPostal || 'NO VIENE EN XML',
      referencia: u.referencia || 'NO VIENE EN XML',
      Domicilio: formatAddress(u),
      Observacion: hasValue(u.idUbicacion) || hasValue(u.rfcRemitenteDestinatario) ? 'Ubicación extraída' : 'NO VIENE EN XML',
    }));
  });

const buildCartaPorteFiguras = (results: ValidationResult[]) =>
  (results ?? []).flatMap(r => {
    const detail = cp(r);
    const figuras = detail?.figuras ?? [];
    if (figuras.length === 0) return [];
    return figuras.map((fig: any, index: number) => ({
      Archivo_XML: r?.fileName || 'NO VIENE EN XML',
      UUID: r?.uuid || 'NO VIENE EN XML',
      Indice_Nodo: index + 1,
      Nodo_XML: 'TiposFigura',
      tipoFigura: fig.tipoFigura || 'NO VIENE EN XML',
      rfcFigura: fig.rfcFigura || 'NO VIENE EN XML',
      nombreFigura: fig.nombreFigura || 'NO VIENE EN XML',
      numLicencia: fig.numLicencia || 'NO VIENE EN XML',
      residenciaFiscal: fig.residenciaFiscal || 'NO VIENE EN XML',
      numRegIdTrib: fig.numRegIdTrib || 'NO VIENE EN XML',
      Observacion: 'Figura transporte extraída',
    }));
  });

const buildPagosRows = (results: ValidationResult[], cache?: XmlDocCache) => {
  // Índice de UUIDs de CFDIs de ingreso en el lote (para marcar REP vinculado vs sin origen)
  const loteUuids = new Set(results.filter(r => r.tipoCFDI !== 'P').map(r => String(r.uuid || '').toUpperCase()));

  return results.flatMap(r => {
    if (r.desglosePagos && r.desglosePagos.length > 0) {
      // Enriquecer filas pre-cargadas con campo de vinculación
      return r.desglosePagos.map((row: any) => {
        const uuidRel = String(row.UUID_CFDI_Relacionado || row.IdDocumento || '').trim().toUpperCase();
        const localizado = loteUuids.has(uuidRel) ? 'SI' : (uuidRel && uuidRel !== 'NO VIENE EN XML' ? 'REP SIN CFDI ORIGEN EN LOTE' : 'NO APLICA');
        return { ...row, ObjetoImpDR: row.ObjetoImpDR || 'NO VIENE EN XML', Complemento_Pago_Localizado: localizado };
      });
    }
    const doc = parseXml(r, cache);
    const tienePagos = nodes(doc, 'Pagos').length > 0;
    if (!tienePagos) return [];
    return nodes(doc, 'DoctoRelacionado').map((dr, index) => {
      let parent = dr.parentElement;
      while (parent && nodeName(parent) !== 'Pago') {
        parent = parent.parentElement;
      }
      const pago = parent;

      const impuestosDR = firstNode(dr, 'ImpuestosDR');
      const trasladoDR = firstNode(impuestosDR, 'TrasladoDR') || firstNode(dr, 'TrasladoDR') || firstNode(impuestosDR, 'Traslado') || firstNode(dr, 'Traslado');

      const baseDR = attrRaw(trasladoDR, 'BaseDR') !== 'NO VIENE EN XML' ? attrRaw(trasladoDR, 'BaseDR') : attrRaw(trasladoDR, 'Base');
      const impuestoDR = attrRaw(trasladoDR, 'ImpuestoDR') !== 'NO VIENE EN XML' ? attrRaw(trasladoDR, 'ImpuestoDR') : attrRaw(trasladoDR, 'Impuesto');
      const tipoFactorDR = attrRaw(trasladoDR, 'TipoFactorDR') !== 'NO VIENE EN XML' ? attrRaw(trasladoDR, 'TipoFactorDR') : attrRaw(trasladoDR, 'TipoFactor');
      const tasaOCuotaDR = attrRaw(trasladoDR, 'TasaOCuotaDR') !== 'NO VIENE EN XML' ? attrRaw(trasladoDR, 'TasaOCuotaDR') : attrRaw(trasladoDR, 'TasaOCuota');
      const importeDR = attrRaw(trasladoDR, 'ImporteDR') !== 'NO VIENE EN XML' ? attrRaw(trasladoDR, 'ImporteDR') : attrRaw(trasladoDR, 'Importe');

      const trasladoP = firstNode(pago, 'TrasladoP') || firstNode(pago, 'Traslado') || firstNode(dr, 'TrasladoP');
      const baseP = attrRaw(trasladoP, 'BaseP') !== 'NO VIENE EN XML' ? attrRaw(trasladoP, 'BaseP') : attrRaw(trasladoP, 'Base');
      const impuestoP = attrRaw(trasladoP, 'ImpuestoP') !== 'NO VIENE EN XML' ? attrRaw(trasladoP, 'ImpuestoP') : attrRaw(trasladoP, 'Impuesto');
      const tipoFactorP = attrRaw(trasladoP, 'TipoFactorP') !== 'NO VIENE EN XML' ? attrRaw(trasladoP, 'TipoFactorP') : attrRaw(trasladoP, 'TipoFactor');
      const tasaOCuotaP = attrRaw(trasladoP, 'TasaOCuotaP') !== 'NO VIENE EN XML' ? attrRaw(trasladoP, 'TasaOCuotaP') : attrRaw(trasladoP, 'TasaOCuota');
      const importeP = attrRaw(trasladoP, 'ImporteP') !== 'NO VIENE EN XML' ? attrRaw(trasladoP, 'ImporteP') : attrRaw(trasladoP, 'Importe');

      // ObjetoImpDR: atributo SAT 4.0 en DoctoRelacionado
      const objetoImpDR = attrRaw(dr, 'ObjetoImpDR');

      // Vinculación: ¿el UUID del CFDI origen está en el lote?
      const uuidRel = String(dr.getAttribute('IdDocumento') || '').trim().toUpperCase();
      const localizado = loteUuids.has(uuidRel) ? 'SI' : (uuidRel ? 'REP SIN CFDI ORIGEN EN LOTE' : 'NO APLICA');

      return {
        Archivo_XML: r.fileName,
        UUID: r.uuid,
        Indice_Nodo: index + 1,
        Nodo_XML: 'DoctoRelacionado',
        FechaPago: attrRaw(pago, 'FechaPago'),
        FormaDePagoP: attrRaw(pago, 'FormaDePagoP'),
        MonedaP: attrRaw(pago, 'MonedaP'),
        TipoCambioP: attrRaw(pago, 'TipoCambioP'),
        Monto: attrRaw(pago, 'Monto'),
        UUID_CFDI_Relacionado: attrRaw(dr, 'IdDocumento'),
        Serie_Relacionado: attrRaw(dr, 'Serie'),
        Folio_Relacionado: attrRaw(dr, 'Folio'),
        MonedaDR: attrRaw(dr, 'MonedaDR'),
        NumParcialidad: attrRaw(dr, 'NumParcialidad'),
        ImpSaldoAnt: attrRaw(dr, 'ImpSaldoAnt'),
        ImpPagado: attrRaw(dr, 'ImpPagado'),
        ImpSaldoInsoluto: attrRaw(dr, 'ImpSaldoInsoluto'),
        ObjetoImpDR: objetoImpDR,
        BaseDR: baseDR,
        ImpuestoDR: impuestoDR,
        TipoFactorDR: tipoFactorDR,
        TasaOCuotaDR: tasaOCuotaDR,
        ImporteDR: importeDR,
        BaseP: baseP,
        ImpuestoP: impuestoP,
        TipoFactorP: tipoFactorP,
        TasaOCuotaP: tasaOCuotaP,
        ImporteP: importeP,
        Complemento_Pago_Localizado: localizado,
        Observacion: 'Complemento de pago extraído'
      };
    });
  });
};

const addAlert = (alerts: any[], r: ValidationResult, tipo: string, regla: string, riesgo: string, descripcion: string, evidencia: string, recomendacion: string) => {
  alerts.push({
    UUID: r.uuid,
    Archivo_XML: r.fileName,
    Tipo_Alerta: tipo,
    Regla: regla,
    Nivel_Riesgo: riesgo,
    Descripcion_Tecnica: descripcion,
    Fundamento_Referencia: 'Regla preventiva Sentinel Express; requiere revisión con documentación soporte.',
    Evidencia_XML: evidencia,
    Recomendacion: recomendacion,
    Requiere_Revision_Manual: 'SI',
  });
};

const buildAlerts = (results: ValidationResult[], cache?: XmlDocCache) => {
  const alerts: any[] = [];
  const seen = new Map<string, number>();
  results.forEach(r => seen.set(r.uuid, (seen.get(r.uuid) || 0) + 1));

  // PAGO-01 usa la MISMA fuente central que Dashboard/Resumen/Excel
  // (reconciliarPagosPPD, cfdiEngine.ts) — no reimplementa su propia
  // detección de cobertura REP ni su propia fecha de corte.
  const conciliacionParaAlertas = reconciliarPagosPPD(results).facturas;
  const facturaConciliadaPorUuid = new Map(conciliacionParaAlertas.map(f => [String(f.uuid || '').toUpperCase(), f]));

  results.forEach(r => {
    const detail = cp(r);
    const transporte = String(detail?.transporteInternacional || '').toLowerCase();
    const entradaSalida = String(detail?.entradaSalidaMercancia || '').toLowerCase();
    if ((r.baseIVA0 || 0) > 0 && /si|sí/i.test(transporte) && /salida/i.test(entradaSalida)) addAlert(alerts, r, 'IVA', 'IVA-01', 'AMARILLO', '0% aparentemente soportado por transporte internacional de salida, sujeto a pedimento/DODA/BOL/evidencia.', joinClean(detail?.transporteInternacional, detail?.entradaSalidaMercancia), 'Integrar expediente de exportación y soporte logístico.');
    if ((r.baseIVA0 || 0) > 0 && /si|sí/i.test(transporte) && /entrada/i.test(entradaSalida)) addAlert(alerts, r, 'IVA', 'IVA-02', 'ROJO', 'Riesgo: revisar si la tasa 0% procede en servicio vinculado a importación.', joinClean(detail?.transporteInternacional, detail?.entradaSalidaMercancia), 'Revisión fiscal manual de procedencia de tasa 0%.');
    if ((r.baseIVA0 || 0) > 0 && /no/i.test(transporte)) addAlert(alerts, r, 'IVA', 'IVA-03', 'ROJO', 'Posible tasa 0% sin soporte de servicio internacional.', String(detail?.transporteInternacional || 'NO VIENE EN XML'), 'Solicitar fundamento y evidencia soporte.');
    (r.desglosePorConcepto || []).forEach((c: any) => {
      if (c.objetoImp === '01' && (c.traslados || []).some((t: any) => Number(t.importe || 0) > 0)) addAlert(alerts, r, 'IVA', 'IVA-04', 'ROJO', 'Inconsistencia interna posible: ObjetoImp=01 con IVA trasladado.', c.descripcion || 'Concepto sin descripción', 'Revisar estructura fiscal del XML.');
      if ((c.descripcion || '').trim().length < 8 || /servicio|producto|varios|concepto/i.test(c.descripcion || '')) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-04', 'AMARILLO', 'Descripción genérica; materialidad débil.', c.descripcion || 'NO VIENE EN XML', 'Solicitar soporte documental del servicio/bien.');
      if (getCartaPortePresente(r) === 'SI' && !/^78/.test(c.claveProdServ || '')) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-05', 'NARANJA', 'Carta Porte detectada con clave de producto/servicio no claramente logística.', c.claveProdServ || 'NO VIENE EN XML', 'Revisar clave fiscal del servicio.');
    });
    if (r.tipoCFDI === 'I' && !(r.ivaTraslado > 0) && !(r.baseIVAExento > 0) && !(r.baseNoObjeto > 0) && !(r.baseIVA0 > 0)) addAlert(alerts, r, 'IVA', 'IVA-05', 'NARANJA', 'Tratamiento de IVA no claro: sin IVA trasladado, exento, no objeto ni tasa 0 identificada.', r.uuid, 'Revisión manual del tratamiento de IVA.');
    if (/transporte|flete|acarreo/i.test((r.desglosePorConcepto || []).map((c: any) => c.descripcion).join(' ')) && getCartaPortePresente(r) !== 'SI') addAlert(alerts, r, 'CARTA PORTE', 'CP-01', 'ROJO', 'CFDI de transporte de carga sin Carta Porte detectada.', r.uuid, 'Solicitar complemento Carta Porte o soporte logístico.');
    const faltantesCp = getCartaPorteMissing(r);
    if (getCartaPortePresente(r) === 'SI' && faltantesCp.length) addAlert(alerts, r, 'CARTA PORTE', 'CP-02', 'NARANJA', 'Carta Porte incompleta.', faltantesCp.join(' | '), 'Completar datos logísticos faltantes.');
    if (/si|sí/i.test(transporte) && (detail?.mercancias || []).some((m: any) => !hasValue((m as any).fraccionArancelaria))) addAlert(alerts, r, 'CARTA PORTE', 'CP-03', 'NARANJA', 'Transporte internacional con mercancía sin fracción arancelaria.', detail?.mercanciaPrincipal || 'NO VIENE EN XML', 'Revisar datos de comercio exterior.');
    const distancia = Number(detail?.totalDistanciaRecorrida || 0);
    if (getCartaPortePresente(r) === 'SI' && (distancia < 1 || distancia > 5000)) addAlert(alerts, r, 'CARTA PORTE', 'CP-05', 'AMARILLO', 'Distancia atípica; revisar manualmente.', String(detail?.totalDistanciaRecorrida || 'NO VIENE EN XML'), 'Validar ruta/distancia.');
    if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'NARANJA', 'Estatus SAT no confirmado.', r.estatusSAT, 'Validar manualmente antes de usar en devolución/acreditamiento.');
    if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'ROJO', 'CFDI cancelado.', r.estatusSAT, 'No usar para acreditamiento/deducción sin revisión.');
    if ((seen.get(r.uuid) || 0) > 1) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-03', 'ROJO', 'UUID duplicado en lote.', r.uuid, 'Depurar duplicados.');
    // PAGO-01: solo aplica cuando la conciliación central no encontró NINGÚN
    // REP para este CFDI PPD (estado === 'SIN_EVIDENCIA_REP'). Sin REP no hay
    // fecha de pago conocida — NUNCA se decide con la fecha de la factura
    // (evaluarObligacionREP, cfdiEngine.ts), así que esta alerta SIEMPRE se
    // genera cuando falta evidencia, sin importar qué tan antigua sea la
    // factura: solo se suprime cuando un REP con FechaPago comprobada
    // demuestra que el pago fue anterior al 01/09/2018 (pagoHistoricamenteExento),
    // caso en el cual el estado ya no es SIN_EVIDENCIA_REP.
    //
    // Severidad y texto deliberadamente NO acusatorios: Sentinel solo conoce
    // los XML cargados en este lote, no si el pago se hizo o se documentó
    // fuera de él. NUNCA usar "impagada", "REP omitido", "incumplimiento
    // fiscal" ni "complemento obligatorio no emitido" — es una advertencia de
    // revisión (AMARILLO), no un hallazgo de riesgo crítico (ROJO/NARANJA).
    const facturaConciliada = facturaConciliadaPorUuid.get(String(r.uuid || '').toUpperCase());
    if (r.metodoPago === 'PPD' && r.tipoCFDI !== 'P' && facturaConciliada?.estado === 'SIN_EVIDENCIA_REP') {
      // El texto viene de la MISMA fuente central que Dashboard/Resumen/Excel
      // (facturaConciliada.observacion === evaluarObligacionREP(...).mensaje)
      // — no se duplica el copy en dos lugares.
      addAlert(alerts, r, 'PAGO', 'PAGO-01', 'AMARILLO', facturaConciliada.observacion, r.metodoPago, 'Cargar el complemento de pago (REP) correspondiente para determinar el estado de pago de esta factura.');
    }
  });
  return alerts;
};

const buildQualityRows = (results: ValidationResult[], cache?: XmlDocCache) => results.map(r => {
  const doc = parseXml(r, cache);
  const missing: string[] = [];
  if (!doc?.documentElement) missing.push('Comprobante');
  if (!firstNode(doc, 'Emisor')) missing.push('Emisor');
  if (!firstNode(doc, 'Receptor')) missing.push('Receptor');
  if (!(r.desglosePorConcepto || []).length) missing.push('Conceptos');
  if (getCartaPortePresente(r) === 'SI' && getCartaPorteMissing(r).length) missing.push(...getCartaPorteMissing(r));
  const numConceptos = nodes(doc, 'Concepto').length || (r.desglosePorConcepto || []).length;
  const numTraslados = nodes(doc, 'Traslado').length;
  const numMercancias = cp(r)?.mercancias?.length || 0;
  const criticos = Array.from(new Set(missing));
  const nivel = criticos.length === 0 ? 'ALTO' : criticos.length <= 2 ? 'MEDIO' : criticos.length <= 5 ? 'BAJO' : 'CRITICO';
  return {
    UUID: r.uuid,
    Archivo_XML: r.fileName,
    Tiene_Comprobante: doc?.documentElement ? 'SI' : 'NO',
    Tiene_Emisor: firstNode(doc, 'Emisor') ? 'SI' : 'NO',
    Tiene_Receptor: firstNode(doc, 'Receptor') ? 'SI' : 'NO',
    Num_Conceptos: numConceptos,
    Num_Traslados: numTraslados,
    Tiene_Carta_Porte: getCartaPortePresente(r),
    Version_Carta_Porte: cp(r)?.version || r.versionCartaPorte,
    Num_Origenes: cp(r)?.origenes?.length || 0,
    Num_Destinos: cp(r)?.destinos?.length || 0,
    Num_Mercancias: numMercancias,
    Num_Remolques: cp(r)?.autotransporte?.remolques?.length || 0,
    Num_Figuras: cp(r)?.figuras?.length || 0,
    Tiene_Complemento_Pago: normalizeSiNo(r.pagosPresente),
    Campos_Criticos_Faltantes: criticos.join(' | ') || 'NO APLICA',
    Nivel_Confianza_Lectura: nivel,
    Observacion_QA: criticos.length ? 'Requiere revisión de campos críticos faltantes' : 'Lectura completa para campos críticos',
  };
});

export const buildExecutiveSummaryRows = (results: ValidationResult[]) => {
  const total = results.length;

  // Resumen Operativo (cuadra con Dashboard)
  const usables = results.filter(r => r.resultado?.includes("🟢")).length;
  const alertas = results.filter(r => r.resultado?.includes("🟡")).length;
  const noUsables = results.filter(r => r.resultado?.includes("🔴")).length;
  const totalMonto = results.reduce((sum, r) => sum + (r.total || 0), 0);
  const montoRiesgo = results
    .filter(r => r.resultado?.includes("🔴") || r.resultado?.includes("🟡"))
    .reduce((sum, r) => sum + (r.total || 0), 0);
  // Conteo central de estatus SAT — misma función que usan RESUMEN EJECUTIVO
  // y el Dashboard, para que los tres siempre reporten la misma cifra.
  const conteoSAT = contarEstatusSAT(results);
  const { vigentes, cancelados, noConfirmados: noValidadosSAT, repExcluidos } = conteoSAT;

  // Semáforo Fiscal Preventivo
  const verdes = results.filter(r => r.fiscalRiskLevel === 'VERDE').length;
  const amarillos = results.filter(r => r.fiscalRiskLevel === 'AMARILLO').length;
  const rojos = results.filter(r => r.fiscalRiskLevel === 'ROJO').length;
  const sinRiesgo = results.filter(r => !r.fiscalRiskLevel).length;

  const ppdSinComp = results.filter(r => r.paymentMethodStatus === 'PPD_SIN_COMPLEMENTO').length;
  const pueRevisarCobro = results.filter(r => r.paymentMethodStatus === 'PUE_REVISAR_COBRO').length;
  const compFueraPeriodo = results.filter(r => r.paymentComplementStatus === 'COMPLEMENTO_FUERA_DE_PERIODO').length;
  const uuidRelNoEncontrado = results.filter(r => r.paymentComplementStatus === 'UUID_RELACIONADO_NO_ENCONTRADO').length;

  const ivaNoAcreditable = results.filter(r => r.ivaCreditabilityStatus === 'NO_ACREDITABLE');
  const ivaPotencialmenteNoAcreditableVal = ivaNoAcreditable.reduce((sum, r) => sum + (r.ivaTraslado || 0), 0);

  const ivaAcreditableRows = results.filter(r => r.ivaCreditabilityStatus === 'ACREDITABLE');
  const ivaAcreditableVal = ivaAcreditableRows.reduce((sum, r) => sum + (r.ivaTraslado || 0), 0);

  const ivaEnRevisionRows = results.filter(r => r.ivaCreditabilityStatus === 'POR_DETERMINAR' || r.fiscalRiskLevel === 'AMARILLO');
  const ivaEnRevisionVal = ivaEnRevisionRows.reduce((sum, r) => sum + (r.ivaTraslado || 0), 0);
  // Clasificacion direccional (fila por fila) para que los contadores cuadren con las cedulas
  const emitidosDir = results.filter(r => r.direccionCFDI === 'EMITIDO').length;
  const recibidosDir = results.filter(r => r.direccionCFDI === 'RECIBIDO').length;
  const noClasDir = results.filter(r => !r.direccionCFDI || r.direccionCFDI === 'REQUIERE_REVISION').length;
  const signoRes = (r: ValidationResult) => (String(r.tipoCFDI || '').toUpperCase() === 'E' ? -1 : 1);
  const notasEmit = results.filter(r => r.direccionCFDI === 'EMITIDO' && String(r.tipoCFDI || '').toUpperCase() === 'E').length;
  const notasRec = results.filter(r => r.direccionCFDI === 'RECIBIDO' && String(r.tipoCFDI || '').toUpperCase() === 'E').length;
  const ivaTrasladadoNeto = results.filter(r => r.direccionCFDI === 'EMITIDO').reduce((ac, r) => ac + (r.ivaTraslado || 0) * signoRes(r), 0);
  const ivaAcreditableNeto = results.filter(r => r.direccionCFDI === 'RECIBIDO').reduce((ac, r) => ac + (r.ivaTraslado || 0) * signoRes(r), 0);
  return [
    { Metrica: '=== 1. RESUMEN OPERATIVO ===', Valor: '' },
    { Metrica: 'CFDI procesados', Valor: total },
    { Metrica: 'Usables', Valor: usables },
    { Metrica: 'Alertas', Valor: alertas },
    { Metrica: 'No usables', Valor: noUsables },
    { Metrica: 'Monto total', Valor: Math.round(totalMonto * 100) / 100 },
    { Metrica: 'Monto en riesgo', Valor: Math.round(montoRiesgo * 100) / 100 },
    { Metrica: '', Valor: '' },
    { Metrica: '=== 1A. ESTATUS SAT (Vigentes + Cancelados + No confirmados + REP excluidos = total) ===', Valor: '' },
    { Metrica: 'Vigentes', Valor: vigentes },
    { Metrica: 'Cancelados', Valor: cancelados },
    { Metrica: 'No validados SAT', Valor: noValidadosSAT },
    { Metrica: 'REP excluidos de validación SAT (Total=0.00, no es error)', Valor: repExcluidos },
    { Metrica: '', Valor: '' },
    { Metrica: '=== 1B. DIRECCION (clasificacion fila por fila) ===', Valor: '' },
    { Metrica: 'Emitidos (empresa vende)', Valor: emitidosDir },
    { Metrica: 'Recibidos (empresa compra)', Valor: recibidosDir },
    { Metrica: 'No clasificados (REQUIERE_REVISION)', Valor: noClasDir },
    { Metrica: 'Notas de credito emitidas', Valor: notasEmit },
    { Metrica: 'Notas de credito recibidas', Valor: notasRec },
    { Metrica: 'IVA trasladado neto (emitidos, notas restan)', Valor: Math.round(ivaTrasladadoNeto * 100) / 100 },
    { Metrica: 'IVA acreditable neto (recibidos, notas restan)', Valor: Math.round(ivaAcreditableNeto * 100) / 100 },
    { Metrica: '', Valor: '' },
    { Metrica: '=== 2. REVISIÓN FISCAL PREVENTIVA ===', Valor: '' },
    { Metrica: 'CFDI sin riesgo fiscal preventivo', Valor: verdes },
    { Metrica: 'CFDI con revisión fiscal preventiva', Valor: amarillos },
    { Metrica: 'CFDI con riesgo fiscal preventivo', Valor: rojos },
    { Metrica: 'PPD sin complemento', Valor: ppdSinComp },
    { Metrica: 'PUE revisar cobro', Valor: pueRevisarCobro },
    { Metrica: 'Complementos fuera de periodo', Valor: compFueraPeriodo },
    { Metrica: 'UUID relacionado no encontrado', Valor: uuidRelNoEncontrado },
    { Metrica: 'IVA acreditable', Valor: Math.round(ivaAcreditableVal * 100) / 100 },
    { Metrica: 'IVA en revisión', Valor: Math.round(ivaEnRevisionVal * 100) / 100 },
    { Metrica: 'IVA potencialmente no acreditable', Valor: Math.round(ivaPotencialmenteNoAcreditableVal * 100) / 100 },
    { Metrica: '', Valor: '' },
    { Metrica: '=== 3. VALIDACIÓN LISTA 69-B ===', Valor: '' },
    { Metrica: 'Total RFC revisados 69-B', Valor: results.filter(r => r.rfcEmisorBlacklist && !r.rfcEmisorBlacklist.notSynced).length },
    { Metrica: 'Sin coincidencia 69-B', Valor: results.filter(r => r.rfcEmisorBlacklist && !r.rfcEmisorBlacklist.notSynced && !r.rfcEmisorBlacklist.found).length },
    { Metrica: 'Presuntos 69-B', Valor: results.filter(r => { const bl = r.rfcEmisorBlacklist; return bl?.found && (bl.situacion || '').toLowerCase().includes('presunto'); }).length },
    { Metrica: 'Definitivos 69-B', Valor: results.filter(r => { const bl = r.rfcEmisorBlacklist; return bl?.found && (bl.situacion || '').toLowerCase().includes('definitivo'); }).length },
    { Metrica: 'Desvirtuados 69-B', Valor: results.filter(r => { const bl = r.rfcEmisorBlacklist; return bl?.found && (bl.situacion || '').toLowerCase().includes('desvirtuado'); }).length },
    { Metrica: 'Sentencia favorable 69-B', Valor: results.filter(r => { const bl = r.rfcEmisorBlacklist; return bl?.found && ((bl.situacion || '').toLowerCase().includes('sentencia') || (bl.situacion || '').toLowerCase().includes('favorable')); }).length },
    { Metrica: 'Requieren revisión 69-B', Valor: results.filter(r => { const bl = r.rfcEmisorBlacklist; return bl?.multiEstado; }).length },
    { Metrica: 'No validados 69-B (lista no cargada)', Valor: results.filter(r => r.rfcEmisorBlacklist?.notSynced).length },
    { Metrica: '', Valor: '' },
    { Metrica: 'NOTA EXPLICATIVA', Valor: 'El resumen operativo mide usabilidad del CFDI. La revisión fiscal preventiva mide posibles puntos de revisión por método de pago, complementos, UUID relacionados e IVA. Un CFDI puede ser usable operativamente y aun así requerir revisión preventiva.' }
  ];
};

const buildSummaryRows = (results: ValidationResult[], alerts: any[]) => {
  const total = results.length;
  // Conteo central de estatus SAT — misma función que usan la hoja "Resumen"
  // y el Dashboard (ver cfdiEngine.ts). Corrige un conteo que siempre daba 0
  // porque comparaba contra un string de respaldo que en la práctica nunca
  // se produce (ver la nota extensa en contarEstatusSAT).
  const conteoSAT = contarEstatusSAT(results);
  const cpRows = results.filter(r => getCartaPortePresente(r) === 'SI');
  const tasa0 = results.filter(r => (r.baseIVA0 || 0) > 0).length;
  const ppdSinPago = results.filter(r => r.metodoPago === 'PPD' && normalizeSiNo(r.pagosPresente) !== 'SI').length;
  // Conciliación PPD↔REP (item 4 de la auditoría): totales que deben cuadrar
  // exactamente con las hojas "CONCILIACION PAGOS PPD" y "CONCILIACION REP".
  const { facturas: conciliacionFacturas, reps: conciliacionReps } = reconciliarPagosPPD(results);
  const facturasPPD = conciliacionFacturas.filter(f => f.metodoPago === 'PPD');
  const ppdSinEvidencia = facturasPPD.filter(f => f.estado === 'SIN_EVIDENCIA_REP').length;
  const ppdParcial = facturasPPD.filter(f => f.estado === 'PARCIAL').length;
  const ppdLiquidada = facturasPPD.filter(f => f.estado === 'LIQUIDADA').length;
  const ppdRevisionMoneda = facturasPPD.filter(f => f.estado === 'REQUIERE_REVISION_MONEDA').length;
  const ppdRevisionFecha = facturasPPD.filter(f => f.estado === 'REQUIERE_REVISION_FECHA').length;
  const ppdRequiereRevision = ppdRevisionMoneda + ppdRevisionFecha;
  // Informativo, NUNCA resta del total PPD: REP con FechaPago comprobada
  // anterior al 01/09/2018 (evaluarObligacionREP) — el documento ya cuenta
  // como liquidada/parcial en su bucket correspondiente.
  const ppdPagoHistoricamenteExento = facturasPPD.filter(f => f.pagoHistoricamenteExento).length;
  const repRelacionados = conciliacionReps.filter(r => r.estado === 'RELACIONADO').length;
  const repSinFactura = conciliacionReps.filter(r => r.estado === 'SIN_FACTURA_RELACIONADA').length;
  const repRechazados = conciliacionReps.filter(r => r.estado === 'RECHAZADO_ERROR').length;
  const repDuplicados = conciliacionReps.filter(r => r.estado === 'DUPLICADO').length;
  const byRisk = (risk: string) => alerts.filter(a => a.Nivel_Riesgo === risk).length;
  const topAlertas = Object.entries(alerts.reduce((acc: any, a) => { acc[a.Regla] = (acc[a.Regla] || 0) + 1; return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'NO APLICA';
  const topEmisores = Object.entries(results.reduce((acc: any, r) => { acc[r.rfcEmisor] = (acc[r.rfcEmisor] || 0) + Number(r.total || 0); return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]: any) => `${k}: ${Math.round(v * 100) / 100}`).join(' | ') || 'NO APLICA';
  return [
    { Metrica: 'Total XML recibidos', Valor: total },
    { Metrica: 'Total XML procesados', Valor: total },
    { Metrica: 'Total errores lectura', Valor: results.filter(r => r.resultado === 'ERROR').length },
    { Metrica: 'Total CFDI con SAT no confirmado', Valor: conteoSAT.noConfirmados },
    { Metrica: 'Total CFDI vigentes', Valor: conteoSAT.vigentes },
    { Metrica: 'Total CFDI cancelados', Valor: conteoSAT.cancelados },
    { Metrica: 'Total REP excluidos de validación SAT (Total=0.00, no es error)', Valor: conteoSAT.repExcluidos },
    { Metrica: 'Total con Carta Porte', Valor: cpRows.length },
    { Metrica: 'Total con Carta Porte completa', Valor: cpRows.filter(r => r.cartaPorteCompleta === 'SI').length },
    { Metrica: 'Regla de Carta Porte Completa', Valor: 'Simultáneamente Origen, Destino, Mercancías con Peso/Cantidad, Vehículo con Placa/Permiso/Seguro y Figura con RFC/Licencia' },
    { Metrica: 'Total sin Carta Porte cuando aplica', Valor: results.filter(r => r.requiereCartaPorte === 'SI' && getCartaPortePresente(r) !== 'SI').length },
    { Metrica: 'Total PPD sin complemento de pago', Valor: ppdSinPago },
    { Metrica: 'Facturas PPD - sin evidencia REP', Valor: ppdSinEvidencia },
    { Metrica: 'Facturas PPD - pagadas parcialmente', Valor: ppdParcial },
    { Metrica: 'Facturas PPD - liquidadas', Valor: ppdLiquidada },
    { Metrica: 'Facturas PPD - requieren revisión (moneda)', Valor: ppdRevisionMoneda },
    { Metrica: 'Facturas PPD - requieren revisión (fecha insuficiente)', Valor: ppdRevisionFecha },
    { Metrica: 'Facturas PPD - pago comprobado antes del 01/09/2018 (informativo, YA incluidas en parciales/liquidadas)', Valor: ppdPagoHistoricamenteExento },
    { Metrica: 'Facturas PPD total (= sin evidencia + parciales + liquidadas + requieren revisión)', Valor: ppdSinEvidencia + ppdParcial + ppdLiquidada + ppdRequiereRevision },
    { Metrica: 'REP cargados - relacionados', Valor: repRelacionados },
    { Metrica: 'REP cargados - sin factura relacionada en este análisis (huérfanos)', Valor: repSinFactura },
    { Metrica: 'REP cargados - rechazados por error', Valor: repRechazados },
    { Metrica: 'REP cargados - duplicados', Valor: repDuplicados },
    { Metrica: 'REP cargados total (= relacionados + huérfanos + rechazados + duplicados)', Valor: repRelacionados + repSinFactura + repRechazados + repDuplicados },
    { Metrica: 'Total CFDI tasa 0%', Valor: tasa0 },
    { Metrica: 'Total alertas rojas', Valor: byRisk('ROJO') },
    { Metrica: 'Total alertas naranjas', Valor: byRisk('NARANJA') },
    { Metrica: 'Total alertas amarillas', Valor: byRisk('AMARILLO') },
    { Metrica: 'Total IVA en riesgo', Valor: alerts.filter(a => a.Tipo_Alerta === 'IVA' && ['ROJO', 'NARANJA'].includes(a.Nivel_Riesgo)).length },
    { Metrica: 'Total IVA aparentemente soportado', Valor: alerts.filter(a => a.Regla === 'IVA-01').length },
    { Metrica: 'Top 5 alertas', Valor: topAlertas },
    { Metrica: 'Top emisores por importe', Valor: topEmisores },
    { Metrica: 'Rutas principales', Valor: cpRows.map(routeSummary).filter(hasValue).slice(0, 5).join(' | ') || 'NO APLICA' },
  ];
};

const applySheetDefaults = (ws: any) => {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = (XLSX as any).utils.decode_range(ref);
  ws['!autofilter'] = { ref };
  ws['!panes'] = { ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const firstRow = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[(XLSX as any).utils.encode_cell({ r: 0, c })];
    firstRow.push(String(cell?.v || ''));
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4788' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  }
  ws['!cols'] = firstRow.map(h => ({ wch: Math.min(Math.max(h.length + 4, 14), 42) }));
};

const applyIvaSheetDefaults = (ws: any) => {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = (XLSX as any).utils.decode_range(ref);
  ws['!autofilter'] = { ref: (XLSX as any).utils.encode_range({ s: { r: 1, c: range.s.c }, e: { r: range.e.r, c: range.e.c } }) };
  ws['!panes'] = { ySplit: 2, topLeftCell: 'A3', activePane: 'bottomLeft', state: 'frozen' };
  
  const cellA1 = ws['A1'];
  if (cellA1) {
    cellA1.s = {
      font: { bold: true, color: { rgb: '1F4788' }, name: 'Calibri', sz: 11 },
      fill: { fgColor: { rgb: 'EBF1FA' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    };
  }
  
  const firstRow = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[(XLSX as any).utils.encode_cell({ r: 1, c })];
    firstRow.push(String(cell?.v || ''));
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4788' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  }
  ws['!cols'] = firstRow.map(h => ({ wch: Math.min(Math.max(h.length + 4, 14), 42) }));
};

// Cede el control al event loop del navegador entre hojas — permite que React
// pinte el progreso ("Generando hoja X de N") y que la interfaz no se sienta
// congelada durante una exportación de miles de registros.
const yieldToMain = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// P0-A (requisitos 1-3, 7-8, 10, 13-14): construcción segura de hoja.
// - Nunca pasa objetos/arrays/nodos crudos a SheetJS (rowsToAOA sanea cada celda).
// - Usa aoa_to_sheet con encabezados explícitos, no json_to_sheet sobre datos sin verificar.
// - Divide automáticamente en NOMBRE_1/NOMBRE_2/... si excede 1,048,576 filas.
// - Cede el hilo antes de construir cada hoja para que el progreso sea visible.
// - Si falla la construcción de ESTA hoja, no aborta el libro completo: registra el
//   error, reporta qué hoja y en qué etapa falló, y agrega una hoja de aviso visible
//   en su lugar para que el resto del reporte se conserve íntegro.
const appendJsonSheet = async (
  wb: any,
  data: any[],
  name: string,
  onProgress?: ExportProgressCallback,
  sheetIndex = 0,
  totalSheets = 0
) => {
  onProgress?.({ sheet: name, stage: 'building', sheetIndex, totalSheets });
  await yieldToMain();
  try {
    // appendJsonSheet siempre mostró un placeholder "SIN REGISTROS" para datos
    // vacíos (comportamiento previo preservado); las cédulas dirigidas que
    // legítimamente pueden quedar vacías usan buildSafeSheets directamente
    // sin este placeholder (ver nota en buildSafeSheets).
    const chunks = buildSafeSheets(data && data.length ? data : [{ Estado: 'SIN REGISTROS' }], name);
    chunks.forEach(c => c.rows.length && applySheetDefaults(c.ws));
    appendSheetChunks(wb, chunks);
    onProgress?.({ sheet: name, stage: 'done', sheetIndex, totalSheets });
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[excelExporter] Fallo construyendo la hoja "${name}":`, err);
    onProgress?.({ sheet: name, stage: 'error', sheetIndex, totalSheets, error: message, affectedRows: Array.isArray(data) ? data.length : undefined });
    try {
      const errorWs = (XLSX as any).utils.aoa_to_sheet([
        ['ERROR AL GENERAR ESTA HOJA'],
        ['Hoja afectada', name],
        ['Detalle técnico', message],
        ['Las demás hojas del reporte se generaron correctamente.'],
        ['Si el problema persiste, reporte este mensaje a soporte junto con el lote de XML usado.'],
      ]);
      (XLSX as any).utils.book_append_sheet(wb, errorWs, uniqueSheetName(wb, `ERROR_${name}`));
    } catch (fallbackErr) {
      console.error('[excelExporter] No se pudo ni siquiera crear la hoja de aviso de error:', fallbackErr);
    }
  }
};

// ─── Helper: resuelve Coincide_Tasa con reglas estrictas sin includes/startsWith ───────────────
// Coincide_Tasa = SI ÚNICAMENTE si la tasa facturada coincide exactamente con la esperada
// y la tasa esperada NO contiene condiciones, soporte pendiente o indeterminación.
const resolveCoincideTasa = (
  tasaFacturadaXML: string,
  tasaEsperadaSugerida: string,
  tieneSoporteDocumentalSuficiente: boolean
): string => {
  if (tasaEsperadaSugerida === 'NO APLICA' || tasaFacturadaXML === 'NO APLICA') return 'NO APLICA';

  const esCondicional =
    tasaEsperadaSugerida.includes('REQUIERE') ||
    tasaEsperadaSugerida.includes('SUJETA') ||
    tasaEsperadaSugerida.includes('REVISAR');

  if (esCondicional) return 'REVISAR';

  if (tasaFacturadaXML === 'INDETERMINADO' || tasaEsperadaSugerida === 'INDETERMINADO') return 'INDETERMINADO';

  // Tasa 0%: exige soporte documental suficiente (Carta Porte + pedimento/DODA)
  if (tasaFacturadaXML === '0%' && tasaEsperadaSugerida === '0%') {
    return tieneSoporteDocumentalSuficiente ? 'SI' : 'REVISAR';
  }
  // Tasa 16%: coincidencia exacta basta
  if (tasaFacturadaXML === '16%' && tasaEsperadaSugerida === '16%') return 'SI';
  // No objeto
  if (tasaFacturadaXML === 'NO OBJETO' && tasaEsperadaSugerida === 'NO OBJETO') return 'SI';
  // Exento
  if (tasaFacturadaXML === 'EXENTO' && tasaEsperadaSugerida === 'EXENTO') return 'SI';

  return 'NO';
};



const buildComparativoBaseTasaRows = (results: ValidationResult[]) => {
  // Determine dominant RFC to identify EMITIDO vs RECIBIDO
  const rfcCounts = new Map<string, number>();
  results.forEach(r => {
    const emisor = String(r.rfcEmisor || '').trim().toUpperCase();
    const receptor = String(r.rfcReceptor || '').trim().toUpperCase();
    if (emisor) rfcCounts.set(emisor, (rfcCounts.get(emisor) || 0) + 1);
    if (receptor) rfcCounts.set(receptor, (rfcCounts.get(receptor) || 0) + 1);
  });

  const sortedRfcs = Array.from(rfcCounts.entries()).sort((a, b) => b[1] - a[1]);

  let rfcPrincipal = '';
  const THRESHOLD_PERCENT = 10.0;

  if (sortedRfcs.length > 0) {
    const [firstRfc, firstCount] = sortedRfcs[0];
    if (sortedRfcs.length > 1) {
      const [secondRfc, secondCount] = sortedRfcs[1];
      const diffPercent = ((firstCount - secondCount) / firstCount) * 100;
      if (diffPercent < THRESHOLD_PERCENT) {
        rfcPrincipal = 'LOTE_MIXTO';
        console.log(`[excelExporter] Ambigüedad por margen bajo detectada. Primer RFC: ${firstRfc} (${firstCount}), Segundo RFC: ${secondRfc} (${secondCount}). Diferencia: ${diffPercent.toFixed(2)}% < ${THRESHOLD_PERCENT}%. Se marca como LOTE_MIXTO.`);
      } else {
        rfcPrincipal = firstRfc;
        console.log(`[excelExporter] RFC Principal elegido: ${rfcPrincipal} con ${firstCount} conteos. Segundo RFC: ${secondRfc} con ${secondCount} (Diferencia: ${diffPercent.toFixed(2)}%).`);
      }
    } else {
      rfcPrincipal = firstRfc;
      console.log(`[excelExporter] RFC Principal elegido (único): ${rfcPrincipal} con ${firstCount} conteos.`);
    }
  } else {
    console.log(`[excelExporter] No se encontraron RFCs en el lote.`);
  }

  return results.flatMap(r => {
    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];

    // ── Perspectiva fiscal ──
    let perspectivaAnalisis: string;
    let naturalezaCFDI: string;
    let efectoFiscalPrincipal: string;
    let ivaAnalizadoComo: string;
    let accionSegunPerspectiva: string;

    const cleanEmisor = String(r.rfcEmisor || '').trim().toUpperCase();
    const cleanReceptor = String(r.rfcReceptor || '').trim().toUpperCase();

    if (r.tipoCFDI === 'P') {
      perspectivaAnalisis = 'COMPLEMENTO_PAGO';
      naturalezaCFDI = 'Pago';
      efectoFiscalPrincipal = 'Soporte de pago (no acumula base)';
      ivaAnalizadoComo = 'SOPORTE_DE_PAGO';
      accionSegunPerspectiva = 'Validar soporte de flujo de efectivo; no duplicar en base gravada';
    } else if (r.tipoCFDI === 'E') {
      perspectivaAnalisis = 'EGRESO_AJUSTE';
      naturalezaCFDI = 'Egreso';
      efectoFiscalPrincipal = 'Amortización/Ajuste (Nota de Crédito)';
      ivaAnalizadoComo = 'AJUSTE_NO_ACUMULABLE';
      accionSegunPerspectiva = 'Verificar que disminuye ingresos o devuelve saldos; no sumar como ingreso ordinario';
    } else if (r.tipoCFDI === 'T') {
      perspectivaAnalisis = 'TRASLADO_LOGISTICO';
      naturalezaCFDI = 'Traslado';
      efectoFiscalPrincipal = 'Movimiento logístico (sin efecto directo en IVA)';
      ivaAnalizadoComo = 'NO APLICA';
      accionSegunPerspectiva = 'Usar solo para trazabilidad; no asignar base fiscal de IVA';
    } else if (rfcPrincipal && rfcPrincipal !== 'LOTE_MIXTO' && cleanEmisor === rfcPrincipal) {
      perspectivaAnalisis = 'EMITIDO_IVA_TRASLADADO';
      naturalezaCFDI = 'Ingreso';
      efectoFiscalPrincipal = 'Ingreso gravado/facturado';
      ivaAnalizadoComo = 'IVA_TRASLADADO';
      accionSegunPerspectiva = 'Verificar tasa correcta; corregir CFDI o integrar soporte de tasa 0%';
    } else if (rfcPrincipal && rfcPrincipal !== 'LOTE_MIXTO' && cleanReceptor === rfcPrincipal) {
      perspectivaAnalisis = 'RECIBIDO_IVA_ACREDITABLE';
      naturalezaCFDI = 'Ingreso';
      efectoFiscalPrincipal = 'Gasto deducible / Acreditamiento';
      ivaAnalizadoComo = 'IVA_ACREDITABLE_CONDICIONADO';
      accionSegunPerspectiva = 'Validar materialidad, soporte del gasto y complemento de pago si aplica';
    } else {
      if (rfcPrincipal === 'LOTE_MIXTO') {
        perspectivaAnalisis = 'LOTE_MIXTO_REVISION';
        naturalezaCFDI = 'Lote mixto o margen insuficiente para determinar empresa auditada dominante; revisar manualmente la perspectiva emitido/recibido antes de interpretar IVA.';
        efectoFiscalPrincipal = 'Lote mixto o margen insuficiente para determinar empresa auditada dominante; revisar manualmente la perspectiva emitido/recibido antes de interpretar IVA.';
        ivaAnalizadoComo = 'LOTE_MIXTO';
        accionSegunPerspectiva = 'Lote mixto o margen insuficiente para determinar empresa auditada dominante; revisar manualmente la perspectiva emitido/recibido antes de interpretar IVA.';
      } else {
        perspectivaAnalisis = 'INDETERMINADO';
        naturalezaCFDI = 'Indeterminado';
        efectoFiscalPrincipal = 'Indeterminado';
        ivaAnalizadoComo = 'INDETERMINADO';
        accionSegunPerspectiva = 'Revisar manualmente la naturaleza del XML antes de interpretar IVA';
      }
    }

    // ── PPD / Complemento de pago columns ──
    const requiereCP = r.metodoPago === 'PPD' ? 'SI' : (r.metodoPago === 'PUE' ? 'NO' : 'NO APLICA');
    const cpLocalizado = (r.tipoCFDI !== 'P' && r.tipoCFDI !== 'T') ? normalizeSiNo(r.pagosPresente) : 'NO APLICA';
    let riesgoPPD = 'NO APLICA';
    if (requiereCP === 'SI' && cpLocalizado === 'NO') {
      if (perspectivaAnalisis === 'RECIBIDO_IVA_ACREDITABLE') {
        riesgoPPD = 'ALTO: IVA acreditable condicionado al pago; solicitar REP';
        accionSegunPerspectiva = 'Solicitar complemento de pago al proveedor';
      } else if (perspectivaAnalisis === 'EMITIDO_IVA_TRASLADADO') {
        riesgoPPD = 'MEDIO: REP pendiente de emitir; revisar cobranza';
        accionSegunPerspectiva = 'Emitir complemento de pago si ya se cobró';
      }
    } else if (requiereCP === 'SI' && cpLocalizado === 'SI') {
      riesgoPPD = 'BAJO: Pago soportado';
    }

    // ── Cruce fronterizo / Transcruces ──
    const esTranscruces = /transcruces/i.test(String(r.nombreEmisor || '')) ||
      /transcruces/i.test(String(r.nombreReceptor || '')) ||
      /transcruces/i.test(String(r.fileName || ''));
    const transporteInternacional = normalizeI18nSiNo(detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional);
    const paisOrigen = mainOrigen?.pais || 'NO VIENE EN XML';
    const paisDestino = mainDestino?.pais || 'NO VIENE EN XML';
    const esCruceFronterizo =
      transporteInternacional === 'SI' ||
      (paisOrigen === 'MEX' && paisDestino !== 'MEX' && paisDestino !== 'NO VIENE EN XML') ||
      (paisOrigen !== 'MEX' && paisOrigen !== 'NO VIENE EN XML' && paisDestino === 'MEX') ? 'SI' : 'NO';

    const cartaPortePresente = getCartaPortePresente(r);
    const distanciaCp = Number(detail?.totalDistanciaRecorrida || 0);
    // Soporte logístico: Carta Porte presente (prueba de movimiento, NO soporte aduanal)
    const tieneSoporteLogistico = cartaPortePresente === 'SI';
    // Soporte aduanal: solo pedimento o DODA (evidencia aduanera real)
    const tieneSoporteAduanal = normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'SI' ||
      normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'SI';
    // Soporte documental suficiente: requiere AMBOS logístico Y aduanal para tasa 0% internacional
    const tieneSoporteSuficiente = tieneSoporteLogistico && tieneSoporteAduanal;
    // Compatibilidad: para operaciones nacionales y exentos, Carta Porte es soporte suficiente
    const tieneSoporte = tieneSoporteAduanal || cartaPortePresente === 'SI';

    // Distancia risk — Transcruces only gets lower risk for SHORT distance; tasa still needs independent validation
    let riesgoDistancia = 'NO APLICA';
    let justificacionDistancia = 'NO APLICA';
    if (cartaPortePresente === 'SI') {
      if (esTranscruces === true && esCruceFronterizo === 'SI' && distanciaCp < 50) {
        riesgoDistancia = 'BAJO';
        justificacionDistancia = 'NORMAL PARA CRUCE FRONTERIZO / REVISAR SOPORTE DOCUMENTAL';
      } else if (esCruceFronterizo === 'SI') {
        riesgoDistancia = 'BAJO';
        justificacionDistancia = 'Distancia consistente con operación internacional';
      } else if (distanciaCp < 1 || distanciaCp < 50) {
        riesgoDistancia = 'MEDIO-ALTO';
        justificacionDistancia = 'Distancia corta; requiere validación contra ruta real';
      } else {
        riesgoDistancia = 'BAJO';
        justificacionDistancia = 'Distancia normal';
      }
    }

    // Use single placeholder concept for P/E/T to avoid empty rows
    const conceptosFuente: any[] = (r.desglosePorConcepto && r.desglosePorConcepto.length > 0)
      ? r.desglosePorConcepto
      : [{ claveProdServ: 'N/A', descripcion: `CFDI tipo ${r.tipoCFDI}`, objetoImp: 'N/A', importe: r.total || 0, traslados: [], retenciones: [] }];

    return conceptosFuente.map((concepto: any) => {
      // ── Extract IVA from traslado ──
      let baseXML: string | number = 'NO VIENE EN XML';
      let importeIvaXML: string | number = 'NO VIENE EN XML';
      let tipoFactorXML = 'NO VIENE EN XML';
      let tasaOCuotaXML = 'NO VIENE EN XML';
      let impuestoXML = 'NO VIENE EN XML';
      let tasaFacturadaXML = 'INDETERMINADO';

      const traslados: any[] = concepto.traslados || [];
      const ivaT = traslados.find((t: any) => t.impuesto === '002');
      if (ivaT) {
        baseXML = ivaT.base ?? 'NO VIENE EN XML';
        importeIvaXML = ivaT.importe ?? 0;
        tipoFactorXML = String(ivaT.tipoFactor || 'NO VIENE EN XML');
        tasaOCuotaXML = String(ivaT.tasa || 'NO VIENE EN XML');
        impuestoXML = ivaT.impuesto;
      }

      // Determine Tasa Facturada XML
      if (concepto.objetoImp === '01') {
        tasaFacturadaXML = 'NO OBJETO';
        baseXML = Number(concepto.importe || 0) - Number(concepto.descuento || 0);
      } else if (ivaT) {
        const tfUp = tipoFactorXML.toUpperCase();
        if (tfUp === 'EXENTO') {
          tasaFacturadaXML = 'EXENTO';
        } else if (tasaOCuotaXML !== 'NO VIENE EN XML' && tasaOCuotaXML !== '') {
          const tNum = Number(tasaOCuotaXML);
          if (!isNaN(tNum)) {
            if (tNum === 0.16) tasaFacturadaXML = '16%';
            else if (tNum === 0.08) tasaFacturadaXML = '8%';
            else if (tNum === 0) tasaFacturadaXML = '0%';
          }
        }
      }

      // ── Tasa esperada + Riesgo ──
      let tasaEsperadaSugerida = 'INDETERMINADO';
      let nivelRiesgo = 'BAJO';
      let motivoDiferencia = 'Operación normal';
      let accionRecomendada = accionSegunPerspectiva;

      // COMPLEMENTO_PAGO / EGRESO_AJUSTE / TRASLADO_LOGISTICO: no acumulan base fiscal
      if (perspectivaAnalisis === 'COMPLEMENTO_PAGO' || perspectivaAnalisis === 'EGRESO_AJUSTE' || perspectivaAnalisis === 'TRASLADO_LOGISTICO') {
        tasaEsperadaSugerida = 'NO APLICA';
        nivelRiesgo = 'BAJO';
        motivoDiferencia = `Naturaleza ${naturalezaCFDI}: no acumula a la base de facturación para evitar duplicidad`;
      }
      // ObjetoImp=01 no objeto con IVA
      else if (concepto.objetoImp === '01') {
        tasaEsperadaSugerida = 'NO OBJETO';
        if (typeof importeIvaXML === 'number' && importeIvaXML > 0) {
          nivelRiesgo = 'CRITICO';
          motivoDiferencia = 'ObjetoImp=01 con IVA trasladado; inconsistencia fiscal';
          accionRecomendada = 'Revisar estructura fiscal del XML; corregir CFDI';
        }
      }
      // Exento
      else if (tipoFactorXML.toUpperCase() === 'EXENTO') {
        tasaEsperadaSugerida = 'EXENTO / REVISAR FUNDAMENTO';
        if (!tieneSoporte) {
          nivelRiesgo = 'MEDIO';
          motivoDiferencia = 'Exención sin soporte claro identificado';
          accionRecomendada = 'Validar fundamento fiscal de la exención';
        }
      }
      // Transcruces + cruce fronterizo:
      // La regla especial SOLO ajusta el riesgo por distancia corta.
      // La tasa requiere soporte ADUANAL (pedimento/DODA), no solo logístico (Carta Porte).
      else if (esTranscruces && esCruceFronterizo === 'SI') {
        if (tieneSoporteAduanal) {
          // Tiene pedimento o DODA: soporte aduanal suficiente
          tasaEsperadaSugerida = '0% SUJETA A SOPORTE';
          nivelRiesgo = tasaFacturadaXML === '16%' ? 'MEDIO' : 'BAJO';
          motivoDiferencia = tasaFacturadaXML === '16%'
            ? 'Cruce fronterizo facturado al 16%; revisar tratamiento fiscal'
            : 'Tasa 0% con soporte aduanal detectado (pedimento/DODA)';
        } else if (tieneSoporteLogistico) {
          // Solo tiene Carta Porte, sin pedimento/DODA: soporte logístico pero no aduanal completo
          tasaEsperadaSugerida = '0% REQUIERE SOPORTE ADUANAL';
          nivelRiesgo = 'MEDIO-ALTO';
          motivoDiferencia = 'Tasa 0% requiere soporte documental suficiente; distancia corta consistente con cruce fronterizo no valida por si sola el tratamiento fiscal.';
          accionRecomendada = 'Solicitar pedimento o DODA; la Carta Porte es soporte logístico pero no aduanal suficiente';
        } else {
          // Sin Carta Porte ni pedimento/DODA
          tasaEsperadaSugerida = '0% REQUIERE SOPORTE';
          nivelRiesgo = 'ALTO';
          motivoDiferencia = 'Tasa 0% requiere soporte documental suficiente; distancia corta consistente con cruce fronterizo no valida por si sola el tratamiento fiscal.';
          accionRecomendada = 'Solicitar Carta Porte, pedimento y/o DODA';
        }
      }
      // Internacional sin Transcruces
      else if (esCruceFronterizo === 'SI') {
        tasaEsperadaSugerida = '0% SUJETA A SOPORTE';
        if (tasaFacturadaXML === '16%') {
          nivelRiesgo = 'MEDIO';
          motivoDiferencia = 'Operación internacional facturada al 16%; revisar tratamiento fiscal';
          accionRecomendada = 'Revisar con asesor fiscal antes de declarar';
        } else if (tasaFacturadaXML === '0%' && !tieneSoporteAduanal) {
          nivelRiesgo = tieneSoporteLogistico ? 'MEDIO-ALTO' : 'ALTO';
          motivoDiferencia = tieneSoporteLogistico
            ? 'Tasa 0% con Carta Porte pero sin soporte aduanal (pedimento/DODA)'
            : 'Tasa 0% sin soporte documental suficiente';
          accionRecomendada = 'Solicitar pedimento o soporte de exportación';
        }
      }
      // Nacional
      else if (paisOrigen === 'MEX' && paisDestino === 'MEX') {
        tasaEsperadaSugerida = '16%';
        if (tasaFacturadaXML === '0%') {
          nivelRiesgo = 'ALTO';
          motivoDiferencia = 'Tasa 0% en operación aparentemente nacional';
          accionRecomendada = 'Validar fundamento fiscal de tasa 0% en operación nacional';
        }
      }
      // Indeterminado
      else {
        tasaEsperadaSugerida = 'INDETERMINADO';
        nivelRiesgo = perspectivaAnalisis === 'INDETERMINADO' ? 'MEDIO' : 'MEDIO';
        motivoDiferencia = 'Datos insuficientes para determinar tipo de operación';
        accionRecomendada = 'Revisión manual del concepto y soporte documental';
      }

      // ── Cálculos esperados (solo si NO es pago/egreso/traslado y base válida) ──
      let baseEsperadaSugerida: string | number = 'NO APLICA';
      let ivaEsperadoSugerido: string | number = 'NO APLICA';
      let diferenciaBase: string | number = 'NO APLICA';
      let diferenciaIVA: string | number = 'NO DETERMINABLE';

      if (perspectivaAnalisis !== 'COMPLEMENTO_PAGO' && perspectivaAnalisis !== 'EGRESO_AJUSTE' && perspectivaAnalisis !== 'TRASLADO_LOGISTICO' && baseXML !== 'NO VIENE EN XML') {
        baseEsperadaSugerida = baseXML;
        const bNum = Number(baseXML);
        if (tasaEsperadaSugerida === '16%') ivaEsperadoSugerido = Math.round(bNum * 0.16 * 100) / 100;
        else if (tasaEsperadaSugerida.includes('0%')) ivaEsperadoSugerido = 0;
        if (typeof ivaEsperadoSugerido === 'number' && typeof importeIvaXML === 'number') {
          diferenciaIVA = Math.round((ivaEsperadoSugerido - importeIvaXML) * 100) / 100;
        }
      }

      // ── Coincidencias ──
      let coincideBase = 'INDETERMINADO';
      let coincideTasa = 'INDETERMINADO';
      let coincideXmlVsEsperado = 'INDETERMINADO';

      if (perspectivaAnalisis === 'COMPLEMENTO_PAGO' || perspectivaAnalisis === 'EGRESO_AJUSTE' || perspectivaAnalisis === 'TRASLADO_LOGISTICO') {
        coincideBase = 'NO APLICA'; coincideTasa = 'NO APLICA'; coincideXmlVsEsperado = 'NO APLICA';
      } else {
        if (baseEsperadaSugerida !== 'NO APLICA' && baseXML !== 'NO VIENE EN XML')
          coincideBase = Number(baseEsperadaSugerida) === Number(baseXML) ? 'SI' : 'NO';
        if (tasaFacturadaXML !== 'INDETERMINADO' && tasaEsperadaSugerida !== 'INDETERMINADO') {
          coincideTasa = resolveCoincideTasa(
            tasaFacturadaXML,
            tasaEsperadaSugerida,
            tieneSoporteSuficiente
          );
        }
        if (coincideBase === 'SI' && coincideTasa === 'SI') coincideXmlVsEsperado = 'SI';
        else if (coincideBase === 'NO' || coincideTasa === 'NO') coincideXmlVsEsperado = 'NO';
        else coincideXmlVsEsperado = 'REVISAR';
      }

      const detailMerc = detail?.mercancias?.[0];

      return {
        UUID: r.uuid,
        Archivo_XML: r.fileName,
        RFC_Emisor: r.rfcEmisor,
        Nombre_Emisor: r.nombreEmisor,
        RFC_Receptor: r.rfcReceptor,
        Nombre_Receptor: r.nombreReceptor,
        Fecha: r.fechaEmision,
        Tipo_XML: r.tipoCFDI,
        Naturaleza_CFDI: naturalezaCFDI,
        Efecto_Fiscal_Principal: efectoFiscalPrincipal,
        Perspectiva_Analisis: perspectivaAnalisis,
        IVA_Analizado_Como: ivaAnalizadoComo,
        Requiere_Complemento_Pago: requiereCP,
        Complemento_Pago_Localizado: cpLocalizado,
        Riesgo_PPD_Sin_Pago: riesgoPPD,
        Accion_Recomendada_Segun_Perspectiva: accionSegunPerspectiva,
        ClaveProdServ: concepto.claveProdServ || 'NO VIENE EN XML',
        Descripcion_Concepto: concepto.descripcion || 'NO VIENE EN XML',
        ObjetoImp_XML: concepto.objetoImp || 'NO VIENE EN XML',
        Base_XML: baseXML,
        Impuesto_XML: impuestoXML,
        TipoFactor_XML: tipoFactorXML,
        TasaOCuota_XML: tasaOCuotaXML,
        Importe_IVA_XML: importeIvaXML,
        Tasa_Facturada_XML: tasaFacturadaXML,
        Base_Gravada_XML: baseXML,
        Clasificacion_XML: r.clasificacionFiscal || 'NO APLICA',
        Carta_Porte_Presente: cartaPortePresente,
        Version_Carta_Porte: detail?.version || r.versionCartaPorte || 'NO VIENE EN XML',
        Transporte_Internacional: transporteInternacional,
        Origen_Pais: paisOrigen,
        Origen_Estado: mainOrigen?.estado || 'NO VIENE EN XML',
        Destino_Pais: paisDestino,
        Destino_Estado: mainDestino?.estado || 'NO VIENE EN XML',
        BienesTransp: detailMerc?.bienesTransp || 'NO VIENE EN XML',
        FraccionArancelaria: detailMerc?.fraccionArancelaria || 'NO VIENE EN XML',
        Tiene_Pedimento: normalizeSiNo(r.trazabilidadInfo?.tienePedimento),
        Tiene_DODA: normalizeSiNo(r.trazabilidadInfo?.tieneDoda),
        Tiene_Soporte_Logistico: tieneSoporteLogistico ? 'SI' : 'NO',
        Tiene_Soporte_Aduanal: tieneSoporteAduanal ? 'SI' : 'NO',
        Tiene_Soporte_Documental_Suficiente: tieneSoporteSuficiente ? 'SI' : 'NO',
        Tipo_Operacion_Deducida: esCruceFronterizo === 'SI' ? 'CRUCE FRONTERIZO/INTERNACIONAL' : 'NACIONAL',
        Base_Esperada_Sugerida: baseEsperadaSugerida,
        Tasa_Esperada_Sugerida: tasaEsperadaSugerida,
        IVA_Esperado_Sugerido: ivaEsperadoSugerido,
        Diferencia_Base: diferenciaBase,
        Diferencia_IVA: diferenciaIVA,
        Coincide_Base: coincideBase,
        Coincide_Tasa: coincideTasa,
        Coincide_XML_vs_Esperado: coincideXmlVsEsperado,
        Nivel_Riesgo: nivelRiesgo,
        Motivo_Diferencia: motivoDiferencia,
        Accion_Recomendada: accionRecomendada,
        Tipo_Viaje_Deducido: esCruceFronterizo === 'SI' ? 'CRUCE FRONTERIZO/INTERNACIONAL' : 'NACIONAL',
        Es_Cruce_Fronterizo: esCruceFronterizo,
        Distancia_CP: distanciaCp || 'NO VIENE EN XML',
        Distancia_Atipica: riesgoDistancia !== 'BAJO' && riesgoDistancia !== 'NO APLICA' ? 'SI' : 'NO',
        Justificacion_Distancia: justificacionDistancia,
        Riesgo_Distancia: riesgoDistancia,
      };
    });
  });
};

const applyComparativoSheetDefaults = (ws: any, dataRows: any[]) => {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = (XLSX as any).utils.decode_range(ref);

  // Autofilter on header row (row index 9 = row 10)
  ws['!autofilter'] = { ref: (XLSX as any).utils.encode_range({ s: { r: 9, c: range.s.c }, e: { r: range.e.r, c: range.e.c } }) };
  ws['!panes'] = { ySplit: 10, topLeftCell: 'A11', activePane: 'bottomLeft', state: 'frozen' };

  // Compute summary counts
  let coincidentes = 0, enRevision = 0, incorrectas = 0, baseIncongruente = 0;
  let tasa0SinSoporte = 0, noObjetoConIva = 0, indeterminados = 0;
  for (const row of dataRows) {
    const ct = row.Coincide_Tasa;
    if (ct === 'SI') coincidentes++;
    else if (ct === 'REVISAR') enRevision++;
    else if (ct === 'NO') incorrectas++;
    else if (ct === 'INDETERMINADO') indeterminados++;
    if (row.Coincide_Base === 'NO') baseIncongruente++;

    // Tasa 0% sin soporte suficiente:
    // (Tasa_Facturada_XML = 0% O Tasa_Esperada_Sugerida contiene 0%) Y Tiene_Soporte_Documental_Suficiente = NO
    const isTasa0OrExpectedTasa0 = row.Tasa_Facturada_XML === '0%' || String(row.Tasa_Esperada_Sugerida).includes('0%');
    const lacksSufficientSupport = row.Tiene_Soporte_Documental_Suficiente === 'NO';
    if (isTasa0OrExpectedTasa0 && lacksSufficientSupport) {
      tasa0SinSoporte++;
    }

    if (row.ObjetoImp_XML === '01' && typeof row.Importe_IVA_XML === 'number' && row.Importe_IVA_XML > 0) noObjetoConIva++;
  }

  const summaryBlock = [
    ['RESUMEN EJECUTIVO: COMPARATIVO BASE Y TASA IVA'],
    ['Total conceptos analizados', dataRows.length],
    ['Total con tasa XML coincidente', coincidentes],
    ['Total con tasa en revisión', enRevision],
    ['Total con tasa posiblemente incorrecta', incorrectas],
    ['Total con base incongruente', baseIncongruente],
    ['Total tasa 0% sin soporte suficiente', tasa0SinSoporte],
    ['Total no objeto con IVA trasladado', noObjetoConIva],
    ['Total indeterminados', indeterminados],
  ];
  (XLSX as any).utils.sheet_add_aoa(ws, summaryBlock, { origin: 'A1' });

  // Style summary header cell
  const cellA1 = ws['A1'];
  if (cellA1) cellA1.s = { font: { bold: true, color: { rgb: '1F4788' }, sz: 12 }, fill: { fgColor: { rgb: 'EBF1FA' } }, alignment: { horizontal: 'left' } };

  // Style data header row (row 10, index 9)
  const headerCols: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[(XLSX as any).utils.encode_cell({ r: 9, c })];
    if (cell) {
      headerCols.push(String(cell.v || ''));
      cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4788' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    }
  }
  ws['!cols'] = headerCols.map(h => ({ wch: Math.min(Math.max(h.length + 4, 14), 42) }));

  // Color Nivel_Riesgo column
  let nivelCol = -1;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[(XLSX as any).utils.encode_cell({ r: 9, c })];
    if (cell?.v === 'Nivel_Riesgo') { nivelCol = c; break; }
  }
  if (nivelCol !== -1) {
    const riskColors: Record<string, string> = { 'BAJO': 'C6EFCE', 'MEDIO': 'FFEB9C', 'MEDIO-ALTO': 'FFCC00', 'ALTO': 'FF9900', 'CRITICO': 'FF0000' };
    for (let r = 10; r <= range.e.r; r++) {
      const cell = ws[(XLSX as any).utils.encode_cell({ r, c: nivelCol })];
      if (cell && riskColors[cell.v]) cell.s = { fill: { fgColor: { rgb: riskColors[cell.v] } } };
    }
  }
};

// ─── END COMPARATIVO BASE Y TASA IVA ─────────────────────────────────────────

// Clasificación pura de la situación 69-B del RFC emisor (extraída para reutilización y pruebas).
// No altera reglas: reproduce fielmente la lógica previa inline del exportador.
export function clasificarValidacion69B(bl: any): string {
  if (!bl || bl.notSynced) return 'No validado: lista no cargada';
  if (!bl.found) return 'Sin coincidencia';
  if (bl.multiEstado) return 'Requiere revisión';
  const s = (bl.situacion || '').toLowerCase();
  if (s.includes('definitivo')) return 'Definitivo';
  if (s.includes('presunto')) return 'Presunto';
  if (s.includes('desvirtuado')) return 'Desvirtuado';
  if (s.includes('sentencia') || s.includes('favorable')) return 'Sentencia favorable';
  return 'Requiere revisión';
}

// P0-A (requisitos 10, 13): ejecuta la construcción de una hoja con
// aislamiento de error — si falla, se reporta qué hoja y en qué etapa,
// se agrega una hoja de aviso visible, y el resto del libro se conserva.
const TOTAL_EXPORT_STAGES = 26;

// Mapea el estado interno de reconciliarPagosPPD a la etiqueta de pantalla/Excel
// pedida: PUE / sin evidencia REP / parcial / liquidado / REP sin factura.
const ETIQUETA_ESTADO_PAGO: Record<string, string> = {
  PUE: 'PUE',
  SIN_EVIDENCIA_REP: 'SIN EVIDENCIA REP',
  PARCIAL: 'PARCIAL',
  LIQUIDADA: 'LIQUIDADO',
  REQUIERE_REVISION_MONEDA: 'REQUIERE REVISIÓN (MONEDA)',
  REQUIERE_REVISION_FECHA: 'REQUIERE REVISIÓN (FECHA DE PAGO)',
};

// Hoja "CONCILIACION PAGOS PPD" (una fila por factura PUE/PPD, item 4 de la
// auditoría PPD↔REP): reconcilia el pago real contra el complemento(s) de
// pago (REP) presentes en ESTE MISMO lote — ver limitación de persistencia
// entre cargas documentada junto a reconciliarPagosPPD (cfdiEngine.ts).
const buildConciliacionPagosRows = (results: ValidationResult[]) => {
  const { facturas } = reconciliarPagosPPD(results);
  return facturas.map(f => ({
    Tipo_CFDI: f.tipoCFDI,
    UUID_Factura: f.uuid,
    UUID_REP: f.repRelacionados.length ? f.repRelacionados.join(' | ') : 'NO APLICA',
    Metodo_Pago: f.metodoPago,
    Numero_Parcialidad: f.ultimaParcialidad ?? 'NO APLICA',
    Fecha_Pago: f.ultimaFechaPago || 'NO APLICA',
    Importe_Pagado: f.totalPagado,
    Saldo_Anterior: f.saldoAnterior ?? 'NO APLICA',
    Saldo_Insoluto: f.saldoInsoluto ?? 'NO APLICA',
    Estado_Pago: ETIQUETA_ESTADO_PAGO[f.estado] || f.estado,
    Direccion_CFDI: f.direccionCFDI || 'REQUIERE_REVISION',
    // "Exento" se evita deliberadamente en el texto visible: no es una
    // exención fiscal, solo informa que el pago se recibió antes de la
    // obligatoriedad general del REP (01/09/2018) y no cambia Estado_Pago.
    Pago_Antes_Obligatoriedad_REP: f.pagoHistoricamenteExento ? 'SI (informativo, no cambia Estado_Pago)' : 'NO',
    Observacion: f.observacion,
  }));
};

// Hoja "CONCILIACION REP" (uno por REP cargado): relacionados / sin factura
// relacionada en este análisis / rechazados por error (UUID inválido o REP
// duplicado ya contabilizado una sola vez).
const buildConciliacionREPRows = (results: ValidationResult[]) => {
  const { reps } = reconciliarPagosPPD(results);
  const ETIQUETA_ESTADO_REP: Record<string, string> = {
    RELACIONADO: 'RELACIONADO',
    SIN_FACTURA_RELACIONADA: 'SIN FACTURA RELACIONADA',
    RECHAZADO_ERROR: 'RECHAZADO POR ERROR',
    DUPLICADO: 'DUPLICADO',
  };
  return reps.map(r => ({
    UUID_REP: r.uuid,
    Estado_REP: ETIQUETA_ESTADO_REP[r.estado] || r.estado,
    Facturas_Relacionadas: r.facturasRelacionadas.length ? r.facturasRelacionadas.join(' | ') : 'NO APLICA',
    Observacion: r.observacion || 'NO APLICA',
  }));
};
const runSheetStage = async (
  wb: any,
  name: string,
  sheetIndex: number,
  onProgress: ExportProgressCallback | undefined,
  build: () => void,
  affectedRows?: number
) => {
  onProgress?.({ sheet: name, stage: 'building', sheetIndex, totalSheets: TOTAL_EXPORT_STAGES });
  await yieldToMain();
  try {
    build();
    onProgress?.({ sheet: name, stage: 'done', sheetIndex, totalSheets: TOTAL_EXPORT_STAGES });
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[excelExporter] Fallo construyendo la hoja "${name}":`, err);
    onProgress?.({ sheet: name, stage: 'error', sheetIndex, totalSheets: TOTAL_EXPORT_STAGES, error: message, affectedRows });
    try {
      const errorWs = (XLSX as any).utils.aoa_to_sheet([
        ['ERROR AL GENERAR ESTA HOJA'],
        ['Hoja afectada', name],
        ['Detalle técnico', message],
        ['Las demás hojas del reporte se generaron correctamente.'],
        ['Si el problema persiste, reporte este mensaje a soporte junto con el lote de XML usado.'],
      ]);
      (XLSX as any).utils.book_append_sheet(wb, errorWs, uniqueSheetName(wb, `ERROR_${name}`));
    } catch (fallbackErr) {
      console.error('[excelExporter] No se pudo ni siquiera crear la hoja de aviso de error:', fallbackErr);
    }
  }
};

export async function buildDiagnosticoWorkbook(results: ValidationResult[], onProgressIn?: ExportProgressCallback): Promise<any> {
  let stageIdx = 0;
  // Reportes parciales (requisito 3): se intercepta cada evento de progreso
  // para registrar las fallas de hoja sin cambiar el resto del pipeline —
  // el resultado se usa al final para decidir si el archivo se entrega
  // completo, parcial (con aviso) o recortado a un diagnóstico mínimo.
  const failures: ExportSheetFailure[] = [];
  const onProgress: ExportProgressCallback = (event) => {
    if (event.stage === 'error') {
      failures.push({
        sheet: event.sheet,
        error: event.error || 'Error desconocido',
        affectedRows: typeof event.affectedRows === 'number' ? event.affectedRows : 'N/D',
        critical: CRITICAL_SHEETS.has(event.sheet),
      });
    }
    onProgressIn?.(event);
  };
  // 1. Separar resultados válidos e inválidos
  const isValidUUID = (uuid: string | undefined): boolean => {
    if (!uuid) return false;
    const cleanUuid = String(uuid).trim().toUpperCase();
    return cleanUuid !== 'NO DISPONIBLE' && cleanUuid !== 'NO_DISPONIBLE' && cleanUuid !== 'NO VIENE EN XML' && cleanUuid !== '';
  };

  const validResults = results.filter(r => isValidUUID(r.uuid));
  const invalidResults = results.filter(r => !isValidUUID(r.uuid));

  const totalXMLCargados = results.length;
  const totalCFDIValidosConUUID = validResults.length;
  const totalXMLConErrorLectura = invalidResults.length;
  let totalFilasSinUUIDEnHojasPrincipales = 0;

  // Comprobación de integridad
  validResults.forEach(r => {
    if (!isValidUUID(r.uuid)) {
      totalFilasSinUUIDEnHojasPrincipales++;
    }
  });

  console.log('\n================ VALIDACIÓN DE INTEGRIDAD EN EXPORTACIÓN ================');
  console.log(`- totalXMLCargados: ${totalXMLCargados}`);
  console.log(`- totalCFDIValidosConUUID: ${totalCFDIValidosConUUID}`);
  console.log(`- totalXMLConErrorLectura: ${totalXMLConErrorLectura}`);
  console.log(`- totalFilasSinUUIDEnHojasPrincipales: ${totalFilasSinUUIDEnHojasPrincipales}`);
  console.log('=========================================================================\n');

  if (totalFilasSinUUIDEnHojasPrincipales > 0) {
    console.error('[INTEGRITY ERROR] Se detectaron filas sin UUID válido destinadas a hojas principales.');
    throw new Error('Error de integridad: No se permiten filas sin UUID en hojas principales.');
  }

  // Detect if batch is predominantly EMITIDOS or RECIBIDOS
  const emisorCounts = new Map<string, number>();
  const receptorCounts = new Map<string, number>();
  
  validResults.forEach(r => {
    if (r.rfcEmisor) emisorCounts.set(r.rfcEmisor, (emisorCounts.get(r.rfcEmisor) || 0) + 1);
    if (r.rfcReceptor) receptorCounts.set(r.rfcReceptor, (receptorCounts.get(r.rfcReceptor) || 0) + 1);
  });
  
  let maxEmisorCount = 0;
  emisorCounts.forEach(count => {
    if (count > maxEmisorCount) maxEmisorCount = count;
  });
  
  let maxReceptorCount = 0;
  receptorCounts.forEach(count => {
    if (count > maxReceptorCount) maxReceptorCount = count;
  });

  // ✅ CORRECCIÓN: NO se usa dirección predominante del lote para clasificar registros.
  // La clasificación es SIEMPRE fila por fila (rfcEmisor/rfcReceptor vs RFC de empresa).
  // Si el lote fue validado con el RFC de la empresa, la dirección está definida y se
  // generan las cédulas por dirección; si no, se mantiene una sola cédula IVA legacy.
  const tieneDireccion = validResults.some(r => r.direccionCFDI && r.direccionCFDI !== 'REQUIERE_REVISION');

  // Signo para notas de crédito (tipo E): restan al agregarlas a ingresos/gastos e IVA.
  const signoCFDI = (r: ValidationResult) => (String(r.tipoCFDI || '').toUpperCase() === 'E' ? -1 : 1);

  // Crear workbook
  const wb = (XLSX as any).utils.book_new();

  // Hoja Resumen como primera hoja del Excel
  await appendJsonSheet(wb, buildExecutiveSummaryRows(validResults), 'Resumen', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  if (wb.Sheets['Resumen']) {
    wb.Sheets['Resumen']['!cols'] = [
      { wch: 45 }, // Metrica
      { wch: 80 }  // Valor (so the long note is fully readable)
    ];
  }

  // Preparar datos en el orden exacto de columnas
  await runSheetStage(wb, 'Diagnostico_CFDI', ++stageIdx, onProgress, () => {
  const data = validResults.map((r) => {
    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];
    const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];

    return {
      Archivo_XML: r.fileName,
      UUID: r.uuid,
      Version_CFDI: r.versionCFDI,
      Tipo_CFDI: r.tipoCFDI,
      Serie: r.serie,
      Folio: r.folio,
      Fecha_Emision: r.fechaEmision,
      Hora_Emision: r.horaEmision,
      ...getSatExportFields(r),
      Fecha_Cancelacion: r.fechaCancelacion,
      CFDI_Sustituido: r.cfdiSustituido,
      UUID_Sustitucion: r.uuidSustitucion,
      RFC_Emisor: r.rfcEmisor,
      Nombre_Emisor: r.nombreEmisor,
      Regimen_Emisor: r.regimenEmisor,
      Estado_SAT_Emisor: r.estadoSATEmisor,
      RFC_Receptor: r.rfcReceptor,
      Nombre_Receptor: r.nombreReceptor,
      Regimen_Receptor: r.regimenReceptor,
      Uso_CFDI: r.usoCFDI,
      CP_Receptor: r.cpReceptor,
      Es_Nomina: r.esNomina,
      Version_Nomina: r.versionNomina,
      Requiere_Carta_Porte: r.requiereCartaPorte,
      Carta_Porte_Presente: getCartaPortePresente(r),
      Carta_Porte_Completa: r.cartaPorteCompleta,
      Version_Carta_Porte: detail?.version || r.versionCartaPorte,
      Transporte_Internacional: detail?.transporteInternacional || 'NO VIENE EN XML',
      Entrada_Salida_Mercancia: detail?.entradaSalidaMercancia || 'NO VIENE EN XML',
      Pais_Origen_Destino: detail?.paisOrigenDestino || 'NO VIENE EN XML',
      Via_Entrada_Salida: detail?.viaEntradaSalida || 'NO VIENE EN XML',
      Total_Distancia_Recorrida: detail?.totalDistanciaRecorrida || 'NO VIENE EN XML',
      Origen_IDUbicacion: mainOrigen?.idUbicacion || 'NO VIENE EN XML',
      Origen_RFC: mainOrigen?.rfcRemitenteDestinatario || 'NO VIENE EN XML',
      Origen_Nombre: mainOrigen?.nombreRemitenteDestinatario || 'NO VIENE EN XML',
      Origen_Fecha_Hora_Salida: mainOrigen?.fechaHoraSalidaLlegada || 'NO VIENE EN XML',
      Origen_Calle: mainOrigen?.calle || 'NO VIENE EN XML',
      Origen_Numero_Exterior: mainOrigen?.numeroExterior || 'NO VIENE EN XML',
      Origen_Numero_Interior: mainOrigen?.numeroInterior || 'NO VIENE EN XML',
      Origen_Colonia: mainOrigen?.colonia || 'NO VIENE EN XML',
      Origen_Localidad: mainOrigen?.localidad || 'NO VIENE EN XML',
      Origen_Municipio: mainOrigen?.municipio || 'NO VIENE EN XML',
      Origen_Estado: mainOrigen?.estado || 'NO VIENE EN XML',
      Origen_Pais: mainOrigen?.pais || 'NO VIENE EN XML',
      Origen_CP: mainOrigen?.codigoPostal || 'NO VIENE EN XML',
      Origen_Referencia: mainOrigen?.referencia || 'NO VIENE EN XML',
      Origen_Domicilio: formatAddress(mainOrigen),
      Destino_IDUbicacion: mainDestino?.idUbicacion || 'NO VIENE EN XML',
      Destino_RFC: mainDestino?.rfcRemitenteDestinatario || 'NO VIENE EN XML',
      Destino_Nombre: mainDestino?.nombreRemitenteDestinatario || 'NO VIENE EN XML',
      Destino_Fecha_Hora_Llegada: mainDestino?.fechaHoraSalidaLlegada || 'NO VIENE EN XML',
      Destino_Calle: mainDestino?.calle || 'NO VIENE EN XML',
      Destino_Numero_Exterior: mainDestino?.numeroExterior || 'NO VIENE EN XML',
      Destino_Numero_Interior: mainDestino?.numeroInterior || 'NO VIENE EN XML',
      Destino_Colonia: mainDestino?.colonia || 'NO VIENE EN XML',
      Destino_Localidad: mainDestino?.localidad || 'NO VIENE EN XML',
      Destino_Municipio: mainDestino?.municipio || 'NO VIENE EN XML',
      Destino_Estado: mainDestino?.estado || 'NO VIENE EN XML',
      Destino_Pais: mainDestino?.pais || 'NO VIENE EN XML',
      Destino_CP: mainDestino?.codigoPostal || 'NO VIENE EN XML',
      Destino_Referencia: mainDestino?.referencia || 'NO VIENE EN XML',
      Destino_Domicilio: formatAddress(mainDestino),
      Total_Mercancias: detail?.numTotalMercancias || '0',
      Peso_Bruto_Total: detail?.pesoBrutoTotal || 'NO VIENE EN XML',
      Unidad_Peso: detail?.unidadPeso || 'NO VIENE EN XML',
      Num_Total_Mercancias: detail?.numTotalMercancias || '0',
      Descripcion_Mercancia: detail?.mercanciaPrincipal || 'NO VIENE EN XML',
      Permiso_SCT: detail?.autotransporte?.permSCT || 'NO VIENE EN XML',
      Numero_Permiso_SCT: detail?.autotransporte?.numPermisoSCT || 'NO VIENE EN XML',
      Configuracion_Vehicular: detail?.autotransporte?.configVehicular || 'NO VIENE EN XML',
      Placa_VM: detail?.autotransporte?.placaVM || 'NO VIENE EN XML',
      Anio_Modelo_VM: detail?.autotransporte?.anioModeloVM || 'NO VIENE EN XML',
      Aseguradora_RC: detail?.autotransporte?.aseguradoraRespCivil || 'NO VIENE EN XML',
      Poliza_RC: detail?.autotransporte?.polizaRespCivil || 'NO VIENE EN XML',
      Remolques: summarizeList(detail?.autotransporte?.remolques?.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)), 5, 'DETALLE CARTA PORTE FIGURAS'),
      Tipo_Figura: operador?.tipoFigura || 'NO VIENE EN XML',
      RFC_Figura: operador?.rfcFigura || 'NO VIENE EN XML',
      Nombre_Figura: operador?.nombreFigura || 'NO VIENE EN XML',
      Num_Licencia: operador?.numLicencia || 'NO VIENE EN XML',
      Residencia_Fiscal: operador?.residenciaFiscal || 'NO VIENE EN XML',
      Num_Reg_Id_Trib: operador?.numRegIdTrib || 'NO VIENE EN XML',
      Subtotal: r.subtotal,
      Total_Percepciones: r.totalPercepciones,
      Total_Deducciones: r.totalDeducciones,
      Total_OtrosPagos: r.totalOtrosPagos,
      ISR_Retenido_Nomina: r.isrRetenidoNomina,
      // Tope defensivo (sin deduplicar, para no cambiar el formato en documentos normales):
      // un documento con miles de conceptos ya no puede exceder el límite de 32,767
      // caracteres por celda de Excel en este campo.
      OBJETO_IMP_XML: r.desglosePorConcepto?.length
        ? (r.desglosePorConcepto.length <= 500
          ? (r.desglosePorConcepto.map(c => c.objetoImp).join(',') || 'N/A')
          : `${r.desglosePorConcepto.slice(0, 500).map(c => c.objetoImp).join(',')},+${r.desglosePorConcepto.length - 500} más (ver hoja "DETALLE CONCEPTOS XML")`)
        : 'N/A',
      CLASIFICACION_FISCAL: r.clasificacionFiscal ?? 'SIN_IMPUESTOS',
      BASE_NO_OBJETO: r.baseNoObjeto ?? 0,
      BASE_SIN_DESGLOSE: r.baseObjetoSinDesglose ?? 0,
      BASE_GRAVADA_IVA: Math.round(((r.baseIVA16 ?? 0) + (r.baseIVA8 ?? 0)) * 100) / 100,
      BASE_TASA_0: r.baseIVA0 ?? 0,
      BASE_EXENTA: r.baseIVAExento ?? 0,
      BASE_TOTAL_VERIFICACION: Math.round((
        (r.baseIVA16 ?? 0) + (r.baseIVA8 ?? 0) + (r.baseIVA0 ?? 0) +
        (r.baseIVAExento ?? 0) + (r.baseNoObjeto ?? 0) + (r.baseObjetoSinDesglose ?? 0)
      ) * 100) / 100,
      Base_IVA_16: r.baseIVA16,
      Base_IVA_8: r.baseIVA8,
      Base_IVA_0: r.baseIVA0,
      Base_IVA_Exento: r.baseIVAExento,
      IVA_Trasladado: r.ivaTraslado,
      IVA_Retenido: r.ivaRetenido,
      ISR_Retenido: r.isrRetenido,
      IEPS_Trasladado: r.iepsTraslado,
      IEPS_Retenido: r.iepsRetenido,
      Impuestos_Locales_Trasladados: r.impuestosLocalesTrasladados,
      Impuestos_Locales_Retenidos: r.impuestosLocalesRetenidos,
      Total_Calculado: normalizeSiNo(r.esNomina) === 'SI' ? r.totalCalculadoNomina : r.totalCalculado,
      Total_Declarado: r.total,
      Diferencia_Totales: r.diferenciaTotales,
      Moneda: r.moneda,
      Tipo_Cambio: r.tipoCambio,
      Forma_Pago: r.formaPago,
      Metodo_Pago: r.metodoPago,
      Nivel_Validacion: r.nivelValidacion,
      Resultado: r.resultado,
      Comentario_Fiscal: r.comentarioFiscal,
      Observaciones_Tecnicas: r.observacionesTecnicas,
      Observaciones_Contador: r.observacionesContador,
      Giro_Empresa: r.giroEmpresa || 'NO DEFINIDO',
      UUIDs_Relacionados: r.uuids_relacionados?.length ? summarizeList(r.uuids_relacionados, 20, 'EXTRACCION CRUDA XML') : 'NO APLICA',
      Nivel_Trazabilidad: r.trazabilidadInfo?.nivelExpediente || 'NO APLICA',
      Requiere_Soporte_Externo: r.trazabilidadInfo?.fuenteExternaRequerida || 'NO',
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'NO APLICA',
      Fiscal_Risk_Level: r.fiscalRiskLevel || 'VERDE',
      Fiscal_Risk_Reason: r.fiscalRiskReason || 'SIN HALLAZGOS FISCALES',
      Fiscal_Rule_Applied: r.fiscalRuleApplied || 'NINGUNA',
      Payment_Complement_Status: r.paymentComplementStatus || 'NO APLICA',
      IVA_Creditability_Status: r.ivaCreditabilityStatus || 'POR_DETERMINAR',
      Payment_Method_Status: r.paymentMethodStatus || 'NO APLICA',
      // ── Columnas 69-B ──
      // ✅ CORRECCIÓN: el RFC a evaluar en 69-B depende de la dirección del CFDI.
      //   - RECIBIDO (la empresa compra): el proveedor es el EMISOR => evaluar rfcEmisor.
      //   - EMITIDO (la empresa vende): el cliente es el RECEPTOR => evaluar rfcReceptor.
      // Si la dirección no está definida, se mantiene el emisor (criterio legacy).
      ...(() => {
        const evaluarReceptor = r.direccionCFDI === 'EMITIDO';
        const bl = evaluarReceptor ? r.rfcReceptorBlacklist : r.rfcEmisorBlacklist;
        const rfcEval = evaluarReceptor ? r.rfcReceptor : r.rfcEmisor;
        return {
          RFC_Evaluado_69B: rfcEval || '',
          Validacion_69B: clasificarValidacion69B(bl),
          Situacion_69B: bl?.situacion || (bl?.notSynced ? 'No validado: lista no cargada' : 'Sin coincidencia'),
          Fecha_Publicacion_69B: bl?.fechaPublicacion || 'NO APLICA',
          Fecha_Corte_Listado: (() => {
            if (bl?.notSynced) return 'Lista no cargada';
            return '2025-12-31';
          })(),
          Historial_69B: bl?.multiEstado ? 'Situación múltiple; requiere revisión' : (bl?.situacion || 'Sin coincidencia'),
          Observacion_69B: bl?.notSynced
            ? 'No validado: lista 69-B no cargada en este dispositivo'
            : bl?.found
              ? `RFC ${rfcEval} — ${bl?.situacion || 'situación no especificada'}`
              : 'RFC no encontrado en lista 69-B',
        };
      })(),
    };
  });

  // Crear sheet — P0-A: si el lote excede el límite de filas de Excel, se divide
  // automáticamente (Diagnostico_CFDI_1, _2, ...) con el estilo simple por defecto;
  // en el caso normal (siempre, con lotes de miles de XML) se conserva el estilo
  // detallado de columnas/encabezados de abajo sobre una sola hoja saneada.
  if (data.length > EXCEL_MAX_DATA_ROWS) {
    const chunks = buildSafeSheets(data, 'Diagnostico_CFDI');
    chunks.forEach(c => applySheetDefaults(c.ws));
    appendSheetChunks(wb, chunks);
    return;
  }
  const diagHeaders = collectHeaders(data);
  const ws = (XLSX as any).utils.aoa_to_sheet(rowsToAOA(data, diagHeaders));

  // Configurar ancho de columnas
  const colWidths = [
    { wch: 25 }, // A: Archivo_XML
    { wch: 38 }, // B: UUID
    { wch: 14 }, // C: Version_CFDI
    { wch: 12 }, // D: Tipo_CFDI
    { wch: 10 }, // E: Serie
    { wch: 10 }, // F: Folio
    { wch: 16 }, // G: Fecha_Emision
    { wch: 12 }, // H: Hora_Emision
    { wch: 14 }, // I: Estatus_SAT
    { wch: 25 }, // J: Resultado_Validacion_SAT
    { wch: 50 }, // K: Accion_Recomendada
    { wch: 16 }, // J: Fecha_Cancelacion
    { wch: 16 }, // K: CFDI_Sustituido
    { wch: 38 }, // L: UUID_Sustitucion
    { wch: 14 }, // M: RFC_Emisor
    { wch: 25 }, // N: Nombre_Emisor
    { wch: 16 }, // O: Regimen_Emisor
    { wch: 16 }, // P: Estado_SAT_Emisor
    { wch: 14 }, // Q: RFC_Receptor
    { wch: 25 }, // R: Nombre_Receptor
    { wch: 16 }, // S: Regimen_Receptor
    { wch: 12 }, // T: Uso_CFDI
    { wch: 12 }, // U: CP_Receptor
    { wch: 12 }, // V: Es_Nomina
    { wch: 16 }, // W: Version_Nomina
    { wch: 20 }, // X: Requiere_Carta_Porte
    { wch: 20 }, // Y: Carta_Porte_Presente
    { wch: 20 }, // Z: Carta_Porte_Completa
    { wch: 18 }, // AA: Version_Carta_Porte
    { wch: 12 }, // AB: Subtotal
    { wch: 16 }, // AC: Total_Percepciones
    { wch: 16 }, // AD: Total_Deducciones
    { wch: 16 }, // AE: Total_OtrosPagos
    { wch: 18 }, // AF: ISR_Retenido_Nomina
    { wch: 24 }, // AG: OBJETO_IMP_XML
    { wch: 22 }, // AH: CLASIFICACION_FISCAL
    { wch: 14 }, // AI: BASE_NO_OBJETO
    { wch: 16 }, // AJ: BASE_SIN_DESGLOSE
    { wch: 16 }, // AK: BASE_GRAVADA_IVA
    { wch: 14 }, // AL: BASE_TASA_0
    { wch: 14 }, // AM: BASE_EXENTA
    { wch: 22 }, // AN: BASE_TOTAL_VERIFICACION
    { wch: 12 }, // AO: Base_IVA_16
    { wch: 12 }, // AP: Base_IVA_8
    { wch: 12 }, // AQ: Base_IVA_0
    { wch: 14 }, // AR: Base_IVA_Exento
    { wch: 14 }, // AS: IVA_Trasladado
    { wch: 14 }, // AT: IVA_Retenido
    { wch: 12 }, // AU: ISR_Retenido
    { wch: 14 }, // AV: IEPS_Trasladado
    { wch: 14 }, // AW: IEPS_Retenido
    { wch: 20 }, // AX: Impuestos_Locales_Trasladados
    { wch: 20 }, // AY: Impuestos_Locales_Retenidos
    { wch: 14 }, // AZ: Total_Calculado
    { wch: 14 }, // BA: Total_Declarado
    { wch: 14 }, // BB: Diferencia_Totales
    { wch: 10 }, // BC: Moneda
    { wch: 12 }, // BD: Tipo_Cambio
    { wch: 14 }, // BE: Forma_Pago
    { wch: 14 }, // BF: Metodo_Pago
    { wch: 22 }, // BG: Nivel_Validacion
    { wch: 20 }, // BH: Resultado
    { wch: 50 }, // BI: Comentario_Fiscal
    { wch: 50 }, // BJ: Observaciones_Tecnicas
    { wch: 40 }, // BK: Observaciones_Contador
    { wch: 20 }, // BL: Giro_Empresa
    { wch: 60 }, // BM: UUIDs_Relacionados
    { wch: 25 }, // BN: Nivel_Trazabilidad
    { wch: 20 }, // BO: Requiere_Soporte_Externo
    { wch: 30 }, // BP: Accion_Recomendada
    { wch: 14 }, // BQ: Fiscal_Risk_Level
    { wch: 40 }, // BR: Fiscal_Risk_Reason
    { wch: 30 }, // BS: Fiscal_Rule_Applied
    { wch: 24 }, // BT: Payment_Complement_Status
    { wch: 24 }, // BU: IVA_Creditability_Status
    { wch: 24 }, // BV: Payment_Method_Status
    { wch: 16 }, // BW: RFC_Evaluado_69B
    { wch: 22 }, // BX: Validacion_69B
    { wch: 22 }, // BY: Situacion_69B
    { wch: 18 }, // BZ: Fecha_Publicacion_69B
    { wch: 18 }, // CA: Fecha_Corte_Listado
    { wch: 30 }, // CB: Historial_69B
    { wch: 40 }, // CC: Observacion_69B
  ];

  (ws as any)['!cols'] = colWidths;

  // Estilos para encabezados
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
    fill: { fgColor: { rgb: '1F4788' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin' as const, color: { rgb: '000000' } },
      bottom: { style: 'thin' as const, color: { rgb: '000000' } },
      left: { style: 'thin' as const, color: { rgb: '000000' } },
      right: { style: 'thin' as const, color: { rgb: '000000' } },
    },
  };

  // Aplicar estilos a encabezados
  const headers = Object.keys(data[0] || {});
  for (let i = 0; i < headers.length; i++) {
    const cellRef = (XLSX as any).utils.encode_cell({ r: 0, c: i });
    if ((ws as any)[cellRef]) {
      (ws as any)[cellRef].s = headerStyle;
    }
  }

  // Altura de fila de encabezado
  (ws as any)['!rows'] = [{ hpx: 30 }];

  // Activar filtros dinámicamente para todas las columnas
  const lastColRef = (XLSX as any).utils.encode_col(headers.length - 1);
  (ws as any)['!autofilter'] = { ref: `A1:${lastColRef}1` };

  // Congelar fila 1
  (ws as any)['!panes'] = { ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Agregar sheet al workbook
  (XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');
  }, validResults.length); // fin runSheetStage('Diagnostico_CFDI')

  // 1. CEDULA INGRESOS SAT
  // ✅ CORRECCIÓN DE ESPEJO CONTABLE: solo entran los CFDI EMITIDOS por la empresa
  // (su venta/ingreso). Un "tipo I" RECIBIDO es compra del proveedor, no ingreso propio.
  const dataIngresos = validResults
    .filter(r => (tieneDireccion ? r.direccionCFDI === 'EMITIDO' : r.tipoCFDI === 'I'))
    .map(r => ({
      Direccion_CFDI: r.direccionCFDI || 'REQUIERE_REVISION',
      RFC_Empresa_Evaluada: r.rfcEmpresaEvaluada || '',
      Naturaleza_Para_Empresa: r.naturalezaParaEmpresa || 'N/A',
      UUID: r.uuid,
      Serie: r.serie,
      Folio: r.folio,
      Fecha: r.fechaEmision,
      RFC_Receptor: r.rfcReceptor,
      Nombre_Receptor: r.nombreReceptor,
      // Tope alto (200) para no alterar el listado en facturas normales con varias
      // decenas de conceptos — solo protege contra documentos con miles de líneas.
      Concepto: r.desglosePorConcepto ? summarizeList(Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))), 200, 'DETALLE CONCEPTOS XML') : 'NO VIENE EN XML',
      Subtotal: (r.subtotal || 0) * signoCFDI(r),
      IVA: (r.ivaTraslado || 0) * signoCFDI(r),
      Total: (r.total || 0) * signoCFDI(r),
      Metodo_Pago: r.metodoPago,
      Forma_Pago: r.formaPago,
      Estatus_CFDI: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
      Fecha_Cobro: r.trazabilidadInfo?.fechaCobro || 'REQUIERE IMPORTACION',
      Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE IMPORTACION',
      Banco: r.trazabilidadInfo?.banco || 'REQUIERE IMPORTACION',
      Identificador_Bancario: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
      Observacion_SAT: r.trazabilidadInfo?.observacionSAT || 'NO APLICA'
    }));
  await runSheetStage(wb, 'CEDULA INGRESOS SAT', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataIngresos, 'CEDULA INGRESOS SAT'));
  }, dataIngresos.length);

  // 2. CEDULA TASA 0%
  const dataTasa0 = validResults.filter(r => (r.baseIVA0 || 0) > 0).map(r => {
    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];
    const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];
    
    return {
      UUID: r.uuid,
      Fecha: r.fechaEmision,
      RFC_Receptor: r.rfcReceptor,
      Nombre_Receptor: r.nombreReceptor,
      // Tope alto (200) para no alterar el listado en facturas normales con varias
      // decenas de conceptos — solo protege contra documentos con miles de líneas.
      Concepto: r.desglosePorConcepto ? summarizeList(Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))), 200, 'DETALLE CONCEPTOS XML') : 'NO VIENE EN XML',
      Base_Tasa_0: r.baseIVA0,
      IVA_Trasladado_0: 0,
      Exportacion: r.trazabilidadInfo?.exportacion || 'NO DISPONIBLE',
      Tiene_Carta_Porte: getCartaPortePresente(r),
      Placas: detail?.autotransporte?.placaVM || r.trazabilidadInfo?.placas || 'NO VIENE EN XML',
      Remolques: (detail?.autotransporte?.remolques?.length ? summarizeList(detail.autotransporte.remolques.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)), 5, 'DETALLE CARTA PORTE FIGURAS') : null) || r.trazabilidadInfo?.remolques || 'NO VIENE EN XML',
      Origen: formatAddress(mainOrigen),
      Destino: formatAddress(mainDestino),
      RFC_Operador: operador?.rfcFigura || r.trazabilidadInfo?.rfcOperador || 'NO VIENE EN XML',
      Mercancias: detail?.mercancias?.length ? 'SI' : normalizeSiNo(r.trazabilidadInfo?.tieneMercancias),
      Peso: joinClean(detail?.pesoBrutoTotal, detail?.unidadPeso),
      Distancia: detail?.totalDistanciaRecorrida || r.trazabilidadInfo?.distancia || 'NO VIENE EN XML',
      Permiso_SCT: detail?.autotransporte?.permSCT || r.trazabilidadInfo?.permisoSCT || 'NO VIENE EN XML',
      Transporte_Internacional: detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional || 'NO VIENE EN XML',
      Destino_Extranjero: r.trazabilidadInfo?.destinoExtranjero || 'NO',
      Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
      Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
      Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
      Numero_DODA_Integracion: r.trazabilidadInfo?.numeroDodaIntegracion || 'NO VIENE EN XML',
      Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior || 'REQUIERE IMPORTACION',
      Diagnostico_Tasa_0: r.trazabilidadInfo?.diagnosticoTasa0 || 'OPERACION IVA TASA 0% DETECTADA: requiere soporte fiscal y materialidad',
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaTasa0 || 'Integrar evidencia de exportacion, pedimento/DODA o soporte contractual y bancario segun aplique'
    };
  });
  await runSheetStage(wb, 'CEDULA TASA 0%', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataTasa0, 'CEDULA TASA 0%'));
  }, dataTasa0.length);

  // 2b. AUDITORIA IVA TASA 0%
  const dataAuditoriaIvaTasa0 = validResults.flatMap(r => {
    const conceptosFuente = r.desglosePorConcepto || [];
    const conceptosTasa0 = conceptosFuente.filter((concepto: any) => isTasa0Concept(concepto));
    const conceptos = conceptosTasa0.length ? conceptosTasa0 : ((r.baseIVA0 || 0) > 0 ? [{
      claveProdServ: 'NO DISPONIBLE',
      descripcion: 'Base tasa 0 acumulada sin detalle por concepto',
      objetoImp: '02',
      importe: r.baseIVA0,
      descuento: 0,
      traslados: [{ impuesto: '002', tasa: '0.000000', base: r.baseIVA0, importe: 0 }],
      __metodoDeteccionTasa0: 'BASE_IVA_0',
    }] : (r.clasificacionFiscal === 'TASA_0' ? (conceptosFuente.length ? conceptosFuente.map((concepto: any) => ({
      ...concepto,
      __metodoDeteccionTasa0: 'CLASIFICACION_FISCAL',
    })) : [{
      claveProdServ: 'NO DISPONIBLE',
      descripcion: 'CFDI clasificado como TASA_0 sin detalle por concepto',
      objetoImp: '02',
      importe: r.subtotal || r.total || 0,
      descuento: 0,
      traslados: [{ impuesto: '002', tasa: '0.000000', base: 0, importe: 0 }],
      __metodoDeteccionTasa0: 'CLASIFICACION_FISCAL',
    }]) : []));

    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];

    return conceptos.map((concepto: any) => {
      const iva = classifyTasa0Iva(r);
      const deteccion = getTasa0Detection(r, concepto);
      return {
        Archivo_XML: r.fileName,
        UUID: r.uuid,
        Serie: r.serie,
        Folio: r.folio,
        Fecha: r.fechaEmision,
        RFC_Emisor: r.rfcEmisor,
        RFC_Receptor: r.rfcReceptor,
        ClaveProdServ: concepto.claveProdServ || 'NO DISPONIBLE',
        Concepto: concepto.descripcion || 'NO VIENE EN XML',
        Base_Tasa_0: Math.round(getTasa0Base(concepto) * 100) / 100,
        IVA_Trasladado: Math.round(getTasa0Iva(concepto) * 100) / 100,
        ObjetoImp: concepto.objetoImp || 'NO DISPONIBLE',
        Metodo_Deteccion_Tasa_0: deteccion.metodo,
        Observacion_Base_Tasa_0: deteccion.observacion,
        Exportacion: r.trazabilidadInfo?.exportacion || 'NO DISPONIBLE',
        Tiene_Carta_Porte: getCartaPortePresente(r),
        Origen: formatAddress(mainOrigen),
        Destino: formatAddress(mainDestino),
        Pais_Origen: mainOrigen?.pais || 'NO VIENE EN XML',
        Pais_Destino: mainDestino?.pais || 'NO VIENE EN XML',
        Transporte_Internacional: normalizeI18nSiNo(detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional),
        Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
        Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
        Tiene_BOL: getCartaPortePresente(r) === 'SI' ? 'SI' : 'NO',
        Clasificacion_Sugerida_IVA: iva.clasificacion,
        Riesgo_IVA: iva.riesgo,
        Motivo_Del_Riesgo: iva.motivo,
        Soporte_Requerido: iva.soporte,
        Accion_Recomendada: iva.accion,
      };
    });
  });
  await runSheetStage(wb, 'AUDITORIA IVA TASA 0%', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataAuditoriaIvaTasa0, 'AUDITORIA IVA TASA 0%'));
  }, dataAuditoriaIvaTasa0.length);

  // 3. CEDULA IVA (ACREDITABLE/TRASLADADO)
  // ✅ CORRECCIÓN DE ESPEJO CONTABLE: el IVA ACREDITABLE proviene de CFDI RECIBIDOS
  // (compras del proveedor). El IVA TRASLADADO proviene de CFDI EMITIDOS (ventas).
  // Filtramos por dirección cuando está disponible; si no, usamos la lógica legacy.
  const mapaFilaIva = (r: ValidationResult) => {
    const sg = signoCFDI(r);
    return {
      Direccion_CFDI: r.direccionCFDI || 'REQUIERE_REVISION',
      RFC_Empresa_Evaluada: r.rfcEmpresaEvaluada || '',
      Naturaleza_Para_Empresa: r.naturalezaParaEmpresa || 'N/A',
      Impacto_IVA: r.impactoIVA || 'N/A',
      UUID: r.uuid,
      Fecha: r.fechaEmision,
      RFC_Emisor: r.rfcEmisor,
      Nombre_Emisor: r.nombreEmisor,
      // Tope alto (200) para no alterar el listado en facturas normales con varias
      // decenas de conceptos — solo protege contra documentos con miles de líneas.
      Concepto: r.desglosePorConcepto ? summarizeList(Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))), 200, 'DETALLE CONCEPTOS XML') : 'NO VIENE EN XML',
      Subtotal: (r.subtotal || 0) * sg,
      IVA: (r.trazabilidadInfo?.ivaAcreditable || r.ivaTraslado || 0) * sg,
      Total: (r.total || 0) * sg,
      Metodo_Pago: r.metodoPago,
      Forma_Pago: r.formaPago,
      Estatus_CFDI: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
      Uso_CFDI: r.usoCFDI,
      Regimen_Emisor: r.regimenEmisor,
      Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
      Fecha_Pago: r.trazabilidadInfo?.fechaPago || 'REQUIERE IMPORTACION',
      Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE IMPORTACION',
      Diagnostico_IVA: r.trazabilidadInfo?.diagnosticoIvaAcreditable || 'NO APLICA',
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaIvaAcreditable || 'NO APLICA',
    };
  };

  const filtroEmitido = (r: ValidationResult) =>
    tieneDireccion ? r.direccionCFDI === 'EMITIDO'
      : (r.tipoCFDI === 'I' && !!r.rfcEmisor && !r.rfcEmisor.startsWith('XEXX') && r.rfcReceptor !== r.rfcEmisor);
  const filtroRecibido = (r: ValidationResult) =>
    tieneDireccion ? r.direccionCFDI === 'RECIBIDO'
      : (r.tipoCFDI === 'E' || (r.tipoCFDI === 'I' && !!r.rfcReceptor && !r.rfcReceptor.startsWith('XEXX') && r.rfcEmisor !== r.rfcReceptor));
  const filtroNoClas = (r: ValidationResult) =>
    tieneDireccion && (r.direccionCFDI === 'REQUIERE_REVISION' || !r.direccionCFDI);

  const dataIvaTrasladado = validResults.filter(filtroEmitido).map(mapaFilaIva);
  const dataIvaAcreditable = validResults.filter(filtroRecibido).map(mapaFilaIva);
  const dataNoClasificados = validResults.filter(filtroNoClas).map(mapaFilaIva);

  await runSheetStage(wb, 'CEDULA IVA TRASLADADO', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildTitledSheetChunks(dataIvaTrasladado, 'CEDULA IVA TRASLADADO',
      "CEDULA IVA TRASLADADO (CFDI EMITIDOS - RFC empresa = emisor). Las notas de credito (tipo E) restan."));
  }, dataIvaTrasladado.length);

  await runSheetStage(wb, 'CEDULA IVA ACREDITABLE', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildTitledSheetChunks(dataIvaAcreditable, 'CEDULA IVA ACREDITABLE',
      "CEDULA IVA ACREDITABLE (CFDI RECIBIDOS - RFC empresa = receptor). Las notas de credito (tipo E) restan."));
  }, dataIvaAcreditable.length);

  await runSheetStage(wb, 'CEDULA NO CLASIFICADOS', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildTitledSheetChunks(dataNoClasificados, 'CEDULA NO CLASIFICADOS',
      "CEDULA NO CLASIFICADOS: direccion no determinada (RFC empresa no coincide con emisor/receptor). No suman a ingresos, gastos ni IVA."));
  }, dataNoClasificados.length);

  // 4. ANEXO DATOS FALTANTES
  const dataFaltantes = validResults.map(r => {
    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];
    const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];
    
    return {
      UUID: r.uuid,
      Serie: r.serie,
      Folio: r.folio,
      Fecha: r.fechaEmision,
      RFC_Emisor: r.rfcEmisor,
      RFC_Receptor: r.rfcReceptor,
      Tipo_CFDI: r.tipoCFDI,
      Tiene_Carta_Porte: getCartaPortePresente(r),
      Tiene_Placas_Unidad: hasValue(detail?.autotransporte?.placaVM) ? 'SI' : (r.trazabilidadInfo?.tienePlacasUnidad || 'NO'),
      Tiene_Origen: hasValue(mainOrigen?.idUbicacion) || hasValue(mainOrigen?.rfcRemitenteDestinatario) || hasValue(mainOrigen?.codigoPostal) ? 'SI' : (r.trazabilidadInfo?.tieneOrigen || 'NO'),
      Tiene_Destino: hasValue(mainDestino?.idUbicacion) || hasValue(mainDestino?.rfcRemitenteDestinatario) || hasValue(mainDestino?.codigoPostal) ? 'SI' : (r.trazabilidadInfo?.tieneDestino || 'NO'),
      Tiene_Mercancias: detail?.mercancias?.length ? 'SI' : (r.trazabilidadInfo?.tieneMercancias || 'NO'),
      Tiene_Operador: hasValue(operador?.rfcFigura) || hasValue(operador?.nombreFigura) || hasValue(operador?.numLicencia) ? 'SI' : (r.trazabilidadInfo?.tieneOperador || 'NO'),
      Tiene_Distancia: hasValue(detail?.totalDistanciaRecorrida) ? 'SI' : 'NO',
      Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
      Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
      Tiene_Entry: r.trazabilidadInfo?.tieneEntryNumber || 'NO',
      Tiene_Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
      Datos_Faltantes: getDatosFaltantes(r),
      Fuente_Externa_Requerida: r.trazabilidadInfo?.fuenteExternaRequerida || (isSatTechnicalFailure(r.estatusSAT) ? 'SAT externo/acuse' : 'NO'),
      Diagnostico: r.trazabilidadInfo?.diagnosticoDatosFaltantes || `Expediente ${getDatosFaltantes(r) === 'Sin faltantes críticos' ? 'sin faltantes criticos' : `incompleto: falta ${getDatosFaltantes(r)}`}`,
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaDatosFaltantes || 'Integrar documentos faltantes y relacionarlos por UUID antes de usar el expediente',
      Se_Puede_Auditar_Con_Este_XML_Solamente: r.trazabilidadInfo?.auditableSoloConXML || 'NO'
    };
  });
  await runSheetStage(wb, 'ANEXO DATOS FALTANTES', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataFaltantes, 'ANEXO DATOS FALTANTES'));
  }, dataFaltantes.length);

  // 5. MATRIZ DE RASTREABILIDAD
  const dataMatriz = validResults.map(r => {
    const detail = cp(r);
    const mainOrigen = detail?.origenes?.[0];
    const mainDestino = detail?.destinos?.[0];
    const operador = detail?.figuras?.find((f: any) => f.tipoFigura === '01') || detail?.figuras?.[0];
    
    return {
      UUID: r.uuid,
      Factura: `${r.serie}-${r.folio}`,
      Cliente_Proveedor: r.tipoCFDI === 'I' ? r.nombreReceptor : r.nombreEmisor,
      Fecha: r.fechaEmision,
      Origen_Completo: formatAddress(mainOrigen),
      Destino_Completo: formatAddress(mainDestino),
      Ruta_Resumen: routeSummary(r),
      Unidad_Placas: detail?.autotransporte?.placaVM || r.trazabilidadInfo?.placas || 'NO',
      Operador: joinClean(operador?.rfcFigura, operador?.nombreFigura, operador?.numLicencia),
      Mercancia_Principal: detail?.mercanciaPrincipal || 'NO VIENE EN XML',
      Peso_Total: joinClean(detail?.pesoBrutoTotal, detail?.unidadPeso),
      Distancia_Recorrida: detail?.totalDistanciaRecorrida || r.trazabilidadInfo?.distancia || 'NO VIENE EN XML',
      Transporte_Internacional: normalizeI18nSiNo(detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional),
      Origen: r.trazabilidadInfo?.tieneOrigen || 'NO VIENE EN XML',
      Destino: r.trazabilidadInfo?.tieneDestino || 'NO VIENE EN XML',
      Mercancia: r.trazabilidadInfo?.tieneMercancias || 'NO VIENE EN XML',
      Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
      DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
      Entry: r.trazabilidadInfo?.tieneEntryNumber || 'NO',
      Pago_Identificado: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE CRUCE EXTERNO',
      Estado_De_Cuenta: r.trazabilidadInfo?.estadoDeCuenta || 'REQUIERE IMPORTACION',
      Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior || 'REQUIERE CRUCE EXTERNO',
      Nivel_De_Expediente: getNivelExpediente(r),
      Estatus_Documental: r.trazabilidadInfo?.estatusDocumental || (getDatosFaltantes(r) === 'Sin faltantes críticos' ? 'Expediente completo' : 'Expediente incompleto'),
      Riesgo: r.trazabilidadInfo?.riesgo || (getDatosFaltantes(r) === 'Sin faltantes críticos' ? 'BAJO' : 'MEDIO'),
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || (isSatTechnicalFailure(r.estatusSAT) ? SAT_RETRY_ACTION : 'Integrar documentos faltantes y relacionarlos por UUID')
    };
  });
  await runSheetStage(wb, 'MATRIZ DE RASTREABILIDAD', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataMatriz, 'MATRIZ DE RASTREABILIDAD'));
  }, dataMatriz.length);

  // Memoria/CPU (item 4): caché de documentos XML parseados, con vida acotada
  // a esta fase (las únicas 4 hojas que necesitan volver a leer el XML crudo).
  // Antes: hasta 4 parseos independientes por documento en este tramo. Ahora:
  // 1 parseo por documento, reutilizado, y la caché se descarta al terminar
  // esta fase — no se retienen los documentos DOM parseados durante el resto
  // del export (COMPARATIVO/RETENCIONES/ERRORES no los necesitan).
  const xmlDocCache: XmlDocCache = new Map();
  const alertasForenses = buildAlerts(validResults, xmlDocCache);
  await appendJsonSheet(wb, extractRawXmlRows(validResults, xmlDocCache), 'EXTRACCION CRUDA XML', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildForensicRows(validResults), 'DETALLE FORENSE POR CFDI', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildConceptRows(validResults), 'DETALLE CONCEPTOS XML', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildTaxRows(validResults), 'DETALLE IMPUESTOS CONCEPTO', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildCartaPorteMercancias(validResults), 'DETALLE CARTA PORTE MERCANCIAS', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildCartaPorteUbicaciones(validResults), 'DETALLE CP UBICACIONES', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildCartaPorteFiguras(validResults), 'DETALLE CARTA PORTE FIGURAS', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildPagosRows(validResults, xmlDocCache), 'DETALLE COMPLEMENTOS PAGO', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildConciliacionPagosRows(validResults), 'CONCILIACION PAGOS PPD', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildConciliacionREPRows(validResults), 'CONCILIACION REP', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, alertasForenses, 'ALERTAS FORENSES', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildQualityRows(validResults, xmlDocCache), 'CONTROL CALIDAD XML', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  await appendJsonSheet(wb, buildSummaryRows(validResults, alertasForenses), 'RESUMEN EJECUTIVO', onProgress, ++stageIdx, TOTAL_EXPORT_STAGES);
  xmlDocCache.clear(); // liberar los documentos DOM parseados — ya no se necesitan en las hojas restantes

  // ── Nueva hoja: COMPARATIVO BASE Y TASA IVA ──
  const dataComparativo = buildComparativoBaseTasaRows(validResults);
  await runSheetStage(wb, 'COMPARATIVO BASE Y TASA IVA', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataComparativo, 'COMPARATIVO BASE Y TASA IVA', 'A10'));
  }, dataComparativo.length);

  // ── Nueva hoja: CEDULA RETENCIONES ──
  const dataRetenciones = buildRetencionesRows(validResults);
  await runSheetStage(wb, 'CEDULA RETENCIONES', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(dataRetenciones, 'CEDULA RETENCIONES', 'A10'));
  }, dataRetenciones.length);

  // ── Nueva hoja obligatoria: ERRORES LECTURA XML ──
  const dataErrores = invalidResults.map(r => {
    const xmlStr = String(r.xmlContent || '');
    const errorMsg = String(r.comentarioFiscal || r.comentarioMotor || '');
    
    let motivoError = 'XML INCOMPLETO';
    if (errorMsg.includes('Timeout') || errorMsg.includes('excedido')) {
      motivoError = 'TIMEOUT EN PROCESAMIENTO';
    } else if (xmlStr) {
      const hasComprobante = xmlStr.includes('Comprobante');
      const hasTimbre = xmlStr.includes('TimbreFiscalDigital');
      if (!hasComprobante) {
        motivoError = 'XML NO CFDI';
      } else if (!hasTimbre) {
        motivoError = 'CFDI SIN TIMBRE';
      } else {
        motivoError = 'UUID NO LOCALIZADO';
      }
    } else {
      if (errorMsg.includes('formato inválido') || errorMsg.includes('parse')) {
        motivoError = 'XML INCOMPLETO';
      } else if (errorMsg.includes('Versión no soportada')) {
        motivoError = 'VERSION NO SOPORTADA';
      } else {
        motivoError = 'UUID NO LOCALIZADO';
      }
    }

    const tieneComprobante = xmlStr.includes('Comprobante') ? 'SI' : 'NO';
    const tieneTimbre = xmlStr.includes('TimbreFiscalDigital') ? 'SI' : 'NO';

    let uuidExtraido = 'NO DISPONIBLE';
    const uuidMatch = xmlStr.match(/UUID="([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})"/i);
    if (uuidMatch) {
      uuidExtraido = uuidMatch[1];
    }

    let versionCFDI = r.versionCFDI || 'NO DISPONIBLE';
    if (versionCFDI === 'NO DISPONIBLE' && xmlStr) {
      const versionMatch = xmlStr.match(/Version="([^"]+)"/);
      if (versionMatch) versionCFDI = versionMatch[1];
    }

    let tipoCFDI = r.tipoCFDI || 'NO DISPONIBLE';
    if (tipoCFDI === 'NO DISPONIBLE' && xmlStr) {
      const tipoMatch = xmlStr.match(/TipoDeComprobante="([^"]+)"/);
      if (tipoMatch) tipoCFDI = tipoMatch[1];
    }

    let rfcEmisor = r.rfcEmisor || 'NO DISPONIBLE';
    if (rfcEmisor === 'NO DISPONIBLE' && xmlStr) {
      const rfcMatch = xmlStr.match(/Emisor[^>]*Rfc="([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})"/i);
      if (rfcMatch) rfcEmisor = rfcMatch[1];
    }

    let rfcReceptor = r.rfcReceptor || 'NO DISPONIBLE';
    if (rfcReceptor === 'NO DISPONIBLE' && xmlStr) {
      const rfcMatch = xmlStr.match(/Receptor[^>]*Rfc="([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})"/i);
      if (rfcMatch) rfcReceptor = rfcMatch[1];
    }

    let fecha = r.fechaEmision || 'NO DISPONIBLE';
    if (fecha === 'NO DISPONIBLE' && xmlStr) {
      const fechaMatch = xmlStr.match(/Fecha="([^T"]+)/);
      if (fechaMatch) fecha = fechaMatch[1];
    }

    let accionRecomendada = 'Revisar archivo XML manualmente';
    if (motivoError === 'TIMEOUT EN PROCESAMIENTO') {
      accionRecomendada = 'Reintentar procesamiento; el servicio del SAT podría estar congestionado';
    } else if (motivoError === 'XML NO CFDI') {
      accionRecomendada = 'Verificar que el archivo sea un CFDI válido emitido por el SAT';
    } else if (motivoError === 'CFDI SIN TIMBRE') {
      accionRecomendada = 'Verificar que el comprobante esté debidamente timbrado';
    } else if (motivoError === 'VERSION NO SOPORTADA') {
      accionRecomendada = 'Utilizar una versión de CFDI soportada (3.3 o 4.0)';
    }

    return {
      Archivo_XML: r.fileName,
      Motivo_Error: motivoError,
      Tiene_Comprobante: tieneComprobante,
      Tiene_Complemento_TimbreFiscalDigital: tieneTimbre,
      UUID_Extraido: uuidExtraido,
      Version_CFDI: versionCFDI,
      Tipo_CFDI: tipoCFDI,
      RFC_Emisor: rfcEmisor,
      RFC_Receptor: rfcReceptor,
      Fecha: fecha,
      Error_Tecnico: r.observacionesTecnicas || errorMsg || 'Error desconocido',
      Accion_Recomendada: accionRecomendada
    };
  });

  await runSheetStage(wb, 'ERRORES LECTURA XML', ++stageIdx, onProgress, () => {
    appendSheetChunks(wb, buildSafeSheets(
      dataErrores.length ? dataErrores : [{ Archivo_XML: 'SIN REGISTROS', Motivo_Error: 'Ningún XML con error de lectura.' }],
      'ERRORES LECTURA XML'
    ));
  }, dataErrores.length);

  // Nota: se usa startsWith (no ===) porque hojas voluminosas pueden dividirse
  // automáticamente en NOMBRE_1/NOMBRE_2/... si exceden 1,048,576 filas (P0-A).
  wb.SheetNames.forEach((sheetName: string) => {
    if (sheetName.startsWith('COMPARATIVO BASE Y TASA IVA')) {
      applyComparativoSheetDefaults(wb.Sheets[sheetName], dataComparativo);
    } else if (sheetName.startsWith('CEDULA RETENCIONES')) {
      applyRetencionesSheetDefaults(wb.Sheets[sheetName], dataRetenciones);
    } else if (sheetName.startsWith('CEDULA IVA')) {
      applyIvaSheetDefaults(wb.Sheets[sheetName]);
    } else {
      applySheetDefaults(wb.Sheets[sheetName]);
    }
  });

  // ── Reportes parciales (requisito 3) ──────────────────────────────────
  // Nunca se presenta un archivo con hojas faltantes como si fuera un
  // reporte completo. Si falló alguna hoja: se agrega un aviso EXPLICITO
  // como primera hoja del libro (imposible de pasar por alto), con el
  // detalle de qué hoja, por qué, y cuántas filas quedaron afectadas.
  // Si la hoja que falló es FISCAL CRÍTICA (Resumen, Diagnostico_CFDI,
  // cédulas de ingresos/IVA), el archivo se recorta a un reporte de
  // diagnóstico — nunca se entrega como si tuviera el detalle completo.
  const hasCriticalFailure = failures.some(f => f.critical);
  const exportStatus: ExportStatus = hasCriticalFailure ? 'critical_failure' : (failures.length > 0 ? 'partial' : 'complete');

  if (failures.length > 0) {
    const summaryAoa: any[][] = [
      ['EXPORTACION INCOMPLETA'],
      [hasCriticalFailure
        ? 'Al menos una hoja FISCAL CRITICA no pudo generarse. Este archivo se recorto a un reporte de diagnostico y NO contiene el detalle completo habitual.'
        : 'Todas las hojas fiscales criticas se generaron correctamente. Una o mas hojas de detalle/forenses no pudieron generarse; el resto del reporte esta completo.'],
      [],
      ['Hoja afectada', 'Critica', 'Filas afectadas', 'Motivo'],
      ...failures.map(f => [f.sheet, f.critical ? 'SI' : 'NO', String(f.affectedRows), f.error]),
    ];
    const statusWs = (XLSX as any).utils.aoa_to_sheet(summaryAoa);
    statusWs['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 80 }];
    const cellA1 = statusWs['A1'];
    if (cellA1) cellA1.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, fill: { fgColor: { rgb: hasCriticalFailure ? 'C00000' : 'B45309' } } };
    const statusSheetName = 'EXPORTACION INCOMPLETA';
    wb.Sheets[statusSheetName] = statusWs;
    // Insertar como PRIMERA hoja del libro.
    wb.SheetNames = [statusSheetName, ...wb.SheetNames.filter((n: string) => n !== statusSheetName)];

    if (hasCriticalFailure) {
      // Recorte a reporte de diagnóstico: solo el aviso + hojas críticas que
      // sí se generaron + errores de lectura. Las demás hojas permanecen en
      // wb.Sheets (no se destruyen), pero se excluyen de wb.SheetNames — por
      // lo que NO se escriben en el archivo final. Así nunca se entrega un
      // reporte "completo" con una hoja fiscal crítica omitida en silencio.
      const keep = new Set<string>([statusSheetName, 'ERRORES LECTURA XML']);
      wb.SheetNames.forEach((n: string) => {
        const base = n.replace(/_\d+$/, '');
        if (CRITICAL_SHEETS.has(base) && !failures.some(f => f.sheet === base)) keep.add(n);
      });
      wb.SheetNames = wb.SheetNames.filter((n: string) => keep.has(n));
    }
  }

  // Estado estructurado de la exportación — disponible para el llamador
  // (Dashboard.tsx) sin romper el contrato existente de "devuelve wb".
  wb.__sentinelExportStatus = { status: exportStatus, failures } as ExportStatusInfo;

  return wb;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTACIÓN ESCALABLE (lotes grandes) ──────────────────────────────────────
//
// CAUSA RAÍZ diagnosticada (ver exportScalability.test.ts para la evidencia
// medida): buildDiagnosticoWorkbook() construye ~20 hojas de detalle POR
// DOCUMENTO (una de ellas, "EXTRACCION CRUDA XML", emite ~56 filas por CFDI —
// un atributo XML por fila, no un resumen) y las mantiene TODAS en un único
// objeto `wb` hasta el final. Con 6,726 CFDI eso son ~8 millones de celdas en
// memoria simultáneamente, y XLSX.writeFile() debe entonces serializar TODO
// ese workbook de una sola vez (ZIP + XML + tabla de cadenas compartidas) en
// una sola llamada síncrona. Medido: build ~66s / ~2.4GB RSS, más
// XLSX.write ~14s / ~3.0GB RSS pico, archivo final ~353MB — muy por encima de
// lo que un tab de navegador (con la app ya cargada) puede sostener de forma
// fiable, y muy por encima de lo que cualquier prueba con lotes menores
// alcanza (500 CFDI: ~1.3s / ~400MB). NINGUNA hoja individual llega al límite
// de 1,048,576 filas de Excel (el auto-split existente por eso nunca se
// activa) — el problema es memoria/tiempo AGREGADOS de todo el libro a la vez,
// no el límite de una sola hoja.
//
// SOLUCIÓN: en vez de un único `wb` con TODO el lote, se reutiliza
// buildDiagnosticoWorkbook() SIN MODIFICARLO, una vez POR BLOQUE de CFDI, y
// cada bloque se escribe y se descarta (nunca se mantienen dos workbooks
// completos en memoria a la vez). Un resumen global (00_Resumen_Global.xlsx)
// agrega los totales sobre el LOTE COMPLETO (misma fuente central que hoy:
// contarEstatusSAT, reconciliarPagosPPD, buildAlerts — CERO cambios a esas
// funciones ni a sus reglas). La partición en bloques NUNCA separa un REP de
// las facturas con las que tiene relación (ver buildExportClusters): eso
// garantiza que cada archivo de bloque sea, por sí solo, fiscalmente
// autoconsistente (sus propias hojas de conciliación/alertas están completas
// para los documentos que contiene), sin tener que tocar la lógica interna
// de reconciliarPagosPPD/buildAlerts para hacerlas conscientes de bloques.
// ═══════════════════════════════════════════════════════════════════════════

// Peso estimado ("filas equivalentes") que un CFDI aporta al conjunto de
// hojas de detalle. Calibrado empíricamente (ver exportScalability.test.ts)
// contra las hojas más voluminosas: EXTRACCION CRUDA XML (un atributo XML por
// fila), DETALLE CONCEPTOS/IMPUESTOS, hojas de Carta Porte y conciliación de
// pagos. Deliberadamente conservador (sobreestima antes que subestimar) —
// instrucción del usuario: dividir por filas/celdas y memoria estimada, no
// solo por cantidad de XML.
const EXPORT_WEIGHT_BASE = 40;
const EXPORT_WEIGHT_PER_CONCEPTO = 16;
const EXPORT_WEIGHT_PER_CARTA_PORTE_ITEM = 13;
const EXPORT_WEIGHT_PER_PAGO_RELACIONADO = 8;

export const estimateCfdiExportWeight = (r: ValidationResult): number => {
  const conceptos = r.desglosePorConcepto?.length || 0;
  const cpDetail: any = r.trazabilidadInfo?.cartaPorteDetalle;
  const cpItems = (cpDetail?.mercancias?.length || 0) + (cpDetail?.origenes?.length || 0) +
    (cpDetail?.destinos?.length || 0) + (cpDetail?.figuras?.length || 0);
  const pagos = r.pagosRelacionados?.length || 0;
  return EXPORT_WEIGHT_BASE
    + conceptos * EXPORT_WEIGHT_PER_CONCEPTO
    + cpItems * EXPORT_WEIGHT_PER_CARTA_PORTE_ITEM
    + pagos * EXPORT_WEIGHT_PER_PAGO_RELACIONADO;
};

// Presupuesto por bloque. A este peso, un bloque se comporta como el caso
// medido de ~500 CFDI típicos (~1.3s, ~400MB de pico) — muy por debajo de
// donde el tiempo/memoria empiezan a crecer de forma no lineal (medido a
// partir de ~2,300 CFDI). PLAN_MAX_CFDI_POR_BLOQUE es un tope adicional por
// conteo bruto (además del peso, nunca en su lugar).
const PLAN_MAX_WEIGHT_POR_BLOQUE = 40000;
const PLAN_MAX_CFDI_POR_BLOQUE = 800;

// Une con path compression + union by reference — estructura mínima, solo
// para agrupar UUIDs relacionados antes de exportar (no es parte del motor
// fiscal, no se usa en reconciliarPagosPPD).
class ExportUnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

// Agrupa resultados en "clusters" que jamás deben separarse entre archivos
// de bloque: mismo UUID (duplicados exactos) y relaciones REP<->factura
// (pagosRelacionados). Un documento sin relaciones queda en su propio
// cluster de tamaño 1 — la inmensa mayoría del lote no se ve afectada.
// Devuelve los clusters en orden de primera aparición en `results` (los Map
// de JS preservan el orden de inserción), para que la partición en bloques
// sea determinística.
const buildExportClusters = (results: ValidationResult[]): Map<string, ValidationResult[]> => {
  const uf = new ExportUnionFind();
  const byUuid = new Map<string, ValidationResult[]>();
  results.forEach((r, idx) => {
    const uuid = String(r.uuid || '').trim().toUpperCase();
    const key = uuid && uuid !== 'NO DISPONIBLE' && uuid !== 'NO VIENE EN XML' ? uuid : `__SIN_UUID__${idx}`;
    uf.find(key);
    if (!byUuid.has(key)) byUuid.set(key, []);
    byUuid.get(key)!.push(r);
  });
  results.forEach(r => {
    if (String(r.tipoCFDI || '').toUpperCase() !== 'P') return;
    const repUuid = String(r.uuid || '').trim().toUpperCase();
    if (!repUuid || !byUuid.has(repUuid)) return;
    (r.pagosRelacionados || []).forEach(pago => {
      const facturaUuid = String(pago.uuidFacturaRelacionada || '').trim().toUpperCase();
      if (facturaUuid && byUuid.has(facturaUuid)) uf.union(repUuid, facturaUuid);
    });
  });

  const membersByCluster = new Map<string, ValidationResult[]>();
  const clusterKeyByUuidKey = new Map<string, string>();
  Array.from(byUuid.keys()).forEach(key => clusterKeyByUuidKey.set(key, uf.find(key)));
  results.forEach((r, idx) => {
    const uuid = String(r.uuid || '').trim().toUpperCase();
    const uuidKey = uuid && uuid !== 'NO DISPONIBLE' && uuid !== 'NO VIENE EN XML' ? uuid : `__SIN_UUID__${idx}`;
    const clusterKey = clusterKeyByUuidKey.get(uuidKey)!;
    if (!membersByCluster.has(clusterKey)) membersByCluster.set(clusterKey, []);
    membersByCluster.get(clusterKey)!.push(r);
  });
  return membersByCluster;
};

export interface ExportChunkPlan {
  chunks: ValidationResult[][];
  totalWeight: number;
  singleFile: boolean; // true si cabe todo en un solo bloque — conserva el XLSX único actual
}

// Decide cómo particionar `results` en bloques de exportación. NUNCA separa
// un cluster (REP + sus facturas relacionadas, o UUIDs duplicados) entre dos
// bloques distintos — instrucción explícita del usuario. Si un solo cluster
// excede el presupuesto de un bloque (muy improbable con datos reales), se
// convierte en su propio bloque sobredimensionado en vez de romperlo.
export function planExportChunks(
  results: ValidationResult[],
  maxWeightPerChunk: number = PLAN_MAX_WEIGHT_POR_BLOQUE,
  maxCfdiPerChunk: number = PLAN_MAX_CFDI_POR_BLOQUE
): ExportChunkPlan {
  const membersByCluster = buildExportClusters(results);
  const chunks: ValidationResult[][] = [];
  let current: ValidationResult[] = [];
  let currentWeight = 0;
  let totalWeight = 0;

  const clusterGroups: ValidationResult[][] = Array.from(membersByCluster.values());
  for (const members of clusterGroups) {
    const clusterWeight = members.reduce((sum: number, r: ValidationResult) => sum + estimateCfdiExportWeight(r), 0);
    totalWeight += clusterWeight;
    const overflow = current.length > 0 &&
      (currentWeight + clusterWeight > maxWeightPerChunk || current.length + members.length > maxCfdiPerChunk);
    if (overflow) {
      chunks.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(...members);
    currentWeight += clusterWeight;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);

  return { chunks, totalWeight, singleFile: chunks.length <= 1 };
}

// Hoja "INDICE_CONCILIACION" + reconciliación exacta del lote completo, para
// el archivo 00_Resumen_Global.xlsx. Usa exclusivamente resultados YA
// calculados (contarEstatusSAT/reconciliarPagosPPD no se vuelven a computar
// aquí de forma distinta) — solo agrega la vista "qué CFDI quedó en qué
// archivo".
const buildIndiceConciliacionRows = (
  results: ValidationResult[],
  chunks: ValidationResult[][],
  chunkFileNames: string[]
) => {
  const isValidUUID = (uuid: string | undefined): boolean => {
    if (!uuid) return false;
    const u = String(uuid).trim().toUpperCase();
    return u !== 'NO DISPONIBLE' && u !== 'NO_DISPONIBLE' && u !== 'NO VIENE EN XML' && u !== '';
  };

  const rows = chunks.map((chunk, i) => {
    const validos = chunk.filter(r => isValidUUID(r.uuid));
    const uuidCounts = new Map<string, number>();
    validos.forEach(r => {
      const u = String(r.uuid).toUpperCase();
      uuidCounts.set(u, (uuidCounts.get(u) || 0) + 1);
    });
    const distintos = uuidCounts.size;
    const duplicados = validos.length - distintos;
    const errores = chunk.length - validos.length;
    const uuidsOrdenados = Array.from(uuidCounts.keys()).sort();
    return {
      Archivo: chunkFileNames[i],
      CFDI_Incluidos: chunk.length,
      UUID_Unicos: distintos,
      Duplicados_En_Este_Archivo: duplicados,
      Errores_Lectura_En_Este_Archivo: errores,
      Primer_UUID: uuidsOrdenados[0] || 'NO APLICA',
      Ultimo_UUID: uuidsOrdenados[uuidsOrdenados.length - 1] || 'NO APLICA',
      Peso_Estimado: chunk.reduce((sum, r) => sum + estimateCfdiExportWeight(r), 0),
    };
  });

  // Reconciliación exacta del LOTE COMPLETO (instrucción 6): Total procesados
  // = UUID exportados (distintos) + errores de lectura + duplicados
  // controlados. Ninguna fila se pierde: todo CFDI cargado queda en
  // exactamente un archivo de bloque (ver buildExportClusters).
  const validosTotal = results.filter(r => isValidUUID(r.uuid));
  const uuidCountsTotal = new Map<string, number>();
  validosTotal.forEach(r => {
    const u = String(r.uuid).toUpperCase();
    uuidCountsTotal.set(u, (uuidCountsTotal.get(u) || 0) + 1);
  });
  const uuidExportados = uuidCountsTotal.size;
  const erroresLectura = results.length - validosTotal.length;
  const duplicadosControlados = validosTotal.length - uuidExportados;
  const totalProcesados = results.length;
  const cuadra = totalProcesados === uuidExportados + erroresLectura + duplicadosControlados;

  return {
    rows,
    reconciliacion: { totalProcesados, uuidExportados, erroresLectura, duplicadosControlados, cuadra },
  };
};

// Construye el archivo 00_Resumen_Global.xlsx: Resumen + RESUMEN EJECUTIVO
// (exactamente las mismas funciones que usa el archivo único de hoy, sobre
// el LOTE COMPLETO) + el índice de conciliación del paquete. Es
// deliberadamente ligero: no reconstruye ninguna hoja de detalle por
// documento (esas viven en los archivos de bloque), así que no reintroduce
// el problema de memoria que se está resolviendo.
async function buildResumenGlobalWorkbook(
  results: ValidationResult[],
  chunks: ValidationResult[][],
  chunkFileNames: string[]
): Promise<{ wb: any; reconciliacion: ExportStatusInfo['reconciliacion'] }> {
  const isValidUUID = (uuid: string | undefined): boolean => {
    if (!uuid) return false;
    const u = String(uuid).trim().toUpperCase();
    return u !== 'NO DISPONIBLE' && u !== 'NO_DISPONIBLE' && u !== 'NO VIENE EN XML' && u !== '';
  };
  const validResults = results.filter(r => isValidUUID(r.uuid));

  const wb = (XLSX as any).utils.book_new();
  await appendJsonSheet(wb, buildExecutiveSummaryRows(validResults), 'Resumen');
  if (wb.Sheets['Resumen']) {
    wb.Sheets['Resumen']['!cols'] = [{ wch: 45 }, { wch: 80 }];
  }
  const alertasGlobales = buildAlerts(validResults);
  await appendJsonSheet(wb, buildSummaryRows(validResults, alertasGlobales), 'RESUMEN EJECUTIVO');

  const { rows: indiceRows, reconciliacion } = buildIndiceConciliacionRows(results, chunks, chunkFileNames);
  const reconciliacionRows = [
    { Metrica: 'Total CFDI procesados (lote completo)', Valor: reconciliacion.totalProcesados },
    { Metrica: 'UUID exportados (distintos)', Valor: reconciliacion.uuidExportados },
    { Metrica: 'Errores de lectura (sin UUID válido)', Valor: reconciliacion.erroresLectura },
    { Metrica: 'Duplicados controlados (mismo UUID, no se pierden ni se duplican en los totales)', Valor: reconciliacion.duplicadosControlados },
    { Metrica: 'Reconciliación exacta (procesados = exportados + errores + duplicados)', Valor: reconciliacion.cuadra ? 'CUADRA' : 'NO CUADRA — REVISAR' },
    { Metrica: 'Total de archivos de bloque generados', Valor: chunks.length },
  ];
  await appendJsonSheet(wb, [...reconciliacionRows, { Metrica: '', Valor: '' }, { Metrica: '=== DETALLE POR ARCHIVO ===', Valor: '' }], 'INDICE_CONCILIACION');
  // Se agrega el detalle por archivo a partir de la fila siguiente, en la
  // misma hoja (misma lógica de aoa que usan las demás cédulas con título).
  if (wb.Sheets['INDICE_CONCILIACION'] && indiceRows.length) {
    const headers = collectHeaders(indiceRows);
    const startRow = reconciliacionRows.length + 2; // +1 encabezado, +1 fila de título de sección
    (XLSX as any).utils.sheet_add_aoa(wb.Sheets['INDICE_CONCILIACION'], rowsToAOA(indiceRows, headers), { origin: { r: startRow, c: 0 } });
    const ref = wb.Sheets['INDICE_CONCILIACION']['!ref'];
    const range = ref ? (XLSX as any).utils.decode_range(ref) : null;
    const lastRow = startRow + indiceRows.length;
    const lastCol = Math.max(range ? range.e.c : 1, headers.length - 1);
    wb.Sheets['INDICE_CONCILIACION']['!ref'] = (XLSX as any).utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });
  }

  return { wb, reconciliacion };
}

// Tipado mínimo de File System Access API (no siempre presente en lib.dom
// según la versión de TypeScript) — evita depender de tipos globales que
// pueden faltar en el entorno de build.
export interface MinimalWritableFileStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface MinimalFileSystemDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<MinimalWritableFileStream>;
  }>;
}

export interface ExportToExcelOptions {
  cancelToken?: ExportCancelToken;
  // Si se provee (usuario concedió acceso a una carpeta vía
  // window.showDirectoryPicker()), cada archivo se escribe ahí con
  // confirmación real de escritura (File System Access API) en vez de una
  // descarga de navegador "dispara y olvida" — nunca se afirma que un
  // archivo se guardó sin esa confirmación.
  directoryHandle?: MinimalFileSystemDirectoryHandle;
  // Reintento dirigido (instrucción 6, "reintenta solo los pendientes"):
  // 1-indexado, mismo valor que ExportProgressEvent.fileIndex. Los archivos
  // con índice MENOR a este NO se reconstruyen ni se vuelven a escribir —
  // se asume que ya existen de un intento anterior (el llamador es
  // responsable de esa garantía, típicamente porque status.filesWritten los
  // reportó como exitosos). Ningún archivo ya generado se repite.
  resumeFromFile?: number;
}

export async function exportToExcel(
  results: ValidationResult[],
  fileNameOverride?: string,
  onProgress?: ExportProgressCallback,
  options?: ExportToExcelOptions
): Promise<any> {
  const plan = planExportChunks(results);

  // Lotes pequeños/medianos (la inmensa mayoría de los casos reales): se
  // conserva EXACTAMENTE el comportamiento actual — un solo XLSX, sin ningún
  // cambio de nombre de archivo ni de contrato de retorno.
  if (plan.singleFile) {
    const wb = await buildDiagnosticoWorkbook(results, onProgress);
    const status: ExportStatusInfo | undefined = wb.__sentinelExportStatus;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    let fileName = fileNameOverride || `SentinelExpress_Diagnostico_${dateStr}.xlsx`;
    if (!fileNameOverride && status?.status === 'critical_failure') {
      fileName = `DIAGNOSTICO_INCOMPLETO_${dateStr}.xlsx`;
    } else if (!fileNameOverride && status?.status === 'partial') {
      fileName = `INCOMPLETO_SentinelExpress_Diagnostico_${dateStr}.xlsx`;
    }
    sentinelStageLog("serializacion_descarga_inicio", { fileName });
    (XLSX as any).writeFile(wb, fileName);
    sentinelStageLog("serializacion_descarga_fin", { fileName });
    return wb;
  }

  // Lotes grandes: paquete de varios archivos, generados y descargados UNO A
  // LA VEZ — nunca se mantienen dos workbooks completos en memoria
  // simultáneamente (instrucción 3). Cada archivo se descarga tan pronto se
  // termina de construir, así que si un bloque posterior falla, los
  // anteriores YA están en el disco del usuario — no hay nada que "perder"
  // (instrucción 7).
  return exportToExcelMultiFile(results, plan, fileNameOverride, onProgress, options);
}

// Escribe UN workbook a disco/descarga. Si se proveyó `directoryHandle`
// (File System Access API — el usuario ya concedió acceso a una carpeta),
// la escritura queda CONFIRMADA: cualquier error (permiso revocado, cuota,
// usuario cerró el picker) se propaga como excepción real, nunca se informa
// éxito sin esa confirmación. Sin `directoryHandle`, se usa el mecanismo de
// descarga de navegador de siempre (XLSX.writeFile) — que dispara la
// descarga pero NO puede confirmar que el navegador no la haya bloqueado
// (limitación de la plataforma, no de este código): por eso
// ExportStatusInfo.writesConfirmed queda en `false` para ese camino, y
// Dashboard.tsx nunca debe redactar el mensaje como si fuera un guardado
// confirmado.
async function writeWorkbookFile(
  wb: any,
  fileName: string,
  directoryHandle?: MinimalFileSystemDirectoryHandle
): Promise<void> {
  if (directoryHandle) {
    const baseName = fileName.split(/[\\/]/).pop() || fileName;
    const buffer: Uint8Array = (XLSX as any).write(wb, { type: 'array', bookType: 'xlsx' });
    const fileHandle = await directoryHandle.getFileHandle(baseName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return;
  }
  (XLSX as any).writeFile(wb, fileName);
}

async function exportToExcelMultiFile(
  results: ValidationResult[],
  plan: ExportChunkPlan,
  fileNameOverride: string | undefined,
  onProgress: ExportProgressCallback | undefined,
  options: ExportToExcelOptions | undefined
): Promise<any> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  // Si se pasó un nombre/ruta explícito (usado por las pruebas para escribir
  // a un directorio conocido), se usa como prefijo de cada archivo del
  // paquete en vez de como nombre único.
  const basePrefix = fileNameOverride
    ? fileNameOverride.replace(/\.xlsx$/i, '')
    : `SentinelExpress_Diagnostico_${dateStr}`;

  const totalChunks = plan.chunks.length;
  const chunkFileNames = plan.chunks.map((_, i) => `${basePrefix}_Diagnostico_${String(i + 1).padStart(3, '0')}.xlsx`);
  const globalFileName = `${basePrefix}_00_Resumen_Global.xlsx`;

  const filesWritten: string[] = [];
  const chunkFailures: ExportSheetFailure[] = [];
  let failedAtFile: number | undefined;
  let cancelled = false;
  const directoryHandle = options?.directoryHandle;
  // Reintento dirigido: los archivos con índice MENOR a resumeFromFile no se
  // reconstruyen — se asume que ya existen de un intento previo (instrucción
  // 6, "reintenta solo los pendientes" / "ningún archivo ya generado se
  // repite"). Se registran igual en filesWritten para que la reconciliación
  // final del paquete completo siga siendo honesta y completa.
  const resumeFromFile = options?.resumeFromFile && options.resumeFromFile > 1 ? options.resumeFromFile : 1;

  sentinelStageLog("export_multiarchivo_inicio", { totalChunks, totalCfdi: results.length, pesoTotal: plan.totalWeight, resumeFromFile });

  for (let i = 0; i < totalChunks; i++) {
    if (i + 1 < resumeFromFile) {
      filesWritten.push(chunkFileNames[i]); // ya generado en un intento anterior — no se repite
      continue;
    }
    if (options?.cancelToken?.cancelled) { cancelled = true; break; }

    const chunkFileName = chunkFileNames[i];
    onProgress?.({ sheet: `Preparando archivo ${i + 1} de ${totalChunks}`, stage: 'building', sheetIndex: 0, totalSheets: TOTAL_EXPORT_STAGES, fileIndex: i + 1, fileTotal: totalChunks, fileName: chunkFileName });

    // Reenvía el progreso interno de hoja (ya probado y estable) anotado con
    // en qué archivo del paquete va — Dashboard.tsx puede mostrar ambos
    // niveles ("Archivo 2 de 12 — hoja DETALLE CONCEPTOS XML").
    const innerOnProgress: ExportProgressCallback = (event) => {
      if (event.stage === 'error') {
        chunkFailures.push({
          sheet: `${chunkFileName} :: ${event.sheet}`,
          error: event.error || 'Error desconocido',
          affectedRows: typeof event.affectedRows === 'number' ? event.affectedRows : 'N/D',
          critical: CRITICAL_SHEETS.has(event.sheet),
        });
      }
      onProgress?.({ ...event, fileIndex: i + 1, fileTotal: totalChunks, fileName: chunkFileName });
    };

    try {
      // buildDiagnosticoWorkbook NO se modifica: se reutiliza tal cual, una
      // vez por bloque. Como cada bloque preserva intactos los clusters
      // REP<->factura (buildExportClusters), la conciliación/alertas de ESTE
      // archivo son correctas y autosuficientes para los CFDI que contiene.
      // Nota de cancelación: no se interrumpe a mitad de un bloque ya
      // iniciado (el trabajo ya invertido en construirlo se aprovecha y se
      // descarga) — la cancelación se aplica ANTES de empezar el SIGUIENTE
      // bloque (chequeo al inicio del for). Así "cancelar" nunca tira a la
      // basura un archivo que ya estaba prácticamente listo.
      let chunkWb: any = await buildDiagnosticoWorkbook(plan.chunks[i], innerOnProgress);
      sentinelStageLog("serializacion_descarga_inicio", { fileName: chunkFileName });
      await writeWorkbookFile(chunkWb, chunkFileName, directoryHandle);
      sentinelStageLog("serializacion_descarga_fin", { fileName: chunkFileName });
      filesWritten.push(chunkFileName);
      // Se libera la referencia explícitamente antes de construir el
      // siguiente bloque — nunca coexisten dos workbooks completos.
      chunkWb = null;
      onProgress?.({ sheet: `Archivo ${i + 1} de ${totalChunks} completado`, stage: 'done', sheetIndex: TOTAL_EXPORT_STAGES, totalSheets: TOTAL_EXPORT_STAGES, fileIndex: i + 1, fileTotal: totalChunks, fileName: chunkFileName });
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[excelExporter] Fallo generando el archivo de bloque "${chunkFileName}":`, err);
      failedAtFile = i + 1;
      onProgress?.({ sheet: chunkFileName, stage: 'error', sheetIndex: 0, totalSheets: TOTAL_EXPORT_STAGES, error: message, fileIndex: i + 1, fileTotal: totalChunks, fileName: chunkFileName });
      break; // Los archivos anteriores ya se escribieron/descargaron — se conservan (instrucción 7).
    }
    await yieldToMain(); // deja pintar el progreso y dar tiempo a GC entre bloques
  }

  let reconciliacion: ExportStatusInfo['reconciliacion'] | undefined;
  if (!cancelled && failedAtFile === undefined) {
    onProgress?.({ sheet: '00_Resumen_Global', stage: 'building', sheetIndex: 0, totalSheets: TOTAL_EXPORT_STAGES, fileIndex: totalChunks + 1, fileTotal: totalChunks + 1, fileName: globalFileName });
    try {
      const { wb: globalWb, reconciliacion: rec } = await buildResumenGlobalWorkbook(results, plan.chunks, chunkFileNames);
      reconciliacion = rec;
      sentinelStageLog("serializacion_descarga_inicio", { fileName: globalFileName });
      await writeWorkbookFile(globalWb, globalFileName, directoryHandle);
      sentinelStageLog("serializacion_descarga_fin", { fileName: globalFileName });
      filesWritten.unshift(globalFileName);
      onProgress?.({ sheet: '00_Resumen_Global', stage: 'done', sheetIndex: TOTAL_EXPORT_STAGES, totalSheets: TOTAL_EXPORT_STAGES, fileIndex: totalChunks + 1, fileTotal: totalChunks + 1, fileName: globalFileName });
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error('[excelExporter] Fallo generando 00_Resumen_Global.xlsx:', err);
      failedAtFile = totalChunks + 1;
      onProgress?.({ sheet: globalFileName, stage: 'error', sheetIndex: 0, totalSheets: TOTAL_EXPORT_STAGES, error: message, fileIndex: totalChunks + 1, fileTotal: totalChunks + 1, fileName: globalFileName });
    }
  }

  const status: ExportStatus = cancelled
    ? 'cancelled'
    : failedAtFile !== undefined
      ? 'critical_failure'
      : chunkFailures.some(f => f.critical)
        ? 'partial'
        : chunkFailures.length > 0
          ? 'partial'
          : 'complete';

  sentinelStageLog("export_multiarchivo_fin", { status, filesWritten: filesWritten.length, failedAtFile, cancelled });

  // No existe un único "workbook" en modo paquete — se devuelve un objeto
  // liviano portador del mismo campo __sentinelExportStatus que Dashboard.tsx
  // ya sabe leer, enriquecido con la información propia del paquete.
  return {
    __sentinelExportStatus: {
      status,
      failures: chunkFailures,
      isMultiFile: true,
      filesWritten,
      totalFiles: totalChunks + 1,
      failedAtFile,
      writesConfirmed: !!directoryHandle,
      reconciliacion,
    } as ExportStatusInfo,
  };
}
