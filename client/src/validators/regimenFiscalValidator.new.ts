export type RegimenFiscalValidationResult = {
  valido: boolean;
  nivel: 'ok' | 'alerta' | 'critico';
  regimenDetectado: string;
  descripcionRegimen: string;
  mensaje: string;
  fundamento: string;
};

const regimenFiscalCatalog: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
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
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza (RESICO)',
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getLocalElementsByTagName = (doc: Document, localName: string): Element[] =>
  Array.from(doc.getElementsByTagName('*')).filter(
    (node) => node.localName === localName
  );

const getRootComprobante = (doc: Document): Element | null => {
  if (doc.documentElement && doc.documentElement.localName === 'Comprobante') {
    return doc.documentElement;
  }
  return getLocalElementsByTagName(doc, 'Comprobante')[0] || null;
};

const getReceptor = (doc: Document): Element | null =>
  getLocalElementsByTagName(doc, 'Receptor')[0] || null;

const getConceptos = (doc: Document): Element[] =>
  getLocalElementsByTagName(doc, 'Concepto');

export function validarRegimenFiscal(doc: Document): RegimenFiscalValidationResult {
  const fundamento = 'Art. 29-A CFF, tercer párrafo';
  const comprobante = getRootComprobante(doc);
  const receptor = getReceptor(doc);

  const regimenFiscal = receptor?.getAttribute('RegimenFiscalReceptor')?.trim() || '';
  const tipoComprobante = comprobante?.getAttribute('TipoDeComprobante')?.trim() || '';
  const total = Number(comprobante?.getAttribute('Total') || 0);

  const descripcionRegimen =
    regimenFiscalCatalog[regimenFiscal] ||
    (regimenFiscal === '' ? 'No especificado' : 'Régimen desconocido');

  if (!regimenFiscal) {
    return {
      valido: false,
      nivel: 'critico',
      regimenDetectado: regimenFiscal,
      descripcionRegimen,
      mensaje:
        'El régimen fiscal del receptor no está especificado en el CFDI. Esto impide validar la deducibilidad y puede ser motivo de rechazo ante el SAT.',
      fundamento,
    };
  }

  const conceptos = getConceptos(doc).map((concepto) => ({
    claveProdServ: concepto.getAttribute('ClaveProdServ')?.trim() || '',
    descripcion: concepto.getAttribute('Descripcion')?.trim() || '',
  }));

  const textoConceptos = conceptos
    .map((concepto) => normalizeText(concepto.descripcion))
    .join(' ');

  const contieneHonorario = /honorario|honorarios|servicio profesional|consultoria|consultoría/.test(
    textoConceptos
  );
  const contieneEquipoTransporte = /equipo de transporte/.test(textoConceptos);
  const tieneClave78 = conceptos.some((concepto) => concepto.claveProdServ.startsWith('78'));
  const tieneClave81 = conceptos.some((concepto) => concepto.claveProdServ.startsWith('81'));

  if (regimenFiscal === '606') {
    if (tieneClave78 || tieneClave81 || contieneEquipoTransporte) {
      return {
        valido: false,
        nivel: 'critico',
        regimenDetectado: regimenFiscal,
        descripcionRegimen,
        mensaje:
          'El receptor está en régimen de Arrendamiento (606) pero el CFDI contiene conceptos relacionados con transporte o servicios profesionales, lo que sugiere clasificación incorrecta.',
        fundamento,
      };
    }

    if (contieneHonorario) {
      return {
        valido: false,
        nivel: 'alerta',
        regimenDetectado: regimenFiscal,
        descripcionRegimen,
        mensaje:
          'El receptor está en régimen de Arrendamiento (606) y el CFDI contiene conceptos de honorarios o servicios profesionales, lo que puede indicar una inconsistencia fiscal.',
        fundamento,
      };
    }
  }

  if (regimenFiscal === '626' && total > 300000) {
    return {
      valido: false,
      nivel: 'alerta',
      regimenDetectado: regimenFiscal,
      descripcionRegimen,
      mensaje:
        'El receptor está en Régimen Simplificado de Confianza (RESICO) y el total del CFDI excede $300,000 MXN, lo que podría superar los límites de facturación permitidos para este régimen.',
      fundamento,
    };
  }

  if (!regimenFiscalCatalog[regimenFiscal]) {
    return {
      valido: false,
      nivel: 'alerta',
      regimenDetectado: regimenFiscal,
      descripcionRegimen,
      mensaje:
        'El código de régimen fiscal del receptor no pertenece al catálogo mínimo conocido. Verifique que el CFDI utilice un régimen válido y acorde a la actividad económica.',
      fundamento,
    };
  }

  return {
    valido: true,
    nivel: 'ok',
    regimenDetectado: regimenFiscal,
    descripcionRegimen,
    mensaje: 'El régimen fiscal del receptor es compatible con los conceptos del CFDI.',
    fundamento,
  };
}
