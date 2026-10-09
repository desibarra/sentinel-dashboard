// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBlacklistSync, extractOfficialDate, parseCsv, parseOfficial69B } from '../../../server/blacklistSync';

const header = (date: string) => `"Información actualizada al ${date}; los listados son de carácter público"\r\nNo,RFC,Nombre del Contribuyente,Situación del contribuyente,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p\r\n`;
const row = (i: number, situacion = 'Definitivo') =>
  `${i},AAA${String(100000 + i).slice(-6)}AB${i % 10},"EMPRESA ${i}, S.A. DE C.V.",${situacion},x,01/02/2020,x,03/04/2020,x,x,x,x,x,15/06/2021,x,x,x,x,x,x\r\n`;
const csv = (date: string, n = 1200) => header(date) + Array.from({ length: n }, (_, i) => row(i + 1)).join('');
const encode = (text: string) => new TextEncoder().encode(text);

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const setup = (responses: Record<string, string | Error>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sentinel-69b-'));
  dirs.push(dir);
  const bundledJsonPath = path.join(dir, 'bundled.json');
  writeFileSync(bundledJsonPath, JSON.stringify({ fechaOficial: '2025-06-30', registros: [{ rfc: 'AAA000001AB1', tipo: '69B', situacion: 'Definitivo' }] }));
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const scheme = url.split(':')[0];
    const body = responses[scheme];
    if (body instanceof Error || body === undefined) throw body ?? new Error('sin respuesta');
    return new Response(encode(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { sync: createBlacklistSync({ dataDir: path.join(dir, 'data'), bundledJsonPath, fetchImpl }), calls, dir };
};

describe('listado 69-B automático (servidor)', () => {
  it('lee CSV con comillas y la fecha oficial del encabezado', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
    expect(extractOfficialDate('Información actualizada al 31 de diciembre de 2025;')).toBe('2025-12-31');
    expect(extractOfficialDate('Información actualizada al 31 de febrero de 2025')).toBeNull();
  });

  it('rechaza listados incompletos, sin fecha o con fecha futura', () => {
    expect(() => parseOfficial69B(csv('31 de diciembre de 2025', 10))).toThrow(/al menos 1000/);
    expect(() => parseOfficial69B('sin encabezado\r\n' + row(1))).toThrow(/fecha oficial/);
    expect(() => parseOfficial69B(csv('31 de diciembre de 2099'), new Date('2026-10-09'))).toThrow(/futuro/);
    const parsed = parseOfficial69B(csv('31 de diciembre de 2025'));
    expect(parsed.registros).toHaveLength(1200);
    expect(parsed.registros[0]).toMatchObject({ situacion: 'Definitivo', fechaPublicacion: '2021-06-15', razonSocial: 'EMPRESA 1, S.A. DE C.V.' });
  });

  it('usa HTTP si HTTPS no responde, guarda la lista y la verificación, y no repite la descarga', async () => {
    const { sync, calls } = setup({ https: new Error('connect timeout'), http: csv('31 de diciembre de 2025') });
    expect(sync.getMeta()).toMatchObject({ fechaOficial: '2025-06-30', verificadoEl: null });
    const meta = await sync.checkIfStale();
    expect(meta).toMatchObject({ fechaOficial: '2025-12-31', registros: 1200, ultimoError: null });
    expect(meta.origen).toMatch(/^http:/);
    expect(meta.verificadoEl).toBeTruthy();
    expect(calls).toHaveLength(2);
    await sync.checkIfStale();
    expect(calls).toHaveLength(2);
  });

  it('conserva la copia anterior si la descarga falla o trae un corte más viejo', async () => {
    const ok = setup({ https: csv('31 de diciembre de 2025') });
    await ok.sync.check();
    const listPath = path.join(ok.dir, 'data', '69b.json');
    const before = readFileSync(listPath, 'utf8');

    const failing = createBlacklistSync({ dataDir: path.join(ok.dir, 'data'), bundledJsonPath: path.join(ok.dir, 'bundled.json'),
      fetchImpl: (async () => { throw new Error('sin red'); }) as unknown as typeof fetch });
    expect((await failing.check()).ultimoError).toMatch(/sin red/);
    const older = createBlacklistSync({ dataDir: path.join(ok.dir, 'data'), bundledJsonPath: path.join(ok.dir, 'bundled.json'),
      fetchImpl: (async () => new Response(encode(csv('30 de junio de 2025')))) as unknown as typeof fetch });
    expect((await older.check()).ultimoError).toMatch(/anterior al vigente/);
    expect(readFileSync(listPath, 'utf8')).toBe(before);
    expect(failing.getMeta().fechaOficial).toBe('2025-12-31');
  });

  it('sin descarga previa sirve la lista incluida en la aplicación', () => {
    const { sync, dir } = setup({});
    expect(existsSync(path.join(dir, 'data', '69b.json'))).toBe(false);
    expect(sync.getMeta()).toMatchObject({ fechaOficial: '2025-06-30', origen: 'incluida en la aplicación', registros: 1 });
  });
});
