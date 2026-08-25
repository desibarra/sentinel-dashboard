/**
 * satQueue
 * --------
 * P0-C: cola de concurrencia acotada para consultas al SAT, con reintentos
 * controlados y contadores de progreso en vivo.
 *
 * Antes, useXMLValidator.ts disparaba hasta 20 consultas SAT concurrentes
 * por lote (una por cada XML del lote, sin límite propio para la fase SAT) —
 * la misma concurrencia usada para el trabajo local de CPU. La evidencia real
 * (múltiples "Timeout SAT" con 2,351 XML) demostró que eso es excesivo para
 * el servicio del SAT bajo carga sostenida.
 *
 * Este módulo desacopla la concurrencia de la consulta SAT (por defecto 5,
 * configurable) de la concurrencia del motor local — el resto del pipeline
 * (parseo, 69-B, reglas fiscales) sigue en lotes de 20 sin cambios; solo la
 * llamada de red al SAT pasa por esta cola.
 *
 * No se realizan pruebas masivas contra el SAT real desde este módulo ni
 * desde sus pruebas — la cola es agnóstica del transporte: recibe una
 * función de trabajo y decide cuándo ejecutarla y si reintentarla según el
 * tipo de error que lance.
 */

export type SatRetryKind = 'timeout' | 'http_429' | 'http_5xx' | 'network';

/** Error tipado para fallas transitorias — únicas elegibles para reintento. */
export class SatRetryableError extends Error {
  kind: SatRetryKind;
  status?: number;
  constructor(kind: SatRetryKind, message: string, status?: number) {
    super(message);
    this.name = 'SatRetryableError';
    this.kind = kind;
    this.status = status;
  }
}

export interface SatQueueConfig {
  concurrency: number; // consultas SAT simultáneas — default 5, conservador y configurable
  timeoutMs: number; // timeout por intento — default 12s (antes: 5s fijo, causa confirmada de timeouts reales)
  maxRetries: number; // reintentos máximos ante falla transitoria — default 2
  baseBackoffMs: number; // backoff exponencial base — default 800ms
}

export const DEFAULT_SAT_QUEUE_CONFIG: SatQueueConfig = {
  concurrency: 5,
  timeoutMs: 12000,
  maxRetries: 2,
  baseBackoffMs: 800,
};

export interface SatQueueCounts {
  total: number;
  processed: number;
  pending: number;
  vigentes: number;
  cancelados: number;
  noEncontrados: number;
  timeoutOrError: number;
  reintentos: number;
}

export type SatOutcomeKind = 'vigente' | 'cancelado' | 'no_encontrado' | 'timeout_o_error';
export type SatCountsListener = (counts: Readonly<SatQueueCounts>) => void;

function freshCounts(): SatQueueCounts {
  return { total: 0, processed: 0, pending: 0, vigentes: 0, cancelados: 0, noEncontrados: 0, timeoutOrError: 0, reintentos: 0 };
}

function jitter(ms: number): number {
  // +/- 30% de jitter para evitar que reintentos de varios archivos del mismo
  // lote se sincronicen y vuelvan a golpear al SAT todos en el mismo instante.
  const delta = ms * 0.3;
  return Math.round(ms - delta + Math.random() * delta * 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new SatRetryableError('timeout', `Timeout SAT (${ms}ms)`)), ms)),
  ]);
}

/**
 * Cola de concurrencia acotada con reintentos. Un solo semáforo compartido
 * por todas las llamadas que pasen por run() — así 2,351 archivos entrando
 * "a la vez" al paso de validación nunca generan más de `concurrency`
 * consultas SAT reales simultáneas.
 */
export class SatQueue {
  private config: SatQueueConfig;
  private activeCount = 0;
  private waiters: Array<() => void> = [];
  private counts: SatQueueCounts = freshCounts();
  private listeners = new Set<SatCountsListener>();

  constructor(config: Partial<SatQueueConfig> = {}) {
    this.config = { ...DEFAULT_SAT_QUEUE_CONFIG, ...config };
  }

  configure(partial: Partial<SatQueueConfig>) {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): Readonly<SatQueueConfig> {
    return this.config;
  }

  getCounts(): Readonly<SatQueueCounts> {
    return this.counts;
  }

  resetCounts(total = 0) {
    this.counts = { ...freshCounts(), total, pending: total };
    this.emit();
  }

  onCountsChange(listener: SatCountsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    Array.from(this.listeners).forEach(l => l({ ...this.counts }));
  }

  private async acquire(): Promise<void> {
    if (this.activeCount < this.config.concurrency) {
      this.activeCount++;
      return;
    }
    return new Promise(resolve => {
      this.waiters.push(() => {
        this.activeCount++;
        resolve();
      });
    });
  }

  private release() {
    this.activeCount--;
    const next = this.waiters.shift();
    if (next) next();
  }

  /**
   * Ejecuta `task` respetando el límite de concurrencia, con reintentos
   * automáticos (backoff exponencial + jitter) SOLO para SatRetryableError
   * (timeout, 429, 5xx, fallo de red transitorio). Cualquier otro resultado
   * — incluida una respuesta definitiva como Vigente/Cancelado/No Encontrado,
   * o un error no marcado como reintentable — se resuelve en el primer intento.
   *
   * `classify` (opcional) recibe el valor resuelto y devuelve el tipo de
   * resultado para actualizar los contadores en vivo; si no se provee, el
   * resultado se cuenta como "vigente" a efectos de progreso (no bloquea
   * la clasificación fiscal real, que ocurre fuera de esta cola).
   */
  async run<T>(task: () => Promise<T>, classify?: (value: T) => SatOutcomeKind): Promise<T> {
    await this.acquire();
    try {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const value = await withTimeout(task(), this.config.timeoutMs);
          this.counts.processed++;
          this.counts.pending = Math.max(0, this.counts.pending - 1);
          const kind = classify ? classify(value) : 'vigente';
          if (kind === 'vigente') this.counts.vigentes++;
          else if (kind === 'cancelado') this.counts.cancelados++;
          else if (kind === 'no_encontrado') this.counts.noEncontrados++;
          else this.counts.timeoutOrError++;
          this.emit();
          return value;
        } catch (err) {
          const retryable = err instanceof SatRetryableError;
          if (retryable && attempt < this.config.maxRetries) {
            attempt++;
            this.counts.reintentos++;
            this.emit();
            await sleep(jitter(this.config.baseBackoffMs * Math.pow(2, attempt - 1)));
            continue;
          }
          this.counts.processed++;
          this.counts.pending = Math.max(0, this.counts.pending - 1);
          this.counts.timeoutOrError++;
          this.emit();
          throw err;
        }
      }
    } finally {
      this.release();
    }
  }
}

// Instancia compartida por toda la app — una sola cola real gobierna cuántas
// consultas SAT concurrentes salen del navegador en un momento dado,
// independientemente de cuántos lotes/componentes la usen a la vez.
export const satQueue = new SatQueue();
