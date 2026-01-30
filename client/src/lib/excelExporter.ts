import * as XLSX from 'xlsx';
import { ValidationResult } from '@/hooks/useXMLValidator';

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
    Estatus_SAT: r.estatusSAT,
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
    Total_Calculado: r.esNomina === "SÍ" ? r.totalCalculadoNomina : r.totalCalculado,
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
    { wch: 12 }, // T: CP_Receptor
    { wch: 12 }, // U: Es_Nomina
    { wch: 16 }, // V: Version_Nomina
    { wch: 20 }, // W: Requiere_Carta_Porte
    { wch: 20 }, // X: Carta_Porte_Presente
    { wch: 20 }, // Y: Carta_Porte_Completa
    { wch: 18 }, // Z: Version_Carta_Porte
    { wch: 12 }, // AA: Subtotal
    { wch: 16 }, // AB: Total_Percepciones
    { wch: 16 }, // AC: Total_Deducciones
    { wch: 16 }, // AD: Total_OtrosPagos
    { wch: 18 }, // AE: ISR_Retenido_Nomina
    { wch: 12 }, // AF: Base_IVA_16
    { wch: 12 }, // AG: Base_IVA_8
    { wch: 12 }, // AH: Base_IVA_0
    { wch: 14 }, // AI: Base_IVA_Exento
    { wch: 14 }, // AJ: IVA_Trasladado
    { wch: 14 }, // AK: IVA_Retenido
    { wch: 12 }, // AL: ISR_Retenido
    { wch: 14 }, // AM: IEPS_Trasladado
    { wch: 14 }, // AN: IEPS_Retenido
    { wch: 20 }, // AO: Impuestos_Locales_Trasladados
    { wch: 20 }, // AP: Impuestos_Locales_Retenidos
    { wch: 14 }, // AQ: Total_Calculado
    { wch: 14 }, // AR: Total_Declarado
    { wch: 14 }, // AS: Diferencia_Totales
    { wch: 10 }, // AT: Moneda
    { wch: 12 }, // AU: Tipo_Cambio
    { wch: 14 }, // AV: Forma_Pago
    { wch: 14 }, // AW: Metodo_Pago
    { wch: 22 }, // AX: Nivel_Validacion
    { wch: 20 }, // AY: Resultado
    { wch: 50 }, // AZ: Comentario_Fiscal
    { wch: 50 }, // BA: Observaciones_Tecnicas
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

  // Configurar altura de fila de encabezado
  (ws as any)['!rows'] = [{ hpx: 30 }];

  // Activar filtros (actualizado para incluir todas las nuevas columnas)
  (ws as any)['!autofilter'] = { ref: `A1:BA1` };

  // Congelar fila 1
  (ws as any)['!panes'] = { ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Agregar sheet al workbook
  (XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');

  // Generar nombre de archivo con fecha
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fileName = `SentinelExpress_Diagnostico_${dateStr}.xlsx`;

  // Descargar archivo
  (XLSX as any).writeFile(wb, fileName);
}
