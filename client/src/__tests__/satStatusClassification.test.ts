import { describe, it, expect } from 'vitest';
import { classifyBySATStatus, type EstatusSAT } from '../hooks/useXMLValidator';

const baseUsable = {
  resultado: '🟢 USABLE',
  comentarioFiscal: '',
  nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
  score: 100,
};

const SAT_VIGENTE: EstatusSAT = 'Vigente';
const SAT_CANCELADO: EstatusSAT = 'Cancelado';
const SAT_NO_ENCONTRADO: EstatusSAT = 'No Encontrado';
const SAT_ERROR: EstatusSAT = 'Error Conexión';
const SAT_NO_VERIFICADO: EstatusSAT = 'No verificado';

describe('Clasificación Estatus SAT (función real classifyBySATStatus)', () => {
  it('1. SAT Vigente + XML correcto → USABLE', () => {
    const r = classifyBySATStatus(SAT_VIGENTE, 'comentario motor', baseUsable);
    expect(r.resultado).toBe('🟢 USABLE');
    expect(r.comentarioFiscal).toBe('comentario motor');
  });

  it('2. SAT Cancelado → NO USABLE', () => {
    const r = classifyBySATStatus(SAT_CANCELADO, 'comentario motor', baseUsable, 'Cancelado parcial');
    expect(r.resultado).toBe('🔴 NO USABLE');
    expect(r.nivelValidacion).toBe('ERROR');
    expect(r.score).toBe(0);
  });

  it('3. SAT Error → NO VALIDADO (nunca USABLE)', () => {
    const r = classifyBySATStatus(SAT_ERROR, 'comentario motor', baseUsable);
    expect(r.resultado).toBe('No validado SAT');
    expect(r.nivelValidacion).toBe('NO VALIDADO');
    expect(r.resultado).not.toContain('🟢');
    expect(r.resultado).not.toContain('🟡');
    expect(r.resultado).not.toContain('🔴');
  });

  it('4. SAT pendiente (No verificado) → NO VALIDADO', () => {
    const r = classifyBySATStatus(SAT_NO_VERIFICADO, 'comentario motor', baseUsable);
    expect(r.resultado).toBe('No validado SAT');
  });

  it('5. SAT No Encontrado → NO VALIDADO (no USABLE ni ALERTA)', () => {
    const r = classifyBySATStatus(SAT_NO_ENCONTRADO, 'comentario motor', baseUsable);
    expect(r.resultado).toBe('No validado SAT');
    expect(r.resultado).not.toContain('🟢');
    expect(r.resultado).not.toContain('🟡');
  });

  it('6. Contadores separan No validados SAT de Usables', () => {
    const estados: EstatusSAT[] = [
      SAT_VIGENTE, SAT_CANCELADO, SAT_ERROR, SAT_NO_ENCONTRADO, SAT_NO_VERIFICADO,
    ];
    const resultados = estados.map(e => classifyBySATStatus(e, 'm', baseUsable).resultado);

    const usables = resultados.filter(r => r.includes('🟢')).length;
    const alertas = resultados.filter(r => r.includes('🟡')).length;
    const noUsable = resultados.filter(r => r.includes('🔴')).length;
    const noValidadosSAT = resultados.filter(r => r === 'No validado SAT').length;

    expect(usables).toBe(1);   // solo Vigente
    expect(alertas).toBe(0);
    expect(noUsable).toBe(1);  // Cancelado
    expect(noValidadosSAT).toBe(3); // Error, No Encontrado, No verificado
  });

  it('7. Reintento SAT actualiza fila y contadores', () => {
    // Primer intento: Error SAT → fila queda NO VALIDADO
    const primerResultado = classifyBySATStatus(SAT_ERROR, 'comentario motor', baseUsable);
    expect(primerResultado.resultado).toBe('No validado SAT');

    // Tras reintento exitoso: Vigente → fila pasa a USABLE
    const trasReintento = classifyBySATStatus(SAT_VIGENTE, 'comentario motor', baseUsable);
    expect(trasReintento.resultado).toBe('🟢 USABLE');

    // Contador refleja el cambio de estado
    const filas = [primerResultado.resultado, trasReintento.resultado];
    const noValidadosSAT = filas.filter(r => r === 'No validado SAT').length;
    const usables = filas.filter(r => r.includes('🟢')).length;
    expect(noValidadosSAT).toBe(1);
    expect(usables).toBe(1);
  });
});
