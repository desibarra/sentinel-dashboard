import * as XLSX from 'xlsx';
import { ValidationResult } from '@/lib/cfdiEngine';

export function exportToExcel(results: ValidationResult[]) {
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
    Estatus_SAT: r.trazabilidadInfo?.observacionSAT || r.estatusSAT,
    Resultado_Validacion_SAT: r.trazabilidadInfo?.observacionSAT === 'ESTATUS SAT NO CONFIRMADO' ? 'FALLA TECNICA DE CONSULTA' : 'VALIDACION OK',
    Accion_Recomendada_SAT: r.trazabilidadInfo?.observacionSAT === 'ESTATUS SAT NO CONFIRMADO' ? 'Reintentar validación SAT o validar con acuse/portal externo.' : 'Ninguna',
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
    Carta_Porte_Presente: r.cartaPorte,
    Carta_Porte_Completa: r.cartaPorteCompleta,
    Version_Carta_Porte: r.versionCartaPorte,
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
    Total_Calculado: r.esNomina === "SÃ" ? r.totalCalculadoNomina : r.totalCalculado,
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
    Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte || 'NO',
    Placas: r.trazabilidadInfo?.placas || 'NO VIENE EN XML',
    Remolques: r.trazabilidadInfo?.remolques || 'NO VIENE EN XML',
    Origen: r.trazabilidadInfo?.tieneOrigen || 'NO VIENE EN XML',
    Destino: r.trazabilidadInfo?.tieneDestino || 'NO VIENE EN XML',
    RFC_Operador: r.trazabilidadInfo?.rfcOperador || 'NO VIENE EN XML',
    Mercancias: r.trazabilidadInfo?.tieneMercancias === 'SÃ' ? 'SÃ' : 'NO',
    Peso: r.trazabilidadInfo?.peso || 'NO VIENE EN XML',
    Distancia: r.trazabilidadInfo?.distancia || 'NO VIENE EN XML',
    Permiso_SCT: r.trazabilidadInfo?.permisoSCT || 'NO VIENE EN XML',
    Transporte_Internacional: r.trazabilidadInfo?.transporteInternacional || 'NO VIENE EN XML',
    Destino_Extranjero: r.trazabilidadInfo?.destinoExtranjero || 'NO',
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
    Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
    Numero_DODA_Integracion: r.trazabilidadInfo?.numeroDodaIntegracion || 'NO VIENE EN XML',
    Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior || 'REQUIERE CAPTURA',
    Diagnostico_Tasa_0: r.trazabilidadInfo?.diagnosticoTasa0 || 'NO APLICA',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaTasa0 || 'NO APLICA'
  }));
  const wsTasa0 = (XLSX as any).utils.json_to_sheet(dataTasa0);
  (XLSX as any).utils.book_append_sheet(wb, wsTasa0, 'CEDULA TASA 0%');

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
    Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte || 'NO',
    Tiene_Placas_Unidad: r.trazabilidadInfo?.tienePlacasUnidad || 'NO',
    Tiene_Origen: r.trazabilidadInfo?.tieneOrigen || 'NO',
    Tiene_Destino: r.trazabilidadInfo?.tieneDestino || 'NO',
    Tiene_Mercancias: r.trazabilidadInfo?.tieneMercancias || 'NO',
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
    Tiene_Entry: r.trazabilidadInfo?.tieneEntryNumber || 'NO',
    Tiene_Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE IMPORTACION',
    Datos_Faltantes: r.trazabilidadInfo?.datosFaltantes || 'NO APLICA',
    Fuente_Externa_Requerida: r.trazabilidadInfo?.fuenteExternaRequerida || 'NO APLICA',
    Diagnostico: r.trazabilidadInfo?.diagnosticoDatosFaltantes || 'NO APLICA',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaDatosFaltantes || 'NO APLICA',
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
    Unidad_Placas: r.trazabilidadInfo?.tienePlacasUnidad || 'NO',
    Origen: r.trazabilidadInfo?.tieneOrigen || 'NO VIENE EN XML',
    Destino: r.trazabilidadInfo?.tieneDestino || 'NO VIENE EN XML',
    Mercancia: r.trazabilidadInfo?.tieneMercancias || 'NO VIENE EN XML',
    Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
    DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
    Entry: r.trazabilidadInfo?.tieneEntryNumber || 'NO',
    Pago_Identificado: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE CRUCE EXTERNO',
    Estado_De_Cuenta: r.trazabilidadInfo?.estadoDeCuenta || 'REQUIERE IMPORTACION',
    Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior || 'REQUIERE CRUCE EXTERNO',
    Nivel_De_Expediente: r.trazabilidadInfo?.nivelExpediente || 'NO APLICA',
    Estatus_Documental: r.trazabilidadInfo?.estatusDocumental || 'NO APLICA',
    Riesgo: r.trazabilidadInfo?.riesgo || 'NO APLICA',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'NO APLICA'
  }));
  const wsMatriz = (XLSX as any).utils.json_to_sheet(dataMatriz);
  (XLSX as any).utils.book_append_sheet(wb, wsMatriz, 'MATRIZ DE RASTREABILIDAD');

  // Generar nombre de archivo con fecha
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fileName = `SentinelExpress_Diagnostico_${dateStr}.xlsx`;

  // Descargar archivo
  (XLSX as any).writeFile(wb, fileName);
}
