export const CATALOGO_REGIMENES: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados',
  '606': 'Arrendamiento',
  '608': 'Demás ingresos',
  '611': 'Ingresos por Dividendos',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza (RESICO)',
};

export type RegimenFiscalValidacion = {
  valido: boolean;
  nivel: 'ok' | 'alerta' | 'critico';
  regimenDetectado: string;
  descripcionRegimen: string;
  mensaje: string;
  fundamento: string;
};

const FUNDAMENTO = 'Art. 29-A CFF, tercer párrafo';

const normalizeText = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function validarRegimenFiscal(params: {
  regimenReceptor: string;
  usoCFDI: string;
  montoTotal: number;
  conceptoDescripcion: string;
  claveProdServ: string;
}): RegimenFiscalValidacion {
  const regimenReceptor = params.regimenReceptor?.trim() || '';
  const usoCFDI = params.usoCFDI?.trim() || '';
  const montoTotal = Number(params.montoTotal || 0);
  const conceptoDescripcion = params.conceptoDescripcion || '';
  const claveProdServ = params.claveProdServ?.trim() || '';

  void usoCFDI;

  const descripcionRegimen =
    CATALOGO_REGIMENES[regimenReceptor] ||
    (regimenReceptor === '' ? 'No especificado' : 'Régimen desconocido');

  if (!regimenReceptor) {
    return {
      valido: false,
      nivel: 'critico',
      regimenDetectado: regimenReceptor,
      descripcionRegimen,
      mensaje:
        'El régimen fiscal del receptor no está especificado en el CFDI. Esto impide validar la deducibilidad y puede ser motivo de rechazo ante el SAT.',
      fundamento: FUNDAMENTO,
    };
  }

  const descripcionNormalizada = normalizeText(conceptoDescripcion);
  const esHonorario = /honorario|honorarios|profesional|consultoria|asesoria/.test(
    descripcionNormalizada
  );
  const esVehiculo = /automovil|vehiculo|camioneta|unidad|camion/.test(
    descripcionNormalizada
  );
  const esClave78o81 = /^78|^81/.test(claveProdServ);
  const esClave52 = /^52/.test(claveProdServ);

  if (regimenReceptor === '606') {
    if (esClave78o81 || esHonorario) {
      return {
        valido: false,
        nivel: 'critico',
        regimenDetectado: regimenReceptor,
        descripcionRegimen,
        mensaje:
          'El receptor está en régimen de Arrendamiento (606) pero el CFDI contiene servicios profesionales o clave 78/81. El régimen de arrendamiento no permite deducir servicios profesionales.',
        fundamento: FUNDAMENTO,
      };
    }

    if (esClave52 || esVehiculo) {
      return {
        valido: false,
        nivel: 'critico',
        regimenDetectado: regimenReceptor,
        descripcionRegimen,
        mensaje:
          'El receptor está en régimen de Arrendamiento (606) pero el CFDI contiene conceptos de vehículo o clave 52. Este régimen no es compatible con la deducibilidad de estos conceptos.',
        fundamento: FUNDAMENTO,
      };
    }
  }

  if (regimenReceptor === '626' && montoTotal > 300000) {
    return {
      valido: false,
      nivel: 'alerta',
      regimenDetectado: regimenReceptor,
      descripcionRegimen,
      mensaje:
        'El receptor está en Régimen Simplificado de Confianza (RESICO) y el total del CFDI excede $300,000 MXN, lo que puede superar los límites de facturación permitidos para este régimen.',
      fundamento: FUNDAMENTO,
    };
  }

  if (!CATALOGO_REGIMENES[regimenReceptor]) {
    return {
      valido: false,
      nivel: 'alerta',
      regimenDetectado: regimenReceptor,
      descripcionRegimen,
      mensaje:
        'El código de régimen fiscal del receptor no pertenece al catálogo mínimo conocido. Verifique que el CFDI utilice un régimen válido y acorde a la actividad económica.',
      fundamento: FUNDAMENTO,
    };
  }

  return {
    valido: true,
    nivel: 'ok',
    regimenDetectado: regimenReceptor,
    descripcionRegimen,
    mensaje: 'El régimen fiscal del receptor es compatible con el CFDI.',
    fundamento: FUNDAMENTO,
  };
}
