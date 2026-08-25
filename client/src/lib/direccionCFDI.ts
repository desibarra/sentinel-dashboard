// Dirección del CFDI respecto a la empresa evaluada.
// Función pura y reutilizable: dado un CFDI (emisor/receptor) y el RFC de la
// empresa que está realizando la auditoría, determina si el comprobante es
// EMITIDO (la empresa vende) o RECIBIDO (la empresa compra).
//
// Esta clasificación es la base para corregir los "espejos contables":
//   - Un CFDI tipo "I" (ingreso) emitido POR la empresa es INGRESO/VENTA.
//   - Un CFDI tipo "I" recibido POR la empresa es COMPRA/GASTO (no es ingreso
//     propio, por mucho que el tipo SAT diga "ingreso" desde la óptica del emisor).
//
// No se hardcodea ningún RFC: siempre se compara contra `rfcEmpresa`.

export type DireccionCFDI = 'EMITIDO' | 'RECIBIDO' | 'REQUIERE_REVISION';

export interface DireccionInput {
  rfcEmisor?: string | null;
  rfcReceptor?: string | null;
}

export interface ClasificacionDireccion {
  direccionCFDI: DireccionCFDI;
  rfcEmpresaEvaluada: string;
  naturalezaParaEmpresa: string;
  impactoIVA: string;
  motivoClasificacion: string;
}

/** Normaliza un RFC para comparación robusta (mayúsculas, sin espacios). */
export function normalizarRFC(rfc?: string | null): string {
  return (rfc || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '')
    .trim();
}

/**
 * Determina la dirección del CFDI respecto a la empresa.
 * Reglas:
 *   - Sin RFC de empresa => REQUIERE_REVISION (no se puede inferir).
 *   - El RFC de la empresa coincide con el EMISOR => EMITIDO.
 *   - El RFC de la empresa coincide con el RECEPTOR => RECIBIDO.
 *   - Coincide con ambos (autofacturación) o con ninguno => REQUIERE_REVISION.
 */
export function determinarDireccionCFDI(cfdi: DireccionInput, rfcEmpresa: string): DireccionCFDI {
  const emisor = normalizarRFC(cfdi.rfcEmisor);
  const receptor = normalizarRFC(cfdi.rfcReceptor);
  const empresa = normalizarRFC(rfcEmpresa);

  if (!empresa) return 'REQUIERE_REVISION';

  const esEmisor = emisor === empresa;
  const esReceptor = receptor === empresa;

  if (esEmisor && esReceptor) return 'REQUIERE_REVISION'; // autofacturación: ambiguo
  if (esEmisor) return 'EMITIDO';
  if (esReceptor) return 'RECIBIDO';
  return 'REQUIERE_REVISION';
}

/**
 * Resuelve la clasificación completa de dirección, naturaleza e impacto de IVA
 * para la empresa. Devuelve un objeto plano listo para asignar a ValidationResult.
 */
export function resolverClasificacionDireccion(
  cfdi: DireccionInput,
  rfcEmpresa: string,
  tipoCFDI: string,
  esNomina: boolean
): ClasificacionDireccion {
  const direccion = determinarDireccionCFDI(cfdi, rfcEmpresa);
  const empresa = normalizarRFC(rfcEmpresa);
  const tipo = String(tipoCFDI || '').toUpperCase();

  if (esNomina) {
    return {
      direccionCFDI: direccion,
      rfcEmpresaEvaluada: empresa,
      naturalezaParaEmpresa: 'NOMINA',
      impactoIVA: 'NO APLICA (NOMINA)',
      motivoClasificacion:
        direccion === 'REQUIERE_REVISION'
          ? 'No se pudo determinar la dirección (RFC de empresa no coincide con emisor/receptor)'
          : `CFDI de nómina (la empresa es ${direccion === 'EMITIDO' ? 'el emisor' : 'el receptor'})`,
    };
  }

  if (direccion === 'EMITIDO') {
    switch (tipo) {
      case 'I':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'INGRESO/VENTA',
          impactoIVA: 'IVA TRASLADADO (A CARGO)',
          motivoClasificacion: 'La empresa es el EMISOR del CFDI de ingreso: es su venta.',
        };
      case 'E':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'NOTA DE CREDITO EMITIDA',
          impactoIVA: 'IVA TRASLADADO (NEGATIVO)',
          motivoClasificacion: 'La empresa es el EMISOR de un CFDI de egreso/nota de crédito.',
        };
      case 'P':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'COMPLEMENTO DE PAGO',
          impactoIVA: 'NO APLICA (PAGO)',
          motivoClasificacion: 'La empresa es el EMISOR de un complemento de pago.',
        };
      case 'T':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'TRASLADO/DESPOSTEO',
          impactoIVA: 'IVA TRASLADADO (A CARGO)',
          motivoClasificacion: 'La empresa es el EMISOR de un CFDI de traslado/desposteo.',
        };
      default:
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'EMITIDO',
          impactoIVA: 'IVA TRASLADADO (A CARGO)',
          motivoClasificacion: 'La empresa es el EMISOR del CFDI.',
        };
    }
  }

  if (direccion === 'RECIBIDO') {
    switch (tipo) {
      case 'I':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'COMPRA/GASTO',
          impactoIVA: 'IVA ACREDITABLE (A FAVOR)',
          motivoClasificacion:
            'La empresa es el RECEPTOR de un CFDI de ingreso: es su compra/proveedor (IVA a acreditar).',
        };
      case 'E':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'NOTA DE CREDITO RECIBIDA',
          impactoIVA: 'IVA ACREDITABLE (NEGATIVO)',
          motivoClasificacion: 'La empresa es el RECEPTOR de un CFDI de egreso/nota de crédito de proveedor.',
        };
      case 'P':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'COMPLEMENTO DE PAGO',
          impactoIVA: 'NO APLICA (PAGO)',
          motivoClasificacion: 'La empresa es el RECEPTOR de un complemento de pago.',
        };
      case 'T':
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'TRASLADO/DESPOSTEO',
          impactoIVA: 'IVA ACREDITABLE (A FAVOR)',
          motivoClasificacion: 'La empresa es el RECEPTOR de un CFDI de traslado/desposteo.',
        };
      default:
        return {
          direccionCFDI: direccion,
          rfcEmpresaEvaluada: empresa,
          naturalezaParaEmpresa: 'RECIBIDO',
          impactoIVA: 'IVA ACREDITABLE (A FAVOR)',
          motivoClasificacion: 'La empresa es el RECEPTOR del CFDI.',
        };
    }
  }

  // REQUIERE_REVISION
  return {
    direccionCFDI: 'REQUIERE_REVISION',
    rfcEmpresaEvaluada: empresa,
    naturalezaParaEmpresa: 'REQUIERE_REVISION',
    impactoIVA: 'N/A',
    motivoClasificacion:
      !empresa
        ? 'RFC de empresa no proporcionado: no se puede determinar la dirección.'
        : 'El RFC de la empresa no coincide con el emisor ni con el receptor del CFDI.',
  };
}
