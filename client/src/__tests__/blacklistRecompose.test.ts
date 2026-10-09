import { describe, it, expect, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import * as XLSX from 'xlsx';
import { getMetadata, replaceBlacklistRecordsBulk, updateMetadata } from '../db/blacklistDB';
import { sincronizarListado69B } from '../utils/blacklist69BLoader';
import { recomponerResultado, refrescarCruce69B } from '../lib/recomposeResult';
import { revalidarFilaSAT } from '../pages/Dashboard';
import { buildMainReportWorkbook } from '../lib/excelExporter';
import type { ValidationResult } from '../lib/cfdiEngine';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const row = (props: Partial<ValidationResult> = {}) => ({
  uuid: '00000000-0000-4000-8000-000000000501', fileName: 'a.xml', tipoCFDI: 'I', direccionCFDI: 'RECIBIDO',
  rfcEmisor: 'BAD010101AB1', rfcReceptor: 'EMP010101EMP', fechaEmision: '2026-07-01', moneda: 'MXN', tipoCambio: 1, total: 116, subtotal: 100,
  ivaTraslado: 16, estatusSAT: 'Error Conexión', resultado: 'No validado SAT', comentarioFiscal: 'No validado: … CFDI válido.',
  resultadoMotor: '🟢 USABLE', comentarioMotor: 'CFDI válido.', nivelValidacion: 'NO VALIDADO', nivelValidacionMotor: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO',
  scoreInformativo: 90, esNomina: 'NO', ...props,
} as unknown as ValidationResult);
const definitivo = { rfc: 'BAD010101AB1', isEFOS: false, is69B: true, found: true, notSynced: false, situacion: 'Definitivo', fechaCorte: '2025-12-31' };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('semáforo SAT × 69-B al revalidar o actualizar la lista', () => {
  it('revalidar el SAT como Vigente no borra un 69-B definitivo', () => {
    const revalidada = revalidarFilaSAT(row({ rfcEmisorBlacklist: definitivo }), { estado: 'Vigente', esCancelable: '', estatusCancelacion: '', codigoEstatus: '', validatedAt: new Date() } as any, '', 'EMP010101EMP');
    expect(revalidada.estatusSAT).toBe('Vigente');
    expect(revalidada.resultado).toBe('🔴 NO USABLE');
    expect(revalidada.comentarioFiscal).toContain('69-B DEFINITIVO');
  });

  it('sin hallazgo 69-B, SAT vigente devuelve la clasificación del motor y es idempotente', () => {
    const once = recomponerResultado(row(), { estatusSAT: 'Vigente' });
    expect(once).toMatchObject({ resultado: '🟢 USABLE', comentarioFiscal: 'CFDI válido.', nivelValidacion: 'ESTRUCTURAL, SAT, NEGOCIO, RIESGO' });
    expect(recomponerResultado(once, { estatusSAT: 'Vigente' })).toEqual(once);
  });

  it('el cruce se rehace con la lista vigente del dispositivo', async () => {
    await replaceBlacklistRecordsBulk([{ rfc: 'BAD010101AB1', tipo: '69B', situacion: 'Presunto' }]);
    await updateMetadata({ key: 'lastUpdate', cargadoEl: new Date().toISOString(), fechaOficial: '2025-12-31', verificadoEl: '2026-10-09T00:00:00Z', efosCount: 0, list69BCount: 1, totalRFC: 1, presuntos: 1, definitivos: 0, desvirtuados: 0, sentenciaFavorable: 0 });
    const [refrescada] = await refrescarCruce69B([row({ estatusSAT: 'Vigente', resultado: '🟢 USABLE' })]);
    expect(refrescada.resultado).toBe('🟡 ALERTA');
    expect(refrescada.rfcEmisorBlacklist).toMatchObject({ found: true, fechaCorte: '2025-12-31', listaVerificadaEl: '2026-10-09T00:00:00Z' });
  });
});

describe('sincronización automática del listado 69-B en el navegador', () => {
  it('recarga cuando el servidor tiene un corte nuevo y solo actualiza la verificación si el corte es el mismo', async () => {
    await updateMetadata({ key: 'lastUpdate', cargadoEl: '2026-01-01T00:00:00Z', fechaOficial: '2025-06-30', efosCount: 0, list69BCount: 1, totalRFC: 1, presuntos: 0, definitivos: 1, desvirtuados: 0, sentenciaFavorable: 0 });
    let meta = { fechaOficial: '2025-12-31', verificadoEl: '2026-10-09T01:00:00Z' };
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/meta') ? json(meta)
      : json({ fechaOficial: '2025-12-31', registros: [{ rfc: 'NEW010101AB1', situacion: 'Definitivo' }, { rfc: 'mal', situacion: 'x' }] }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await sincronizarListado69B()).cambio).toBe(true);
    expect(await getMetadata()).toMatchObject({ fechaOficial: '2025-12-31', verificadoEl: '2026-10-09T01:00:00Z', list69BCount: 1, definitivos: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/blacklist/69b', expect.anything());

    fetchMock.mockClear();
    meta = { fechaOficial: '2025-12-31', verificadoEl: '2026-10-10T01:00:00Z' };
    expect((await sincronizarListado69B()).cambio).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getMetadata())?.verificadoEl).toBe('2026-10-10T01:00:00Z');

    fetchMock.mockClear();
    expect((await sincronizarListado69B()).cambio).toBe(false);
  });
});

describe('reporte: lista 69-B con corte viejo pero verificada contra el SAT', () => {
  it('es concluyente si se verificó en los últimos 7 días', async () => {
    const verificada = { rfc: 'PRO010101PRO', isEFOS: false, is69B: false, found: false, notSynced: false, fechaCorte: '2025-12-31', listaVerificadaEl: new Date().toISOString() };
    const wb = await buildMainReportWorkbook([row({ estatusSAT: 'Vigente', resultado: '🟢 USABLE', rfcEmisor: 'PRO010101PRO', rfcEmisorBlacklist: verificada, rfcReceptorBlacklist: verificada })], { rfc: 'EMP010101EMP' });
    const resumen = XLSX.utils.sheet_to_json<any>(wb.Sheets['Resumen']);
    const valor = (k: string) => resumen.find(r => r.Indicador === k)?.Valor;
    expect(String(valor('Antigüedad de lista 69-B'))).toMatch(/^VIGENTE: es la publicación más reciente del SAT/);
    expect(valor('Cruces 69-B sin coincidencia (lista cargada)')).toBe(2);
    expect(XLSX.utils.sheet_to_json<any>(wb.Sheets['69-B - EFOS'])[0].Coincidencia).toBe('Sin coincidencias');
  });
});
