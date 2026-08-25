import { describe, it, expect, vi } from 'vitest';
import { SatQueue, SatRetryableError, satQueue, DEFAULT_SAT_QUEUE_CONFIG } from '../lib/satQueue';

// P0-C: pruebas de la cola SAT con mocks — NUNCA se consulta el SAT real.

describe('SatQueue — concurrencia acotada', () => {
  it('nunca ejecuta más tareas simultáneas que la concurrencia configurada', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 0 });
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 30 }, () => () =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
        return 'ok';
      })
    );
    await Promise.all(tasks.map(t => t()));
    expect(maxActive).toBeLessThanOrEqual(5);
    expect(maxActive).toBeGreaterThan(1); // confirma que sí hubo concurrencia real, no serializado a 1
  });

  it('el default de producción (DEFAULT_SAT_QUEUE_CONFIG.concurrency=5) nunca se excede en la cola compartida "satQueue"', async () => {
    expect(DEFAULT_SAT_QUEUE_CONFIG.concurrency).toBe(5);
    const originalConfig = satQueue.getConfig();
    satQueue.configure({ ...DEFAULT_SAT_QUEUE_CONFIG }); // asegura el default exacto, sin restos de otra prueba
    try {
      let active = 0;
      let maxActive = 0;
      const tasks = Array.from({ length: 40 }, () => () =>
        satQueue.run(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise(r => setTimeout(r, 10));
          active--;
          return 'ok';
        })
      );
      await Promise.all(tasks.map(t => t()));
      expect(maxActive).toBeLessThanOrEqual(DEFAULT_SAT_QUEUE_CONFIG.concurrency);
      expect(maxActive).toBeGreaterThan(1);
    } finally {
      satQueue.configure(originalConfig);
    }
  });

  it('respeta una concurrencia configurada distinta (2)', async () => {
    const queue = new SatQueue({ concurrency: 2, timeoutMs: 5000, maxRetries: 0 });
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 10 }, () => () =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 5));
        active--;
      })
    );
    await Promise.all(tasks.map(t => t()));
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe('SatQueue — reintentos y clasificación de errores', () => {
  it('reintenta ante timeout (respeta el timeoutMs configurado, no el 5s anterior)', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 30, maxRetries: 2, baseBackoffMs: 5 });
    let calls = 0;
    const result = await queue.run(async () => {
      calls++;
      if (calls < 3) {
        await new Promise(r => setTimeout(r, 100)); // más lento que timeoutMs -> dispara el timeout de la cola
      }
      return 'ok-eventual';
    });
    expect(result).toBe('ok-eventual');
    expect(calls).toBe(3); // 1 intento inicial + 2 reintentos
  });

  it('reintenta ante 429 y ante 5xx con backoff', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 2, baseBackoffMs: 5 });
    let calls = 0;
    const result = await queue.run(async () => {
      calls++;
      if (calls === 1) throw new SatRetryableError('http_429', '429', 429);
      if (calls === 2) throw new SatRetryableError('http_5xx', '503', 503);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('reintenta ante fallas de red transitorias', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 1, baseBackoffMs: 5 });
    let calls = 0;
    const result = await queue.run(async () => {
      calls++;
      if (calls === 1) throw new SatRetryableError('network', 'fetch failed');
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  it('agota los reintentos configurados y luego propaga el error (nunca reintenta indefinidamente)', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 20, maxRetries: 2, baseBackoffMs: 5 });
    let calls = 0;
    await expect(
      queue.run(async () => {
        calls++;
        throw new SatRetryableError('timeout', 'siempre falla');
      })
    ).rejects.toThrow();
    expect(calls).toBe(3); // 1 + 2 reintentos, nunca más
  });

  it('NO reintenta un error no marcado como transitorio (p.ej. 401/403 -> Error simple)', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 2, baseBackoffMs: 5 });
    let calls = 0;
    await expect(
      queue.run(async () => {
        calls++;
        throw new Error('Acceso denegado (HTTP 401)');
      })
    ).rejects.toThrow('Acceso denegado');
    expect(calls).toBe(1); // ni un solo reintento
  });

  it('un resultado definitivo (Vigente/Cancelado/No Encontrado) se resuelve en el primer intento, sin reintentar', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 2, baseBackoffMs: 5 });
    let calls = 0;
    const result = await queue.run(
      async () => { calls++; return { estado: 'Cancelado' }; },
      (v) => (v.estado === 'Cancelado' ? 'cancelado' : 'vigente')
    );
    expect(result.estado).toBe('Cancelado');
    expect(calls).toBe(1);
  });
});

describe('SatQueue — contadores en vivo', () => {
  it('lleva la cuenta de procesados, vigentes, cancelados, no encontrados y reintentos', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 2, baseBackoffMs: 5 });
    queue.resetCounts(3);

    await queue.run(async () => ({ estado: 'Vigente' }), (v: any) => (v.estado === 'Vigente' ? 'vigente' : 'timeout_o_error'));
    await queue.run(async () => ({ estado: 'Cancelado' }), (v: any) => (v.estado === 'Cancelado' ? 'cancelado' : 'timeout_o_error'));

    let attempt = 0;
    await queue.run(async () => {
      attempt++;
      if (attempt === 1) throw new SatRetryableError('timeout', 'x');
      return { estado: 'No Encontrado' };
    }, (v: any) => (v.estado === 'No Encontrado' ? 'no_encontrado' : 'timeout_o_error'));

    const counts = queue.getCounts();
    expect(counts.processed).toBe(3);
    expect(counts.vigentes).toBe(1);
    expect(counts.cancelados).toBe(1);
    expect(counts.noEncontrados).toBe(1);
    expect(counts.reintentos).toBe(1);
  });

  it('notifica a los listeners suscritos en cada cambio de contador', async () => {
    const queue = new SatQueue({ concurrency: 5, timeoutMs: 5000, maxRetries: 0 });
    queue.resetCounts(1);
    const seen: number[] = [];
    const unsubscribe = queue.onCountsChange(c => seen.push(c.processed));
    await queue.run(async () => ({ estado: 'Vigente' }));
    unsubscribe();
    expect(seen[seen.length - 1]).toBe(1);
  });
});
