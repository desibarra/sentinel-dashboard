// Diagnóstico de memoria escalonado (Fase 4). Hook de logging INERTE:
// no hace nada a menos que un arnés de prueba externo (Playwright) haya
// pre-creado window.__sentinelStageLog como arreglo ANTES de cargar la app
// (via addInitScript). En uso normal de producción, window.__sentinelStageLog
// nunca existe, por lo que esta función es un no-op de costo mínimo (un solo
// chequeo `typeof`/`Array.isArray`). No altera resultados fiscales ni el
// flujo de control de ninguna pantalla.
export function sentinelStageLog(stage: string, extra?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && Array.isArray((window as any).__sentinelStageLog)) {
    (window as any).__sentinelStageLog.push({ stage, t: performance.now(), ...extra });
  }
}
