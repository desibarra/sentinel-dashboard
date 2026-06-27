export interface ExportacionInput {
  uuid: string;
  exportacion: string;
  moneda: string;
  tieneImpuestoTasa0: boolean;
  tieneComplementoComex: boolean;
  rfcReceptor: string;
}

export interface ExportacionValidacion {
  uuid: string;
  tipoExportacion: '00' | '01' | '02' | '03' | 'no_aplica';
  esExportacion: boolean;
  clasificacionCorrecta: 'exportacion_tasa0' | 'otros_tasa0' | 'no_aplica';
  nivel: 'ok' | 'alerta' | 'critico';
  mensaje: string;
  fundamento: string;
}

const FUNDAMENTO = 'Art. 29 LIVA tasa 0% exportación + Guía prellenado SAT';

export function validarExportacion(
  input: ExportacionInput
): ExportacionValidacion {
  const exportacion = String(input.exportacion || '').trim();
  const esExportacion = exportacion !== '' && exportacion !== '00';
  const tipoExportacion = esExportacion
    ? (['01', '02', '03'] as const).includes(exportacion as any)
      ? (exportacion as '01' | '02' | '03')
      : '00'
    : 'no_aplica';

  if (!esExportacion) {
    return {
      uuid: input.uuid,
      tipoExportacion: 'no_aplica',
      esExportacion: false,
      clasificacionCorrecta: 'no_aplica',
      nivel: 'ok',
      mensaje: 'No es una exportación; no aplica clasificación de tasa 0%.',
      fundamento: FUNDAMENTO,
    };
  }

  const tieneTasa0 = input.tieneImpuestoTasa0;
  const tieneComex = input.tieneComplementoComex;

  if (exportacion === '02' && !tieneTasa0) {
    return {
      uuid: input.uuid,
      tipoExportacion: '02',
      esExportacion: true,
      clasificacionCorrecta: 'exportacion_tasa0',
      nivel: 'critico',
      mensaje:
        'Exportación definitiva con pedimento (02) debe tener tasa 0% — verifica los impuestos trasladados',
      fundamento: FUNDAMENTO,
    };
  }

  if (exportacion === '01' && !tieneComex) {
    return {
      uuid: input.uuid,
      tipoExportacion: '01',
      esExportacion: true,
      clasificacionCorrecta: 'exportacion_tasa0',
      nivel: 'alerta',
      mensaje:
        'Exportación definitiva sin complemento de comercio exterior — puede generar observaciones del SAT',
      fundamento: FUNDAMENTO,
    };
  }

  if (['01', '02', '03'].includes(exportacion) && tieneTasa0) {
    return {
      uuid: input.uuid,
      tipoExportacion: exportacion as '01' | '02' | '03',
      esExportacion: true,
      clasificacionCorrecta: 'exportacion_tasa0',
      nivel: 'ok',
      mensaje:
        "Exportación con tasa 0% correctamente clasificada — en tu declaración asegúrate de reportarla como 'tasa 0% exportación' y NO como 'Otros'",
      fundamento: FUNDAMENTO,
    };
  }

  return {
    uuid: input.uuid,
    tipoExportacion: exportacion as '01' | '02' | '03',
    esExportacion: true,
    clasificacionCorrecta: 'exportacion_tasa0',
    nivel: 'alerta',
    mensaje:
      'CFDI marcado como exportación pero sin impuesto tasa 0% — revisa',
    fundamento: FUNDAMENTO,
  };
}
