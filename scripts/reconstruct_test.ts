import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import { exportToExcel } from '../client/src/lib/excelExporter';

async function main() {
  const sourceFile = 'C:\\Users\\desib\\Downloads\\SentinelExpress_Diagnostico_20260527.xlsx';
  const errorsFile = 'C:\\Users\\desib\\Downloads\\SentinelExpress_Diagnostico_20260527 (1).xlsx';
  const outputFile = path.resolve('SentinelExpress_Diagnostico_20260527_Separado.xlsx');
  
  const xlsx = (XLSX as any).default || (XLSX as any);

  console.log(`[reconstruct] Cargando archivo de errores para extraer UUIDs de timeout: ${errorsFile}`);
  const wbErrors = xlsx.readFile(errorsFile);
  const diagErrors = xlsx.utils.sheet_to_json(wbErrors.Sheets['Diagnostico_CFDI'] || {}, { defval: '' }) as any[];
  
  const timeoutUuids = new Set<string>();
  diagErrors.forEach(row => {
    const uuid = String(row.UUID || '').trim().toUpperCase();
    if (uuid === 'NO DISPONIBLE' || uuid === 'NO_DISPONIBLE' || uuid === '') {
      const match = String(row.Archivo_XML || '').match(/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/);
      if (match) {
        timeoutUuids.add(match[1].toUpperCase());
      }
    }
  });
  console.log(`[reconstruct] Detectados ${timeoutUuids.size} UUIDs de timeout desde el archivo de errores.`);

  console.log(`[reconstruct] Cargando archivo original completo: ${sourceFile}`);
  const wb = xlsx.readFile(sourceFile);
  
  const rows = (sheetName: string) => xlsx.utils.sheet_to_json(wb.Sheets[sheetName] || {}, { defval: '' }) as Record<string, any>[];
  
  const diagnosticoRows = rows('Diagnostico_CFDI');
  const conceptosRows = rows('DETALLE CONCEPTOS XML');
  const impuestosRows = rows('DETALLE IMPUESTOS CONCEPTO');
  const originalUbicaciones = rows('DETALLE CP UBICACIONES');
  const originalMercancias = rows('DETALLE CARTA PORTE MERCANCIAS');
  const originalFiguras = rows('DETALLE CARTA PORTE FIGURAS');
  const originalPagos = rows('DETALLE COMPLEMENTOS PAGO');
  
  console.log(`[reconstruct] Cargados ${diagnosticoRows.length} registros principales de Diagnostico_CFDI`);

  // 1. Agrupar impuestos por UUID e Indice_Nodo del concepto (remediando el formato decimal Indice_Nodo)
  const trasladosMap = new Map<string, any[]>();
  const retencionesMap = new Map<string, any[]>();

  impuestosRows.forEach(iRow => {
    const uuid = String(iRow.UUID || '').trim().toUpperCase();
    const conceptIndex = String(iRow.Indice_Nodo || '').split('.')[0];
    const key = `${uuid}_${conceptIndex}`;
    
    let tipoFactor = iRow.TipoFactor;
    if (tipoFactor === 'NO VIENE EN XML' || !tipoFactor) {
      if (iRow.TasaOCuota !== 'NO VIENE EN XML' && iRow.TasaOCuota !== '') {
        const tNum = Number(iRow.TasaOCuota);
        if (!isNaN(tNum)) {
          tipoFactor = 'Tasa';
        }
      }
    }

    const tax = {
      impuesto: iRow.Impuesto === 'IVA' ? '002' : iRow.Impuesto,
      tasa: String(iRow.TasaOCuota),
      importe: Number(iRow.Importe || 0),
      base: Number(iRow.Base || 0),
      tipoFactor: tipoFactor
    };

    if (String(iRow.Nodo_XML || iRow.Tipo_Impuesto || '').toUpperCase() === 'RETENCION') {
      if (!retencionesMap.has(key)) retencionesMap.set(key, []);
      retencionesMap.get(key)!.push(tax);
    } else {
      if (!trasladosMap.has(key)) trasladosMap.set(key, []);
      trasladosMap.get(key)!.push(tax);
    }
  });

  // 2. Agrupar conceptos por UUID
  const conceptMap = new Map<string, any[]>();
  conceptosRows.forEach(cRow => {
    const uuid = String(cRow.UUID || '').trim().toUpperCase();
    if (!conceptMap.has(uuid)) conceptMap.set(uuid, []);
    
    const key = `${uuid}_${cRow.Indice_Nodo}`;
    const traslados = trasladosMap.get(key) || [];
    const retenciones = retencionesMap.get(key) || [];
    
    conceptMap.get(uuid)!.push({
      claveProdServ: cRow.ClaveProdServ,
      descripcion: cRow.Concepto,
      cantidad: cRow.Cantidad,
      noIdentificacion: cRow.NoIdentificacion,
      valorUnitario: cRow.ValorUnitario,
      objetoImp: cRow.ObjetoImp,
      importe: Number(cRow.Importe || 0),
      descuento: Number(cRow.Descuento || 0),
      traslados,
      retenciones
    });
  });

  // 2b. Agrupar complementos de pago por UUID
  const pagosMap = new Map<string, any[]>();
  originalPagos.forEach(pRow => {
    const uuid = String(pRow.UUID || '').trim().toUpperCase();
    if (!pagosMap.has(uuid)) pagosMap.set(uuid, []);
    if (pRow.UUID !== 'SIN REGISTROS') {
      pagosMap.get(uuid)!.push({
        Archivo_XML: pRow.Archivo_XML,
        UUID: pRow.UUID,
        Indice_Nodo: pRow.Indice_Nodo,
        Nodo_XML: pRow.Nodo_XML,
        FechaPago: pRow.FechaPago,
        FormaDePagoP: pRow.FormaDePagoP,
        MonedaP: pRow.MonedaP,
        TipoCambioP: pRow.TipoCambioP,
        Monto: pRow.Monto,
        UUID_CFDI_Relacionado: pRow.UUID_CFDI_Relacionado || pRow.IdDocumento,
        Serie_Relacionado: pRow.Serie_Relacionado || pRow.Serie,
        Folio_Relacionado: pRow.Folio_Relacionado || pRow.Folio,
        MonedaDR: pRow.MonedaDR,
        NumParcialidad: pRow.NumParcialidad,
        ImpSaldoAnt: pRow.ImpSaldoAnt,
        ImpPagado: pRow.ImpPagado,
        ImpSaldoInsoluto: pRow.ImpSaldoInsoluto,
        BaseDR: pRow.BaseDR,
        ImpuestoDR: pRow.ImpuestoDR,
        TipoFactorDR: pRow.TipoFactorDR,
        TasaOCuotaDR: pRow.TasaOCuotaDR,
        ImporteDR: pRow.ImporteDR,
        BaseP: pRow.BaseP,
        ImpuestoP: pRow.ImpuestoP,
        TipoFactorP: pRow.TipoFactorP,
        TasaOCuotaP: pRow.TasaOCuotaP,
        ImporteP: pRow.ImporteP,
        Observacion: pRow.Observacion || 'Complemento de pago extraído'
      });
    }
  });

  // 3. Agrupar tablas secundarias de Carta Porte por UUID
  const cpUbicacionesMap = new Map<string, any[]>();
  originalUbicaciones.forEach(uRow => {
    const uuid = String(uRow.UUID || '').trim().toUpperCase();
    if (!cpUbicacionesMap.has(uuid)) cpUbicacionesMap.set(uuid, []);
    cpUbicacionesMap.get(uuid)!.push({
      tipoUbicacion: uRow.tipoUbicacion,
      idUbicacion: uRow.idUbicacion,
      rfcRemitenteDestinatario: uRow.rfcRemitenteDestinatario,
      nombreRemitenteDestinatario: uRow.nombreRemitenteDestinatario,
      fechaHoraSalidaLlegada: uRow.fechaHoraSalidaLlegada,
      calle: uRow.calle,
      numeroExterior: uRow.numeroExterior,
      numeroInterior: uRow.numeroInterior,
      colonia: uRow.colonia,
      localidad: uRow.localidad,
      municipio: uRow.municipio,
      estado: uRow.estado,
      pais: uRow.pais,
      codigoPostal: uRow.codigoPostal,
      referencia: uRow.referencia,
    });
  });

  const cpMercanciasMap = new Map<string, any[]>();
  originalMercancias.forEach(mRow => {
    const uuid = String(mRow.UUID || '').trim().toUpperCase();
    if (!cpMercanciasMap.has(uuid)) cpMercanciasMap.set(uuid, []);
    cpMercanciasMap.get(uuid)!.push({
      bienesTransp: mRow.bienesTransp,
      descripcion: mRow.descripcion,
      cantidad: mRow.cantidad,
      claveUnidad: mRow.claveUnidad,
      unidad: mRow.unidad,
      pesoEnKg: mRow.pesoEnKg,
      valorMercancia: mRow.valorMercancia,
      moneda: mRow.moneda,
      fraccionArancelaria: mRow.fraccionArancelaria,
      uuidComercioExt: mRow.uuidComercioExt,
      materialPeligroso: mRow.materialPeligroso,
      cveMaterialPeligroso: mRow.cveMaterialPeligroso,
      embalaje: mRow.embalaje,
    });
  });

  const cpFigurasMap = new Map<string, any[]>();
  originalFiguras.forEach(fRow => {
    const uuid = String(fRow.UUID || '').trim().toUpperCase();
    if (!cpFigurasMap.has(uuid)) cpFigurasMap.set(uuid, []);
    cpFigurasMap.get(uuid)!.push({
      tipoFigura: fRow.tipoFigura,
      rfcFigura: fRow.rfcFigura,
      nombreFigura: fRow.nombreFigura,
      numLicencia: fRow.numLicencia,
      residenciaFiscal: fRow.residenciaFiscal,
      numRegIdTrib: fRow.numRegIdTrib,
    });
  });

  // 4. Reconstruir ValidationResult[]
  let statTimeoutApply = 0;

  const results = diagnosticoRows.map(row => {
    const uuid = String(row.UUID || '').trim().toUpperCase();
    const isTimeout = timeoutUuids.has(uuid);
    
    const cpPresente = row.Carta_Porte_Presente === 'SI' || row.Carta_Porte_Presente === 'SÍ' ? 'SI' : 'NO';
    const allUbicaciones = cpUbicacionesMap.get(uuid) || [];
    const origenes = allUbicaciones.filter((u: any) => u.tipoUbicacion === 'Origen');
    const destinos = allUbicaciones.filter((u: any) => u.tipoUbicacion === 'Destino');
    const figuras = cpFigurasMap.get(uuid) || [];
    const mercancias = cpMercanciasMap.get(uuid) || [];

    const autotransporte = {
      permSCT: row.Permiso_SCT,
      numPermisoSCT: row.Numero_Permiso_SCT,
      configVehicular: row.Configuracion_Vehicular,
      placaVM: row.Placa_VM,
      anioModeloVM: row.Anio_Modelo_VM,
      aseguradoraRespCivil: row.Aseguradora_RC,
      polizaRespCivil: row.Poliza_RC,
      remolques: row.Remolques ? String(row.Remolques).split('|').map(s => {
        const parts = s.trim().split(' ');
        return { subTipoRem: parts[0] || '', placa: parts[1] || '' };
      }) : []
    };

    const cartaPorteDetalle = cpPresente === 'SI' ? {
      version: row.Version_Carta_Porte,
      transpInternac: row.Transporte_Internacional,
      transporteInternacional: row.Transporte_Internacional,
      entradaSalidaMercancia: row.Entrada_Salida_Mercancia,
      paisOrigenDestino: row.Pais_Origen_Destino,
      viaEntradaSalida: row.Via_Entrada_Salida,
      totalDistanciaRecorrida: row.Total_Distancia_Recorrida,
      pesoBrutoTotal: row.Peso_Bruto_Total,
      unidadPeso: row.Unidad_Peso,
      numTotalMercancias: row.Num_Total_Mercancias,
      origenes,
      destinos,
      autotransporte,
      figuras,
      mercancias,
      mercanciaPrincipal: row.Descripcion_Mercancia
    } : null;

    let estatusSAT = row.Estatus_SAT;
    let comentarioFiscal = row.Comentario_Fiscal;
    let observacionesTecnicas = row.Observaciones_Tecnicas;

    if (isTimeout) {
      estatusSAT = "Error Conexión";
      comentarioFiscal = `[AVISO] No se pudo verificar estatus en SAT (Timeout). Sincronizado con Motor Fiscal v1.1`;
      observacionesTecnicas = "Error al procesar: Error: Tiempo de procesamiento excedido";
      statTimeoutApply++;
    }

    return {
      fileName: row.Archivo_XML,
      uuid: row.UUID,
      versionCFDI: row.Version_CFDI,
      tipoCFDI: row.Tipo_CFDI,
      serie: row.Serie,
      folio: row.Folio,
      fechaEmision: row.Fecha_Emision,
      horaEmision: row.Hora_Emision,
      estatusSAT: estatusSAT,
      fechaCancelacion: row.Fecha_Cancelacion,
      cfdiSustituido: row.CFDI_Sustituido,
      uuidSustitucion: row.UUID_Sustitucion,
      rfcEmisor: row.RFC_Emisor,
      nombreEmisor: row.Nombre_Emisor,
      regimenEmisor: row.Regimen_Emisor,
      estadoSATEmisor: row.Estado_SAT_Emisor,
      rfcReceptor: row.RFC_Receptor,
      nombreReceptor: row.Nombre_Receptor,
      regimenReceptor: row.Regimen_Receptor,
      usoCFDI: row.Uso_CFDI,
      cpReceptor: row.CP_Receptor,
      esNomina: row.Es_Nomina,
      versionNomina: row.Version_Nomina,
      requiereCartaPorte: row.Requiere_Carta_Porte,
      cartaPorte: cpPresente,
      cartaPorteCompleta: row.Carta_Porte_Completa,
      versionCartaPorte: row.Version_Carta_Porte,
      subtotal: Number(row.Subtotal || 0),
      totalPercepciones: Number(row.Total_Percepciones || 0),
      totalDeducciones: Number(row.Total_Deducciones || 0),
      totalOtrosPagos: Number(row.Total_OtrosPagos || 0),
      isrRetenidoNomina: Number(row.ISR_Retenido_Nomina || 0),
      clasificacionFiscal: row.CLASIFICACION_FISCAL,
      baseNoObjeto: Number(row.BASE_NO_OBJETO || 0),
      baseObjetoSinDesglose: Number(row.BASE_SIN_DESGLOSE || 0),
      baseIVA16: Number(row.Base_IVA_16 || 0),
      baseIVA8: Number(row.Base_IVA_8 || 0),
      baseIVA0: Number(row.Base_IVA_0 || 0),
      baseIVAExento: Number(row.Base_IVA_Exento || 0),
      ivaTraslado: Number(row.IVA_Trasladado || 0),
      ivaRetenido: Number(row.IVA_Retenido || 0),
      isrRetenido: Number(row.ISR_Retenido || 0),
      iepsTraslado: Number(row.IEPS_Trasladado || 0),
      iepsRetenido: Number(row.IEPS_Retenido || 0),
      impuestosLocalesTrasladados: Number(row.Impuestos_Locales_Trasladados || 0),
      impuestosLocalesRetenidos: Number(row.Impuestos_Locales_Retenidos || 0),
      totalCalculado: Number(row.Total_Calculado || 0),
      totalCalculadoNomina: Number(row.Total_Calculado || 0),
      total: Number(row.Total_Declarado || 0),
      diferenciaTotales: Number(row.Diferencia_Totales || 0),
      moneda: row.Moneda,
      tipoCambio: Number(row.Tipo_Cambio || 1),
      formaPago: row.Forma_Pago,
      metodoPago: row.Metodo_Pago,
      nivelValidacion: row.Nivel_Validacion,
      resultado: row.Resultado,
      comentarioFiscal: comentarioFiscal,
      observacionesTecnicas: observacionesTecnicas,
      observacionesContador: row.Observaciones_Contador,
      giroEmpresa: row.Giro_Empresa,
      uuids_relacionados: String(row.UUIDs_Relacionados || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      pagosPresente: row.Metodo_Pago === 'PPD' ? 'SI' : 'NO APLICA',
      desglosePorConcepto: conceptMap.get(uuid) || [],
      desglosePagos: pagosMap.get(uuid) || [],
      trazabilidadInfo: {
        nivelExpediente: row.Nivel_Trazabilidad,
        fuenteExternaRequerida: row.Requiere_Soporte_Externo,
        accionRecomendadaMatriz: row.Accion_Recomendada,
        tienePedimento: row.Tiene_Pedimento || 'NO',
        tieneDoda: row.Tiene_DODA || 'NO',
        tieneCartaPorte: cpPresente,
        exportacion: row.Exportacion || '01',
        ivaAcreditable: Number(row.IVA_Trasladado || 0),
        cartaPorteDetalle
      }
    };
  });

  console.log(`[reconstruct] Aplicados ${statTimeoutApply} simulaciones de timeout SAT.`);
  console.log(`[reconstruct] Exportando ${results.length} resultados con el nuevo excelExporter...`);
  exportToExcel(results, outputFile);
  console.log(`[reconstruct] Excel generado en: ${outputFile}`);

  // Ejecutamos validaciones sobre el nuevo archivo generado
  console.log('\n================ AUDITORÍA Y MÉTRICAS DE VALIDACIÓN ================');
  const wbOut = xlsx.readFile(outputFile);
  console.log(`- Total de hojas generadas: ${wbOut.SheetNames.length}`);
  console.log(`- Nombres de hojas:`, wbOut.SheetNames.join(', '));

  const outRows = (sheetName: string) => xlsx.utils.sheet_to_json(wbOut.Sheets[sheetName] || {}, { defval: '' }) as Record<string, any>[];
  const count = (data: any[], predicate: (row: any) => boolean) => data.filter(predicate).length;

  const getBadUuidCount = (sheetName: string, headerRange?: number) => {
    const ws = wbOut.Sheets[sheetName];
    if (!ws) return 0;
    const rangeOpt = headerRange !== undefined ? { range: headerRange } : {};
    const data = xlsx.utils.sheet_to_json(ws, { defval: '', ...rangeOpt }) as Record<string, any>[];
    if (data.length === 0) return 0;
    const sample = data[0];
    const uuidKey = Object.keys(sample).find(k => k.toUpperCase() === 'UUID');
    if (!uuidKey) return 0;
    return count(data, r => {
      const val = String(r[uuidKey]).trim().toUpperCase();
      return val === 'NO DISPONIBLE' || val === 'NO_DISPONIBLE' || val === '' || val === 'NO VIENE EN XML';
    });
  };

  const diagBad = getBadUuidCount('Diagnostico_CFDI');
  const matrizBad = getBadUuidCount('MATRIZ DE RASTREABILIDAD');
  const forenseBad = getBadUuidCount('DETALLE FORENSE POR CFDI');
  const comparativoBad = getBadUuidCount('COMPARATIVO BASE Y TASA IVA', 9);
  
  const diagTotal = outRows('Diagnostico_CFDI').length;
  const erroresTotal = outRows('ERRORES LECTURA XML').length;

  const validUuidsCount = results.filter(r => r.uuid && r.uuid !== 'NO DISPONIBLE').length;
  const satNoConfirmado = count(outRows('Diagnostico_CFDI'), r => r.Estatus_SAT === 'ESTATUS SAT NO CONFIRMADO');
  const satTimeoutCount = results.filter(r => r.estatusSAT === 'Error Conexión').length;

  console.log(`- Total XML cargados: ${results.length}`);
  console.log(`- Total CFDI con UUID real extraído: ${validUuidsCount}`);
  console.log(`- Total XML en ERRORES LECTURA XML: ${erroresTotal}`);
  console.log(`- Total CFDI con ESTATUS SAT NO CONFIRMADO: ${satNoConfirmado}`);
  console.log(`- Total CFDI con UUID válido pero SAT timeout: ${satTimeoutCount}`);
  console.log(`- Total filas con UUID = NO DISPONIBLE en Diagnostico_CFDI: ${diagBad}`);
  console.log(`- Total filas con UUID = NO DISPONIBLE en MATRIZ DE RASTREABILIDAD: ${matrizBad}`);
  console.log(`- Total filas con UUID = NO DISPONIBLE en DETALLE FORENSE POR CFDI: ${forenseBad}`);
  console.log(`- Total filas con UUID = NO DISPONIBLE en COMPARATIVO BASE Y TASA IVA: ${comparativoBad}`);

  // Validaciones de Carta Porte
  const ubicaciones = outRows('DETALLE CP UBICACIONES');
  const mercancias = outRows('DETALLE CARTA PORTE MERCANCIAS');
  const figuras = outRows('DETALLE CARTA PORTE FIGURAS');
  const totalCartaPorte = count(outRows('Diagnostico_CFDI'), row => row.Carta_Porte_Presente === 'SI' || row.Tiene_Carta_Porte === 'SI');
  
  console.log(`\n================ DETALLE CARTA PORTE REAL RECUPERADA ================`);
  console.log(`- UUIDs válidos con Carta Porte: ${totalCartaPorte}`);
  console.log(`- DETALLE CP UBICACIONES: ${ubicaciones.length} registros`);
  console.log(`- DETALLE CARTA PORTE MERCANCIAS: ${mercancias.length} registros`);
  console.log(`- DETALLE CARTA PORTE FIGURAS: ${figuras.length} registros`);
}

main().catch(err => {
  console.error('Error:', err);
});
