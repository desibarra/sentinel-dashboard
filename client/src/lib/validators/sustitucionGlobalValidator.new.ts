export interface SustitucionInput {
  uuid: string;
  tipoRelacion?: string;
  uuidSustituido?: string;
  fechaEmision: string;
  fechaTimbrado: string;
}

export interface SustitucionValidacion {
  uuid: string;
  esSustitucion: boolean;
  uuidSustituido: string;
  mesTimbrado: string;
  mesOperacion: string;
  hayDesfase: boolean;
  nivel: 'ok' | 'alerta';
  mensaje: string;
  fundamento: string;
}

const FUNDAMENTO = 'Ficha de trámite 325/CFF — aclaración de diferencias en declaración';

export function validarSustitucion(
  input: SustitucionInput
): SustitucionValidacion {
  const tipoRelacion = String(input.tipoRelacion || '').trim();
  const esSustitucion = tipoRelacion === '04';
  const mesTimbrado = input.fechaTimbrado.substring(0, 7);
  const mesOperacion = input.fechaEmision.substring(0, 7);
  const hayDesfase = esSustitucion && mesTimbrado !== mesOperacion;

  const nivel = esSustitucion ? (hayDesfase ? 'alerta' : 'ok') : 'ok';
  const mensaje = esSustitucion
    ? hayDesfase
      ? `CFDI de sustitución timbrado en ${mesTimbrado} pero el período que ampara es ${mesOperacion} — aplica procedimiento Ficha 325/CFF para aclarar diferencia con el SAT antes de que genere carta invitación`
      : 'Sustitución timbrada en el mismo período — sin desfase'
    : 'No es un CFDI de sustitución; no aplica desfase.';

  return {
    uuid: input.uuid,
    esSustitucion,
    uuidSustituido: String(input.uuidSustituido || '').trim(),
    mesTimbrado,
    mesOperacion,
    hayDesfase,
    nivel,
    mensaje,
    fundamento: FUNDAMENTO,
  };
}
