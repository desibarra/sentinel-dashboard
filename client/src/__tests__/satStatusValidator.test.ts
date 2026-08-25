import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkCFDIStatusSAT } from '../utils/satStatusValidator';
import { satQueue } from '../lib/satQueue';

// P0-C: pruebas con fetch mockeado — NUNCA se consulta el SAT real.
// Se reconfigura la cola compartida a timeouts/backoff cortos solo para que
// las pruebas corran rápido; la concurrencia (5) y el límite de reintentos
// (2) se mantienen iguales a producción.

const originalConfig = satQueue.getConfig();

beforeEach(() => {
  satQueue.configure({ timeoutMs: 200, baseBackoffMs: 5, maxRetries: 2, concurrency: 5 });
});

afterEach(() => {
  satQueue.configure(originalConfig);
  vi.restoreAllMocks();
});

function xmlResponse(estado: string) {
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"><a:Estado>${estado}</a:Estado><a:EsCancelable>Cancelable sin aceptación</a:EsCancelable><a:EstatusCancelacion></a:EstatusCancelacion></ConsultaResult></ConsultaResponse></s:Body></s:Envelope>`;
}

function okXmlResponse(estado: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/xml' },
    text: async () => xmlResponse(estado),
    json: async () => ({}),
  } as any;
}

describe('checkCFDIStatusSAT — clasificación de reintentos (mock, sin red real)', () => {
  it('Vigente se resuelve en la primera llamada, sin reintentos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okXmlResponse('Vigente'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-1', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Vigente');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Cancelado se resuelve en la primera llamada, sin reintentos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okXmlResponse('Cancelado'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-2', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Cancelado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('una respuesta HTTP 500 se reintenta (hasta 2 veces) y puede recuperarse', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => '' }, json: async () => ({}) })
      .mockResolvedValueOnce(okXmlResponse('Vigente'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-3', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Vigente');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 429 se reintenta con backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => '' }, json: async () => ({}) })
      .mockResolvedValueOnce(okXmlResponse('Vigente'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-4', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Vigente');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un fallo de red (fetch rechaza) se reintenta como transitorio', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okXmlResponse('No Encontrado'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-5', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('No Encontrado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 401 NO se reintenta (no es transitorio) y cae a "Error Conexión" en un solo intento', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Token inválido' }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-6', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Error Conexión');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tras agotar los reintentos (fallas persistentes), el resultado final es "Error Conexión" — nunca "Vigente"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: { get: () => '' }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-7', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Error Conexión');
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos, nunca más
  });

  it('un timeout persistente también cae a "Error Conexión" respetando el máximo de reintentos', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => { /* nunca resuelve -> siempre dispara el timeout de la cola */ }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-8', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('Error Conexión');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10000);

  it('"No Encontrado" (respuesta directa, sin fallo previo) se resuelve en un solo intento — es definitivo, no transitorio', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okXmlResponse('No Encontrado'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCFDIStatusSAT('uuid-9', 'EMI010101EMI', 'REC010101REC', 100);

    expect(result.estado).toBe('No Encontrado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Vigente/Cancelado/No Encontrado nunca se reintentan (definitivos); solo timeout/429/5xx/red sí', async () => {
    for (const estado of ['Vigente', 'Cancelado', 'No Encontrado']) {
      const fetchMock = vi.fn().mockResolvedValue(okXmlResponse(estado));
      vi.stubGlobal('fetch', fetchMock);
      await checkCFDIStatusSAT(`uuid-def-${estado}`, 'EMI010101EMI', 'REC010101REC', 100);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

});
