import { describe, it, expect } from 'vitest';
import { combinarResultadoFinal, type EstatusSAT, type Hallazgo69B, type ClasificacionEstructural } from '../hooks/useXMLValidator';

// classifyBySATStatus() fue reemplazada por combinarResultadoFinal(): una
// función pura de PRECEDENCIA que recibe el hallazgo 69-B y el estatus SAT
// como señales YA evaluadas por separado, y decide el resultado final en un
// solo paso — sin mutación secuencial (ver la nota extensa en
// useXMLValidator.ts). Esta prueba cubre la matriz completa pedida.

const estructuralUsable: ClasificacionEstructural = {
  resultado: '🟢 USABLE',
  comentarioFiscal: 'comentario motor',
  nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
  score: 100,
};

const sin69B: Hallazgo69B = { severidad: 'NINGUNO', texto: '' };
const definitivo69B: Hallazgo69B = { severidad: 'DEFINITIVO', texto: '[CRÍTICO — 69-B DEFINITIVO] RFC Emisor publicado como DEFINITIVO...' };
const presunto69B: Hallazgo69B = { severidad: 'ALERTA', texto: '[ADVERTENCIA — 69-B PRESUNTO] RFC Emisor figura como PRESUNTO...' };
const multiestado69B: Hallazgo69B = { severidad: 'ALERTA', texto: '[ADVERTENCIA — 69-B SITUACIÓN MÚLTIPLE] ...' };
const sentenciaFavorable69B: Hallazgo69B = { severidad: 'INFO', texto: '[INFO — 69-B] RFC Emisor cuenta con sentencia favorable...' };
const desvirtuado69B: Hallazgo69B = { severidad: 'INFO', texto: '[INFO — 69-B] RFC Emisor estuvo en lista 69-B pero aclaró su situación (Desvirtuado)...' };

const SAT_VIGENTE: EstatusSAT = 'Vigente';
const SAT_CANCELADO: EstatusSAT = 'Cancelado';
const SAT_NO_ENCONTRADO: EstatusSAT = 'No Encontrado';
const SAT_ERROR: EstatusSAT = 'Error Conexión';
const SAT_NO_VERIFICADO: EstatusSAT = 'No verificado';

describe('combinarResultadoFinal — matriz completa de precedencia SAT × 69-B', () => {
  it('1. Error SAT + Definitivo → NO USABLE; el estatus SAT en sí sigue siendo "no validado" (dimensiones separadas)', () => {
    const r = combinarResultadoFinal(estructuralUsable, definitivo69B, SAT_ERROR);
    expect(r.resultado).toBe('🔴 NO USABLE');
    expect(r.nivelValidacion).toBe('ERROR');
    expect(r.comentarioFiscal).toContain('69-B DEFINITIVO');
  });

  it('2. Error SAT + Presunto → ALERTA', () => {
    const r = combinarResultadoFinal(estructuralUsable, presunto69B, SAT_ERROR);
    expect(r.resultado).toBe('🟡 ALERTA');
    expect(r.nivelValidacion).toBe('ALERTA');
    expect(r.comentarioFiscal).toContain('69-B PRESUNTO');
  });

  it('2b. Error SAT + situación múltiple → ALERTA (misma regla que Presunto)', () => {
    const r = combinarResultadoFinal(estructuralUsable, multiestado69B, SAT_NO_VERIFICADO);
    expect(r.resultado).toBe('🟡 ALERTA');
  });

  it('3. Error SAT + Sentencia Favorable → No validado SAT (INFO no eleva ni limpia un SAT no confirmado)', () => {
    const r = combinarResultadoFinal(estructuralUsable, sentenciaFavorable69B, SAT_ERROR);
    expect(r.resultado).toBe('No validado SAT');
    expect(r.comentarioFiscal).toContain('sentencia favorable');
  });

  it('3b. Error SAT + Desvirtuado → No validado SAT (misma regla que Sentencia Favorable)', () => {
    const r = combinarResultadoFinal(estructuralUsable, desvirtuado69B, SAT_NO_ENCONTRADO);
    expect(r.resultado).toBe('No validado SAT');
  });

  it('4. Vigente + Definitivo → NO USABLE', () => {
    const r = combinarResultadoFinal(estructuralUsable, definitivo69B, SAT_VIGENTE);
    expect(r.resultado).toBe('🔴 NO USABLE');
  });

  it('5. Vigente + Presunto → ALERTA', () => {
    const r = combinarResultadoFinal(estructuralUsable, presunto69B, SAT_VIGENTE);
    expect(r.resultado).toBe('🟡 ALERTA');
  });

  it('6. Cancelado + cualquier 69-B → NO USABLE (prioridad crítica de SAT, independiente de 69-B)', () => {
    for (const hallazgo of [sin69B, definitivo69B, presunto69B, sentenciaFavorable69B]) {
      const r = combinarResultadoFinal(estructuralUsable, hallazgo, SAT_CANCELADO, 'Cancelado con aceptación');
      expect(r.resultado).toBe('🔴 NO USABLE');
      expect(r.nivelValidacion).toBe('ERROR');
      expect(r.score).toBe(0);
      expect(r.comentarioFiscal).toContain('CANCELADO');
    }
  });

  it('7. Vigente + sin coincidencia → resultado estructural normal', () => {
    const r = combinarResultadoFinal(estructuralUsable, sin69B, SAT_VIGENTE);
    expect(r.resultado).toBe('🟢 USABLE');
    expect(r.comentarioFiscal).toBe('comentario motor');
  });

  it('8. Error SAT + sin coincidencia → No validado SAT', () => {
    const r = combinarResultadoFinal(estructuralUsable, sin69B, SAT_ERROR);
    expect(r.resultado).toBe('No validado SAT');
    expect(r.resultado).not.toContain('🟢');
  });

  it('nunca muestra USABLE cuando el SAT no fue validado, sin importar el hallazgo 69-B', () => {
    for (const satStatus of [SAT_ERROR, SAT_NO_ENCONTRADO, SAT_NO_VERIFICADO]) {
      for (const hallazgo of [sin69B, sentenciaFavorable69B, desvirtuado69B]) {
        const r = combinarResultadoFinal(estructuralUsable, hallazgo, satStatus);
        expect(r.resultado).not.toBe('🟢 USABLE');
      }
    }
  });

  it('el comentario nunca duplica el texto estructural (comentarioMotor aparece una sola vez)', () => {
    const casos: Array<[Hallazgo69B, EstatusSAT]> = [
      [definitivo69B, SAT_VIGENTE], [presunto69B, SAT_ERROR], [sin69B, SAT_CANCELADO], [sin69B, SAT_VIGENTE],
    ];
    for (const [hallazgo, satStatus] of casos) {
      const r = combinarResultadoFinal(estructuralUsable, hallazgo, satStatus, 'motivo');
      const ocurrencias = r.comentarioFiscal.split('comentario motor').length - 1;
      expect(ocurrencias).toBe(1);
    }
  });

  it('contadores: de los 5 estatus SAT posibles sin hallazgo 69-B, solo Vigente es USABLE, Cancelado es NO USABLE, y los 3 restantes son "No validado SAT"', () => {
    const estados: EstatusSAT[] = [SAT_VIGENTE, SAT_CANCELADO, SAT_ERROR, SAT_NO_ENCONTRADO, SAT_NO_VERIFICADO];
    const resultados = estados.map(e => combinarResultadoFinal(estructuralUsable, sin69B, e).resultado);

    const usables = resultados.filter(r => r.includes('🟢')).length;
    const alertas = resultados.filter(r => r.includes('🟡')).length;
    const noUsable = resultados.filter(r => r.includes('🔴')).length;
    const noValidadosSAT = resultados.filter(r => r === 'No validado SAT').length;

    expect(usables).toBe(1);
    expect(alertas).toBe(0);
    expect(noUsable).toBe(1);
    expect(noValidadosSAT).toBe(3);
  });

  it('reintento SAT: Error → Vigente cambia el resultado de "No validado SAT" a estructural, sin arrastrar estado previo (función pura, sin memoria)', () => {
    const primerResultado = combinarResultadoFinal(estructuralUsable, sin69B, SAT_ERROR);
    expect(primerResultado.resultado).toBe('No validado SAT');

    const trasReintento = combinarResultadoFinal(estructuralUsable, sin69B, SAT_VIGENTE);
    expect(trasReintento.resultado).toBe('🟢 USABLE');
  });
});
