import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveSessionCache, loadSessionCache, clearSessionCache, getCacheAge } from '../hooks/useSessionCache';
import { appDB } from '../db/appDB';
import type { ValidationResult } from '../lib/cfdiEngine';

// P0-B: la caché de sesión ahora vive en IndexedDB (appDB.ts, store
// "sessionCache"), no en localStorage. Estas pruebas usan fake-indexeddb —
// no se usan datos fiscales reales.

function makeResult(uuid: string, xmlContentSizeKB = 20): ValidationResult {
  return {
    fileName: `${uuid}.xml`,
    uuid,
    xmlContent: 'X'.repeat(xmlContentSizeKB * 1024), // simula un XML real (no trivial)
    resultado: '🟢 USABLE',
    estatusSAT: 'Vigente',
  } as unknown as ValidationResult;
}

const COMPANY_A = 'EMP_A_000001';
const COMPANY_B = 'EMP_B_000002';

beforeEach(async () => {
  await clearSessionCache(COMPANY_A);
  await clearSessionCache(COMPANY_B);
});

describe('P0-B: saveSessionCache / loadSessionCache (IndexedDB)', () => {
  it('guarda y restaura un lote grande (2,351 resultados de tamaño realista) sin QuotaExceededError', async () => {
    const results = Array.from({ length: 2351 }, (_, i) => makeResult(`uuid-${i}`, 15));
    // ~2,351 * 15KB ≈ 35 MB de xmlContent — muy por encima de la cuota típica
    // de localStorage (~5-10 MB), pero cómodo para IndexedDB.
    const status = await saveSessionCache(COMPANY_A, results);
    expect(status).toBe('complete');

    const cached = await loadSessionCache(COMPANY_A);
    expect(cached).not.toBeNull();
    expect(cached!.results.length).toBe(2351);
    // xmlContent se conserva íntegro (necesario para reexportar tras restaurar)
    expect(cached!.results[0].xmlContent?.length).toBe(15 * 1024);
  });

  it('mantiene cachés independientes por empresa (sin contaminación cruzada)', async () => {
    await saveSessionCache(COMPANY_A, [makeResult('a-1')]);
    await saveSessionCache(COMPANY_B, [makeResult('b-1'), makeResult('b-2')]);

    const cachedA = await loadSessionCache(COMPANY_A);
    const cachedB = await loadSessionCache(COMPANY_B);

    expect(cachedA!.results.map(r => r.uuid)).toEqual(['a-1']);
    expect(cachedB!.results.map(r => r.uuid)).toEqual(['b-1', 'b-2']);
  });

  it('devuelve null si no hay caché para esa empresa', async () => {
    const cached = await loadSessionCache('EMPRESA_SIN_CACHE');
    expect(cached).toBeNull();
  });

  it('respeta el TTL de 30 minutos: una entrada expirada no se restaura y se limpia', async () => {
    await saveSessionCache(COMPANY_A, [makeResult('vieja-1')]);
    // Forzar timestamp expirado directamente en el store (más allá del TTL)
    const entry = await appDB.getSessionCache(COMPANY_A);
    await appDB.saveSessionCache({ ...entry!, timestamp: Date.now() - 31 * 60 * 1000 });

    const cached = await loadSessionCache(COMPANY_A);
    expect(cached).toBeNull();

    // Y quedó limpiada (no solo ignorada)
    const raw = await appDB.getSessionCache(COMPANY_A);
    expect(raw).toBeUndefined();
  });

  it('una entrada corrupta (forma inesperada) se descarta de forma segura, no revienta', async () => {
    // @ts-expect-error — forma corrupta deliberada para la prueba
    await appDB.saveSessionCache({ companyId: COMPANY_A, timestamp: Date.now(), results: 'no-es-un-arreglo', status: 'complete' });
    const cached = await loadSessionCache(COMPANY_A);
    expect(cached).toBeNull();
  });

  it('getCacheAge refleja los minutos transcurridos desde el guardado', async () => {
    await saveSessionCache(COMPANY_A, [makeResult('x')]);
    const age = await getCacheAge(COMPANY_A);
    expect(age).toBe(0);
  });

  it('clearSessionCache elimina solo la entrada de la empresa indicada', async () => {
    await saveSessionCache(COMPANY_A, [makeResult('a-1')]);
    await saveSessionCache(COMPANY_B, [makeResult('b-1')]);

    await clearSessionCache(COMPANY_A);

    expect(await loadSessionCache(COMPANY_A)).toBeNull();
    expect(await loadSessionCache(COMPANY_B)).not.toBeNull();
  });
});

describe('P0-B: una escritura fallida no borra la última sesión válida', () => {
  it('si saveSessionCache falla, la sesión previa sigue disponible intacta', async () => {
    await saveSessionCache(COMPANY_A, [makeResult('sesion-valida')]);

    // Simular fallo de la siguiente escritura (p.ej. cuota agotada)
    const putSpy = vi.spyOn(appDB, 'saveSessionCache').mockRejectedValueOnce(
      Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' })
    );

    const status = await saveSessionCache(COMPANY_A, [makeResult('sesion-nueva-que-falla')]);
    expect(status).toBe('quota_exceeded');
    putSpy.mockRestore();

    // La sesión anterior (válida) sigue intacta — nunca se borró antes de escribir.
    const cached = await loadSessionCache(COMPANY_A);
    expect(cached).not.toBeNull();
    expect(cached!.results.map(r => r.uuid)).toEqual(['sesion-valida']);
  });
});
