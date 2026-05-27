import * as XLSX from 'xlsx';
import { ValidationResult } from '@/lib/cfdiEngine';

const SAT_RETRY_ACTION = 'Reintentar validación SAT o validar con acuse/portal SAT externo';
const SAT_FAILURE_PATTERN = /(error|conexi[oó]n|timeout|failed|network|sat\s+no\s+respondi[oó]|no\s+respond[ií]o|cors|no\s+confirmado)/i;

const normalizeSiNo = (value: unknown): 'SÍ' | 'NO' => {
  if (value === true) return 'SÍ';
  if (value === false || value === null || value === undefined) return 'NO';
  const normalized = String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return ['SÍ', 'SI', 'S?', 'TRUE', '1'].includes(normalized) ? 'SÍ' : 'NO';
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
  const trazabilidad = normalizeSiNo(r.trazabilidadInfo?.tieneCartaPorte);
  const detalle = normalizeSiNo(r.trazabilidadInfo?.cartaPorteDetalle?.presente);
  return diagnostico === 'SÍ' || trazabilidad === 'SÍ' || detalle === 'SÍ' ? 'SÍ' : 'NO';
};

const hasValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return Boolean(text && text !== 'NO' && text !== 'No' && text !== 'NO APLICA' && text !== 'NO VIENE EN XML');
};

const cp = (r: ValidationResult) => r.trazabilidadInfo?.cartaPorteDetalle;

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
  const origen = joinClean(cp(r)?.origen?.municipio, cp(r)?.origen?.estado, cp(r)?.origen?.pais);
  const destino = joinClean(cp(r)?.destino?.municipio, cp(r)?.destino?.estado, cp(r)?.destino?.pais);
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
  const hasCp = getCartaPortePresente(r) === 'SÍ';
  const hasPedimento = normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'SÍ';
  const hasDoda = normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'SÍ';
  const internacional = /s[ií]|salida|entrada|usa|can|mex/i.test(joinClean(cp(r)?.transporteInternacional, cp(r)?.entradaSalidaMercancia, cp(r)?.paisOrigenDestino));

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
  if (getCartaPortePresente(r) !== 'SÍ') return [];
  const detail = cp(r);
  const faltantes: string[] = [];
  if (!hasValue(detail?.origen?.idUbicacion) && !hasValue(detail?.origen?.rfc) && !hasValue(detail?.origen?.codigoPostal)) faltantes.push('Falta origen');
  if (!hasValue(detail?.destino?.idUbicacion) && !hasValue(detail?.destino?.rfc) && !hasValue(detail?.destino?.codigoPostal)) faltantes.push('Falta destino');
  if (!hasValue(detail?.autotransporte?.placaVM)) faltantes.push('Falta placas');
  if (!detail?.mercancias?.length) faltantes.push('Falta mercancías');
  if (!hasValue(detail?.operador?.rfcFigura) && !hasValue(detail?.operador?.nombreFigura) && !hasValue(detail?.operador?.numLicencia)) faltantes.push('Falta operador');
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
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SÍ')) faltantes.push('Falta identificación bancaria');
  if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) faltantes.push('Fuente externa requerida');

  return faltantes.length ? Array.from(new Set(faltantes)).join(' | ') : 'Sin faltantes críticos';
};

const getNivelExpediente = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.nivelExpediente;
  if (existing && existing !== 'NO APLICA') return existing;
  return getDatosFaltantes(r) === 'Sin faltantes críticos'
    ? 'Fiscal + logística completa'
    : getCartaPortePresente(r) === 'SÍ'
      ? 'Expediente parcialmente soportado'
      : 'Expediente incompleto';
};

export function exportToExcel(results: ValidationResult[], fileNameOverride?: string) {
  // Crear workbook
  const wb = (XLSX as any).utils.book_new();

  // Preparar datos en el orden exacto de columnas
  const data = results.map((r) => ({
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
    Version_Carta_Porte: cp(r)?.version || r.versionCartaPorte,
    Transporte_Internacional: cp(r)?.transporteInternacional || 'NO VIENE EN XML',
    Entrada_Salida_Mercancia: cp(r)?.entradaSalidaMercancia || 'NO VIENE EN XML',
    Pais_Origen_Destino: cp(r)?.paisOrigenDestino || 'NO VIENE EN XML',
    Via_Entrada_Salida: cp(r)?.viaEntradaSalida || 'NO VIENE EN XML',
    Total_Distancia_Recorrida: cp(r)?.totalDistanciaRecorrida || 'NO VIENE EN XML',
    Origen_IDUbicacion: cp(r)?.origen?.idUbicacion || 'NO VIENE EN XML',
    Origen_RFC: cp(r)?.origen?.rfc || 'NO VIENE EN XML',
    Origen_Nombre: cp(r)?.origen?.nombre || 'NO VIENE EN XML',
    Origen_Fecha_Hora_Salida: cp(r)?.origen?.fechaHora || 'NO VIENE EN XML',
    Origen_Calle: cp(r)?.origen?.calle || 'NO VIENE EN XML',
    Origen_Numero_Exterior: cp(r)?.origen?.numeroExterior || 'NO VIENE EN XML',
    Origen_Numero_Interior: cp(r)?.origen?.numeroInterior || 'NO VIENE EN XML',
    Origen_Colonia: cp(r)?.origen?.colonia || 'NO VIENE EN XML',
    Origen_Localidad: cp(r)?.origen?.localidad || 'NO VIENE EN XML',
    Origen_Municipio: cp(r)?.origen?.municipio || 'NO VIENE EN XML',
    Origen_Estado: cp(r)?.origen?.estado || 'NO VIENE EN XML',
    Origen_Pais: cp(r)?.origen?.pais || 'NO VIENE EN XML',
    Origen_CP: cp(r)?.origen?.codigoPostal || 'NO VIENE EN XML',
    Origen_Referencia: cp(r)?.origen?.referencia || 'NO VIENE EN XML',
    Origen_Domicilio: formatAddress(cp(r)?.origen),
    Destino_IDUbicacion: cp(r)?.destino?.idUbicacion || 'NO VIENE EN XML',
    Destino_RFC: cp(r)?.destino?.rfc || 'NO VIENE EN XML',
    Destino_Nombre: cp(r)?.destino?.nombre || 'NO VIENE EN XML',
    Destino_Fecha_Hora_Llegada: cp(r)?.destino?.fechaHora || 'NO VIENE EN XML',
    Destino_Calle: cp(r)?.destino?.calle || 'NO VIENE EN XML',
    Destino_Numero_Exterior: cp(r)?.destino?.numeroExterior || 'NO VIENE EN XML',
    Destino_Numero_Interior: cp(r)?.destino?.numeroInterior || 'NO VIENE EN XML',
    Destino_Colonia: cp(r)?.destino?.colonia || 'NO VIENE EN XML',
    Destino_Localidad: cp(r)?.destino?.localidad || 'NO VIENE EN XML',
    Destino_Municipio: cp(r)?.destino?.municipio || 'NO VIENE EN XML',
    Destino_Estado: cp(r)?.destino?.estado || 'NO VIENE EN XML',
    Destino_Pais: cp(r)?.destino?.pais || 'NO VIENE EN XML',
    Destino_CP: cp(r)?.destino?.codigoPostal || 'NO VIENE EN XML',
    Destino_Referencia: cp(r)?.destino?.referencia || 'NO VIENE EN XML',
    Destino_Domicilio: formatAddress(cp(r)?.destino),
    Total_Mercancias: cp(r)?.totalMercancias || '0',
    Peso_Bruto_Total: cp(r)?.pesoBrutoTotal || 'NO VIENE EN XML',
    Unidad_Peso: cp(r)?.unidadPeso || 'NO VIENE EN XML',
    Num_Total_Mercancias: cp(r)?.numTotalMercancias || '0',
    Descripcion_Mercancia: cp(r)?.mercanciaPrincipal || 'NO VIENE EN XML',
    Permiso_SCT: cp(r)?.autotransporte?.permisoSCT || 'NO VIENE EN XML',
    Numero_Permiso_SCT: cp(r)?.autotransporte?.numeroPermisoSCT || 'NO VIENE EN XML',
    Configuracion_Vehicular: cp(r)?.autotransporte?.configuracionVehicular || 'NO VIENE EN XML',
    Placa_VM: cp(r)?.autotransporte?.placaVM || 'NO VIENE EN XML',
    Anio_Modelo_VM: cp(r)?.autotransporte?.anioModeloVM || 'NO VIENE EN XML',
    Aseguradora_RC: cp(r)?.autotransporte?.aseguradoraRC || 'NO VIENE EN XML',
    Poliza_RC: cp(r)?.autotransporte?.polizaRC || 'NO VIENE EN XML',
    Remolques: cp(r)?.remolques?.map(remolque => joinClean(remolque.subTipoRemolque, remolque.placaRemolque)).join(' | ') || 'NO VIENE EN XML',
    Tipo_Figura: cp(r)?.operador?.tipoFigura || 'NO VIENE EN XML',
    RFC_Figura: cp(r)?.operador?.rfcFigura || 'NO VIENE EN XML',
    Nombre_Figura: cp(r)?.operador?.nombreFigura || 'NO VIENE EN XML',
    Num_Licencia: cp(r)?.operador?.numLicencia || 'NO VIENE EN XML',
    Residencia_Fiscal: cp(r)?.operador?.residenciaFiscal || 'NO VIENE EN XML',
    Num_Reg_Id_Trib: cp(r)?.operador?.numRegIdTrib || 'NO VIENE EN XML',
    Subtotal: r.subtotal,
    Total_Percepciones: r.totalPercepciones,
    Total_Deducciones: r.totalDeducciones,
    Total_OtrosPagos: r.totalOtrosPagos,
    ISR_Retenido_Nomina: r.isrRetenidoNomina,
    // âœ… Columnas fiscales explÃ­citas CFDI 4.0 (ObjetoImp)
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
    Total_Calculado: normalizeSiNo(r.esNomina) === 'SÍ' ? r.totalCalculadoNomina : r.totalCalculado,
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
  }));

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
    // âœ… Nuevas columnas fiscales CFDI 4.0
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

  // Activar filtros (actualizado para incluir todas las nuevas columnas)
  (ws as any)['!autofilter'] = { ref: `A1:BP1` };

  // Congelar fila 1
  (ws as any)['!panes'] = { ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Agregar sheet al workbook
  (XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');

  // 1. CEDULA INGRESOS SAT
  const dataIngresos = results.filter(r => r.tipoCFDI === 'I').map(r => ({
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
    Fecha_Cobro: r.trazabilidadInfo?.fechaCobro || 'REQUIERE CAPTURA',
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE CAPTURA',
    Banco: r.trazabilidadInfo?.banco || 'REQUIERE CAPTURA',
    Identificador_Bancario: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE CAPTURA',
    Observacion_SAT: r.trazabilidadInfo?.observacionSAT || 'NO APLICA'
  }));
  const wsIngresos = (XLSX as any).utils.json_to_sheet(dataIngresos);
  (XLSX as any).utils.book_append_sheet(wb, wsIngresos, 'CEDULA INGRESOS SAT');

  // 2. CEDULA TASA 0%
  const dataTasa0 = results.filter(r => (r.baseIVA0 || 0) > 0).map(r => ({
    UUID: r.uuid,
    Fecha: r.fechaEmision,
    RFC_Receptor: r.rfcReceptor,
    Nombre_Receptor: r.nombreReceptor,
    Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))).join(' | ') : 'NO VIENE EN XML',
    Base_Tasa_0: r.baseIVA0,
    IVA_Trasladado_0: 0,
    Exportacion: r.trazabilidadInfo?.exportacion || 'NO DISPONIBLE',
    Tiene_Carta_Porte: getCartaPortePresente(r),
    Placas: cp(r)?.autotransporte?.placaVM || r.trazabilidadInfo?.placas || 'NO VIENE EN XML',
    Remolques: cp(r)?.remolques?.map(remolque => joinClean(remolque.subTipoRemolque, remolque.placaRemolque)).join(' | ') || r.trazabilidadInfo?.remolques || 'NO VIENE EN XML',
    Origen: formatAddress(cp(r)?.origen),
    Destino: formatAddress(cp(r)?.destino),
    RFC_Operador: cp(r)?.operador?.rfcFigura || r.trazabilidadInfo?.rfcOperador || 'NO VIENE EN XML',
    Mercancias: cp(r)?.mercancias?.length ? 'SÍ' : normalizeSiNo(r.trazabilidadInfo?.tieneMercancias),
    Peso: joinClean(cp(r)?.pesoBrutoTotal, cp(r)?.unidadPeso),
    Distancia: cp(r)?.totalDistanciaRecorrida || r.trazabilidadInfo?.distancia || 'NO VIENE EN XML',
    Permiso_SCT: cp(r)?.autotransporte?.permisoSCT || r.trazabilidadInfo?.permisoSCT || 'NO VIENE EN XML',
    Transporte_Internacional: cp(r)?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional || 'NO VIENE EN XML',
    Destino_Extranjero: r.trazabilidadInfo?.destinoExtranjero || 'NO',
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
    Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
    Numero_DODA_Integracion: r.trazabilidadInfo?.numeroDodaIntegracion || 'NO VIENE EN XML',
    Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior || 'REQUIERE CAPTURA',
    Diagnostico_Tasa_0: r.trazabilidadInfo?.diagnosticoTasa0 || 'OPERACION IVA TASA 0% DETECTADA: requiere soporte fiscal y materialidad',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaTasa0 || 'Integrar evidencia de exportacion, pedimento/DODA o soporte contractual y bancario segun aplique'
  }));
  const wsTasa0 = (XLSX as any).utils.json_to_sheet(dataTasa0);
  (XLSX as any).utils.book_append_sheet(wb, wsTasa0, 'CEDULA TASA 0%');

  // 2b. AUDITORIA IVA TASA 0%
  const dataAuditoriaIvaTasa0 = results.flatMap(r => {
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

    return conceptos.map((concepto: any) => {
      const iva = classifyTasa0Iva(r);
      const deteccion = getTasa0Detection(r, concepto);
      return {
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
        Origen: formatAddress(cp(r)?.origen),
        Destino: formatAddress(cp(r)?.destino),
        Pais_Origen: cp(r)?.origen?.pais || 'NO VIENE EN XML',
        Pais_Destino: cp(r)?.destino?.pais || 'NO VIENE EN XML',
        Transporte_Internacional: cp(r)?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional || 'NO VIENE EN XML',
        Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
        Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
        Tiene_BOL: getCartaPortePresente(r) === 'SÍ' ? 'SÍ' : 'NO',
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

  // 3. CEDULA IVA ACREDITABLE
  const dataIvaAcreditable = results.filter(r => r.tipoCFDI === 'E' || (r.tipoCFDI === 'I' && r.rfcReceptor && !r.rfcReceptor.startsWith('XEXX') && r.rfcEmisor !== r.rfcReceptor)).map(r => ({
    UUID: r.uuid,
    Fecha: r.fechaEmision,
    RFC_Emisor: r.rfcEmisor,
    Nombre_Emisor: r.nombreEmisor,
    Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map((c: any) => c.descripcion))).join(' | ') : 'NO VIENE EN XML',
    Subtotal: r.subtotal,
    IVA_Acreditable: r.trazabilidadInfo?.ivaAcreditable || 0,
    Total: r.total,
    Metodo_Pago: r.metodoPago,
    Forma_Pago: r.formaPago,
    Estatus_CFDI: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
    Uso_CFDI: r.usoCFDI,
    Regimen_Emisor: r.regimenEmisor,
    Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
    Fecha_Pago: r.trazabilidadInfo?.fechaPago || 'REQUIERE CAPTURA',
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia || 'REQUIERE CAPTURA',
    Diagnostico_IVA_Acreditable: r.trazabilidadInfo?.diagnosticoIvaAcreditable || 'NO APLICA',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaIvaAcreditable || 'NO APLICA'
  }));
  const wsIvaAcreditable = (XLSX as any).utils.json_to_sheet(dataIvaAcreditable);
  (XLSX as any).utils.book_append_sheet(wb, wsIvaAcreditable, 'CEDULA IVA ACREDITABLE');

  // 4. ANEXO DATOS FALTANTES
  const dataFaltantes = results.map(r => ({
    UUID: r.uuid,
    Serie: r.serie,
    Folio: r.folio,
    Fecha: r.fechaEmision,
    RFC_Emisor: r.rfcEmisor,
    RFC_Receptor: r.rfcReceptor,
    Tipo_CFDI: r.tipoCFDI,
    Tiene_Carta_Porte: getCartaPortePresente(r),
    Tiene_Placas_Unidad: hasValue(cp(r)?.autotransporte?.placaVM) ? 'SÍ' : (r.trazabilidadInfo?.tienePlacasUnidad || 'NO'),
    Tiene_Origen: hasValue(cp(r)?.origen?.idUbicacion) || hasValue(cp(r)?.origen?.rfc) || hasValue(cp(r)?.origen?.codigoPostal) ? 'SÍ' : (r.trazabilidadInfo?.tieneOrigen || 'NO'),
    Tiene_Destino: hasValue(cp(r)?.destino?.idUbicacion) || hasValue(cp(r)?.destino?.rfc) || hasValue(cp(r)?.destino?.codigoPostal) ? 'SÍ' : (r.trazabilidadInfo?.tieneDestino || 'NO'),
    Tiene_Mercancias: cp(r)?.mercancias?.length ? 'SÍ' : (r.trazabilidadInfo?.tieneMercancias || 'NO'),
    Tiene_Operador: hasValue(cp(r)?.operador?.rfcFigura) || hasValue(cp(r)?.operador?.nombreFigura) || hasValue(cp(r)?.operador?.numLicencia) ? 'SÍ' : (r.trazabilidadInfo?.tieneOperador || 'NO'),
    Tiene_Distancia: hasValue(cp(r)?.totalDistanciaRecorrida) ? 'SÍ' : 'NO',
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
    Tiene_Entry: r.trazabilidadInfo?.tieneEntryNumber || 'NO',
    Tiene_Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
    Datos_Faltantes: getDatosFaltantes(r),
    Fuente_Externa_Requerida: r.trazabilidadInfo?.fuenteExternaRequerida || (isSatTechnicalFailure(r.estatusSAT) ? 'SAT externo/acuse' : 'NO'),
    Diagnostico: r.trazabilidadInfo?.diagnosticoDatosFaltantes || `Expediente ${getDatosFaltantes(r) === 'Sin faltantes críticos' ? 'sin faltantes criticos' : `incompleto: falta ${getDatosFaltantes(r)}`}`,
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaDatosFaltantes || 'Integrar documentos faltantes y relacionarlos por UUID antes de usar el expediente',
    Se_Puede_Auditar_Con_Este_XML_Solamente: r.trazabilidadInfo?.auditableSoloConXML || 'NO'
  }));
  const wsFaltantes = (XLSX as any).utils.json_to_sheet(dataFaltantes);
  (XLSX as any).utils.book_append_sheet(wb, wsFaltantes, 'ANEXO DATOS FALTANTES');

  // 5. MATRIZ DE RASTREABILIDAD
  const dataMatriz = results.map(r => ({
    UUID: r.uuid,
    Factura: `${r.serie}-${r.folio}`,
    Cliente_Proveedor: r.tipoCFDI === 'I' ? r.nombreReceptor : r.nombreEmisor,
    Fecha: r.fechaEmision,
    Origen_Completo: formatAddress(cp(r)?.origen),
    Destino_Completo: formatAddress(cp(r)?.destino),
    Ruta_Resumen: routeSummary(r),
    Unidad_Placas: cp(r)?.autotransporte?.placaVM || r.trazabilidadInfo?.placas || 'NO',
    Operador: joinClean(cp(r)?.operador?.rfcFigura, cp(r)?.operador?.nombreFigura, cp(r)?.operador?.numLicencia),
    Mercancia_Principal: cp(r)?.mercanciaPrincipal || 'NO VIENE EN XML',
    Peso_Total: joinClean(cp(r)?.pesoBrutoTotal, cp(r)?.unidadPeso),
    Distancia_Recorrida: cp(r)?.totalDistanciaRecorrida || r.trazabilidadInfo?.distancia || 'NO VIENE EN XML',
    Transporte_Internacional: cp(r)?.transporteInternacional || r.trazabilidadInfo?.transporteInternacional || 'NO VIENE EN XML',
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
  }));
  const wsMatriz = (XLSX as any).utils.json_to_sheet(dataMatriz);
  (XLSX as any).utils.book_append_sheet(wb, wsMatriz, 'MATRIZ DE RASTREABILIDAD');

  // 6. DETALLE CARTA PORTE MERCANCIAS
  const dataCartaPorteMercancias = results.flatMap(r => {
    const detail = cp(r);
    if (!detail?.mercancias?.length) return [];
    return detail.mercancias.map((mercancia, index) => ({
      UUID: r.uuid,
      Archivo_XML: r.fileName,
      Version_Carta_Porte: detail.version,
      Mercancia_Numero: index + 1,
      Descripcion_Mercancia: mercancia.descripcion,
      Clave_ProdServ_CP: mercancia.claveProdServCP,
      Cantidad: mercancia.cantidad,
      Clave_Unidad: mercancia.claveUnidad,
      Peso_Kg: mercancia.pesoKg,
      Valor_Mercancia: mercancia.valorMercancia,
      Moneda: mercancia.moneda,
      Origen_IDUbicacion: detail.origen.idUbicacion,
      Destino_IDUbicacion: detail.destino.idUbicacion,
      Placa_VM: detail.autotransporte.placaVM,
      Operador_RFC: detail.operador.rfcFigura,
    }));
  });
  const wsCartaPorteMercancias = (XLSX as any).utils.json_to_sheet(dataCartaPorteMercancias);
  (XLSX as any).utils.book_append_sheet(wb, wsCartaPorteMercancias, 'DETALLE CARTA PORTE MERCANCIAS');

  // Generar nombre de archivo con fecha
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fileName = fileNameOverride || `SentinelExpress_Diagnostico_${dateStr}.xlsx`;

  // Descargar archivo
  (XLSX as any).writeFile(wb, fileName);
}
