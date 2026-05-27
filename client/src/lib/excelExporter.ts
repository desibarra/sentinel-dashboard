import * as XLSX from 'xlsx';
import { ValidationResult } from '@/lib/cfdiEngine';

const SAT_RETRY_ACTION = 'Reintentar validación SAT';
const SAT_FAILURE_PATTERN = /(error|conexión|timeout|failed|network|sat\s+no\s+respondió|no\s+respondió|cors|no\s+confirmado)/i;

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

const getSatExportFields = (r: ValidationResult) => {
  const rawStatus = r.trazabilidadInfo?.observacionSAT || r.estatusSAT || '';
  if (isSatTechnicalFailure(rawStatus)) {
    return {
      Estatus_SAT: 'ESTATUS SAT NO CONFIRMADO',
      Resultado_Validacion_SAT: 'FALLA TECNICA DE CONSULTA',
      Accion_Recomendada_SAT: SAT_RETRY_ACTION,
    };
  }

  return {
    Estatus_SAT: rawStatus || 'ESTATUS SAT NO CONFIRMADO',
    Resultado_Validacion_SAT: rawStatus ? 'VALIDACION OK' : 'FALLA TECNICA DE CONSULTA',
    Accion_Recomendada_SAT: rawStatus ? 'Ninguna' : SAT_RETRY_ACTION,
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

const parseXml = (r: ValidationResult): XMLDocument | null => {
  if (!r.xmlContent || typeof DOMParser === 'undefined') return null;
  return new DOMParser().parseFromString(r.xmlContent, 'text/xml');
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

const addRecursiveAttrs = (rows: any[], r: ValidationResult, sectionPrefix: string, node: Element | null | undefined, hoja: string) => {
  if (!r || !node) return;
  const attrs = node.attributes;
  if (attrs) {
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      addRawAttr(rows, r, sectionPrefix, node, attr.name, attr.name, hoja, attr.value);
    }
  }
  const children = node.children;
  if (children) {
    const childCounts = new Map<string, number>();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childName = nodeName(child);
      const count = (childCounts.get(childName) || 0) + 1;
      childCounts.set(childName, count);
      addRecursiveAttrs(rows, r, `${sectionPrefix} -> ${childName}[${count}]`, child, hoja);
    }
  }
};

const extractRawXmlRows = (results: ValidationResult[]) => results.flatMap(r => {
  const doc = parseXml(r);
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

const buildConceptRows = (results: ValidationResult[]) => results.flatMap(r => (r.desglosePorConcepto || []).map((c: any, i: number) => ({
  Archivo_XML: r.fileName,
  UUID: r.uuid,
  Indice_Nodo: i + 1,
  Nodo_XML: 'Concepto',
  ClaveProdServ: c.claveProdServ || 'NO VIENE EN XML',
  Concepto: c.descripcion || 'NO VIENE EN XML',
  Cantidad: c.cantidad || 'NO VIENE EN XML',
  ObjetoImp: c.objetoImp || 'NO VIENE EN XML',
  Importe: c.importe ?? 0,
  Descuento: c.descuento ?? 0,
  Observacion: 'Extraído de desglose fiscal del XML',
})));

const buildTaxRows = (results: ValidationResult[]) => results.flatMap(r => (r.desglosePorConcepto || []).flatMap((c: any, i: number) => {
  const mapTax = (t: any, tipo: 'Traslado' | 'Retencion') => {
    let tasaDetectada = 'INDETERMINADO';
    if (c.objetoImp === '01') {
      tasaDetectada = 'NO OBJETO';
    } else {
      const tfUp = String(t.tipoFactor || '').toUpperCase();
      if (tfUp === 'EXENTO') {
        tasaDetectada = 'EXENTO';
      } else {
        const tNum = Number(t.tasa);
        if (!isNaN(tNum)) {
          if (tNum === 0.16) tasaDetectada = '16%';
          else if (tNum === 0.08) tasaDetectada = '8%';
          else if (tNum === 0) tasaDetectada = '0%';
        }
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
      Tasa_Detectada: tasaDetectada,
      Observacion: tipo === 'Traslado' ? 'Impuesto por concepto' : 'Retención por concepto'
    };
  };

  return [
    ...(c.traslados || []).map((t: any) => mapTax(t, 'Traslado')),
    ...(c.retenciones || []).map((t: any) => mapTax(t, 'Retencion'))
  ];
}));

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
    Descuento: (r.desglosePorConcepto || []).reduce((sum: number, c: any) => sum + Number(c.descuento || 0), 0),
    Total: r.total,
    Moneda: r.moneda,
    TipoCambio: r.tipoCambio,
    MetodoPago: r.metodoPago,
    FormaPago: r.formaPago,
    CondicionesDePago: 'NO VIENE EN XML',
    Base_IVA_16: r.baseIVA16,
    Base_IVA_0: r.baseIVA0,
    Base_IVA_Exento: r.baseIVAExento,
    IVA_Trasladado: r.ivaTraslado,
    IVA_Retenido: r.ivaRetenido,
    ISR_Retenido: r.isrRetenido,
    Total_Impuestos_Trasladados: r.ivaTraslado + r.iepsTraslado + r.impuestosLocalesTrasladados,
    Total_Impuestos_Retenidos: r.ivaRetenido + r.isrRetenido + r.iepsRetenido + r.impuestosLocalesRetenidos,
    Conceptos_Resumen: (r.desglosePorConcepto || []).slice(0, 5).map((c: any) => c.descripcion).filter(Boolean).join(' | ') || 'NO VIENE EN XML',
    CartaPorte_Presente: getCartaPortePresente(r),
    CartaPorte_Version: detail?.version || r.versionCartaPorte,
    CartaPorte_Completa: r.cartaPorteCompleta,
    TransporteInternacional: normalizeI18nSiNo(detail?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional),
    EntradaSalidaMercancia: detail?.entradaSalidaMercancia || 'NO VIENE EN XML',
    PaisOrigenDestino: detail?.paisOrigenDestino || 'NO VIENE EN XML',
    TotalDistanciaRecorrida: detail?.totalDistanciaRecorrida || 'NO VIENE EN XML',
    Origen_Resumen: formatAddress(mainOrigen),
    Destino_Resumen: formatAddress(mainDestino),
    Mercancias_Resumen: detail?.mercancias?.map((m: any) => m.descripcion).join(' | ') || 'NO VIENE EN XML',
    Unidad_Placas: detail?.autotransporte?.placaVM || 'NO VIENE EN XML',
    Remolques_Resumen: detail?.autotransporte?.remolques?.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)).join(' | ') || 'NO VIENE EN XML',
    Operador_Resumen: joinClean(operador?.rfcFigura, operador?.nombreFigura, operador?.numLicencia),
    Pedimentos_Detectados: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
    Pago_Presente: r.pagosPresente || 'NO',
    CFDI_Relacionados: r.uuids_relacionados?.join(' | ') || 'NO APLICA',
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

const buildPagosRows = (results: ValidationResult[]) => results.flatMap(r => {
  const doc = parseXml(r);
  const tienePagos = nodes(doc, 'Pagos').length > 0;
  if (!tienePagos) return [];
  return nodes(doc, 'DoctoRelacionado').map((dr, index) => {
    let parent = dr.parentElement;
    while (parent && nodeName(parent) !== 'Pago') {
      parent = parent.parentElement;
    }
    const pago = parent;
    const trasladoP = nodes(pago || dr, 'TrasladoP')[0];
    return {
      Archivo_XML: r.fileName,
      UUID: r.uuid,
      Indice_Nodo: index + 1,
      Nodo_XML: 'DoctoRelacionado',
      FechaPago: attrRaw(pago, 'FechaPago'),
      FormaDePagoP: attrRaw(pago, 'FormaDePagoP'),
      MonedaP: attrRaw(pago, 'MonedaP'),
      Monto: attrRaw(pago, 'Monto'),
      IdDocumento: attrRaw(dr, 'IdDocumento'),
      Folio: attrRaw(dr, 'Folio'),
      Serie: attrRaw(dr, 'Serie'),
      MonedaDR: attrRaw(dr, 'MonedaDR'),
      MetodoDePagoDR: attrRaw(dr, 'MetodoDePagoDR'),
      NumParcialidad: attrRaw(dr, 'NumParcialidad'),
      ImpSaldoAnt: attrRaw(dr, 'ImpSaldoAnt'),
      ImpPagado: attrRaw(dr, 'ImpPagado'),
      ImpSaldoInsoluto: attrRaw(dr, 'ImpSaldoInsoluto'),
      BaseP: attrRaw(trasladoP, 'BaseP'),
      ImpuestoP: attrRaw(trasladoP, 'ImpuestoP'),
      TipoFactorP: attrRaw(trasladoP, 'TipoFactorP'),
      TasaOCuotaP: attrRaw(trasladoP, 'TasaOCuotaP'),
      ImporteP: attrRaw(trasladoP, 'ImporteP'),
      Observacion: 'Complemento de pago extraído',
    };
  });
});

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

const buildAlerts = (results: ValidationResult[]) => {
  const alerts: any[] = [];
  const seen = new Map<string, number>();
  results.forEach(r => seen.set(r.uuid, (seen.get(r.uuid) || 0) + 1));
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
    if (r.metodoPago === 'PPD' && normalizeSiNo(r.pagosPresente) !== 'SI') addAlert(alerts, r, 'PAGO', 'PAGO-01', 'NARANJA', 'MetodoPago PPD sin complemento de pago detectado en el lote.', r.metodoPago, 'Integrar complemento de pago para acreditar IVA efectivamente pagado.');
  });
  return alerts;
};

const buildQualityRows = (results: ValidationResult[]) => results.map(r => {
  const doc = parseXml(r);
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

const buildSummaryRows = (results: ValidationResult[], alerts: any[]) => {
  const total = results.length;
  const satNo = results.filter(r => getSatExportFields(r).Estatus_SAT === 'ESTATUS SAT NO CONFIRMADO').length;
  const cpRows = results.filter(r => getCartaPortePresente(r) === 'SI');
  const tasa0 = results.filter(r => (r.baseIVA0 || 0) > 0).length;
  const ppdSinPago = results.filter(r => r.metodoPago === 'PPD' && normalizeSiNo(r.pagosPresente) !== 'SI').length;
  const byRisk = (risk: string) => alerts.filter(a => a.Nivel_Riesgo === risk).length;
  const topAlertas = Object.entries(alerts.reduce((acc: any, a) => { acc[a.Regla] = (acc[a.Regla] || 0) + 1; return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'NO APLICA';
  const topEmisores = Object.entries(results.reduce((acc: any, r) => { acc[r.rfcEmisor] = (acc[r.rfcEmisor] || 0) + Number(r.total || 0); return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]: any) => `${k}: ${Math.round(v * 100) / 100}`).join(' | ') || 'NO APLICA';
  return [
    { Metrica: 'Total XML recibidos', Valor: total },
    { Metrica: 'Total XML procesados', Valor: total },
    { Metrica: 'Total errores lectura', Valor: results.filter(r => r.resultado === 'ERROR').length },
    { Metrica: 'Total CFDI con SAT no confirmado', Valor: satNo },
    { Metrica: 'Total CFDI vigentes', Valor: results.filter(r => r.estatusSAT === 'Vigente').length },
    { Metrica: 'Total CFDI cancelados', Valor: results.filter(r => /cancelado/i.test(r.estatusSAT)).length },
    { Metrica: 'Total con Carta Porte', Valor: cpRows.length },
    { Metrica: 'Total con Carta Porte completa', Valor: cpRows.filter(r => r.cartaPorteCompleta === 'SI').length },
    { Metrica: 'Regla de Carta Porte Completa', Valor: 'Simultáneamente Origen, Destino, Mercancías con Peso/Cantidad, Vehículo con Placa/Permiso/Seguro y Figura con RFC/Licencia' },
    { Metrica: 'Total sin Carta Porte cuando aplica', Valor: results.filter(r => r.requiereCartaPorte === 'SI' && getCartaPortePresente(r) !== 'SI').length },
    { Metrica: 'Total PPD sin complemento de pago', Valor: ppdSinPago },
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

const appendJsonSheet = (wb: any, data: any[], name: string) => {
  const ws = (XLSX as any).utils.json_to_sheet(data.length ? data : [{ Estado: 'SIN REGISTROS' }]);
  applySheetDefaults(ws);
  (XLSX as any).utils.book_append_sheet(wb, ws, name);
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

export function exportToExcel(results: ValidationResult[], fileNameOverride?: string) {
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
  
  const esLoteEmitidos = maxEmisorCount > maxReceptorCount;

  // Crear workbook
  const wb = (XLSX as any).utils.book_new();

  // Preparar datos en el orden exacto de columnas
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
      Remolques: detail?.autotransporte?.remolques?.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)).join(' | ') || 'NO VIENE EN XML',
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
      OBJETO_IMP_XML: r.desglosePorConcepto?.map(c => c.objetoImp).join(',') || 'N/A',
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
      UUIDs_Relacionados: r.uuids_relacionados?.join(', ') || 'NO APLICA',
      Nivel_Trazabilidad: r.trazabilidadInfo?.nivelExpediente || 'NO APLICA',
      Requiere_Soporte_Externo: r.trazabilidadInfo?.fuenteExternaRequerida || 'NO',
      Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'NO APLICA',
    };
  });

  // Crear sheet
  const ws = (XLSX as any).utils.json_to_sheet(data);

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

  // Activar filtros
  (ws as any)['!autofilter'] = { ref: `A1:BP1` };

  // Congelar fila 1
  (ws as any)['!panes'] = { ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Agregar sheet al workbook
  (XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');

  // 1. CEDULA INGRESOS SAT
  const dataIngresos = validResults.filter(r => r.tipoCFDI === 'I').map(r => ({
    UUID: r.uuid,
    Serie: r.serie,
    Folio: r.folio,
    Fecha: r.fechaEmision,
    RFC_Receptor: r.rfcReceptor,
    Nombre_Receptor: r.nombreReceptor,
    Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))).join(' | ') : 'NO VIENE EN XML',
    Subtotal: r.subtotal,
    IVA: r.ivaTraslado,
    Total: r.total,
    Metodo_Pago: r.metodoPago,
    Forma_Pago: r.formaPago,
    Estatus_CFDI: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
    Fecha_Cobro: r.trazabilidadInfo?.fechaCobro || 'REQUIERE IMPORTACION',
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE IMPORTACION',
    Banco: r.trazabilidadInfo?.banco || 'REQUIERE IMPORTACION',
    Identificador_Bancario: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
    Observacion_SAT: r.trazabilidadInfo?.observacionSAT || 'NO APLICA'
  }));
  const wsIngresos = (XLSX as any).utils.json_to_sheet(dataIngresos);
  (XLSX as any).utils.book_append_sheet(wb, wsIngresos, 'CEDULA INGRESOS SAT');

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
      Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))).join(' | ') : 'NO VIENE EN XML',
      Base_Tasa_0: r.baseIVA0,
      IVA_Trasladado_0: 0,
      Exportacion: r.trazabilidadInfo?.exportacion || 'NO DISPONIBLE',
      Tiene_Carta_Porte: getCartaPortePresente(r),
      Placas: detail?.autotransporte?.placaVM || r.trazabilidadInfo?.placas || 'NO VIENE EN XML',
      Remolques: detail?.autotransporte?.remolques?.map((rem: any) => joinClean(rem.subTipoRem, rem.placa)).join(' | ') || r.trazabilidadInfo?.remolques || 'NO VIENE EN XML',
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
  const wsTasa0 = (XLSX as any).utils.json_to_sheet(dataTasa0);
  (XLSX as any).utils.book_append_sheet(wb, wsTasa0, 'CEDULA TASA 0%');

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
  const wsAuditoriaIvaTasa0 = (XLSX as any).utils.json_to_sheet(dataAuditoriaIvaTasa0);
  (XLSX as any).utils.book_append_sheet(wb, wsAuditoriaIvaTasa0, 'AUDITORIA IVA TASA 0%');

  // 3. CEDULA IVA (ACREDITABLE/TRASLADADO)
  const dataIva = validResults.filter(r => r.tipoCFDI === 'E' || (r.tipoCFDI === 'I' && r.rfcReceptor && !r.rfcReceptor.startsWith('XEXX') && r.rfcEmisor !== r.rfcReceptor)).map(r => ({
    UUID: r.uuid,
    Fecha: r.fechaEmision,
    RFC_Emisor: r.rfcEmisor,
    Nombre_Emisor: r.nombreEmisor,
    Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))).join(' | ') : 'NO VIENE EN XML',
    Subtotal: r.subtotal,
    [esLoteEmitidos ? 'IVA_Trasladado' : 'IVA_Acreditable']: r.trazabilidadInfo?.ivaAcreditable || 0,
    Total: r.total,
    Metodo_Pago: r.metodoPago,
    Forma_Pago: r.formaPago,
    Estatus_CFDI: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
    Uso_CFDI: r.usoCFDI,
    Regimen_Emisor: r.regimenEmisor,
    Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
    Fecha_Pago: r.trazabilidadInfo?.fechaPago || 'REQUIERE IMPORTACION',
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE IMPORTACION',
    [esLoteEmitidos ? 'Diagnostico_IVA_Trasladado' : 'Diagnostico_IVA_Acreditable']: r.trazabilidadInfo?.diagnosticoIvaAcreditable || 'NO APLICA',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaIvaAcreditable || 'NO APLICA'
  }));
  
  const wsIva = (XLSX as any).utils.json_to_sheet(dataIva, { origin: "A2" });
  (XLSX as any).utils.sheet_add_aoa(wsIva, [[
    esLoteEmitidos 
      ? "NOTA: Esta cédula aplica para XMLs EMITIDOS (Facturas de Clientes). Para análisis de XMLs RECIBIDOS los datos de IVA serán diferentes."
      : "NOTA: Esta cédula aplica para XMLs RECIBIDOS (Facturas de Proveedores). Para análisis de XMLs EMITIDOS los datos de IVA serán diferentes."
  ]], { origin: "A1" });

  (XLSX as any).utils.book_append_sheet(wb, wsIva, esLoteEmitidos ? 'CEDULA IVA TRASLADADO' : 'CEDULA IVA ACREDITABLE');

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
  const wsFaltantes = (XLSX as any).utils.json_to_sheet(dataFaltantes);
  (XLSX as any).utils.book_append_sheet(wb, wsFaltantes, 'ANEXO DATOS FALTANTES');

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
  const wsMatriz = (XLSX as any).utils.json_to_sheet(dataMatriz);
  (XLSX as any).utils.book_append_sheet(wb, wsMatriz, 'MATRIZ DE RASTREABILIDAD');

  const alertasForenses = buildAlerts(validResults);
  appendJsonSheet(wb, extractRawXmlRows(validResults), 'EXTRACCION CRUDA XML');
  appendJsonSheet(wb, buildForensicRows(validResults), 'DETALLE FORENSE POR CFDI');
  appendJsonSheet(wb, buildConceptRows(validResults), 'DETALLE CONCEPTOS XML');
  appendJsonSheet(wb, buildTaxRows(validResults), 'DETALLE IMPUESTOS CONCEPTO');
  appendJsonSheet(wb, buildCartaPorteMercancias(validResults), 'DETALLE CARTA PORTE MERCANCIAS');
  appendJsonSheet(wb, buildCartaPorteUbicaciones(validResults), 'DETALLE CP UBICACIONES');
  appendJsonSheet(wb, buildCartaPorteFiguras(validResults), 'DETALLE CARTA PORTE FIGURAS');
  appendJsonSheet(wb, buildPagosRows(validResults), 'DETALLE COMPLEMENTOS PAGO');
  appendJsonSheet(wb, alertasForenses, 'ALERTAS FORENSES');
  appendJsonSheet(wb, buildQualityRows(validResults), 'CONTROL CALIDAD XML');
  appendJsonSheet(wb, buildSummaryRows(validResults, alertasForenses), 'RESUMEN EJECUTIVO');

  // ── Nueva hoja: COMPARATIVO BASE Y TASA IVA ──
  const dataComparativo = buildComparativoBaseTasaRows(validResults);
  const wsComparativo = (XLSX as any).utils.json_to_sheet(dataComparativo, { origin: 'A10' });
  (XLSX as any).utils.book_append_sheet(wb, wsComparativo, 'COMPARATIVO BASE Y TASA IVA');

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

  const wsErrores = (XLSX as any).utils.json_to_sheet(dataErrores.length ? dataErrores : [{ Archivo_XML: 'SIN REGISTROS', Motivo_Error: 'Ningún XML con error de lectura.' }]);
  (XLSX as any).utils.book_append_sheet(wb, wsErrores, 'ERRORES LECTURA XML');

  wb.SheetNames.forEach((sheetName: string) => {
    if (sheetName === 'COMPARATIVO BASE Y TASA IVA') {
      applyComparativoSheetDefaults(wb.Sheets[sheetName], dataComparativo);
    } else if (sheetName.startsWith('CEDULA IVA')) {
      applyIvaSheetDefaults(wb.Sheets[sheetName]);
    } else {
      applySheetDefaults(wb.Sheets[sheetName]);
    }
  });

  // Generar nombre de archivo con fecha
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fileName = fileNameOverride || `SentinelExpress_Diagnostico_${dateStr}.xlsx`;

  // Descargar archivo
  (XLSX as any).writeFile(wb, fileName);
}
