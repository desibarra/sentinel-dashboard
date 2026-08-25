import { describe, it, expect, afterEach } from 'vitest';
import { sentinelStageLog } from '../lib/stageLog';

// stageLog.ts es un hook de diagnóstico (Fase 4, memoria escalonada). Esta
// prueba demuestra las 4 condiciones bajo las cuales se decidió conservarlo:
// (1) nunca recibe RFC/UUID/XML/datos fiscales — ver grep de todos los call
//     sites en Dashboard.tsx/excelExporter.ts: solo contadores, nombres de
//     hoja estáticos y el nombre de archivo genérico de exportación;
// (2)+(3) es un no-op total (no expone ni acumula nada) cuando
//     window.__sentinelStageLog no existe — que es SIEMPRE el caso en
//     producción real, ya que solo un arnés de prueba externo lo crea.
describe('sentinelStageLog: no-op fuera de un arnés de diagnóstico', () => {
  afterEach(() => {
    // @ts-ignore
    delete (window as any).__sentinelStageLog;
  });

  it('no lanza y no crea ningún estado global cuando window.__sentinelStageLog no existe (caso de producción real)', () => {
    // @ts-ignore
    expect((window as any).__sentinelStageLog).toBeUndefined();
    expect(() => sentinelStageLog('cualquier_etapa', { total: 100 })).not.toThrow();
    // Sigue sin existir: no se creó como efecto secundario.
    // @ts-ignore
    expect((window as any).__sentinelStageLog).toBeUndefined();
  });

  it('solo escribe cuando un arnés externo pre-crea el arreglo, y solo con los campos pasados explícitamente (nunca RFC/UUID/XML)', () => {
    // @ts-ignore
    (window as any).__sentinelStageLog = [];
    sentinelStageLog('export_hoja', { sheet: 'Resumen', sheetIndex: 1, totalSheets: 24 });
    // @ts-ignore
    const log = (window as any).__sentinelStageLog;
    expect(log.length).toBe(1);
    expect(log[0].stage).toBe('export_hoja');
    expect(log[0].sheet).toBe('Resumen');
    expect(typeof log[0].t).toBe('number'); // performance.now(), no dato fiscal
    // Ningún campo del entry contiene forma de RFC (patrón AAAA######AAA) o UUID.
    const serialized = JSON.stringify(log[0]);
    expect(serialized).not.toMatch(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/); // RFC
    expect(serialized).not.toMatch(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i); // UUID
  });

  it('si el arnés no limpia el arreglo, las entradas se acumulan solo mientras ese arreglo exista (acotado a la sesión de diagnóstico, nunca en producción real)', () => {
    // @ts-ignore
    (window as any).__sentinelStageLog = [];
    for (let i = 0; i < 5; i++) sentinelStageLog('tick', { i });
    // @ts-ignore
    expect((window as any).__sentinelStageLog.length).toBe(5);
  });
});
