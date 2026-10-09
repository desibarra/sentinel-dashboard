import type { ValidationResult } from '@/lib/cfdiEngine';
import { combinarHallazgo69B, combinarResultadoFinal, type EstatusSAT } from '@/hooks/useXMLValidator';
import { checkRFCBlacklist, type BlacklistValidation } from '@/utils/blacklistValidator';

/**
 * Recompone resultado/comentario de un CFDI a partir de sus tres señales
 * independientes: clasificación del motor (resultadoMotor/comentarioMotor),
 * estatus SAT y cruce 69-B. Es la misma composición que usa la validación
 * inicial (combinarResultadoFinal), así que revalidar el SAT o actualizar la
 * lista 69-B nunca descarta la otra señal.
 */
export function recomponerResultado(
  row: ValidationResult,
  cambios: {
    estatusSAT?: EstatusSAT;
    estatusCancelacion?: string;
    rfcEmisorBlacklist?: BlacklistValidation;
    rfcReceptorBlacklist?: BlacklistValidation;
  } = {}
): ValidationResult {
  // Sin clasificación del motor (p. ej. XML ilegible) no hay base para recomponer.
  if (!row.resultadoMotor) {
    return {
      ...row,
      estatusSAT: (cambios.estatusSAT ?? row.estatusSAT) as EstatusSAT,
      rfcEmisorBlacklist: 'rfcEmisorBlacklist' in cambios ? cambios.rfcEmisorBlacklist : row.rfcEmisorBlacklist,
      rfcReceptorBlacklist: 'rfcReceptorBlacklist' in cambios ? cambios.rfcReceptorBlacklist : row.rfcReceptorBlacklist,
    };
  }
  const estatusSAT = (cambios.estatusSAT ?? row.estatusSAT) as EstatusSAT;
  const emisorBl = 'rfcEmisorBlacklist' in cambios ? cambios.rfcEmisorBlacklist : row.rfcEmisorBlacklist;
  const receptorBl = 'rfcReceptorBlacklist' in cambios ? cambios.rfcReceptorBlacklist : row.rfcReceptorBlacklist;
  const combinado = combinarResultadoFinal(
    {
      resultado: row.resultadoMotor || row.resultado,
      comentarioFiscal: row.comentarioMotor || row.comentarioFiscal,
      nivelValidacion: row.nivelValidacionMotor
        ?? (['ERROR', 'ALERTA', 'NO VALIDADO', 'PENDIENTE SAT'].includes(row.nivelValidacion) ? 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO' : row.nivelValidacion),
      score: row.scoreInformativo,
    },
    combinarHallazgo69B(emisorBl, receptorBl),
    estatusSAT,
    cambios.estatusCancelacion ?? row.fechaCancelacion ?? ''
  );
  return {
    ...row,
    estatusSAT,
    rfcEmisorBlacklist: emisorBl,
    rfcReceptorBlacklist: receptorBl,
    resultado: combinado.resultado,
    comentarioFiscal: combinado.comentarioFiscal,
    nivelValidacion: combinado.nivelValidacion,
    scoreInformativo: combinado.score,
  };
}

/** Vuelve a cruzar emisor y receptor contra la lista 69-B cargada en este dispositivo. */
export async function refrescarCruce69B(results: ValidationResult[]): Promise<ValidationResult[]> {
  const rfcs = Array.from(new Set(results.flatMap(r => [r.rfcEmisor, r.rfcReceptor]).filter(Boolean).map(rfc => rfc.trim().toUpperCase())));
  const cruces = new Map<string, BlacklistValidation>();
  for (const rfc of rfcs) cruces.set(rfc, await checkRFCBlacklist(rfc));
  return results.map(row => recomponerResultado(row, {
    rfcEmisorBlacklist: row.rfcEmisor ? cruces.get(row.rfcEmisor.trim().toUpperCase()) : row.rfcEmisorBlacklist,
    rfcReceptorBlacklist: row.rfcReceptor ? cruces.get(row.rfcReceptor.trim().toUpperCase()) : row.rfcReceptorBlacklist,
  }));
}
